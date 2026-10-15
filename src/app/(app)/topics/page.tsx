import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { topicColor } from "@/lib/topicColor";

export const metadata = { title: "Temas" };
export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("topics").select("id, name, slug, description, color, emoji, note_topics(count)").order("name");

  const topics = (data ?? [])
    .map((t) => ({ ...t, count: (t.note_topics as unknown as { count: number }[] | null)?.[0]?.count ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));

  const max = Math.max(1, ...topics.map((t) => t.count));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="display text-3xl md:text-4xl">Temas</h1>
        <p className="mt-1 max-w-xl text-muted">O Claude separa os temas das suas notas e gravações. Você também pode adicionar à mão em cada nota.</p>
      </header>

      {topics.length === 0 ? (
        <p className="py-6 text-muted">Nenhum tema ainda. Abra uma nota e toque em Analisar para o Claude encontrar os temas dela.</p>
      ) : (
        <ul className="flex flex-col rounded-lg border border-line bg-panel px-3">
          {topics.map((t) => {
            const color = topicColor(t);
            return (
              <li key={t.id} className="border-b border-line last:border-0">
                <Link href={`/topics/${t.slug}`} className="flex items-center gap-4 px-1 py-3 transition hover:bg-panel">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{t.name}</span>
                    {t.description && <span className="line-clamp-1 text-sm text-muted">{t.description}</span>}
                  </span>
                  {/* Participação do tema em relação ao maior */}
                  <span className="hidden h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-surface sm:block" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${(t.count / max) * 100}%`, background: color }} />
                  </span>
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums text-faint">
                    {t.count} {t.count === 1 ? "nota" : "notas"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
