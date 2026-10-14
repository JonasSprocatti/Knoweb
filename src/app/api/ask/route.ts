import { requireUser } from "@/lib/supabase/server";
import { anthropic, clip, CLAUDE_MODEL } from "@/lib/server/claude";
import { badRequest, unauthorized } from "@/lib/server/http";

export const maxDuration = 300;

type Turn = { role: "user" | "assistant"; content: string };

const SYSTEM = `Você é o assistente da base de conhecimento pessoal do usuário (notas escritas e transcrições de conversas).
Responda em português do Brasil usando SOMENTE as notas fornecidas como fonte. Se as notas não respondem, diga isso claramente e sugira o que gravar ou anotar.
Cite as notas de onde tirou cada informação escrevendo o título exato entre colchetes duplos, como [[Título da nota]].
Seja direto. Use listas quando ajudarem. Quando citar o que alguém disse numa gravação, inclua a marca de tempo se houver.`;

/**
 * "Perguntar à teia": busca as notas mais relevantes no Postgres e pede ao
 * Claude uma resposta com citações. A resposta volta em streaming.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { question, history = [] } = (await request.json().catch(() => ({}))) as {
    question?: string;
    history?: Turn[];
  };
  if (!question?.trim()) return badRequest("Faça uma pergunta.");

  // 1) Busca por palavras (OU) + notas ligadas a temas citados na pergunta
  const [{ data: hits }, { data: topics }] = await Promise.all([
    supabase.rpc("search_notes", { q: question, max_results: 12, any_word: true }),
    supabase.from("topics").select("id, name"),
  ]);

  const lowerQ = question.toLowerCase();
  const topicIds = (topics ?? [])
    .filter((t) => lowerQ.includes(String(t.name).toLowerCase()))
    .map((t) => t.id as string);

  const ids = new Set<string>((hits ?? []).map((h: { id: string }) => h.id));
  if (topicIds.length) {
    const { data: tn } = await supabase.from("note_topics").select("note_id").in("topic_id", topicIds).limit(20);
    for (const r of tn ?? []) ids.add(r.note_id as string);
  }
  if (ids.size === 0) {
    const { data: recent } = await supabase.from("notes").select("id").order("updated_at", { ascending: false }).limit(8);
    for (const r of recent ?? []) ids.add(r.id as string);
  }

  const { data: notes } = await supabase
    .from("notes")
    .select("id, title, summary, content, transcript, kind, created_at")
    .in("id", [...ids].slice(0, 16));

  const context = (notes ?? [])
    .map((n) => {
      const body = [n.content, n.transcript && `Transcrição:\n${n.transcript}`].filter(Boolean).join("\n\n");
      return `<nota titulo="${n.title}" data="${new Date(n.created_at).toLocaleDateString("pt-BR")}" tipo="${
        n.kind === "recording" ? "gravação" : "escrita"
      }">
${n.summary ? `Resumo: ${n.summary}\n\n` : ""}${clip(body, 12_000)}
</nota>`;
    })
    .join("\n\n");

  const messages = [
    ...history
      .slice(-6)
      .filter((t) => t.content?.trim())
      .map((t) => ({ role: t.role, content: t.content })),
    {
      role: "user" as const,
      content: `<notas>\n${context || "(nenhuma nota encontrada)"}\n</notas>\n\nPergunta: ${question}`,
    },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const response = anthropic().messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          system: SYSTEM,
          messages,
        });
        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n**Erro:** ${err instanceof Error ? err.message : String(err)}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Sources": encodeURIComponent(JSON.stringify((notes ?? []).map((n) => ({ id: n.id, title: n.title })))),
    },
  });
}
