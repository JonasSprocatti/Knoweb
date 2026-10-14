import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, clip, CLAUDE_MODEL } from "@/lib/server/claude";
import { slugify } from "@/lib/text";
import type { Insights } from "@/lib/types";

interface AnalysisResult {
  title: string;
  summary: string;
  key_points: string[];
  action_items: { text: string; owner?: string | null; due?: string | null }[];
  decisions: string[];
  people: string[];
  questions: string[];
  topics: { name: string; description: string; relevance: number }[];
  related_notes: { id: string; reason: string }[];
}

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "salvar_analise",
  description: "Salva a análise estruturada da nota na base de conhecimento.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Título curto e específico (até 70 caracteres) que descreva o conteúdo.",
      },
      summary: {
        type: "string",
        description: "Resumo em 2 a 5 frases, direto ao ponto, em português.",
      },
      key_points: { type: "array", items: { type: "string" }, description: "Pontos-chave (até 8)." },
      action_items: {
        type: "array",
        description: "Tarefas ou próximos passos mencionados.",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            owner: { type: ["string", "null"], description: "Responsável, se citado." },
            due: { type: ["string", "null"], description: "Prazo, se citado." },
          },
          required: ["text"],
        },
      },
      decisions: { type: "array", items: { type: "string" }, description: "Decisões tomadas." },
      people: { type: "array", items: { type: "string" }, description: "Pessoas citadas pelo nome." },
      questions: { type: "array", items: { type: "string" }, description: "Perguntas em aberto." },
      topics: {
        type: "array",
        description:
          "De 1 a 6 temas. Reaproveite exatamente o nome de um tema existente sempre que ele servir; só crie tema novo quando nenhum existente cobrir o assunto.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nome do tema, curto (1 a 4 palavras)." },
            description: { type: "string", description: "Uma frase explicando o tema (usada só se for novo)." },
            relevance: { type: "number", description: "0 a 1: quanto a nota trata desse tema." },
          },
          required: ["name", "description", "relevance"],
        },
      },
      related_notes: {
        type: "array",
        description: "Notas existentes que têm relação real com esta (até 6). Use só ids da lista fornecida.",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            reason: { type: "string", description: "Por que se relacionam, em poucas palavras." },
          },
          required: ["id", "reason"],
        },
      },
    },
    required: ["title", "summary", "key_points", "action_items", "decisions", "people", "questions", "topics", "related_notes"],
  },
};

const SYSTEM = `Você organiza a base de conhecimento pessoal de uma pessoa. Ela grava conversas, reuniões e ideias, e escreve notas.
Sua tarefa: ler uma nota (texto escrito e/ou transcrição de áudio) e devolver uma análise estruturada para conectá-la ao resto da base.
Regras:
- Escreva em português do Brasil.
- Seja fiel ao conteúdo; não invente fatos, nomes, prazos ou decisões.
- Transcrições automáticas têm erros: corrija nomes óbvios pelo contexto, mas não force.
- Prefira temas existentes. Temas são assuntos duradouros (ex.: "Integração SAP", "Carreira", "Game design"), não detalhes de uma conversa.
- Só relacione notas quando houver ligação de assunto concreta.`;

const DEFAULT_TITLE_RE = /^(Sem título|Gravação \d)/i;

