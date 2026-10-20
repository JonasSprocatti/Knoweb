import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clip } from "@/lib/server/claude";
import { trackUsage } from "@/lib/server/usage";

/**
 * Busca por significado: cada nota vira um vetor (OpenAI text-embedding-3-small,
 * 1536 números, ~US$ 0,02 por milhão de tokens) guardado em notes.embedding.
 * Tudo aqui é opcional: sem OPENAI_API_KEY, sem o SQL do pgvector ou com erro,
 * as funções devolvem null/[] e o app segue só com a busca por palavras.
 */
const MODEL = "text-embedding-3-small";

let client: OpenAI | null = null;
export function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** Texto que representa a nota: título, resumo e o começo do conteúdo. */
export function noteText(n: { title?: string | null; summary?: string | null; content?: string | null; transcript?: string | null }) {
  const body = [n.content, n.transcript].filter(Boolean).join("\n\n");
  return [n.title, n.summary, clip(body, 6_000)].filter(Boolean).join("\n\n");
}

/** Vetores de vários textos numa chamada só; null se não der. */
export async function embed(supabase: SupabaseClient, texts: string[]): Promise<number[][] | null> {
  if (!process.env.OPENAI_API_KEY || !texts.length) return null;
  try {
    const res = await openai().embeddings.create({ model: MODEL, input: texts.map((t) => t.slice(0, 24_000) || " ") });
    await trackUsage(supabase, { kind: "embed", provider: "openai", model: MODEL, input: res.usage?.total_tokens ?? 0 });
    return res.data.map((d) => d.embedding);
  } catch {
    return null;
  }
}

/** Guarda o vetor da nota (ignora se a coluna ainda não existe). */
export async function saveEmbedding(supabase: SupabaseClient, noteId: string, vector: number[]) {
  await supabase.from("notes").update({ embedding: JSON.stringify(vector) }).eq("id", noteId);
}

export type SimilarNote = { id: string; title: string; summary: string | null; similarity: number };

/** As notas mais parecidas com o vetor (sem a própria). [] se a busca não existir ainda. */
export async function similarNotes(supabase: SupabaseClient, vector: number[] | null, count: number, excludeId?: string): Promise<SimilarNote[]> {
  if (!vector) return [];
  const { data, error } = await supabase.rpc("match_notes", {
    query_embedding: JSON.stringify(vector),
    match_count: count,
    exclude_id: excludeId ?? null,
  });
  return error ? [] : ((data ?? []) as SimilarNote[]);
}
