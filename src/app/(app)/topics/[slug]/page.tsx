import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NoteCard } from "@/components/NoteCard";
import { CoverPicker } from "@/components/CoverPicker";
import { topicColor } from "@/lib/topicColor";
import type { NoteListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();

  const { data: topic } = await supabase.from("topics").select("id, name, slug, description, color, emoji, cover_path").eq("slug", slug).maybeSingle();
  if (!topic) notFound();

  const { data: rows } = await supabase
    .from("note_topics")
    .select("relevance, notes(id, title, kind, status, summary, updated_at, duration_seconds, pinned, note_topics(relevance, topics(name, slug, color, emoji)))")
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
      <header className="flex flex-col gap-3">
        <Link href="/topics" className="text-faint underline-offset-4 hover:text-ink hover:underline">
          Todos os temas
        </Link>
        <h1 className="display text-3xl md:text-4xl" >
          <span className="mr-3 inline-block h-3 w-3 rounded-full align-middle" style={{ background: topicColor(topic) }} />
          {topic.name}
        </h1>
        {topic.description && <p className="max-w-2xl text-muted">{topic.description}</p>}
        <CoverPicker table="topics" id={topic.id} initialPath={topic.cover_path} />
      </header>

      {related.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-faint">Aparece junto com</span>
          {related.map((t) => (
            <Link key={t.slug} href={`/topics/${t.slug}`} className="rounded-md bg-panel px-3 py-0.5 text-muted hover:text-ink">
              {t.name} <span className="text-faint">{t.count}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-x-10 lg:grid-cols-2">
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} />
        ))}
      </div>

      <Link href={`/ask?q=${encodeURIComponent(`O que eu sei sobre ${topic.name}? Resuma os pontos principais.`)}`} className="self-start rounded-md bg-accent px-4 py-2 font-semibold text-on-accent hover:brightness-110">
        Perguntar ao Claude sobre este tema
      </Link>
    </div>
  );
}
