import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NoteCard } from "@/components/NoteCard";
import type { NoteListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();

  const { data: topic } = await supabase.from("topics").select("id, name, description").eq("slug", slug).maybeSingle();
  if (!topic) notFound();

  const { data: rows } = await supabase
    .from("note_topics")
    .select("relevance, notes(id, title, kind, status, summary, updated_at, duration_seconds, pinned)")
    .eq("topic_id", topic.id)
    .order("relevance", { ascending: false });

  const notes = (rows ?? [])
    .map((r) => (Array.isArray(r.notes) ? r.notes[0] : r.notes) as unknown as NoteListItem | null)
    .filter((n): n is NoteListItem => !!n);

  // Temas que aparecem junto com este (vizinhos na teia)
  const noteIds = notes.map((n) => n.id);
  const { data: siblings } = noteIds.length
    ? await supabase.from("note_topics").select("topics(id, name, slug)").in("note_id", noteIds).neq("topic_id", topic.id)
    : { data: [] };
  const counts = new Map<string, { name: string; slug: string; count: number }>();
  for (const s of siblings ?? []) {
    const t = (Array.isArray(s.topics) ? s.topics[0] : s.topics) as unknown as { id: string; name: string; slug: string } | null;
    if (!t) continue;
    const cur = counts.get(t.id) ?? { name: t.name, slug: t.slug, count: 0 };
    cur.count++;
    counts.set(t.id, cur);
  }
  const related = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/topics" className="text-xs text-faint hover:text-accent">
          ← Temas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-topic">{topic.name}</h1>
        {topic.description && <p className="text-sm text-muted">{topic.description}</p>}
      </header>

      {related.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-faint">Aparece junto com:</span>
          {related.map((t) => (
            <Link key={t.slug} href={`/topics/${t.slug}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-topic hover:text-topic">
              {t.name} <span className="opacity-60">{t.count}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} />
        ))}
      </div>

      <Link href={`/ask?q=${encodeURIComponent(`O que eu sei sobre ${topic.name}? Resuma os pontos principais.`)}`} className="self-start text-sm text-accent hover:underline">
        Perguntar ao Claude sobre este tema →
      </Link>
    </div>
  );
}
