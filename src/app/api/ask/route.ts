import { requireUser } from "@/lib/supabase/server";
import { anthropic, clip, CLAUDE_MODEL, excerpts, keywords } from "@/lib/server/claude";
import { aiProvider, geminiStream, GEMINI_MODEL } from "@/lib/server/gemini";
import { embed, similarNotes } from "@/lib/server/embeddings";
import { trackClaude, trackGemini } from "@/lib/server/usage";
import { badRequest, unauthorized } from "@/lib/server/http";

export const maxDuration = 300;

type Turn = { role: "user" | "assistant"; content: string };

const SYSTEM = `Você é o assistente da base de conhecimento pessoal do usuário (notas escritas e transcrições de conversas).
Responda em português do Brasil usando SOMENTE as notas e o quadro de trabalho (projetos, tarefas, pessoas) fornecidos como fonte. Se as notas não respondem, diga isso claramente e sugira o que gravar ou anotar.
Cite as notas de onde tirou cada informação escrevendo o título exato entre colchetes duplos, como [[Título da nota]].
Cite tarefas pelo código (ex.: T-12) e projetos pelo nome. Seja direto. Use listas quando ajudarem. Quando citar o que alguém disse numa gravação, inclua a marca de tempo se houver.
A <base_de_conhecimento>, quando vier, traz o que o usuário já confirmou como definitivo (artigos, respostas salvas e o documento final de projetos concluídos): ela vale mais que as notas. Quando ela responder, use-a primeiro e cite como (Base: Título); se uma nota mais nova contradisser a base, aponte a diferença.`;

