import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkSystem, unlinkSystem } from "@/lib/work-actions";
import { ENTITY } from "@/lib/entities";
import { Icon } from "@/components/Icon";

type Target = "project" | "task" | "company";

/** Sistemas ligados a um projeto, tarefa ou empresa: chips com ×, e um seletor para ligar mais. */
export async function SystemLinks({ supabase, type, id, title = "Sistemas" }: { supabase: SupabaseClient; type: Target; id: string; title?: string }) {
  const [{ data: links }, { data: all }] = await Promise.all([
    supabase.from("entity_links").select("source, entities(id, name, slug)").eq("target_type", type).eq("target_id", id),
    supabase.from("entities").select("id, name").eq("kind", "system").order("name"),
  ]);
  type E = { id: string; name: string; slug: string };
  const linked = (links ?? [])
    .map((l) => ({ ...((Array.isArray(l.entities) ? l.entities[0] : l.entities) as E | null), source: l.source as string }))
    .filter((e): e is E & { source: string } => !!e.id);
  const free = (all ?? []).filter((s) => !linked.some((l) => l.id === s.id));
  const color = ENTITY.system.color;

  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-1.5">
        {linked.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-1 text-sm" style={{ borderColor: `${color}66` }} title={e.source === "ai" ? "Ligado pelo Claude" : undefined}>
            <span style={{ color }}><Icon name="server" className="h-3.5 w-3.5" /></span>
            <Link href={`/systems/${e.slug}`} className="text-ink hover:underline">{e.name}</Link>
            {e.source === "ai" && <span className="text-[10px] text-faint">IA</span>}
            <form action={unlinkSystem.bind(null, e.id, type, id)}>
              <button className="px-1 text-faint hover:text-rec" aria-label={`Desligar ${e.name}`}>×</button>
            </form>
          </span>
        ))}
        {!linked.length && <p className="text-sm text-faint">Nenhum ainda.</p>}
      </div>
      <form action={linkSystem.bind(null, type, id)} className="mt-2 flex gap-2">
        <select name="entity_id" aria-label="Ligar sistema" defaultValue="" className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2 py-1 text-sm">
          <option value="">{free.length ? "Ligar um sistema…" : "Todos os sistemas já ligados"}</option>
          {free.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input name="new_name" placeholder="ou novo" aria-label="Novo sistema" className="w-24 rounded-md border border-line bg-panel px-2 py-1 text-sm" />
        <button className="press rounded-md bg-surface px-3 text-sm text-muted hover:text-ink">Ligar</button>
      </form>
    </section>
  );
}
