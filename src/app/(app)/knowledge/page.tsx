import Link from "@/components/Link";
import { supabaseServer } from "@/lib/supabase/server";
import { saveKnowledge } from "@/lib/work-actions";
import { formatDay } from "@/components/Work";
import { SaveButton } from "@/components/SaveButton";
import { KIND_LABEL } from "@/lib/knowledge";

export const metadata = { title: "Base de conhecimento" };
export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

type Row = { id: string; title: string; kind: string; status: string; content: string; updated_at: string };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const { busca = "" } = await searchParams;
  const supabase = await supabaseServer();
  // ponytail: traz o texto inteiro para o resumo do cartão; com centenas de artigos, pedir só um trecho (view)
  let query = supabase.from("knowledge").select("id, title, kind, status, content, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (busca.trim()) query = query.textSearch("search", busca, { type: "websearch", config: "portuguese" });
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];
  const projects = rows.filter((r) => r.kind === "project");
  const others = rows.filter((r) => r.kind !== "project");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header>
        <h1 className="display text-3xl md:text-4xl">Base de conhecimento</h1>
        <p className="mt-1 max-w-2xl text-muted">
          O que já é definitivo: artigos, respostas salvas do Perguntar, notas marcadas e o documento de cada projeto concluído. O Perguntar consulta a base antes das notas.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">Para usar a base, rode o SQL novo do supabase/schema.sql (Base de conhecimento) no Supabase.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-3">
            <form className="flex min-w-0 flex-1 gap-2">
              <input name="busca" defaultValue={busca} placeholder="Buscar na base" aria-label="Buscar na base" className={`${input} min-w-0 flex-1`} />
              <button className="rounded-md bg-surface px-3 text-sm text-muted hover:text-ink">Buscar</button>
            </form>
            <details className="w-full rounded-lg border border-line bg-panel p-4 sm:w-auto sm:min-w-80">
              <summary className="cursor-pointer font-semibold">+ Novo artigo</summary>
              <form action={saveKnowledge} className="mt-3 flex flex-col gap-2">
                <input name="title" required placeholder="Título" aria-label="Título" className={input} />
                <textarea name="content" rows={6} placeholder="O que ficou definido (Markdown; [[Nota]] liga a uma nota)" aria-label="Conteúdo" className={input} />
                <SaveButton />
              </form>
            </details>
          </div>

          {busca && !rows.length && <p className="text-muted">Nada na base com “{busca}”.</p>}

          {projects.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Projetos concluídos</h2>
              <Cards rows={projects} />
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Artigos e respostas</h2>
            {others.length ? (
              <Cards rows={others} />
            ) : (
              !busca && <p className="text-sm text-faint">Nada ainda. Salve uma resposta do Perguntar, marque uma nota como definitiva ou escreva um artigo.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Cards({ rows }: { rows: Row[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/knowledge/${r.id}`} className="press flex h-full flex-col gap-1.5 rounded-lg border border-line bg-panel p-4 hover:border-accent">
            <span className="font-semibold text-ink">{r.title}</span>
            <span className="line-clamp-2 text-sm text-muted">
              {r.status === "queued" || r.status === "writing" ? "A IA está escrevendo este documento…" : r.content.replace(/[#*_>`[\]]/g, "").slice(0, 220)}
            </span>
            <span className="mt-auto pt-1 text-xs text-faint">
              {KIND_LABEL[r.kind] ?? r.kind} · {formatDay(r.updated_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
