import Link from "@/components/Link";
import { unlinkEntity, acceptSuggested, deleteProject, removeMention, resolvePending, saveProject, setProjectStatus } from "@/lib/work-actions";
import { normalizeTasks, one, projectColor, QuickTask, TASK_COLUMNS, TaskList } from "@/components/Work";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityKind, PendingCreations } from "@/lib/types";
import { ENTITY } from "@/lib/entities";
import { Icon } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";

type P = { id: string; name: string; slug: string; emoji: string | null; color: string | null; status: string; reason: string | null };

/** Painel da nota: projetos, tarefas e pessoas que saíram dela. */
export async function NoteWork({
  supabase,
  noteId,
  pending,
  versions = [],
}: {
  supabase: SupabaseClient;
  noteId: string;
  pending?: PendingCreations;
  versions?: { id: string; changes: string | null; file_name: string | null; created_at: string }[];
}) {
  const [{ data: pn }, { data: taskRows }, { data: np }, { data: people }, { data: projects }, { data: entRows }] = await Promise.all([
    supabase.from("project_notes").select("projects(id, name, slug, emoji, color, status, reason)").eq("note_id", noteId),
    supabase.from("tasks").select(TASK_COLUMNS).eq("note_id", noteId).order("created_at"),
    supabase.from("note_people").select("people(id, name, slug)").eq("note_id", noteId),
    supabase.from("people").select("id, name, is_me").order("name"),
    supabase.from("projects").select("id, name, emoji").not("status", "in", "(archived)").order("name"),
    supabase.from("note_entities").select("entities(id, kind, name, slug)").eq("note_id", noteId),
  ]);
  const linked = (pn ?? []).map((r) => one(r.projects as unknown as P | null)).filter((p): p is P => !!p);
  const tasks = normalizeTasks(taskRows);
  const mentioned = (np ?? []).map((r) => one(r.people as unknown as { id: string; name: string; slug: string } | null)).filter((p) => !!p);
  const ents = (entRows ?? []).map((r) => one(r.entities as unknown as { id: string; kind: EntityKind; name: string; slug: string } | null)).filter((e) => !!e) as { id: string; kind: EntityKind; name: string; slug: string }[];
  const suggestedCount = tasks.filter((t) => t.status === "suggested").length;

  const suggestedProjects = linked.filter((p) => p.status === "suggested").length;
  const hasPending = !!pending && pending.topics.length + pending.people.length + (pending.entities?.length ?? 0) > 0;

  return (
    <>
      {(hasPending || suggestedProjects > 0 || suggestedCount > 0) && (
        <section id="criar" className="scroll-mt-20 rounded-md border border-dashed border-accent/60 p-3">
          <h2 className="mb-1 text-base font-semibold">O Claude quer criar</h2>
          <p className="mb-2 text-xs text-muted">Nada disso existe ainda. Desmarque o que não quer e clique no nome para corrigir; tarefas e projetos você aceita ou descarta um a um abaixo.</p>
          {hasPending && (
            <form action={resolvePending.bind(null, noteId)} className="flex flex-col gap-2 text-sm">
              {pending!.topics.length > 0 && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-xs font-medium text-muted">Temas novos</legend>
                  {pending!.topics.map((t) => (
                    <div key={t.slug} className="flex items-start gap-2">
                      <input type="checkbox" name="topic" value={t.slug} defaultChecked aria-label={`Criar o tema ${t.name}`} className="mt-1.5 accent-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          {t.emoji}
                          <input name={`name:topic:${t.slug}`} defaultValue={t.name} aria-label="Nome do tema" className="-mx-1 w-full min-w-0 rounded border border-transparent bg-transparent px-1 hover:border-line focus:border-accent focus:bg-panel focus:outline-none" />
                        </span>
                        {t.description && <span className="block text-xs text-faint">{t.description}</span>}
                      </span>
                    </div>
                  ))}
                </fieldset>
              )}
              {(["company", "system"] as const).map((kind) => {
                const list = (pending!.entities ?? []).filter((e) => e.kind === kind);
                if (!list.length) return null;
                return (
                  <fieldset key={kind} className="flex flex-col gap-1">
                    <legend className="mb-1 text-xs font-medium text-muted">{kind === "company" ? "Empresas novas" : "Sistemas novos"}</legend>
                    {list.map((e) => (
                      <div key={e.slug} className="flex items-start gap-2">
                        <input type="checkbox" name="entity" value={`${e.kind}:${e.slug}`} defaultChecked aria-label={`Criar ${e.name}`} className="mt-1.5 accent-accent" />
                        <span className="min-w-0 flex-1">
                          <input name={`name:entity:${e.kind}:${e.slug}`} defaultValue={e.name} aria-label="Nome" className="-mx-1 w-full min-w-0 rounded border border-transparent bg-transparent px-1 hover:border-line focus:border-accent focus:bg-panel focus:outline-none" />
                          {e.description && <span className="block text-xs text-faint">{e.description}</span>}
                        </span>
                      </div>
                    ))}
                  </fieldset>
                );
              })}
              {pending!.people.length > 0 && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-xs font-medium text-muted">Pessoas novas</legend>
                  {pending!.people.map((p) => (
                    <div key={p.slug} className="flex items-center gap-2">
                      <input type="checkbox" name="person" value={p.slug} defaultChecked aria-label={`Criar ${p.name}`} className="accent-accent" />
                      <input name={`name:person:${p.slug}`} defaultValue={p.name} aria-label="Nome da pessoa" className="-mx-1 flex-1 min-w-0 rounded border border-transparent bg-transparent px-1 hover:border-line focus:border-accent focus:bg-panel focus:outline-none" />
                      {p.task_ids.length > 0 && <span className="shrink-0 text-xs text-faint">em {p.task_ids.length} {p.task_ids.length === 1 ? "tarefa" : "tarefas"}</span>}
                    </div>
                  ))}
                </fieldset>
              )}
              <div className="flex gap-2">
                <button className="rounded bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent">Criar marcados</button>
                <button name="discard" value="1" className="px-2 py-0.5 text-xs text-muted hover:text-ink">Descartar</button>
              </div>
            </form>
          )}
          {(suggestedProjects > 0 || suggestedCount > 0) && (
            <p className={`text-xs text-muted ${hasPending ? "mt-3" : ""}`}>
              {[suggestedProjects && `${suggestedProjects} ${suggestedProjects === 1 ? "projeto" : "projetos"}`, suggestedCount && `${suggestedCount} ${suggestedCount === 1 ? "tarefa" : "tarefas"}`]
                .filter(Boolean)
                .join(" e ")}{" "}
              {suggestedProjects + suggestedCount === 1 ? "sugerido" : "sugeridos"}: confirme ou descarte em Projetos e Tarefas logo abaixo.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold">Projetos</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {linked.map((p) => (
            <li key={p.id} className={p.status === "suggested" ? "rounded-md border border-dashed border-accent/60 p-2" : ""}>
              <Link href={`/projects/${p.slug}`} className="flex items-center gap-2 font-medium text-ink hover:underline">
                <span className="h-2 w-2 rounded-full" style={{ background: projectColor(p) }} aria-hidden />
                {p.emoji} {p.name}
              </Link>
              {p.status === "suggested" && (
                <>
                  <p className="mt-1 text-xs text-faint">O Claude sugere criar este projeto{p.reason ? `: ${p.reason}` : "."}</p>
                  <div className="mt-1.5 flex gap-2">
                    <form action={setProjectStatus.bind(null, p.id, "active")}>
                      <button className="rounded bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent">Criar</button>
                    </form>
                    <form action={deleteProject.bind(null, p.id, null)}>
                      <button className="px-2 py-0.5 text-xs text-muted hover:text-ink">Descartar</button>
                    </form>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted hover:text-ink">+ Criar projeto a partir desta nota</summary>
          <form action={saveProject} className="mt-2 flex gap-2">
            <input type="hidden" name="note_id" value={noteId} />
            <input name="name" required placeholder="Nome do projeto" aria-label="Nome do projeto" className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 py-1 focus:border-accent focus:outline-none" />
            <button className="rounded-md bg-accent px-3 font-semibold text-on-accent">Criar</button>
          </form>
        </details>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Tarefas</h2>
          {suggestedCount > 0 && (
            <form action={acceptSuggested.bind(null, "note_id", noteId)}>
              <button className="rounded bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent">Aceitar {suggestedCount} sugeridas</button>
            </form>
          )}
        </div>
        <div className="text-sm">
          <TaskList tasks={tasks} showProject empty="Nenhuma tarefa. O Claude sugere ao analisar." />
        </div>
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer text-muted hover:text-ink">+ Nova tarefa desta nota</summary>
          <div className="mt-2">
            <QuickTask projects={projects ?? []} people={people ?? []} noteId={noteId} projectId={linked.length === 1 ? linked[0].id : undefined} />
          </div>
        </details>
      </section>

      {versions.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Versões anteriores</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="rounded-md border border-line p-2.5">
                <p className="text-xs text-faint">
                  Substituída em {new Date(v.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  {v.file_name && <> por {v.file_name}</>}
                </p>
                {v.changes && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted hover:text-ink">O que mudou</summary>
                    <Markdown className="mt-1 text-sm">{v.changes}</Markdown>
                  </details>
                )}
                <div className="mt-1.5 flex gap-3">
                  <Link href={`/notes/${noteId}/versoes/${v.id}`} className="font-medium text-accent hover:underline">Comparar lado a lado</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ents.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Empresas e sistemas</h2>
          <div className="flex flex-wrap gap-1.5">
            {ents.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-1 text-sm" style={{ borderColor: `${ENTITY[e.kind].color}66` }}>
                <span style={{ color: ENTITY[e.kind].color }}><Icon name={ENTITY[e.kind].icon} className="h-3.5 w-3.5" /></span>
                <Link href={`${ENTITY[e.kind].path}/${e.slug}`} className="text-ink hover:underline">{e.name}</Link>
                <form action={unlinkEntity.bind(null, noteId, e.id)}>
                  <button className="px-1 text-faint hover:text-ink" aria-label={`Tirar ${e.name} desta nota`} title="Tirar desta nota">×</button>
                </form>
              </span>
            ))}
          </div>
        </section>
      )}

      {mentioned.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Pessoas</h2>
          <div className="flex flex-wrap gap-1.5">
            {mentioned.map((p) => (
              <span key={p!.slug} className="inline-flex items-center gap-1 rounded-md border border-line bg-panel py-0.5 pl-2.5 pr-1 text-sm">
                <Link href={`/people/${p!.slug}`} className="text-ink hover:underline">{p!.name}</Link>
                <form action={removeMention.bind(null, noteId, p!.id)}>
                  <button className="px-1 text-faint hover:text-ink" aria-label={`Tirar ${p!.name} desta nota`} title="Tirar desta nota">×</button>
                </form>
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
