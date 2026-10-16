import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteProject, saveProject, setProjectStatus } from "@/lib/work-actions";
import { one, PROJECT_STATUS, Progress, projectColor, formatDay, Timeline, today } from "@/components/Work";
import type { ProjectStatus } from "@/lib/types";

export const metadata = { title: "Projetos" };
export const dynamic = "force-dynamic";

const ORDER: ProjectStatus[] = ["active", "idea", "paused", "done", "archived"];
const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  const { visao = "lista" } = await searchParams;
  const supabase = await supabaseServer();
  const [{ data }, { data: people }] = await Promise.all([
    supabase
      .from("projects")
      .select("*, owner:people!projects_owner_id_fkey(name, slug), origin:notes!projects_origin_note_id_fkey(id, title), tasks(status, due_date, task_assignees(person_id)), project_notes(count)")
      .order("updated_at", { ascending: false }),
    supabase.from("people").select("id, name").order("name"),
  ]);

  const projects = (data ?? []).map((p) => {
    const tasks = (p.tasks ?? []) as { status: string; due_date: string | null; task_assignees: { person_id: string }[] }[];
    const real = tasks.filter((t) => t.status !== "suggested" && t.status !== "canceled");
    return {
      ...p,
      owner: one(p.owner as { name: string; slug: string } | null),
      origin: one(p.origin as { id: string; title: string } | null),
      done: real.filter((t) => t.status === "done").length,
      total: real.length,
      suggestedTasks: tasks.filter((t) => t.status === "suggested").length,
      people: new Set(tasks.flatMap((t) => t.task_assignees.map((a) => a.person_id))).size,
      notes: (p.project_notes as unknown as { count: number }[])?.[0]?.count ?? 0,
      lastDue: tasks.map((t) => t.due_date).filter(Boolean).sort().at(-1) as string | undefined,
    };
  });
  const suggested = projects.filter((p) => p.status === "suggested");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl md:text-4xl">Projetos</h1>
          <p className="mt-1 max-w-xl text-muted">O Claude sugere projetos a partir das suas notas e gravações, e liga tarefas, pessoas e notas a cada um.</p>
        </div>
        <nav className="flex gap-0.5 rounded-md border border-line bg-panel p-0.5 text-sm">
          {[
            ["lista", "Lista"],
            ["linha", "Linha do tempo"],
          ].map(([k, label]) => (
            <Link key={k} href={`/projects?visao=${k}`} className={`rounded px-3 py-1 ${visao === k ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink"}`}>
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <details className="rounded-lg border border-line bg-panel p-4">
        <summary className="cursor-pointer font-semibold">+ Novo projeto</summary>
        <form action={saveProject} className="mt-3 grid gap-2 sm:grid-cols-[4rem_1fr]">
          <input name="emoji" placeholder="🚀" aria-label="Emoji" className={input} />
          <input name="name" required placeholder="Nome do projeto" aria-label="Nome" className={input} />
          <textarea name="description" placeholder="Objetivo" aria-label="Objetivo" rows={2} className={`${input} sm:col-span-2`} />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <label className="text-sm text-muted">Início <input type="date" name="start_date" className={input} /></label>
            <label className="text-sm text-muted">Prazo <input type="date" name="due_date" className={input} /></label>
            <select name="owner_id" aria-label="Responsável" className={input} defaultValue="">
              <option value="">Sem responsável</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select name="status" aria-label="Status" className={input} defaultValue="active">
              {ORDER.map((s) => (
                <option key={s} value={s}>{PROJECT_STATUS[s]}</option>
              ))}
            </select>
            <button className="ml-auto rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110">Criar projeto</button>
          </div>
        </form>
      </details>

      {suggested.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Sugeridos pelo Claude</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {suggested.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 rounded-lg border border-dashed border-accent/60 bg-panel p-4">
                <Link href={`/projects/${p.slug}`} className="font-semibold text-ink hover:underline">
                  {p.emoji} {p.name}
                </Link>
                {p.description && <p className="text-sm text-muted">{p.description}</p>}
                {p.reason && <p className="text-sm text-faint">Por quê: {p.reason}</p>}
                <p className="text-xs text-faint">
                  {p.suggestedTasks > 0 && `${p.suggestedTasks} tarefas sugeridas · `}
                  {p.origin && (
                    <Link href={`/notes/${p.origin.id}`} className="hover:underline">
                      de “{p.origin.title}”
                    </Link>
                  )}
                </p>
                <div className="flex gap-2">
                  <form action={setProjectStatus.bind(null, p.id, "active")}>
                    <button className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-on-accent hover:brightness-110">Criar projeto</button>
                  </form>
                  <form action={deleteProject.bind(null, p.id)}>
                    <button className="rounded-md px-3 py-1 text-sm text-muted hover:text-ink">Descartar</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visao === "linha" ? (
        <Timeline
          items={projects
            .filter((p) => p.status !== "suggested" && p.status !== "archived")
            .map((p) => ({
              id: p.id,
              label: `${p.emoji ?? ""} ${p.name}`.trim(),
              href: `/projects/${p.slug}`,
              start: (p.start_date ?? p.created_at) as string,
              end: (p.due_date ?? p.lastDue ?? today()) as string,
              color: projectColor(p),
              done: p.status === "done",
            }))}
        />
      ) : (
        ORDER.map((status) => {
          const group = projects.filter((p) => p.status === status);
          if (!group.length) return null;
          return (
            <section key={status}>
              <h2 className="mb-2 text-lg font-semibold">
                {PROJECT_STATUS[status]} <span className="font-normal text-faint">{group.length}</span>
              </h2>
              <ul className="flex flex-col rounded-lg border border-line bg-panel px-3">
                {group.map((p) => (
                  <li key={p.id} className="border-b border-line last:border-0">
                    <Link href={`/projects/${p.slug}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: projectColor(p) }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{p.emoji} {p.name}</span>
                        {p.description && <span className="line-clamp-1 text-sm text-muted">{p.description}</span>}
                      </span>
                      {p.owner && <span className="text-xs text-muted">{p.owner.name}</span>}
                      <span className="text-xs text-faint">{p.people} pessoas · {p.notes} notas</span>
                      {p.due_date && <span className={`text-xs ${p.due_date < today() && p.status !== "done" ? "text-rec" : "text-faint"}`}>até {formatDay(p.due_date)}</span>}
                      <Progress done={p.done} total={p.total} color={projectColor(p)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {projects.length === 0 && (
        <p className="text-muted">Nenhum projeto ainda. Crie um acima ou analise uma nota que fale de uma iniciativa: o Claude sugere o projeto e as tarefas.</p>
      )}
    </div>
  );
}