export async function analyzeNote(supabase: SupabaseClient, noteId: string) {
  const { data: note, error } = await supabase
    .from("notes")
    .select("id, title, content, transcript, kind, created_at")
    .eq("id", noteId)
    .single();
  if (error || !note) throw new Error("Nota não encontrada.");

  const body = [note.content?.trim(), note.transcript?.trim() && `## Transcrição\n${note.transcript.trim()}`]
    .filter(Boolean)
    .join("\n\n");

  if (!body) {
    await supabase.from("notes").update({ status: "ready" }).eq("id", noteId);
    return { skipped: true as const };
  }

  await supabase.from("notes").update({ status: "analyzing" }).eq("id", noteId);

  try {
    const [{ data: topics }, { data: others }] = await Promise.all([
      supabase.from("topics").select("name, description").order("name").limit(400),
      supabase
        .from("notes")
        .select("id, title, summary")
        .neq("id", noteId)
        .order("updated_at", { ascending: false })
        .limit(150),
    ]);

    const topicList = (topics ?? []).map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n");
    const noteList = (others ?? [])
      .map((n) => `- id=${n.id} | ${n.title}${n.summary ? ` — ${clip(n.summary, 220)}` : ""}`)
      .join("\n");

    const userPrompt = `<temas_existentes>
${topicList || "(nenhum ainda)"}
</temas_existentes>

<outras_notas>
${noteList || "(nenhuma ainda)"}
</outras_notas>

<nota tipo="${note.kind === "recording" ? "gravação transcrita" : "nota escrita"}" titulo_atual="${note.title}" data="${note.created_at}">
${clip(body, 400_000)}
</nota>

Analise a nota e chame a ferramenta salvar_analise.`;

    const response = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) throw new Error("O Claude não devolveu a análise.");
    const result = toolUse.input as AnalysisResult;

    // ---- Temas -------------------------------------------------------
    const wanted = (result.topics ?? [])
      .map((t) => ({ ...t, name: t.name.trim(), slug: slugify(t.name) }))
      .filter((t) => t.slug);
    const uniqueWanted = [...new Map(wanted.map((t) => [t.slug, t])).values()];

    let topicIdBySlug = new Map<string, string>();
    if (uniqueWanted.length) {
      const slugs = uniqueWanted.map((t) => t.slug);
      const { data: existing } = await supabase.from("topics").select("id, slug").in("slug", slugs);
      topicIdBySlug = new Map((existing ?? []).map((t) => [t.slug as string, t.id as string]));

      const missing = uniqueWanted.filter((t) => !topicIdBySlug.has(t.slug));
      if (missing.length) {
        const { data: created } = await supabase
          .from("topics")
          .upsert(
            missing.map((t) => ({ name: t.name, slug: t.slug, description: t.description })),
            { onConflict: "user_id,slug" },
          )
          .select("id, slug");
        for (const t of created ?? []) topicIdBySlug.set(t.slug as string, t.id as string);
      }
    }

    await supabase.from("note_topics").delete().eq("note_id", noteId).eq("source", "ai");
    const topicRows = uniqueWanted
      .filter((t) => topicIdBySlug.has(t.slug))
      .map((t) => ({
        note_id: noteId,
        topic_id: topicIdBySlug.get(t.slug)!,
        relevance: Math.min(1, Math.max(0, Number(t.relevance) || 0.5)),
        source: "ai" as const,
      }));
    if (topicRows.length) {
      // ignoreDuplicates preserva temas que você adicionou manualmente
      await supabase.from("note_topics").upsert(topicRows, { onConflict: "note_id,topic_id", ignoreDuplicates: true });
    }

    // ---- Notas relacionadas -----------------------------------------
    const validIds = new Set((others ?? []).map((n) => n.id as string));
    await supabase.from("note_links").delete().eq("source_id", noteId).eq("kind", "ai");
    const linkRows = (result.related_notes ?? [])
      .filter((r) => validIds.has(r.id))
      .slice(0, 6)
      .map((r) => ({ source_id: noteId, target_id: r.id, kind: "ai" as const, reason: r.reason }));
    if (linkRows.length) {
      await supabase.from("note_links").upsert(linkRows, { onConflict: "source_id,target_id,kind" });
    }

    // ---- Nota --------------------------------------------------------
    const insights: Insights = {
      key_points: result.key_points ?? [],
      action_items: result.action_items ?? [],
      decisions: result.decisions ?? [],
      people: result.people ?? [],
      questions: result.questions ?? [],
    };
    const update: Record<string, unknown> = {
      summary: result.summary,
      insights,
      status: "ready",
      analyzed_at: new Date().toISOString(),
    };
    if (DEFAULT_TITLE_RE.test(note.title) && result.title?.trim()) {
      update.title = result.title.trim().slice(0, 120);
    }
    await supabase.from("notes").update(update).eq("id", noteId);

    return { skipped: false as const, topics: topicRows.length, links: linkRows.length };
  } catch (err) {
    await supabase.from("notes").update({ status: "error" }).eq("id", noteId);
    throw err;
  }
}
