import Link from "@/components/Link";
import { supabaseServer } from "@/lib/supabase/server";
import { LIST_COLUMNS, NoteCard } from "@/components/NoteCard";
import { NewNoteButton } from "@/components/NewNoteButton";
import type { NoteListItem } from "@/lib/types";

export const metadata = { title: "Notas" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "Tudo" },
  { key: "gravacoes", label: "Gravações" },
  { key: "escritas", label: "Escritas" },
  { key: "sem-analise", label: "Sem análise" },
];

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ tipo?: string; pagina?: string }> }) {
  const { tipo = "", pagina = "1" } = await searchParams;
  const page = Math.max(1, Number(pagina) || 1);
  const perPage = 30;
  const supabase = await supabaseServer();

  let query = supabase
    .from("notes")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (tipo === "gravacoes") query = query.eq("kind", "recording");
  if (tipo === "escritas") query = query.eq("kind", "note");
  if (tipo === "sem-analise") query = query.is("analyzed_at", null);

  const { data, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / perPage));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl md:text-4xl">Notas</h1>
        <NewNoteButton />
      </header>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/notes?tipo=${f.key}` : "/notes"}
            aria-current={tipo === f.key ? "page" : undefined}
            className={`rounded-md px-3.5 py-1 transition ${tipo === f.key ? "bg-ink text-bg" : "text-muted hover:bg-panel hover:text-ink"}`}
          >
            {f.label}
          </Link>
        ))}
        <span className="ml-auto self-center text-faint">
          {count ?? 0} {count === 1 ? "nota" : "notas"}
        </span>
      </div>

      {(data ?? []).length === 0 ? (
        <p className="py-6 text-muted">Nenhuma nota neste filtro. Escreva uma nova ou grave uma conversa.</p>
      ) : (
        <div className="grid gap-x-10 lg:grid-cols-2">
          {(data as NoteListItem[]).map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/notes?${new URLSearchParams({ ...(tipo ? { tipo } : {}), pagina: String(page - 1) })}`} className="text-link hover:underline">
              Anteriores
            </Link>
          )}
          <span className="text-faint">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/notes?${new URLSearchParams({ ...(tipo ? { tipo } : {}), pagina: String(page + 1) })}`} className="text-link hover:underline">
              Mais antigas
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
