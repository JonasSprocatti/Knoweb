"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { deleteNotes } from "@/lib/server/deleteNotes";
import { slugify } from "@/lib/text";
import type { Insights, TemplateTask } from "@/lib/types";

/** Projetos, tarefas e pessoas: ações chamadas direto dos formulários. */

async function db() {
  const { supabase, user } = await requireUser();
  if (!user) throw new Error("Faça login.");
  return supabase;
}

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  const n = v == null ? NaN : Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const must = <T,>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
};
const refresh = () => revalidatePath("/", "layout");

/** Slug livre: "Site novo", "Site novo 2", ... */
async function freeSlug(supabase: SupabaseClient, table: "projects" | "people" | "topics", name: string, exceptId?: string | null) {
  const base = slugify(name) || "sem-nome";
  const { data } = await supabase.from(table).select("id, slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== exceptId).map((r) => r.slug as string));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** Acha a pessoa pelo nome ou cria. */
async function personByName(supabase: SupabaseClient, name: string) {
  const slug = slugify(name);
  const found = await supabase.from("people").select("id").eq("slug", slug).maybeSingle();
  if (found.data) return found.data.id as string;
  return must(await supabase.from("people").insert({ name, slug }).select("id").single()).id as string;
}

// ---------------------------------------------------------------- Projetos

export async function saveProject(form: FormData) {
  const supabase = await db();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) throw new Error("Dê um nome ao projeto.");
  const row = {
    name,
    slug: await freeSlug(supabase, "projects", name, id),
    description: str(form, "description"),
    emoji: str(form, "emoji")?.slice(0, 8) ?? null,
    status: str(form, "status") ?? "active",
    start_date: str(form, "start_date"),
    due_date: str(form, "due_date"),
    owner_id: str(form, "new_owner_id") ? await personByName(supabase, str(form, "new_owner_id")!) : str(form, "owner_id"),
  };
  const saved = id
    ? must(await supabase.from("projects").update(row).eq("id", id).select("slug").single())
    : must(await supabase.from("projects").insert(row).select("slug").single());
  const noteId = str(form, "note_id");
  const templateId = str(form, "template_id");
  if (!id && (noteId || templateId)) {
    const { data: p } = await supabase.from("projects").select("id").eq("slug", saved.slug).single();
    if (p && noteId) await supabase.from("project_notes").upsert({ project_id: p.id, note_id: noteId, relevance: 1, source: "manual" });
    if (p && templateId) await applyTemplate(supabase, templateId, p.id, row.start_date);
  }
  refresh();
  redirect(`/projects/${saved.slug}`);
}

/** Cria as tarefas do modelo no projeto; o prazo conta a partir do início. */
async function applyTemplate(supabase: SupabaseClient, templateId: string, projectId: string, start: string | null) {
  const { data: tpl } = await supabase.from("templates").select("description, emoji, tasks").eq("id", templateId).single();
  if (!tpl) return;
  const base = new Date(`${start ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const due = (offset?: number | null) =>
    offset == null ? null : new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const items = (tpl.tasks ?? []) as TemplateTask[];
  if (items.length)
    must(
      await supabase.from("tasks").insert(
        items.map((t) => ({
          project_id: projectId,
          title: t.title,
          description: t.description ?? "",
          priority: t.priority ?? "medium",
          estimate_hours: t.estimate_hours ?? null,
          recurrence: t.recurrence ?? null,
          due_date: due(t.offset_days),
        })),
      ),
    );
  // Descrição e emoji do modelo só entram se o projeto não tiver os seus
  const { data: p } = await supabase.from("projects").select("description, emoji").eq("id", projectId).single();
  await supabase
    .from("projects")
    .update({ description: p?.description || tpl.description, emoji: p?.emoji || tpl.emoji })
    .eq("id", projectId);
}

export async function setProjectStatus(id: string, status: string) {
  const supabase = await db();
  must(await supabase.from("projects").update({ status }).eq("id", id));
  // Aceitar o projeto aceita também as tarefas que o Claude sugeriu para ele
  if (status === "active") await supabase.from("tasks").update({ status: "todo" }).eq("project_id", id).eq("status", "suggested");
  refresh();
}

/**
 * Exclui o projeto. Sugestões dele sempre vão junto; o resto depende da escolha:
 * tasks = keep (ficam sem projeto) | delete; notes = keep | delete (as ligadas a ele).
 */
export async function deleteProject(id: string, back: string | null, form?: FormData) {
  const supabase = await db();
  await supabase.from("tasks").delete().eq("project_id", id).eq("status", "suggested");
  if (form?.get("tasks") === "delete") must(await supabase.from("tasks").delete().eq("project_id", id));
  if (form?.get("notes") === "delete") {
    const { data } = await supabase.from("project_notes").select("note_id").eq("project_id", id);
    await deleteNotes(supabase, (data ?? []).map((r) => r.note_id as string));
  }
  must(await supabase.from("projects").delete().eq("id", id));
  refresh();
  if (back) redirect(back);
}

export async function linkNote(projectId: string, form: FormData) {
  const supabase = await db();
  const noteId = str(form, "note_id");
  if (!noteId) return;
  must(await supabase.from("project_notes").upsert({ project_id: projectId, note_id: noteId, relevance: 1, source: "manual" }));
  refresh();
}

export async function unlinkNote(projectId: string, noteId: string) {
  const supabase = await db();
  must(await supabase.from("project_notes").delete().eq("project_id", projectId).eq("note_id", noteId));
  refresh();
}

// ---------------------------------------------------------------- Tarefas

export async function saveTask(form: FormData) {
  const supabase = await db();
  const id = str(form, "id");
  const title = str(form, "title");
  if (!title) throw new Error("Escreva a tarefa.");
  const row: Record<string, unknown> = {
    title,
    project_id: str(form, "project_id"),
    status: str(form, "status") ?? "todo",
    priority: str(form, "priority") ?? "medium",
    due_date: str(form, "due_date"),
    estimate_hours: num(form, "estimate_hours"),
  };
  // Campos que só o formulário completo tem; o rápido não apaga o que já existe
  if (form.has("description")) row.description = str(form, "description") ?? "";
  if (form.has("spent_hours")) row.spent_hours = num(form, "spent_hours") ?? 0;
  if (form.has("sprint_id")) row.sprint_id = str(form, "sprint_id");
  if (form.has("recurrence")) row.recurrence = str(form, "recurrence");
  if (!id) {
    row.parent_id = str(form, "parent_id");
    row.note_id = str(form, "note_id");
  }

  const task = id
    ? must(await supabase.from("tasks").update(row).eq("id", id).select("id").single())
    : must(await supabase.from("tasks").insert(row).select("id").single());

  // Responsáveis: os marcados + nomes novos separados por vírgula
  if (form.has("assignees_present")) {
    const ids = new Set(form.getAll("assignee").filter((v): v is string => typeof v === "string" && !!v));
    for (const name of (str(form, "new_assignees") ?? "").split(",").map((n) => n.trim()).filter(Boolean)) {
      ids.add(await personByName(supabase, name));
    }
    const { data: current } = await supabase.from("task_assignees").select("person_id").eq("task_id", task.id);
    const now = new Set((current ?? []).map((r) => r.person_id as string));
    const add = [...ids].filter((p) => !now.has(p));
    const del = [...now].filter((p) => !ids.has(p));
    if (add.length) must(await supabase.from("task_assignees").insert(add.map((person_id) => ({ task_id: task.id, person_id }))));
    if (del.length) must(await supabase.from("task_assignees").delete().eq("task_id", task.id).in("person_id", del));
  }
  refresh();
  if (!id && form.get("open") === "1") redirect(`/tasks/${task.id}`);
}

export async function setTaskStatus(id: string, status: string | FormData) {
  if (typeof status !== "string") status = String(status.get("status"));
  const supabase = await db();
  must(await supabase.from("tasks").update({ status }).eq("id", id));
  refresh();
}

/** Aceita as tarefas sugeridas pelo Claude (de uma nota ou de um projeto). */
export async function acceptSuggested(by: "note_id" | "project_id", id: string) {
  const supabase = await db();
  must(await supabase.from("tasks").update({ status: "todo" }).eq(by, id).eq("status", "suggested"));
  refresh();
}

/** Exclui a tarefa; subtarefas vão junto ou viram tarefas soltas (subtasks = keep). */
export async function deleteTask(id: string, back: string | null, form?: FormData) {
  const supabase = await db();
  if (form?.get("subtasks") === "keep") must(await supabase.from("tasks").update({ parent_id: null }).eq("parent_id", id));
  must(await supabase.from("tasks").delete().eq("id", id));
  refresh();
  if (back) redirect(back);
}

export async function deleteComment(eventId: string, _form?: FormData) {
  const supabase = await db();
  must(await supabase.from("task_events").delete().eq("id", eventId).eq("kind", "comment"));
  refresh();
}

export async function logTime(id: string, form: FormData) {
  const supabase = await db();
  const hours = num(form, "hours");
  if (!hours) return;
  const { data } = await supabase.from("tasks").select("spent_hours").eq("id", id).single();
  must(await supabase.from("tasks").update({ spent_hours: Number(data?.spent_hours ?? 0) + hours }).eq("id", id));
  refresh();
}

export async function addComment(id: string, form: FormData) {
  const supabase = await db();
  const body = str(form, "body");
  if (!body) return;
  must(await supabase.from("task_events").insert({ task_id: id, kind: "comment", new_value: body }));
  refresh();
}

/** "Bloqueada por" aceita o número curto (T-12 ou 12). */
export async function addDependency(id: string, form: FormData) {
  const supabase = await db();
  const n = Number(str(form, "blocked_by")?.replace(/\D/g, ""));
  if (!n) return;
  const { data: blocker } = await supabase.from("tasks").select("id").eq("number", n).maybeSingle();
  if (!blocker) throw new Error(`Tarefa T-${n} não encontrada.`);
  must(await supabase.from("task_dependencies").upsert({ task_id: id, blocked_by: blocker.id }));
  refresh();
}

export async function removeDependency(id: string, blockedBy: string) {
  const supabase = await db();
  must(await supabase.from("task_dependencies").delete().eq("task_id", id).eq("blocked_by", blockedBy));
  refresh();
}

// ---------------------------------------------------------------- Pessoas

export async function savePerson(form: FormData) {
  const supabase = await db();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) throw new Error("Escreva o nome.");
  const row = {
    name,
    slug: await freeSlug(supabase, "people", name, id),
    role: str(form, "role"),
    email: str(form, "email"),
    about: str(form, "about"),
    ...(form.has("company_id") ? { company_id: str(form, "company_id") } : {}),
  };
  const saved = id
    ? must(await supabase.from("people").update(row).eq("id", id).select("id, slug").single())
    : must(await supabase.from("people").insert(row).select("id, slug").single());
  if (form.get("is_me") === "1") await markMe(supabase, saved.id);
  refresh();
  redirect(`/people/${saved.slug}`);
}

/** Só uma pessoa é "eu": desmarca a anterior antes (o índice único exige). */
async function markMe(supabase: SupabaseClient, id: string | null) {
  must(await supabase.from("people").update({ is_me: false }).eq("is_me", true));
  if (id) must(await supabase.from("people").update({ is_me: true }).eq("id", id));
}

/** Define (ou tira, com null) quem é você entre as pessoas. */
export async function setMe(id: string | null) {
  await markMe(await db(), id);
  refresh();
}

/** Exclui a pessoa; tasks = keep (ficam sem ela) | delete (as que só ela fazia). */
export async function deletePerson(id: string, form?: FormData) {
  const supabase = await db();
  if (form?.get("tasks") === "delete") {
    const { data: mine } = await supabase.from("task_assignees").select("task_id").eq("person_id", id);
    const ids = (mine ?? []).map((r) => r.task_id as string);
    const { data: shared } = ids.length
      ? await supabase.from("task_assignees").select("task_id").in("task_id", ids).neq("person_id", id)
      : { data: [] };
    const others = new Set((shared ?? []).map((r) => r.task_id as string));
    const only = ids.filter((t) => !others.has(t));
    if (only.length) must(await supabase.from("tasks").delete().in("id", only));
  }
  must(await supabase.from("people").delete().eq("id", id));
  refresh();
  redirect("/people");
}

// ---------------------------------------------------------------- Sprints

export async function saveSprint(form: FormData) {
  const supabase = await db();
  const id = str(form, "id");
  const row = { name: str(form, "name"), goal: str(form, "goal"), start_date: str(form, "start_date"), end_date: str(form, "end_date") };
  if (!row.name || !row.start_date || !row.end_date) throw new Error("Nome, início e fim são obrigatórios.");
  const saved = id
    ? must(await supabase.from("sprints").update(row).eq("id", id).select("id").single())
    : must(await supabase.from("sprints").insert(row).select("id").single());
  refresh();
  redirect(`/sprints/${saved.id}`);
}

/** Exclui a sprint; tasks = keep (voltam ao backlog) | delete. */
export async function deleteSprint(id: string, form?: FormData) {
  const supabase = await db();
  if (form?.get("tasks") === "delete") must(await supabase.from("tasks").delete().eq("sprint_id", id));
  must(await supabase.from("sprints").delete().eq("id", id));
  refresh();
  redirect("/sprints");
}

/** Põe (ou tira, com null) a tarefa da sprint. */
export async function moveToSprint(taskId: string, sprintId: string | null) {
  const supabase = await db();
  must(await supabase.from("tasks").update({ sprint_id: sprintId }).eq("id", taskId));
  refresh();
}

/** Encerra a sprint: o que não terminou vai para a próxima (ou volta ao backlog). */
export async function completeSprint(id: string) {
  const supabase = await db();
  const { data: sprint } = await supabase.from("sprints").select("end_date").eq("id", id).single();
  const { data: next } = await supabase
    .from("sprints")
    .select("id")
    .gt("start_date", sprint?.end_date ?? "1970-01-01")
    .order("start_date")
    .limit(1)
    .maybeSingle();
  must(
    await supabase
      .from("tasks")
      .update({ sprint_id: next?.id ?? null })
      .eq("sprint_id", id)
      .in("status", ["suggested", "todo", "doing", "blocked"]),
  );
  refresh();
  redirect(next ? `/sprints/${next.id}` : "/sprints");
}

// ---------------------------------------------------------------- Modelos

/** Uma tarefa por linha: "Título ; dias depois do início ; horas". */
function parseTemplateTasks(text: string): TemplateTask[] {
  return text
    .split("\n")
    .map((line) => line.split(";").map((p) => p.trim()))
    .filter(([title]) => title)
    .map(([title, offset, h]) => ({
      title,
      offset_days: offset && Number.isFinite(Number(offset)) ? Number(offset) : null,
      estimate_hours: h && Number(h.replace(",", ".")) > 0 ? Number(h.replace(",", ".")) : null,
    }));
}

export async function saveTemplate(form: FormData) {
  const supabase = await db();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) throw new Error("Dê um nome ao modelo.");
  const row = {
    name,
    emoji: str(form, "emoji")?.slice(0, 8) ?? null,
    description: str(form, "description"),
    tasks: parseTemplateTasks(str(form, "tasks") ?? ""),
  };
  must(id ? await supabase.from("templates").update(row).eq("id", id) : await supabase.from("templates").insert(row));
  refresh();
  redirect("/templates");
}

/** Salva um projeto existente como modelo (tarefas com prazo relativo ao início). */
export async function templateFromProject(projectId: string) {
  const supabase = await db();
  const { data: p } = await supabase.from("projects").select("name, emoji, description, start_date, created_at").eq("id", projectId).single();
  if (!p) throw new Error("Projeto não encontrado.");
  const { data: tasks } = await supabase
    .from("tasks")
    .select("title, description, priority, estimate_hours, due_date, recurrence")
    .eq("project_id", projectId)
    .is("parent_id", null)
    .not("status", "in", "(suggested,canceled)")
    .order("due_date", { ascending: true, nullsFirst: false });
  const start = new Date(`${p.start_date ?? String(p.created_at).slice(0, 10)}T12:00:00Z`).getTime();
  must(
    await supabase.from("templates").insert({
      name: p.name,
      emoji: p.emoji,
      description: p.description,
      tasks: (tasks ?? []).map((t) => ({
        title: t.title,
        description: t.description || undefined,
        priority: t.priority,
        estimate_hours: t.estimate_hours,
        recurrence: t.recurrence,
        offset_days: t.due_date ? Math.max(0, Math.round((new Date(`${t.due_date}T12:00:00Z`).getTime() - start) / 86_400_000)) : null,
      })),
    }),
  );
  refresh();
  redirect("/templates");
}

export async function deleteTemplate(id: string, _form?: FormData) {
  const supabase = await db();
  must(await supabase.from("templates").delete().eq("id", id));
  refresh();
}

// ---------------------------------------------------------------- Temas e notas

/**
 * Exclui o tema. mode:
 *  keep      — só o tema; as notas ficam
 *  move      — as notas passam para o tema "target" antes
 *  exclusive — apaga também as notas que só tinham este tema
 *  all       — apaga também todas as notas deste tema
 */
export async function deleteTopic(id: string, form: FormData) {
  const supabase = await db();
  const mode = str(form, "mode") ?? "keep";
  const { data: topic } = await supabase.from("topics").select("cover_path").eq("id", id).single();
  const { data: rows } = await supabase.from("note_topics").select("note_id, relevance").eq("topic_id", id);
  const noteIds = (rows ?? []).map((r) => r.note_id as string);

  if (mode === "move") {
    const target = str(form, "target");
    if (!target || target === id) throw new Error("Escolha o tema que vai receber as notas.");
    if (rows?.length)
      must(
        await supabase
          .from("note_topics")
          .upsert(rows.map((r) => ({ note_id: r.note_id, topic_id: target, relevance: r.relevance, source: "manual" })), {
            onConflict: "note_id,topic_id",
            ignoreDuplicates: true,
          }),
      );
  }
  if (mode === "all") await deleteNotes(supabase, noteIds);
  if (mode === "exclusive" && noteIds.length) {
    const { data: other } = await supabase.from("note_topics").select("note_id").in("note_id", noteIds).neq("topic_id", id);
    const keep = new Set((other ?? []).map((r) => r.note_id as string));
    await deleteNotes(supabase, noteIds.filter((n) => !keep.has(n)));
  }
  if (topic?.cover_path) await supabase.storage.from("images").remove([topic.cover_path]);
  must(await supabase.from("topics").delete().eq("id", id));
  refresh();
  redirect("/topics");
}

/** Exclui a nota; tasks = keep (ficam sem nota) | delete (as que saíram dela). */
export async function deleteNote(id: string, form: FormData) {
  const supabase = await db();
  if (form.get("tasks") === "delete") must(await supabase.from("tasks").delete().eq("note_id", id));
  else await supabase.from("tasks").delete().eq("note_id", id).eq("status", "suggested");
  // Projetos que o Claude sugeriu a partir desta nota e ninguém aceitou
  await supabase.from("projects").delete().eq("origin_note_id", id).eq("status", "suggested");
  await deleteNotes(supabase, [id]);
  refresh();
  redirect("/notes");
}

/**
 * Cria os temas e pessoas que a análise propôs e você marcou (topic / person = slug)
 * e liga à nota. Com "discard", só limpa a proposta.
 */
export async function resolvePending(noteId: string, form: FormData) {
  const supabase = await db();
  const { data: note } = await supabase.from("notes").select("insights").eq("id", noteId).single();
  const insights = (note?.insights ?? {}) as Insights;
  const pending = insights.pending;
  if (!pending) return;
  const discard = form.has("discard");
  const topics = discard ? [] : pending.topics.filter((t) => form.getAll("topic").includes(t.slug));
  const people = discard ? [] : pending.people.filter((p) => form.getAll("person").includes(p.slug));
  const ents = discard ? [] : (pending.entities ?? []).filter((e) => form.getAll("entity").includes(`${e.kind}:${e.slug}`));

  if (ents.length) {
    must(await supabase.from("entities").upsert(
      ents.map((e) => ({ kind: e.kind, name: e.name, slug: e.slug, description: e.description || null })),
      { onConflict: "user_id,kind,slug", ignoreDuplicates: true },
    ));
    const { data: rows } = await supabase.from("entities").select("id, kind, slug").in("slug", ents.map((e) => e.slug));
    const links = (rows ?? [])
      .filter((r) => ents.some((e) => e.kind === r.kind && e.slug === r.slug))
      .map((r) => ({ note_id: noteId, entity_id: r.id as string, source: "ai" }));
    if (links.length) await supabase.from("note_entities").upsert(links, { ignoreDuplicates: true });
    // Sistemas novos: as ligações que o Claude tinha previsto (tarefas, projetos, empresas)
    const sysLinks = (rows ?? []).flatMap((r) =>
      (ents.find((e) => e.kind === r.kind && e.slug === r.slug)?.links ?? []).map((l) => ({ entity_id: r.id as string, target_type: l.type, target_id: l.id, source: "ai" })),
    );
    if (sysLinks.length) await supabase.from("entity_links").upsert(sysLinks, { onConflict: "entity_id,target_type,target_id", ignoreDuplicates: true });
  }

  if (topics.length) {
    must(await supabase.from("topics").upsert(
      topics.map((t) => ({ name: t.name, slug: t.slug, description: t.description, emoji: t.emoji })),
      { onConflict: "user_id,slug", ignoreDuplicates: true },
    ));
    const { data: rows } = await supabase.from("topics").select("id, slug").in("slug", topics.map((t) => t.slug));
    const id = new Map((rows ?? []).map((r) => [r.slug as string, r.id as string]));
    const links = topics.filter((t) => id.has(t.slug)).map((t) => ({ note_id: noteId, topic_id: id.get(t.slug)!, relevance: t.relevance, source: "ai" }));
    if (links.length) await supabase.from("note_topics").upsert(links, { onConflict: "note_id,topic_id", ignoreDuplicates: true });
  }

  if (people.length) {
    must(await supabase.from("people").upsert(
      people.map((p) => ({ name: p.name, slug: p.slug })),
      { onConflict: "user_id,slug", ignoreDuplicates: true },
    ));
    const { data: rows } = await supabase.from("people").select("id, slug").in("slug", people.map((p) => p.slug));
    const id = new Map((rows ?? []).map((r) => [r.slug as string, r.id as string]));
    const mine = people.filter((p) => id.has(p.slug));
    await supabase.from("note_people").upsert(mine.map((p) => ({ note_id: noteId, person_id: id.get(p.slug)! })), { ignoreDuplicates: true });
    // Só as tarefas que ainda existem (você pode ter descartado alguma)
    const wanted = [...new Set(mine.flatMap((p) => p.task_ids))];
    const { data: alive } = wanted.length ? await supabase.from("tasks").select("id").in("id", wanted) : { data: [] };
    const ok = new Set((alive ?? []).map((t) => t.id as string));
    const assignees = mine.flatMap((p) => p.task_ids.filter((t) => ok.has(t)).map((task_id) => ({ task_id, person_id: id.get(p.slug)! })));
    if (assignees.length) await supabase.from("task_assignees").upsert(assignees, { ignoreDuplicates: true });
  }

  delete insights.pending;
  must(await supabase.from("notes").update({ insights }).eq("id", noteId));
  refresh();
}

export async function removeMention(noteId: string, personId: string) {
  const supabase = await db();
  must(await supabase.from("note_people").delete().eq("note_id", noteId).eq("person_id", personId));
  refresh();
}

// ---------------------------------------------------------------- Empresas e sistemas

export async function saveEntity(form: FormData) {
  const supabase = await db();
  const id = str(form, "id");
  const kind = str(form, "kind") === "system" ? "system" : "company";
  const name = str(form, "name");
  if (!name) throw new Error("Escreva o nome.");
  const row = { kind, name, slug: slugify(name) || "sem-nome", description: str(form, "description"), url: str(form, "url") };
  const saved = id
    ? must(await supabase.from("entities").update(row).eq("id", id).select("slug").single())
    : must(await supabase.from("entities").upsert(row, { onConflict: "user_id,kind,slug" }).select("slug").single());
  refresh();
  redirect(`${kind === "system" ? "/systems" : "/companies"}/${saved.slug}`);
}

/** Exclui a empresa ou sistema; as notas e pessoas ligadas ficam (só perdem o vínculo). */
export async function deleteEntity(id: string, kind: string, _form?: FormData) {
  const supabase = await db();
  must(await supabase.from("entities").delete().eq("id", id));
  refresh();
  redirect(kind === "system" ? "/systems" : "/companies");
}

export async function unlinkEntity(noteId: string, entityId: string) {
  const supabase = await db();
  must(await supabase.from("note_entities").delete().eq("note_id", noteId).eq("entity_id", entityId));
  refresh();
}

/** Volta a nota para uma versão anterior; o texto atual vira versão também (nada se perde). */
export async function restoreVersion(noteId: string, versionId: string) {
  const supabase = await db();
  const [{ data: v }, { data: note }] = await Promise.all([
    supabase.from("note_versions").select("content, created_at").eq("id", versionId).single(),
    supabase.from("notes").select("content").eq("id", noteId).single(),
  ]);
  if (!v || !note) throw new Error("Versão não encontrada.");
  const when = new Date(v.created_at as string).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  must(await supabase.from("note_versions").insert({ note_id: noteId, content: note.content, changes: `Substituída ao restaurar a versão de ${when}.` }));
  must(await supabase.from("notes").update({ content: v.content }).eq("id", noteId));
  refresh();
  redirect(`/notes/${noteId}`);
}

/** Liga um sistema (existente, ou novo pelo nome) a um projeto, tarefa ou empresa. */
export async function linkSystem(type: "project" | "task" | "company", targetId: string, form: FormData) {
  const supabase = await db();
  let entityId = str(form, "entity_id");
  const name = str(form, "new_name");
  if (!entityId && name) {
    const row = must(
      await supabase.from("entities").upsert({ kind: "system", name, slug: slugify(name) || "sem-nome" }, { onConflict: "user_id,kind,slug" }).select("id").single(),
    );
    entityId = row.id as string;
  }
  if (!entityId) return;
  must(await supabase.from("entity_links").upsert({ entity_id: entityId, target_type: type, target_id: targetId, source: "manual" }, { onConflict: "entity_id,target_type,target_id" }));
  refresh();
}

export async function unlinkSystem(entityId: string, type: string, targetId: string) {
  const supabase = await db();
  must(await supabase.from("entity_links").delete().eq("entity_id", entityId).eq("target_type", type).eq("target_id", targetId));
  refresh();
}

/** Edita o tema: nome (o endereço acompanha), emoji, descrição e cor. */
export async function saveTopic(id: string, form: FormData) {
  const supabase = await db();
  const name = str(form, "name");
  if (!name) throw new Error("Escreva o nome.");
  const color = str(form, "color");
  const row = {
    name,
    slug: await freeSlug(supabase, "topics", name, id),
    emoji: str(form, "emoji")?.slice(0, 8) ?? null,
    description: str(form, "description"),
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : null,
  };
  const saved = must(await supabase.from("topics").update(row).eq("id", id).select("slug").single());
  refresh();
  redirect(`/topics/${saved.slug}`);
}
