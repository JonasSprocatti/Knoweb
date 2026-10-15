import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { NoteCard } from "@/components/NoteCard";
import type { NoteListItem } from "@/lib/types";

export const metadata = { title: "Busca" };
export const dynamic = "force-dynamic";

type Hit = { id: string; title: string; summary: string | null; kind: "note" | "recording"; updated_at: string; snippet: string | null };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const supabase = await supabaseServer();

  let hits: Hit[] = [];
  let topics: { name: string; slug: string }[] = [];
  if (q.trim()) {
    const [{ data }, { data: t }, { data: byTitle }] = await Promise.all([
      supabase.rpc("search_notes", { q, max_results: 40 }),
      supabase.from("topics").select("name, slug").ilike("name", `%${q}%`).limit(10),
      supabase.from("notes").select("id, title, summary, kind, updated_at").ilike("title", `%${q}%`).limit(10),
    ]);
    const seen = new Set<string>();
    hits = [...((data ?? []) as Hit[]), ...((byTitle ?? []) as Hit[]).map((n) => ({ ...n, snippet: null }))].filter((h) =>
      seen.has(h.id) ? false : (seen.add(h.id), true),
    );
    topics = t ?? [];
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header>
        <h1 className="display text-3xl md:text-4xl">Busca</h1>
        <form action="/search" className="mt-3">
          <input
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="Palavras, frases entre aspas, -excluir…"
            className="w-full rounded-md border border-line bg-panel px-4 py-2.5 text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </form>
      </header>

      {q && (
        <>
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <Link key={t.slug} href={`/topics/${t.slug}`} className="rounded-md border border-topic/30 bg-topic/10 px-2.5 py-1 text-xs text-topic">
                  {t.name}
                </Link>
              ))}
            </div>
          )}
          <p className="text-sm text-faint">
            {hits.length} {hits.length === 1 ? "resultado" : "resultados"} ·{" "}
            <Link href={`/ask?q=${encodeURIComponent(q)}`} className="text-accent hover:underline">
              perguntar ao Claude
            </Link>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {hits.map((h) => (
              <NoteCard
                key={h.id}
                note={{ ...h, status: "ready", duration_seconds: 0, pinned: false } as NoteListItem}
                snippet={h.snippet}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
