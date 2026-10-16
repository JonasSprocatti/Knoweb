"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { slugify } from "@/lib/text";

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
async function freeSlug(supabase: SupabaseClient, table: "projects" | "people", name: string, exceptId?: string | null) {
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
    owner_id: str(form, "owner_id"),
  };
  const saved = id
    ? must(await supabase.from("projects").update(row).eq("id", id).select("slug").single())
    : must(await supabase.from("projects").insert(row).select("slug").single());
  const noteId = str(form, "note_id");
  if (noteId && !id) {
    const { data: p } = await supabase.from("projects").select("id").eq("slug", saved.slug).single();
    if (p) await supabase.from("project_notes").upsert({ project_id: p.id, note_id: noteId, relevance: 1, source: "manual" });
  }
  refresh();
  redirect(`/projects/${saved.slug}`);
}

export async function setProjectStatus(id: string, status: string) {
  const supabase = await db();
  must(await supabase.from("projects").update({ status }).eq("id", id));
  // Aceitar o projeto aceita também as tarefas que o Claude sugeriu para ele
  if (status === "active") await supabase.from("tasks").update({ status: "todo" }).eq("project_id", id).eq("status", "suggested");
  refresh();
}

export async function deleteProject(id: string, back?: unknown) {
  const supabase = await db();
  // Tarefas sugeridas para um projeto descartado não fazem sentido sozinhas
  await supabase.from("tasks").delete().eq("project_id", id).eq("status", "suggested");
  must(await supabase.from("projects").delete().eq("id", id));
  refresh();
  if (typeof back === "string") redirect(back);
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

export async function deleteTask(id: string, back?: unknown) {
  const supabase = await db();
  must(await supabase.from("tasks").delete().eq("id", id));
  refresh();
  if (typeof back === "string") redirect(back);
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
  };
  const saved = id
    ? must(await supabase.from("people").update(row).eq("id", id).select("slug").single())
    : must(await supabase.from("people").insert(row).select("slug").single());
  refresh();
  redirect(`/people/${saved.slug}`);
}

export async function deletePerson(id: string) {
  const supabase = await db();
  must(await supabase.from("people").delete().eq("id", id));
  refresh();
  redirect("/people");
}
