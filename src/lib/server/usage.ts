import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Para que a IA foi chamada (aparece em Configurações → Uso das IAs). */
export type UsageKind = "analyze" | "ask" | "transcribe" | "ingest" | "versions" | "embed";

type Usage = {
  kind: UsageKind;
  provider: "claude" | "gemini" | "openai";
  model: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  audioSeconds?: number;
};

// US$ por milhão de tokens: entrada, saída, leitura e escrita de cache (5 min).
// ponytail: tabela fixa (preços de out/2026); modelo fora dela usa a do Sonnet. Atualize ao trocar de modelo.
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-sonnet-5": [2, 10, 0.2, 2.5],
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
  "gemini-2.5-flash": [0.3, 2.5, 0.075, 0.3],
  "text-embedding-3-small": [0.02, 0, 0, 0],
};
const WHISPER_PER_MINUTE = 0.006;

export function costOf(u: Usage) {
  if (u.audioSeconds && u.provider === "openai") return (u.audioSeconds / 60) * WHISPER_PER_MINUTE;
  const [inp, out, read, write] = PRICES[u.model] ?? PRICES["claude-sonnet-5-5"];
  return ((u.input ?? 0) * inp + (u.output ?? 0) * out + (u.cacheRead ?? 0) * read + (u.cacheWrite ?? 0) * write) / 1_000_000;
}

/**
 * Anota uma chamada de IA na tabela ai_usage. Nunca derruba a chamada: sem a
 * tabela (SQL ainda não rodado) ou com erro, só não registra.
 */
export async function trackUsage(supabase: SupabaseClient, u: Usage) {
  try {
    await supabase.from("ai_usage").insert({
      kind: u.kind,
      provider: u.provider,
      model: u.model,
      input_tokens: Math.round(u.input ?? 0),
      output_tokens: Math.round(u.output ?? 0),
      cache_read_tokens: Math.round(u.cacheRead ?? 0),
      cache_write_tokens: Math.round(u.cacheWrite ?? 0),
      audio_seconds: u.audioSeconds ?? 0,
      cost_usd: costOf(u),
    });
  } catch {
    // registro é opcional
  }
}

/** Atalho para respostas do Claude. */
export function trackClaude(supabase: SupabaseClient, kind: UsageKind, model: string, usage: Anthropic.Usage) {
  return trackUsage(supabase, {
    kind,
    provider: "claude",
    model,
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  });
}

/** Contagem que o Gemini devolve em usageMetadata. */
export type GeminiUsage = { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };

export function trackGemini(supabase: SupabaseClient, kind: UsageKind, model: string, u: GeminiUsage | undefined) {
  if (!u) return Promise.resolve();
  const cached = u.cachedContentTokenCount ?? 0;
  return trackUsage(supabase, {
    kind,
    provider: "gemini",
    model,
    input: (u.promptTokenCount ?? 0) - cached,
    cacheRead: cached,
    output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  });
}
