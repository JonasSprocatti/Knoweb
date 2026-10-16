import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, clip, CLAUDE_MODEL } from "@/lib/server/claude";
import { aiProvider, gemini } from "@/lib/server/gemini";
import { slugify } from "@/lib/text";
import type { Insights } from "@/lib/types";

interface AnalysisResult {
  title: string;
  summary: string;
  key_points: string[];
  action_items: {
    text: string;
    owner?: string | null;
    due?: string | null;
    due_date?: string | null;
    assignees?: string[];
    project?: string | null;
    priority?: string | null;
    estimate_hours?: number | null;
  }[];
  decisions: string[];
  people: string[];
  questions: string[];
  topics: { name: string; description: string; relevance: number; emoji?: string }[];
  related_notes: { id: string; reason: string }[];
  projects?: { name: string; is_new: boolean; description?: string; emoji?: string; reason?: string; relevance?: number }[];
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
            text: { type: "string", description: "A tarefa, começando por um verbo (ex.: \"Enviar proposta ao cliente\")." },
            owner: { type: ["string", "null"], description: "Responsável, se citado." },
            due: { type: ["string", "null"], description: "Prazo como foi dito, se citado." },
            due_date: { type: ["string", "null"], description: "Prazo em AAAA-MM-DD, calculado a partir da data da nota quando possível (\"sexta\", \"mês que vem\")." },
            assignees: { type: "array", items: { type: "string" }, description: "Nomes de quem deve fazer (uma ou mais pessoas). Use o nome exato de uma pessoa existente quando for ela." },
            project: { type: ["string", "null"], description: "Nome exato do projeto (existente ou sugerido em projects) a que a tarefa pertence." },
            priority: { type: ["string", "null"], description: "low, medium, high ou urgent, pelo tom da conversa." },
            estimate_hours: { type: ["number", "null"], description: "Estimativa de horas para fazer, só se der para inferir com alguma base." },
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
            emoji: { type: "string", description: "Um único emoji que represente o tema (usado só se for novo)." },
            relevance: { type: "number", description: "0 a 1: quanto a nota trata desse tema." },
          },
          required: ["name", "description", "relevance"],
        },
      },
      projects: {
        type: "array",
        description:
          "Projetos de que a nota trata (até 3). Use o nome exato de um projeto existente quando servir (is_new=false). Sugira um projeto novo (is_new=true) só quando a nota descreve uma iniciativa com objetivo e entregas que não cabe em nenhum existente — não para assuntos genéricos (isso é tema).",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nome curto do projeto." },
            is_new: { type: "boolean" },
            description: { type: "string", description: "Objetivo do projeto em uma frase (só se novo)." },
            emoji: { type: "string", description: "Um emoji (só se novo)." },
            reason: { type: "string", description: "Por que criar este projeto, citando a nota (só se novo)." },
            relevance: { type: "number", description: "0 a 1." },
          },
          required: ["name", "is_new"],
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
- Só relacione notas quando houver ligação de assunto concreta.
- Projetos são iniciativas com começo, meio e fim; tarefas são ações concretas com dono. Ligue cada tarefa ao projeto certo e às pessoas certas.`;

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
    const [{ data: topics }, { data: others }, { data: projects }, { data: people }] = await Promise.all([
      supabase.from("topics").select("name, description").order("name").limit(400),
      supabase
        .from("notes")
        .select("id, title, summary")
        .neq("id", noteId)
        .order("updated_at", { ascending: false })
        .limit(150),
      supabase.from("projects").select("id, name, slug, description, status").neq("status", "archived").order("updated_at", { ascending: false }).limit(150),
      supabase.from("people").select("id, name, slug, role").order("name").limit(400),
    ]);

    const topicList = (topics ?? []).map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n");
    const noteList = (others ?? [])
      .map((n) => `- id=${n.id} | ${n.title}${n.summary ? ` — ${clip(n.summary, 220)}` : ""}`)
      .join("\n");

    const projectList = (projects ?? [])
      .map((p) => `- ${p.name} [${p.status}]${p.description ? `: ${clip(p.description, 160)}` : ""}`)
      .join("\n");
    const peopleList = (people ?? []).map((p) => `- ${p.name}${p.role ? ` (${p.role})` : ""}`).join("\n");

    const userPrompt = `<temas_existentes>
${topicList || "(nenhum ainda)"}
</temas_existentes>

<projetos_existentes>
${projectList || "(nenhum ainda)"}
</projetos_existentes>

<pessoas_existentes>
${peopleList || "(nenhuma ainda)"}
</pessoas_existentes>

<outras_notas>
${noteList || "(nenhuma ainda)"}
</outras_notas>

<nota tipo="${note.kind === "recording" ? "gravação transcrita" : "nota escrita"}" titulo_atual="${note.title}" data="${note.created_at}">
${clip(body, 400_000)}
</nota>

