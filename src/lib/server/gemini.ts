import { cookies } from "next/headers";

export type Provider = "claude" | "gemini";

/** Provedor escolhido no seletor do app (cookie "ai"); sem escolha, usa AI_PROVIDER ou a chave que existir. */
export async function aiProvider(): Promise<Provider> {
  const chosen = (await cookies()).get("ai")?.value;
  if (chosen === "claude" || chosen === "gemini") return chosen;
  if (process.env.AI_PROVIDER === "claude" || process.env.AI_PROVIDER === "gemini") return process.env.AI_PROVIDER;
  return process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY ? "gemini" : "claude";
}

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
export type GeminiTurn = { role: "user" | "model"; parts: Part[] };

function request(method: string, body: object, query = "") {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada.");
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:${method}${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
}

function body(system: string, contents: GeminiTurn[], schema?: object) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    ...(schema && { generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema } }),
  };
}

type Chunk = { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message: string } };
const textOf = (c: Chunk) => (c.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");

/** Uma chamada ao Gemini. Com `schema`, devolve o JSON já parseado. */
export async function gemini<T = string>(system: string, contents: GeminiTurn[], schema?: object): Promise<T> {
  const res = await request("generateContent", body(system, contents, schema));
  const data = (await res.json().catch(() => ({}))) as Chunk;
  if (!res.ok) throw new Error(`Gemini: ${data.error?.message ?? `erro ${res.status}`}`);
  const text = textOf(data);
  return (schema ? JSON.parse(text) : text) as T;
}

/** Resposta do Gemini em streaming (SSE), pedaço por pedaço. */
export async function* geminiStream(system: string, contents: GeminiTurn[]) {
  const res = await request("streamGenerateContent", body(system, contents), "?alt=sse");
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as Chunk;
    throw new Error(`Gemini: ${data.error?.message ?? `erro ${res.status}`}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) yield textOf(JSON.parse(line.slice(6)) as Chunk);
    }
  }
}
