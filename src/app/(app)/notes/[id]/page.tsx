import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NoteView, type LinkedNote, type NoteTopic } from "@/components/NoteView";
import { NoteWork } from "@/components/NoteWork";
import type { AudioSegment, Note } from "@/lib/types";
import type { NoteFile } from "@/lib/files";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("notes").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Nota" };
}

export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; versao?: string }>;
}) {
  const { id } = await params;
  const { edit, versao } = await searchParams;
  const supabase = await supabaseServer();

  const { data: row } = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  // O vetor da busca (~19 KB) e o índice de palavras não vão para o navegador
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { embedding, search, ...note } = row;

  const [{ data: segments }, { data: files }, { data: topics }, { data: outgoing }, { data: incoming }, { count: sugTasks }, { count: sugProjects }, { data: versions }] = await Promise.all([
    supabase.from("audio_segments").select("*").eq("note_id", id).order("seq"),
    supabase.from("note_files").select("*").eq("note_id", id).order("created_at"),
    supabase.from("note_topics").select("relevance, source, topics(id, name, slug, color, emoji)").eq("note_id", id).order("relevance", { ascending: false }),
    supabase.from("note_links").select("target_id, kind, reason, notes!note_links_target_id_fkey(id, title)").eq("source_id", id),
    supabase.from("note_links").select("source_id, kind, reason, notes!note_links_source_id_fkey(id, title)").eq("target_id", id),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("note_id", id).eq("status", "suggested"),
    supabase.from("project_notes").select("projects!inner(status)", { count: "exact", head: true }).eq("note_id", id).eq("projects.status", "suggested"),
    supabase.from("note_versions").select("id, changes, file_name, created_at").eq("note_id", id).order("created_at", { ascending: false }),
  ]);
  const pending = (note as Note).insights?.pending;
  const toReview = (pending?.topics.length ?? 0) + (pending?.people.length ?? 0) + (pending?.entities?.length ?? 0) + (sugTasks ?? 0) + (sugProjects ?? 0);

  type Joined = { id: string; title: string } | { id: string; title: string }[] | null;
  const one = (j: Joined) => (Array.isArray(j) ? j[0] : j);

  const noteTopics: NoteTopic[] = (topics ?? [])
    .map((t) => {
      const topic = one(t.topics as unknown as Joined) as unknown as Omit<NoteTopic, "relevance" | "source"> | undefined;
      return topic ? { ...topic, relevance: t.relevance as number, source: t.source as "ai" | "manual" } : null;
    })
    .filter((t): t is NoteTopic => !!t);

  const linked: LinkedNote[] = [];
  for (const l of outgoing ?? []) {
    const n = one(l.notes as unknown as Joined);
    if (n) linked.push({ id: n.id, title: n.title, kind: l.kind as LinkedNote["kind"], reason: l.reason, direction: "out" });
  }
  for (const l of incoming ?? []) {
    const n = one(l.notes as unknown as Joined);
    if (n) linked.push({ id: n.id, title: n.title, kind: l.kind as LinkedNote["kind"], reason: l.reason, direction: "in" });
  }

  return (
    <NoteView
      initialNote={note as Note}
      initialSegments={(segments ?? []) as AudioSegment[]}
      initialFiles={(files ?? []) as NoteFile[]}
      toReview={toReview}
      newVersion={versao === "nova" && versions?.[0] ? { id: versions[0].id as string, changes: (versions[0].changes as string | null) ?? "" } : null}
      initialTopics={noteTopics}
      linked={linked}
      startEditing={edit === "1"}
      work={<NoteWork supabase={supabase} noteId={id} pending={(note as Note).insights?.pending} versions={versions ?? []} />}
    />
  );
}
