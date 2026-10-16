import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { savePerson } from "@/lib/work-actions";
import { today } from "@/components/Work";

export const metadata = { title: "Pessoas" };
export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export default async function PeoplePage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("people")
    .select("id, name, slug, role, task_assignees(tasks(status, due_date, project_id)), note_people(count)")
    .order("name");

  const people = (data ?? []).map((p) => {
    const tasks = (p.task_assignees ?? [])
      .map((a) => (Array.isArray(a.tasks) ? a.tasks[0] : a.tasks) as { status: string; due_date: string | null; project_id: string | null } | null)
      .filter((t) => t && t.status !== "suggested" && t.status !== "canceled") as { status: string; due_date: string | null; project_id: string | null }[];
    const open = tasks.filter((t) => t.status !== "done");
    return {
      ...p,
      open: open.length,
      done: tasks.length - open.length,
      overdue: open.filter((t) => t.due_date && t.due_date < today()).length,
      projects: new Set(tasks.map((t) => t.project_id).filter(Boolean)).size,
      notes: (p.note_people as unknown as { count: number }[])?.[0]?.count ?? 0,
    };
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="display text-3xl md:text-4xl">Pessoas</h1>
        <p className="mt-1 max-w-xl text-muted">Quem aparece nas suas conversas e quem faz o quê. O Claude reconhece as pessoas citadas nas notas.</p>
      </header>

      <form action={savePerson} className="flex flex-wrap gap-2">
        <input name="name" required placeholder="Nome" aria-label="Nome" className={`${input} flex-1`} />
        <input name="role" placeholder="Papel (ex.: designer, cliente)" aria-label="Papel" className={input} />
        <button className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110">Adicionar pessoa</button>
      </form>

      {people.length === 0 ? (
        <p className="text-muted">Ninguém ainda. Analise uma gravação de reunião e as pessoas citadas aparecem aqui.</p>
      ) : (
        <ul className="flex flex-col rounded-lg border border-line bg-panel px-3">
          {people.map((p) => (
            <li key={p.id} className="border-b border-line last:border-0">
              <Link href={`/people/${p.slug}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-muted" aria-hidden>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{p.name}</span>
                  {p.role && <span className="text-sm text-muted">{p.role}</span>}
                </span>
                <span className="text-xs text-faint">
                  {p.open} abertas{p.overdue > 0 && <span className="text-rec"> ({p.overdue} atrasadas)</span>} · {p.done} feitas · {p.projects} projetos · {p.notes} notas
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
