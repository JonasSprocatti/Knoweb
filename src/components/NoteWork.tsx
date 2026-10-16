import Link from "next/link";
import { acceptSuggested, deleteProject, removeMention, resolvePending, saveProject, setProjectStatus } from "@/lib/work-actions";
import { normalizeTasks, one, projectColor, QuickTask, TASK_COLUMNS, TaskList } from "@/components/Work";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingCreations } from "@/lib/types";

type P = { id: string; name: string; slug: string; emoji: string | null; color: string | null; status: string; reason: string | null };

/** Painel da nota: projetos, tarefas e pessoas que saíram dela. */
export async function NoteWork({ supabase, noteId, pending }: { supabase: SupabaseClient; noteId: string; pending?: PendingCreations }) {
  const [{ data: pn }, { data: taskRows }, { data: np }, { data: people }, { data: projects }] = await Promise.all([
    supabase.from("project_notes").select("projects(id, name, slug, emoji, color, status, reason)").eq("note_id", noteId),
    supabase.from("tasks").select(TASK_COLUMNS).eq("note_id", noteId).order("created_at"),
    supabase.from("note_people").select("people(id, name, slug)").eq("note_id", noteId),
    supabase.from("people").select("id, name, is_me").order("name"),
    supabase.from("projects").select("id, name, emoji").not("status", "in", "(archived)").order("name"),
  ]);
  const linked = (pn ?? []).map((r) => one(r.projects as unknown as P | null)).filter((p): p is P => !!p);
  const tasks = normalizeTasks(taskRows);
  const mentioned = (np ?? []).map((r) => one(r.people as unknown as { id: string; name: string; slug: string } | null)).filter((p) => !!p);
  const suggestedCount = tasks.filter((t) => t.status === "suggested").length;

  const suggestedProjects = linked.filter((p) => p.status === "suggested").length;
  const hasPending = !!pending && pending.topics.length + pending.people.length > 0;

  return (
    <>
      {(hasPending || suggestedProjects > 0 || suggestedCount > 0) && (
        <section id="criar" className="scroll-mt-20 rounded-md border border-dashed border-accent/60 p-3">
          <h2 className="mb-1 text-base font-semibold">O Claude quer criar</h2>
          <p className="mb-2 text-xs text-muted">Nada disso existe ainda. Marque o que quer criar.</p>
          {hasPending && (
            <form action={resolvePending.bind(null, noteId)} className="flex flex-col gap-2 text-sm">
              {pending!.topics.length > 0 && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-xs font-medium text-muted">Temas novos</legend>
                  {pending!.topics.map((t) => (
                    <label key={t.slug} className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" name="topic" value={t.slug} defaultChecked className="mt-1 accent-accent" />
                      <span>
                        {t.emoji} {t.name}
                        {t.description && <span className="block text-xs text-faint">{t.description}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {pending!.people.length > 0 && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-xs font-medium text-muted">Pessoas novas</legend>
                  {pending!.people.map((p) => (
                    <label key={p.slug} className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" name="person" value={p.slug} defaultChecked className="accent-accent" />
                      <span>
                        {p.name}
                        {p.task_ids.length > 0 && <span className="text-xs text-faint"> · em {p.task_ids.length} {p.task_ids.length === 1 ? "tarefa" : "tarefas"}</span>}
                      </span>
                    </label>
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
