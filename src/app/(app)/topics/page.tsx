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
        <h1 className="display text-6xl md:text-7xl">Temas</h1>
        <p className="mt-3 max-w-xl text-lg text-muted">O Claude separa os temas das suas notas e gravações. Você também pode adicionar à mão em cada nota.</p>
      </header>

      {topics.length === 0 ? (
        <p className="py-6 text-muted">Nenhum tema ainda. Abra uma nota e toque em Analisar para o Claude encontrar os temas dela.</p>
      ) : (
        <ul className="flex flex-col">
          {topics.map((t) => {
            const color = topicColor(t);
            // O tamanho do nome acompanha quantas notas o tema tem
            const size = 1.1 + (t.count / max) * 1.4;
            return (
              <li key={t.id}>
                <Link href={`/topics/${t.slug}`} className="group -mx-3 flex items-baseline gap-4 rounded-xl px-3 py-2.5 transition hover:bg-panel">
                  <span className="w-8 shrink-0 text-center text-2xl" aria-hidden>
                    {t.emoji ?? <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-tight tracking-tight" style={{ fontSize: `${size}rem`, color: `color-mix(in srgb, ${color} 70%, var(--ink))` }}>
                      {t.name}
                    </span>
                    {t.description && <span className="line-clamp-1 text-muted">{t.description}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-faint">
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
