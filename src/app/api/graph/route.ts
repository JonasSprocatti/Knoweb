import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { serverError, unauthorized } from "@/lib/server/http";
import { topicColor } from "@/lib/topicColor";
import type { GraphLink, GraphNode } from "@/lib/types";

const NO_TOPIC_COLOR = "#D6CEC2";
const PERSON_COLOR = "#B5523B";
const TASK_COLOR = "#8A8073";
const SPRINT_COLOR = "#3F7A93";
const ENTITY_COLOR = { company: "#5B6BB5", system: "#3E8E9E" } as const;

/**
 * Nós (notas, temas, projetos, tarefas, pessoas) e arestas (nota↔tema,
 * wikilinks, ligações do Claude, projeto↔nota, tarefa↔projeto/nota/pessoa,
 * subtarefas e dependências, nota↔pessoa citada).
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const [notes, topics, noteTopics, links, projects, tasks, people, projectNotes, assignees, notePeople, deps, sprints, entities, noteEntities, entityLinks] = await Promise.all([
    supabase.from("notes").select("id, title, kind, created_at, cover_path").limit(3000),
    supabase.from("topics").select("id, name, slug, color, emoji, cover_path, created_at"),
    supabase.from("note_topics").select("note_id, topic_id, relevance"),
    supabase.from("note_links").select("source_id, target_id, kind"),
    supabase.from("projects").select("id, name, slug, color, emoji, owner_id, created_at").not("status", "in", "(suggested,archived)"),
    supabase.from("tasks").select("id, number, title, status, project_id, parent_id, note_id, sprint_id, created_at").not("status", "in", "(suggested,canceled)").limit(3000),
    supabase.from("people").select("id, name, slug, company_id, created_at"),
    supabase.from("project_notes").select("project_id, note_id"),
    supabase.from("task_assignees").select("task_id, person_id"),
    supabase.from("note_people").select("note_id, person_id"),
    supabase.from("task_dependencies").select("task_id, blocked_by"),
    supabase.from("sprints").select("id, name, created_at"),
    supabase.from("entities").select("id, kind, name, slug, created_at"),
    supabase.from("note_entities").select("note_id, entity_id"),
    supabase.from("entity_links").select("entity_id, target_type, target_id"),
  ]);
  const err =
    notes.error || topics.error || noteTopics.error || links.error || projects.error || tasks.error ||
    people.error || projectNotes.error || assignees.error || notePeople.error || deps.error || sprints.error || entities.error || noteEntities.error;
  if (err) return serverError(err);

  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  const colorByTopic = new Map((topics.data ?? []).map((t) => [t.id as string, topicColor(t)]));
  // A nota herda a cor do tema em que ela é mais relevante
  const mainTopic = new Map<string, { topic: string; relevance: number }>();

  const graphLinks: GraphLink[] = [];
  for (const nt of noteTopics.data ?? []) {
    graphLinks.push({ source: nt.note_id, target: `t:${nt.topic_id}`, kind: "topic" });
    bump(nt.note_id);
    bump(`t:${nt.topic_id}`);
    const rel = Number(nt.relevance) || 0;
    if ((mainTopic.get(nt.note_id)?.relevance ?? -1) < rel) mainTopic.set(nt.note_id, { topic: nt.topic_id, relevance: rel });
  }
  const seenPairs = new Set<string>();
  for (const l of links.data ?? []) {
    const key = [l.source_id, l.target_id].sort().join("|") + l.kind;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    graphLinks.push({ source: l.source_id, target: l.target_id, kind: l.kind as GraphLink["kind"] });
    bump(l.source_id);
    bump(l.target_id);
  }

  // ---- Trabalho: projetos, tarefas e pessoas -------------------------
  const ids = new Set<string>([
    ...(notes.data ?? []).map((n) => n.id as string),
    ...(projects.data ?? []).map((p) => `p:${p.id}`),
    ...(tasks.data ?? []).map((t) => `k:${t.id}`),
    ...(people.data ?? []).map((p) => `u:${p.id}`),
    ...(sprints.data ?? []).map((s) => `s:${s.id}`),
    ...(entities.data ?? []).map((e) => `e:${e.id}`),
  ]);
  const link = (source: string, target: string, kind: GraphLink["kind"]) => {
    if (!ids.has(source) || !ids.has(target)) return; // sugestões e arquivados ficam de fora
    graphLinks.push({ source, target, kind });
    bump(source);
    bump(target);
  };
  for (const pn of projectNotes.data ?? []) link(`p:${pn.project_id}`, pn.note_id, "project");
  for (const p of projects.data ?? []) if (p.owner_id) link(`u:${p.owner_id}`, `p:${p.id}`, "assignee");
  for (const t of tasks.data ?? []) {
    if (t.project_id) link(`k:${t.id}`, `p:${t.project_id}`, "task");
    if (t.parent_id) link(`k:${t.id}`, `k:${t.parent_id}`, "task");
    if (t.note_id) link(`k:${t.id}`, t.note_id, "task");
    if (t.sprint_id) link(`k:${t.id}`, `s:${t.sprint_id}`, "sprint");
  }
  for (const d of deps.data ?? []) link(`k:${d.task_id}`, `k:${d.blocked_by}`, "task");
  for (const a of assignees.data ?? []) link(`k:${a.task_id}`, `u:${a.person_id}`, "assignee");
  for (const np of notePeople.data ?? []) link(np.note_id, `u:${np.person_id}`, "mention");
  for (const ne of noteEntities.data ?? []) link(ne.note_id, `e:${ne.entity_id}`, "entity");
  for (const p of people.data ?? []) if (p.company_id) link(`u:${p.id}`, `e:${p.company_id}`, "entity");
  const prefix = { project: "p:", task: "k:", company: "e:" } as const;
  for (const l of entityLinks.data ?? []) link(`e:${l.entity_id}`, `${prefix[l.target_type as keyof typeof prefix]}${l.target_id}`, "entity");

  const projectColorById = new Map((projects.data ?? []).map((p) => [p.id as string, topicColor(p)]));

  // Imagens: URLs assinadas de uma vez só (bucket privado)
  const paths = [...(notes.data ?? []), ...(topics.data ?? [])].map((r) => r.cover_path as string | null).filter((p): p is string => !!p);
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("images").createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  const imageOf = (p: string | null) => (p ? (urlByPath.get(p) ?? null) : null);

  const nodes: GraphNode[] = [
    ...(notes.data ?? []).map((n) => {
      const main = mainTopic.get(n.id as string);
      return {
        id: n.id as string,
        label: n.title as string,
        type: (n.kind === "recording" ? "recording" : "note") as GraphNode["type"],
        weight: degree.get(n.id as string) ?? 0,
        color: (main && colorByTopic.get(main.topic)) || NO_TOPIC_COLOR,
        image: imageOf(n.cover_path as string | null),
        created_at: n.created_at as string,
      };
    }),
    ...(topics.data ?? []).map((t) => ({
      id: `t:${t.id}`,
      label: t.name as string,
      type: "topic" as const,
      slug: t.slug as string,
      weight: degree.get(`t:${t.id}`) ?? 0,
      color: colorByTopic.get(t.id as string)!,
      emoji: t.emoji as string | null,
      image: imageOf(t.cover_path as string | null),
      created_at: t.created_at as string,
    })),
    ...(projects.data ?? []).map((p) => ({
      id: `p:${p.id}`,
      label: p.name as string,
      type: "project" as const,
      slug: p.slug as string,
      weight: degree.get(`p:${p.id}`) ?? 0,
      color: projectColorById.get(p.id as string)!,
      emoji: p.emoji as string | null,
      created_at: p.created_at as string,
    })),
    ...(tasks.data ?? []).map((t) => ({
      id: `k:${t.id}`,
      label: `T-${t.number} ${t.title}`,
      type: "task" as const,
      weight: degree.get(`k:${t.id}`) ?? 0,
      color: (t.project_id && projectColorById.get(t.project_id as string)) || TASK_COLOR,
      created_at: t.created_at as string,
    })),
    ...(people.data ?? []).map((p) => ({
      id: `u:${p.id}`,
      label: p.name as string,
      type: "person" as const,
      slug: p.slug as string,
      weight: degree.get(`u:${p.id}`) ?? 0,
      color: PERSON_COLOR,
      created_at: p.created_at as string,
    })),
    ...(entities.data ?? []).map((e) => ({
      id: `e:${e.id}`,
      label: e.name as string,
      type: e.kind as "company" | "system",
      slug: e.slug as string,
      weight: degree.get(`e:${e.id}`) ?? 0,
      color: ENTITY_COLOR[e.kind as "company" | "system"],
      created_at: e.created_at as string,
    })),
    ...(sprints.data ?? []).map((s) => ({
      id: `s:${s.id}`,
      label: s.name as string,
      type: "sprint" as const,
      weight: degree.get(`s:${s.id}`) ?? 0,
      color: SPRINT_COLOR,
      created_at: s.created_at as string,
    })),
  ];

  return NextResponse.json({ nodes, links: graphLinks });
}
