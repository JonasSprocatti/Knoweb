import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let client: Anthropic | null = null;
export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Corta textos muito longos mantendo começo e fim. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${text.slice(0, head)}\n\n[... trecho omitido ...]\n\n${text.slice(-tail)}`;
}

const STOP = new Set("que com dos das nos nas por nao sim ela ele seu sua foi tem sao era mas pra ser vai ter ate meu minha qual voce como para qual quais quem onde quando porque sobre isso esse essa este esta estes essas esses aquele aquela entre depois antes ainda também mais menos muito pelo pela pelos pelas numa num uma umas uns foram será seria tinha temos tenho fazer feito quero queria preciso pode podem algum alguma alguns algumas tudo todos todas nada cada mesmo mesma".split(" "));
const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Palavras que valem buscar na pergunta (sem acento, 3+ letras para pegar siglas como SAP, sem as muito comuns). */
export function keywords(question: string) {
  return [...new Set(plain(question).match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((w) => !STOP.has(w));
}

/**
 * Trechos de ~1.000 caracteres em volta das palavras da pergunta, até `max` no total.
 * Sem nenhuma palavra no texto, devolve só o começo.
 */
export function excerpts(text: string, words: string[], max: number) {
  if (text.length <= max) return text;
  const lower = plain(text); // tirar acento mantém o comprimento (á → a), então as posições valem no texto original
  const hits: number[] = [];
  for (const w of words) {
    for (let at = lower.indexOf(w), n = 0; at >= 0 && n < 3; at = lower.indexOf(w, at + w.length), n++) hits.push(at);
  }
  if (!hits.length) return clip(text, Math.min(max, 1_200));
  const spans: [number, number][] = [];
  for (const at of hits.sort((a, b) => a - b)) {
    const span: [number, number] = [Math.max(0, at - 500), Math.min(text.length, at + 500)];
    const last = spans[spans.length - 1];
    if (last && span[0] <= last[1]) last[1] = span[1];
    else spans.push(span);
  }
  const out: string[] = [];
  let used = 0;
  for (const [a, b] of spans) {
    if (used >= max) break;
    const piece = text.slice(a, Math.min(b, a + max - used));
    out.push(piece);
    used += piece.length;
  }
  return out.map((p) => `…${p}…`).join("\n");
}
