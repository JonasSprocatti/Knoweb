import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NoteView, type LinkedNote, type NoteTopic } from "@/components/NoteView";
import type { AudioSegment, Note } from "@/lib/types";

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
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const supabase = await supabaseServer();

  const { data: note } = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
  if (!note) notFound();

  const [{ data: segments }, { data: topics }, { data: outgoing }, { data: incoming }] = await Promise.all([
    supabase.from("audio_segments").select("*").eq("note_id", id).order("seq"),
    supabase.from("note_topics").select("relevance, source, topics(id, name, slug)").eq("note_id", id).order("relevance", { ascending: false }),
    supabase.from("note_links").select("target_id, kind, reason, notes!note_links_target_id_fkey(id, title)").eq("source_id", id),
    supabase.from("note_links").select("source_id, kind, reason, notes!note_links_source_id_fkey(id, title)").eq("target_id", id),
  ]);

  type Joined = { id: string; title: string } | { id: string; title: string }[] | null;
  const one = (j: Joined) => (Array.isArray(j) ? j[0] : j);

  const noteTopics: NoteTopic[] = (topics ?? [])
    .map((t) => {
      const topic = one(t.topics as unknown as Joined) as unknown as { id: string; name: string; slug: string } | undefined;
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
      initialTopics={noteTopics}
      linked={linked}
      startEditing={edit === "1"}
    />
  );
}
