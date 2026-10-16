import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteEntity, saveEntity } from "@/lib/work-actions";
import { ENTITY } from "@/lib/entities";
import { Icon } from "@/components/Icon";
import { SaveButton } from "@/components/SaveButton";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { formatDay } from "@/components/Work";
import { SystemLinks } from "@/components/SystemLinks";
import type { Entity, EntityKind } from "@/lib/types";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

/** Lista de empresas ou de sistemas, com quantas notas citam cada um. */
export async function EntityList({ kind }: { kind: EntityKind }) {
  const t = ENTITY[kind];
  const supabase = await supabaseServer();
  const { data } = await supabase.from("entities").select("id, name, slug, description, note_entities(count)").eq("kind", kind).order("name");
  const rows = (data ?? []).map((e) => ({ ...e, notes: (e.note_entities as unknown as { count: number }[])?.[0]?.count ?? 0 }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="display text-3xl md:text-4xl">{t.many}</h1>
        <p className="mt-1 max-w-xl text-muted">{t.hint} O Claude reconhece {kind === "company" ? "as empresas citadas" : "os sistemas citados"} nas notas e pergunta antes de criar.</p>
      </header>

      <form action={saveEntity} className="flex flex-wrap gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input name="name" required placeholder="Nome" aria-label="Nome" className={`${input} min-w-40 flex-1`} />
        <input name="description" placeholder={kind === "company" ? "O que é (cliente, fornecedor…)" : "Para que serve"} aria-label="Descrição" className={`${input} min-w-40 flex-1`} />
        <SaveButton>{t.newOne}</SaveButton>
      </form>

      {rows.length === 0 ? (
        <p className="text-muted">Nada ainda. Analise uma nota que cite {kind === "company" ? "uma empresa" : "um sistema"} ou adicione aqui em cima.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((e) => (
            <li key={e.id}>
              <Link href={`${t.path}/${e.slug}`} className="press flex items-start gap-3 rounded-lg border border-line bg-panel p-3 hover:border-accent">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: `${t.color}22`, color: t.color }}>
                  <Icon name={t.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{e.name}</span>
                  {e.description && <span className="line-clamp-2 text-sm text-muted">{e.description}</span>}
                </span>
                <span className="shrink-0 text-xs text-faint">{e.notes} {e.notes === 1 ? "nota" : "notas"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Página de uma empresa ou sistema: notas que citam, projetos dessas notas e (empresa) as pessoas dela. */
export async function EntityDetail({ kind, slug }: { kind: EntityKind; slug: string }) {
  const t = ENTITY[kind];
  const supabase = await supabaseServer();
  const { data: entity } = await supabase.from("entities").select("*").eq("kind", kind).eq("slug", slug).maybeSingle<Entity>();
  if (!entity) notFound();

  const [{ data: links }, { data: people }] = await Promise.all([
    supabase.from("note_entities").select("notes(id, title, summary, created_at)").eq("entity_id", entity.id),
    kind === "company" ? supabase.from("people").select("id, name, slug, role").eq("company_id", entity.id).order("name") : Promise.resolve({ data: [] }),
  ]);
  type N = { id: string; title: string; summary: string | null; created_at: string };
  const notes = (links ?? [])
    .map((l) => (Array.isArray(l.notes) ? l.notes[0] : l.notes) as N | null)
    .filter((n): n is N => !!n)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { data: pn } = notes.length
    ? await supabase.from("project_notes").select("projects(id, name, slug, emoji, status)").in("note_id", notes.map((n) => n.id))
    : { data: [] };
  type P = { id: string; name: string; slug: string; emoji: string | null; status: string };
  const projects = [...new Map((pn ?? []).map((r) => (Array.isArray(r.projects) ? r.projects[0] : r.projects) as P | null).filter((p): p is P => !!p && p.status !== "suggested").map((p) => [p.id, p])).values()];

  return (
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link href={t.path} className="text-faint underline-offset-4 hover:text-ink hover:underline">{t.many}</Link>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: `${t.color}22`, color: t.color }}>
              <Icon name={t.icon} className="h-6 w-6" />
            </span>
            <h1 className="display text-3xl md:text-4xl">{entity.name}</h1>
          </div>
          {entity.description && <p className="max-w-2xl text-muted">{entity.description}</p>}
          {entity.url && /^https?:\/\//.test(entity.url) && (
            <a href={entity.url} target="_blank" rel="noopener noreferrer" className="self-start text-sm text-link underline underline-offset-2">{entity.url}</a>
          )}
<details className="max-w-xl rounded-lg border border-line bg-panel p-4">
          <summary className="cursor-pointer font-semibold">Editar</summary>
          <form action={saveEntity} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="id" value={entity.id} />
            <input type="hidden" name="kind" value={kind} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Nome
              <input name="name" required defaultValue={entity.name} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {kind === "company" ? "O que é" : "Para que serve"}
              <textarea name="description" defaultValue={entity.description ?? ""} rows={3} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Site
              <input name="url" type="url" defaultValue={entity.url ?? ""} placeholder="https://" className={input} />
            </label>
            <SaveButton />
          </form>
          <div className="mt-3">
            <ConfirmDelete action={deleteEntity.bind(null, entity.id, kind)} title={`Excluir ${entity.name}?`} label={`Excluir ${t.one.toLowerCase()}`}>
              <p className="text-muted">As notas e pessoas ligadas continuam; só perdem o vínculo.</p>
            </ConfirmDelete>
          </div>
        </details>
        </header>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Notas que citam ({notes.length})</h2>
          {notes.length === 0 ? (
            <p className="text-faint">Nenhuma ainda.</p>
          ) : (
            <ul className="flex flex-col">
              {notes.map((n) => (
                <li key={n.id} className="border-b border-line last:border-0">
                  <Link href={`/notes/${n.id}`} className="-mx-2 block rounded-md px-2 py-2.5 hover:bg-panel">
                    <span className="font-medium text-ink">{n.title}</span>
                    <span className="ml-2 text-xs text-faint">{formatDay(n.created_at)}</span>
                    {n.summary && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.summary}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-7 text-sm">
        {kind === "company" && <SystemLinks supabase={supabase} type="company" id={entity.id} title="Sistemas que usa" />}
        {kind === "system" && <UsedBy supabase={supabase} entityId={entity.id} />}
        {kind === "company" && (
          <section>
            <h2 className="mb-2 text-base font-semibold">Pessoas</h2>
            {(people ?? []).length === 0 ? (
              <p className="text-faint">Ninguém ligado. Na página de uma pessoa, escolha a empresa dela.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(people as { id: string; name: string; slug: string; role: string | null }[]).map((p) => (
                  <li key={p.id}>
                    <Link href={`/people/${p.slug}`} className="text-ink hover:underline">{p.name}</Link>
                    {p.role && <span className="text-faint"> · {p.role}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section>
          <h2 className="mb-2 text-base font-semibold">Projetos</h2>
          {projects.length === 0 ? (
            <p className="text-faint">Nenhum projeto nas notas que citam.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.slug}`} className="text-ink hover:underline">{p.emoji} {p.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link
          href={`/ask?q=${encodeURIComponent(`O que eu sei sobre ${entity.name}? Resuma o que foi discutido, decisões, problemas e pendências.`)}`}
          className="self-start rounded-md bg-accent px-4 py-2 font-semibold text-on-accent hover:brightness-110"
        >
          Perguntar ao Claude
        </Link>

      </aside>
    </div>
  );
}

/** Na página de um sistema: projetos, empresas e tarefas a que ele está ligado. */
async function UsedBy({ supabase, entityId }: { supabase: Awaited<ReturnType<typeof supabaseServer>>; entityId: string }) {
  const { data: links } = await supabase.from("entity_links").select("target_type, target_id").eq("entity_id", entityId);
  const ids = (t: string) => (links ?? []).filter((l) => l.target_type === t).map((l) => l.target_id as string);
  const [{ data: projects }, { data: companies }, { data: tasks }] = await Promise.all([
    ids("project").length ? supabase.from("projects").select("id, name, slug, emoji").in("id", ids("project")) : Promise.resolve({ data: [] }),
    ids("company").length ? supabase.from("entities").select("id, name, slug").in("id", ids("company")) : Promise.resolve({ data: [] }),
    ids("task").length ? supabase.from("tasks").select("id, number, title, status").in("id", ids("task")) : Promise.resolve({ data: [] }),
  ]);
  type Row = { id: string; name?: string; slug?: string; emoji?: string | null; number?: number; title?: string };
  const groups: [string, Row[], (r: Row) => string, (r: Row) => string][] = [
    ["Projetos", (projects ?? []) as Row[], (r) => `/projects/${r.slug}`, (r) => `${r.emoji ?? ""} ${r.name}`],
    ["Empresas", (companies ?? []) as Row[], (r) => `/companies/${r.slug}`, (r) => r.name ?? ""],
    ["Tarefas", (tasks ?? []) as Row[], (r) => `/tasks/${r.id}`, (r) => `T-${r.number} ${r.title}`],
  ];
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">Ligado a</h2>
      {!(links ?? []).length && <p className="text-faint">Nada ainda. Ligue este sistema na página de um projeto, empresa ou tarefa, ou deixe o Claude ligar ao analisar.</p>}
      {groups.map(([label, rows, href, text]) =>
        rows.length ? (
          <div key={label} className="mb-2">
            <p className="text-xs text-faint">{label}</p>
            <ul className="flex flex-col gap-0.5">
              {rows.map((r) => (
                <li key={r.id}><Link href={href(r)} className="text-ink hover:underline">{text(r)}</Link></li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}