Analise a nota e chame a ferramenta salvar_analise.`;

    let result: AnalysisResult;
    if ((await aiProvider()) === "gemini") {
      result = await gemini<AnalysisResult>(
        SYSTEM,
        [{ role: "user", parts: [{ text: userPrompt.replace("chame a ferramenta salvar_analise", "devolva a análise") }] }],
        ANALYSIS_TOOL.input_schema,
      );
    } else {
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
      result = toolUse.input as AnalysisResult;
    }

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
            missing.map((t) => ({ name: t.name, slug: t.slug, description: t.description, emoji: t.emoji?.trim().slice(0, 8) || null })),
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

    await linkWork(supabase, noteId, result, projects ?? [], people ?? []);

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

type Row = { id: string; name: string; slug: string };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

/** Cria o que faltar (sem tocar no que já existe) e devolve id por slug. */
async function ensure(
  supabase: SupabaseClient,
  table: "people" | "projects",
  known: Row[],
  wanted: { name: string; slug: string; extra?: Record<string, unknown> }[],
) {
  const bySlug = new Map(known.map((r) => [r.slug, r.id]));
  const missing = [...new Map(wanted.filter((w) => !bySlug.has(w.slug)).map((w) => [w.slug, w])).values()];
  if (missing.length) {
    await supabase.from(table).upsert(
      missing.map((w) => ({ name: w.name, slug: w.slug, ...w.extra })),
      { onConflict: "user_id,slug", ignoreDuplicates: true },
    );
    const { data } = await supabase.from(table).select("id, slug").in("slug", missing.map((w) => w.slug));
    for (const r of data ?? []) bySlug.set(r.slug as string, r.id as string);
  }
  return bySlug;
}

/**
 * Pessoas, projetos e tarefas da nota. Projetos novos entram como "suggested"
 * e tarefas como "suggested": você aceita ou descarta. Reanalisar troca só as
 * sugestões que ainda não foram aceitas.
 */
async function linkWork(supabase: SupabaseClient, noteId: string, result: AnalysisResult, projects: Row[], people: Row[]) {
  const items = (result.action_items ?? []).filter((a) => a.text?.trim());

  // ---- Pessoas ------------------------------------------------------
  const names = [...(result.people ?? []), ...items.flatMap((a) => a.assignees ?? (a.owner ? [a.owner] : []))]
    .map((n) => n.trim())
    .filter(Boolean);
  const personId = await ensure(supabase, "people", people, names.map((name) => ({ name, slug: slugify(name) })).filter((p) => p.slug));
  await supabase.from("note_people").delete().eq("note_id", noteId);
  const mentioned = [...new Set(names.map((n) => personId.get(slugify(n))).filter((id): id is string => !!id))];
  if (mentioned.length) await supabase.from("note_people").insert(mentioned.map((person_id) => ({ note_id: noteId, person_id })));

  // ---- Projetos -----------------------------------------------------
  const wantedProjects = (result.projects ?? [])
    .map((p) => ({ ...p, name: p.name.trim(), slug: slugify(p.name) }))
    .filter((p) => p.slug && (p.is_new || projects.some((k) => k.slug === p.slug)));
  const projectId = await ensure(
    supabase,
    "projects",
    projects,
    wantedProjects.map((p) => ({
      name: p.name,
      slug: p.slug,
      extra: {
        status: "suggested",
        description: p.description ?? null,
        emoji: p.emoji?.trim().slice(0, 8) || null,
        reason: p.reason ?? null,
        origin_note_id: noteId,
      },
    })),
  );
  await supabase.from("project_notes").delete().eq("note_id", noteId).eq("source", "ai");
  const projectRows = [...new Map(wantedProjects.map((p) => [p.slug, p])).values()]
    .filter((p) => projectId.has(p.slug))
    .map((p) => ({
      project_id: projectId.get(p.slug)!,
      note_id: noteId,
      relevance: Math.min(1, Math.max(0, Number(p.relevance) || 0.6)),
      source: "ai" as const,
    }));
  if (projectRows.length) await supabase.from("project_notes").upsert(projectRows, { onConflict: "project_id,note_id", ignoreDuplicates: true });

  // ---- Tarefas ------------------------------------------------------
  await supabase.from("tasks").delete().eq("note_id", noteId).eq("source", "ai").eq("status", "suggested");
  const { data: kept } = await supabase.from("tasks").select("title").eq("note_id", noteId);
  const keptTitles = new Set((kept ?? []).map((t) => String(t.title).toLowerCase()));
  // Sem projeto citado e a nota só trata de um: a tarefa vai para ele
  const onlyProject = projectRows.length === 1 ? projectRows[0].project_id : null;

  const fresh = items.filter((a) => !keptTitles.has(a.text.trim().toLowerCase()));
  if (!fresh.length) return;
  const { data: created } = await supabase
    .from("tasks")
    .insert(
      fresh.map((a) => ({
        title: a.text.trim().slice(0, 300),
        description: a.due && !ISO_DATE.test(a.due_date ?? "") ? `Prazo citado: ${a.due}` : "",
        note_id: noteId,
        project_id: (a.project && projectId.get(slugify(a.project))) || onlyProject,
        status: "suggested",
        source: "ai",
        priority: PRIORITIES.has(a.priority ?? "") ? a.priority : "medium",
        due_date: ISO_DATE.test(a.due_date ?? "") ? a.due_date : null,
        estimate_hours: Number(a.estimate_hours) > 0 ? Number(a.estimate_hours) : null,
      })),
    )
    .select("id");
  const assignees = (created ?? []).flatMap((t, i) => {
    const who = fresh[i].assignees?.length ? fresh[i].assignees! : fresh[i].owner ? [fresh[i].owner!] : [];
    return [...new Set(who.map((n) => personId.get(slugify(n))).filter((id): id is string => !!id))].map((person_id) => ({
      task_id: t.id as string,
      person_id,
    }));
  });
  if (assignees.length) await supabase.from("task_assignees").insert(assignees);
}