/**
 * "Perguntar à teia": busca as notas mais relevantes no Postgres e pede ao
 * Claude uma resposta com citações. A resposta volta em streaming.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { question, history = [], sessionId } = (await request.json().catch(() => ({}))) as {
    question?: string;
    history?: Turn[];
    sessionId?: string | null;
  };
  if (!question?.trim()) return badRequest("Faça uma pergunta.");

  // Conversa salva: continua a que veio ou abre uma nova (sem a tabela, segue sem salvar)
  let session: string | null = null;
  if (sessionId) {
    const { data } = await supabase.from("ask_sessions").select("id").eq("id", sessionId).maybeSingle();
    session = (data?.id as string) ?? null;
  }
  if (!session) {
    const { data } = await supabase.from("ask_sessions").insert({ title: question.trim().slice(0, 140) }).select("id").maybeSingle();
    session = (data?.id as string) ?? null;
  }
  if (session) await supabase.from("ask_messages").insert({ session_id: session, role: "user", content: question.trim() });

  // Base de conhecimento: o que já é definitivo vem antes das notas
  const words = keywords(question);
  const { data: kb } = words.length
    ? await supabase
        .from("knowledge")
        .select("id, title, kind, content")
        .eq("status", "ready")
        .textSearch("search", words.join(" or "), { type: "websearch", config: "portuguese" })
        .limit(4)
    : { data: [] };

  // 1) Busca por palavras (OU) + notas ligadas a temas citados na pergunta + busca por significado
  const [{ data: hits }, { data: topics }, vectors] = await Promise.all([
    supabase.rpc("search_notes", { q: question, max_results: 12, any_word: true }),
    supabase.from("topics").select("id, name"),
    embed(supabase, [question]),
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
  // A busca por significado só acrescenta: as notas achadas por palavras/temas vêm primeiro (as mesmas
  // 16 de antes) e até 6 parecidas entram depois, mesmo sem as palavras exatas
  const similar = (await similarNotes(supabase, vectors?.[0] ?? null, 12)).filter((n) => n.similarity >= 0.3).map((n) => n.id);
  const found = ids.size > 0;
  if (!found) {
    // Nada por palavras: as parecidas vêm antes das 8 recentes de reserva
    const { data: recent } = await supabase.from("notes").select("id").order("updated_at", { ascending: false }).limit(8);
    for (const id of [...similar.slice(0, 6), ...(recent ?? []).map((r) => r.id as string)]) ids.add(id);
  }
  const picked = [...ids].slice(0, 16);
  if (found) for (const id of similar) if (picked.length < 22 && !picked.includes(id)) picked.push(id);
  const { data: notes } = await supabase
    .from("notes")
    .select("id, title, summary, content, transcript, kind, created_at")
    .in("id", picked);

  // As 3 mais relevantes vão quase inteiras; as outras, só os trechos em volta das palavras
  // da pergunta (o resumo já dá o contexto). Antes: até 12 mil caracteres por nota, em todas.
  const order = picked;
  const context = (notes ?? [])
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map((n, i) => {
      const full = [n.content, n.transcript && `Transcrição:\n${n.transcript}`].filter(Boolean).join("\n\n");
      const body = i < 3 ? clip(full, 8_000) : excerpts(full, words, 2_500);
      return `<nota titulo="${n.title}" data="${new Date(n.created_at).toLocaleDateString("pt-BR")}" tipo="${
        n.kind === "recording" ? "gravação" : "escrita"
      }">
${n.summary ? `Resumo: ${n.summary}\n\n` : ""}${body}
</nota>`;
    })
    .join("\n\n");

  // Quadro de trabalho: projetos ativos e tarefas abertas/recentes, com quem e quando
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    supabase.from("projects").select("name, status, description, due_date, owner:people!projects_owner_id_fkey(name)").not("status", "in", "(archived)").limit(60),
    supabase
      .from("tasks")
      .select("number, title, status, priority, due_date, estimate_hours, spent_hours, completed_at, recurrence, projects(name), sprints(name), task_assignees(people(name))")
      .neq("status", "canceled")
      .order("updated_at", { ascending: false })
      .limit(150),
  ]);
  const name = (v: unknown) => ((Array.isArray(v) ? v[0] : v) as { name?: string } | null)?.name;
  const work = [
    ...(projects ?? []).map(
      (p) => `Projeto "${p.name}" [${p.status}]${name(p.owner) ? ` resp. ${name(p.owner)}` : ""}${p.due_date ? ` prazo ${p.due_date}` : ""}${p.description ? ` — ${clip(p.description, 200)}` : ""}`,
    ),
    ...(tasks ?? []).map((t) => {
      const who = (t.task_assignees ?? []).map((a) => name(a.people)).filter(Boolean).join(", ");
      return `T-${t.number} "${t.title}" [${t.status}, ${t.priority}]${name(t.projects) ? ` projeto ${name(t.projects)}` : ""}${who ? ` com ${who}` : ""}${t.due_date ? ` prazo ${t.due_date}` : ""}${t.estimate_hours ? ` est. ${t.estimate_hours}h` : ""}${Number(t.spent_hours) ? ` gasto ${t.spent_hours}h` : ""}${t.completed_at ? ` feita em ${String(t.completed_at).slice(0, 10)}` : ""}${name(t.sprints) ? ` sprint ${name(t.sprints)}` : ""}${t.recurrence ? ` repete ${t.recurrence}` : ""}`;
    }),
  ].join("\n");

  const messages = [
    ...history
      .slice(-6)
      .filter((t) => t.content?.trim())
      .map((t) => ({ role: t.role, content: t.content })),
    {
      role: "user" as const,
      content: `${(kb ?? []).length ? `<base_de_conhecimento>\n${(kb ?? []).map((k) => `<artigo titulo="${k.title}"${k.kind === "project" ? ' tipo="projeto concluído"' : ""}>\n${clip(k.content, 12_000)}\n</artigo>`).join("\n\n")}\n</base_de_conhecimento>\n\n` : ""}<trabalho hoje="${new Date().toISOString().slice(0, 10)}">\n${work || "(nenhum projeto ou tarefa)"}\n</trabalho>\n\n<notas>\n${context || "(nenhuma nota encontrada)"}\n</notas>\n\nPergunta: ${question}`,
    },
  ];

  const sources = [
    ...(kb ?? []).map((k) => ({ id: k.id as string, title: k.title as string, kb: true })),
    ...(notes ?? []).map((n) => ({ id: n.id, title: n.title })),
  ];
  const provider = await aiProvider();
  const encoder = new TextEncoder();
  let answer = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        answer += text;
        controller.enqueue(encoder.encode(text));
      };
      try {
        if (provider === "gemini") {
          const turns = messages.map((m) => ({
            role: m.role === "assistant" ? ("model" as const) : ("user" as const),
            parts: [{ text: m.content }],
          }));
          for await (const text of geminiStream(SYSTEM, turns, (u) => trackGemini(supabase, "ask", GEMINI_MODEL, u))) send(text);
          return;
        }
        const response = anthropic().messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          system: SYSTEM,
          messages,
        });
        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send(event.delta.text);
          }
        }
        await trackClaude(supabase, "ask", CLAUDE_MODEL, (await response.finalMessage()).usage);
      } catch (err) {
        send(`\n\n**Erro:** ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        // A resposta fica salva na conversa (para reabrir sem perguntar de novo)
        if (session && answer.trim()) {
          await supabase.from("ask_messages").insert({ session_id: session, role: "assistant", content: answer, sources });
          await supabase.from("ask_sessions").update({ updated_at: new Date().toISOString() }).eq("id", session);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Sources": encodeURIComponent(JSON.stringify(sources)),
      ...(session ? { "X-Session": session } : {}),
    },
  });
}
