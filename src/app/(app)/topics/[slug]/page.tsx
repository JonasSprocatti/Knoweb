import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NoteCard } from "@/components/NoteCard";
import { CoverPicker } from "@/components/CoverPicker";
import { topicColor } from "@/lib/topicColor";
import type { NoteListItem } from "@/lib/types";
import { ConfirmDelete, DeleteOption } from "@/components/ConfirmDelete";
import { deleteTopic, saveTopic } from "@/lib/work-actions";
import { SaveButton } from "@/components/SaveButton";

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

  // Para a janela de exclusão: notas que só têm este tema e os outros temas (destino)
  const withOthers = new Set(
    notes.filter((n) => (n.note_topics ?? []).some((nt) => (nt.topics as { slug?: string } | null)?.slug !== topic.slug)).map((n) => n.id),
  );
  const exclusive = notes.filter((n) => !withOthers.has(n.id)).length;
  const { data: otherTopics } = await supabase.from("topics").select("id, name").neq("id", topic.id).order("name");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link href="/topics" className="text-faint underline-offset-4 hover:text-ink hover:underline">
          Todos os temas
        </Link>
        <h1 className="display text-3xl md:text-4xl" >
          <span className="mr-3 inline-block h-3 w-3 rounded-full align-middle" style={{ background: topicColor(topic) }} />
          {topic.emoji && <span className="mr-2">{topic.emoji}</span>}
          {topic.name}
        </h1>
        {topic.description && <p className="max-w-2xl text-muted">{topic.description}</p>}
        <CoverPicker table="topics" id={topic.id} initialPath={topic.cover_path} />
        <details className="max-w-xl rounded-lg border border-line bg-panel p-4">
          <summary className="cursor-pointer font-semibold">Editar tema</summary>
          <form action={saveTopic.bind(null, topic.id)} className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex gap-2">
              <label className="flex w-16 flex-col gap-1 text-xs text-muted">
                Emoji
                <input name="emoji" defaultValue={topic.emoji ?? ""} maxLength={8} placeholder="🏷️" className="rounded-md border border-line bg-panel px-2 py-1.5 text-center text-sm" />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
                Nome
                <input name="name" required defaultValue={topic.name} className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink" />
              </label>
              <label className="flex w-16 flex-col gap-1 text-xs text-muted">
                Cor
                <input name="color" type="color" defaultValue={topicColor(topic)} className="h-[34px] w-full cursor-pointer rounded-md border border-line bg-panel p-0.5" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Descrição
              <textarea name="description" defaultValue={topic.description ?? ""} rows={2} placeholder="Do que este tema trata" className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink" />
            </label>
            <SaveButton className="self-start" />
          </form>
        </details>
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

      <div className="flex flex-wrap items-center gap-4">
        <Link href={`/ask?q=${encodeURIComponent(`O que eu sei sobre ${topic.name}? Resuma os pontos principais.`)}`} className="rounded-md bg-accent px-4 py-2 font-semibold text-on-accent hover:brightness-110">
          Perguntar ao Claude sobre este tema
        </Link>
        <ConfirmDelete action={deleteTopic.bind(null, topic.id)} title={`Excluir o tema “${topic.name}”?`} label="Excluir tema">
          <p className="text-muted">
            {notes.length === 0 ? "Nenhuma nota usa este tema." : `${notes.length} ${notes.length === 1 ? "nota usa" : "notas usam"} este tema. O que fazer com elas?`}
          </p>
          <DeleteOption value="keep" defaultChecked label="Excluir só o tema e manter as notas" hint="As notas continuam, só perdem este tema." />
          {notes.length > 0 && (otherTopics ?? []).length > 0 && (
            <DeleteOption value="move" label="Mover as notas para outro tema" hint="Junta este tema em outro.">
              <select name="target" aria-label="Tema de destino" defaultValue="" className="rounded-md border border-line bg-panel px-2 py-1 text-sm">
                <option value="">Escolha o tema…</option>
                {(otherTopics ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </DeleteOption>
          )}
          {exclusive > 0 && exclusive < notes.length && (
            <DeleteOption value="exclusive" label={`Excluir o tema e as ${exclusive} notas que só têm ele`} hint="Notas que também têm outros temas ficam." />
          )}
          {notes.length > 0 && <DeleteOption value="all" label={`Excluir o tema e todas as ${notes.length} notas`} hint="Inclui os áudios delas." />}
        </ConfirmDelete>
      </div>
    </div>
  );
}
