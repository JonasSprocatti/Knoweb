import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Temas" };
export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("topics").select("id, name, slug, description, note_topics(count)").order("name");

  const topics = (data ?? [])
    .map((t) => ({ ...t, count: (t.note_topics as unknown as { count: number }[] | null)?.[0]?.count ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));

  const max = Math.max(1, ...topics.map((t) => t.count));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Temas</h1>
        <p className="text-sm text-muted">Separados pelo Claude a partir das suas notas e gravações. Você também pode adicionar à mão em cada nota.</p>
      </header>

      {topics.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
          Nenhum tema ainda. Analise uma nota com o Claude para começar.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <Link
              key={t.id}
              href={`/topics/${t.slug}`}
              className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4 transition hover:border-topic/60"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-medium text-topic">{t.name}</h2>
                <span className="text-xs text-faint">
                  {t.count} {t.count === 1 ? "nota" : "notas"}
                </span>
              </div>
              {t.description && <p className="line-clamp-2 text-sm text-muted">{t.description}</p>}
              <div className="mt-auto h-1 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-topic/60" style={{ width: `${(t.count / max) * 100}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
