import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { QuickCapture } from "@/components/QuickCapture";
import { NoteCard } from "@/components/NoteCard";
import { Icon } from "@/components/Icon";
import type { Insights, NoteListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const LIST_COLUMNS = "id, title, kind, status, summary, updated_at, duration_seconds, pinned";

export default async function HomePage() {
  const supabase = await supabaseServer();

  const [{ data: pinned }, { data: recent }, { data: topics }, { data: withActions }] = await Promise.all([
    supabase.from("notes").select(LIST_COLUMNS).eq("pinned", true).order("updated_at", { ascending: false }).limit(6),
    supabase.from("notes").select(LIST_COLUMNS).order("updated_at", { ascending: false }).limit(9),
    supabase.from("topics").select("id, name, slug, note_topics(count)").limit(200),
    supabase
      .from("notes")
      .select("id, title, insights, created_at")
      .not("analyzed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const topTopics = (topics ?? [])
    .map((t) => ({
      ...t,
      count: (t.note_topics as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);

  const actions = (withActions ?? [])
    .flatMap((n) =>
      ((n.insights as Insights)?.action_items ?? []).map((a) => ({ ...a, noteId: n.id as string, noteTitle: n.title as string })),
    )
    .slice(0, 8);

  const hour = new Date().toLocaleString("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" });
  const h = Number(hour);
  const greeting = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{greeting}.</h1>
          <p className="text-sm text-muted">O que vale guardar hoje?</p>
        </div>
        <Link
          href="/record"
          className="hidden items-center gap-2 rounded-full bg-rec px-4 py-2 text-sm font-medium text-white shadow-md shadow-rec/25 transition hover:brightness-110 md:inline-flex"
        >
          <Icon name="mic" className="h-4 w-4" />
          Gravar conversa
        </Link>
      </header>

      <QuickCapture />

      {(pinned ?? []).length > 0 && (
        <section>
          <SectionTitle>Fixadas</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(pinned as NoteListItem[]).map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="flex items-center justify-between">
            <SectionTitle>Recentes</SectionTitle>
            <Link href="/notes" className="mb-3 text-xs text-muted hover:text-accent">
              ver todas →
            </Link>
          </div>
          {(recent ?? []).length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(recent as NoteListItem[]).map((n) => (
                <NoteCard key={n.id} note={n} />
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-8">
          {topTopics.length > 0 && (
            <section>
              <SectionTitle>Temas</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {topTopics.map((t) => (
                  <Link
                    key={t.id}
                    href={`/topics/${t.slug}`}
                    className="rounded-full border border-topic/30 bg-topic/10 px-2.5 py-1 text-xs text-topic transition hover:border-topic"
                  >
                    {t.name} <span className="opacity-60">{t.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {actions.length > 0 && (
            <section>
              <SectionTitle>Próximos passos extraídos</SectionTitle>
              <ul className="flex flex-col gap-2">
                {actions.map((a, i) => (
                  <li key={i} className="rounded-lg border border-line bg-panel p-3 text-sm">
                    <p className="text-ink">{a.text}</p>
                    <p className="mt-1 text-xs text-faint">
                      {[a.owner, a.due].filter(Boolean).join(" · ")}
                      {(a.owner || a.due) && " · "}
                      <Link href={`/notes/${a.noteId}`} className="hover:text-accent">
                        {a.noteTitle}
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">{children}</h2>;
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
      <p className="mb-1 font-medium text-ink">Sua teia está vazia.</p>
      <p>
        Grave uma conversa ou escreva uma nota acima. O Claude resume, separa os temas e liga tudo automaticamente.
      </p>
    </div>
  );
}
