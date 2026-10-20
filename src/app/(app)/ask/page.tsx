import Link from "@/components/Link";
import { AskView, type Msg } from "@/components/AskView";
import { supabaseServer } from "@/lib/supabase/server";
import { relativeDate } from "@/lib/text";

export const metadata = { title: "Perguntar" };
export const dynamic = "force-dynamic";

type Session = { id: string; title: string; updated_at: string };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; busca?: string }> }) {
  const { q, s, busca = "" } = await searchParams;
  const supabase = await supabaseServer();

  // Histórico: as conversas mais recentes, ou as que têm a busca em alguma pergunta/resposta
  let ids: string[] | null = null;
  if (busca.trim()) {
    const { data } = await supabase.from("ask_messages").select("session_id").textSearch("search", busca, { type: "websearch", config: "portuguese" }).limit(200);
    ids = [...new Set((data ?? []).map((m) => m.session_id as string))];
  }
  let sessionsQuery = supabase.from("ask_sessions").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(60);
  if (ids) sessionsQuery = sessionsQuery.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const [{ data: sessions, error }, { data: msgs }] = await Promise.all([
    sessionsQuery,
    s ? supabase.from("ask_messages").select("role, content, sources").eq("session_id", s).order("id") : Promise.resolve({ data: null }),
  ]);
  const initial = (msgs ?? []) as Msg[];

  const history = !error && (
    <nav aria-label="Conversas anteriores" className="flex flex-col gap-2">
      <Link href="/ask" className="rounded-md bg-accent px-3 py-1.5 text-center text-sm font-semibold text-on-accent hover:brightness-110">
        + Nova conversa
      </Link>
      <form className="flex gap-1.5">
        {s && <input type="hidden" name="s" value={s} />}
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Buscar no que já perguntei"
          aria-label="Buscar nas conversas"
          className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </form>
      <ul className="flex flex-col">
        {((sessions ?? []) as Session[]).map((c) => (
          <li key={c.id}>
            <Link
              href={`/ask?s=${c.id}${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`}
              aria-current={c.id === s ? "page" : undefined}
              className={`block rounded-md px-2 py-1.5 text-sm ${c.id === s ? "bg-panel font-medium text-ink" : "text-muted hover:bg-panel hover:text-ink"}`}
            >
              <span className="line-clamp-2">{c.title}</span>
              <span className="text-xs text-faint">{relativeDate(c.updated_at)}</span>
            </Link>
          </li>
        ))}
        {!sessions?.length && <li className="px-2 py-1.5 text-sm text-faint">{busca ? `Nada com “${busca}”.` : "As conversas ficam salvas aqui."}</li>}
      </ul>
    </nav>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      {history && (
        <details className="rounded-lg border border-line bg-panel p-3 lg:hidden" open={!!busca}>
          <summary className="cursor-pointer text-sm font-medium">Conversas anteriores ({sessions?.length ?? 0})</summary>
          <div className="mt-3">{history}</div>
        </details>
      )}
      <AskView key={s ?? "nova"} initialQuestion={s ? "" : (q ?? "")} sessionId={s ?? null} initial={initial} />
      {history && <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">{history}</aside>}
    </div>
  );
}
