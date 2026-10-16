import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { completeSprint, deleteSprint, moveToSprint, saveSprint } from "@/lib/work-actions";
import { formatDay, hours, normalizeTasks, Progress, QuickTask, StatusDot, TASK_COLUMNS, TaskBoard, taskCode, today } from "@/components/Work";
import type { TaskRow } from "@/lib/types";
import { ConfirmDelete, DeleteOption } from "@/components/ConfirmDelete";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";
const DAY = 86_400_000;
const t = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();

export default async function SprintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: sprint } = await supabase.from("sprints").select("*").eq("id", id).maybeSingle();
  if (!sprint) notFound();

  const [{ data: inSprint }, { data: backlog }, { data: people }, { data: projects }] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("sprint_id", id).neq("status", "canceled").order("created_at"),
    supabase.from("tasks").select(TASK_COLUMNS).is("sprint_id", null).in("status", ["todo", "doing", "blocked"]).order("due_date", { ascending: true, nullsFirst: false }).limit(100),
    supabase.from("people").select("id, name").order("name"),
    supabase.from("projects").select("id, name, emoji").not("status", "in", "(archived,suggested)").order("name"),
  ]);
  const tasks = normalizeTasks(inSprint).filter((x) => x.status !== "suggested");
  const done = tasks.filter((x) => x.status === "done");
  const est = tasks.reduce((a, x) => a + Number(x.estimate_hours ?? 0), 0);
  const spent = tasks.reduce((a, x) => a + Number(x.spent_hours ?? 0), 0);
  const now = today();
  const total = Math.max(1, Math.round((t(sprint.end_date) - t(sprint.start_date)) / DAY) + 1);
  const left = Math.max(0, Math.round((t(sprint.end_date) - t(now)) / DAY) + (sprint.end_date >= now ? 1 : 0));
  const ended = sprint.end_date < now;

  // Burndown: tarefas que faltavam ao fim de cada dia
  const burn = Array.from({ length: total }, (_, i) => {
    const day = t(sprint.start_date) + i * DAY;
    if (day > t(now)) return null;
    return tasks.filter((x) => !x.completed_at || t(x.completed_at) > day).length;
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/sprints" className="text-faint underline-offset-4 hover:text-ink hover:underline">Sprints</Link>
        <h1 className="display text-3xl md:text-4xl">{sprint.name}</h1>
        <p className="text-muted">
          {formatDay(sprint.start_date)} → {formatDay(sprint.end_date)} · {ended ? "encerrada" : `${left} ${left === 1 ? "dia restante" : "dias restantes"}`}
        </p>
        {sprint.goal && <p className="max-w-2xl text-ink">🎯 {sprint.goal}</p>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Progresso"><Progress done={done.length} total={tasks.length} /></Stat>
          <Stat label="Em aberto">{tasks.length - done.length}</Stat>
          <Stat label="Estimado">{hours(est)}</Stat>
          <Stat label="Gasto">{hours(spent)}</Stat>
        </dl>
        <Burndown burn={burn} total={tasks.length} />
      </div>

      <QuickTask projects={projects ?? []} people={people ?? []} sprintId={sprint.id} />
      <TaskBoard tasks={tasks} showProject />

      <section>
        <h2 className="mb-1 text-lg font-semibold">Backlog</h2>
        <p className="mb-2 text-sm text-faint">Tarefas abertas sem sprint. Puxe para esta.</p>
        <Backlog tasks={normalizeTasks(backlog)} sprintId={sprint.id} />
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <form action={completeSprint.bind(null, sprint.id)}>
          <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110">
            Encerrar sprint (abertas vão para a próxima)
          </button>
        </form>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="cursor-pointer font-semibold">Editar sprint</summary>
          <form action={saveSprint} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="id" value={sprint.id} />
            <input name="name" required defaultValue={sprint.name} aria-label="Nome" className={input} />
            <input name="goal" defaultValue={sprint.goal ?? ""} placeholder="Objetivo" aria-label="Objetivo" className={input} />
            <input type="date" name="start_date" required defaultValue={sprint.start_date} aria-label="Início" className={input} />
            <input type="date" name="end_date" required defaultValue={sprint.end_date} aria-label="Fim" className={input} />
            <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent">Salvar</button>
          </form>
          <div className="mt-3">
            <ConfirmDelete action={deleteSprint.bind(null, sprint.id)} title={`Excluir ${sprint.name}?`} label="Excluir sprint">
              <DeleteOption name="tasks" value="keep" defaultChecked label="Devolver as tarefas ao backlog" />
              <DeleteOption name="tasks" value="delete" label={`Excluir as ${tasks.length} tarefas da sprint`} />
            </ConfirmDelete>
          </div>
        </details>
      </div>
    </div>
  );
}

function Backlog({ tasks, sprintId }: { tasks: TaskRow[]; sprintId: string }) {
  if (!tasks.length) return <p className="text-sm text-faint">Backlog vazio.</p>;
  return (
    <ul className="flex flex-col rounded-lg border border-line bg-panel px-3">
      {tasks.map((x) => (
        <li key={x.id} className="flex flex-wrap items-center gap-3 border-b border-line py-2 text-sm last:border-0">
          <StatusDot status={x.status} />
          <Link href={`/tasks/${x.id}`} className="min-w-0 flex-1 text-ink hover:underline">
            <span className="mr-2 text-xs text-faint">{taskCode(x.number)}</span>
            {x.title}
          </Link>
          {x.projects && <span className="text-xs text-muted">{x.projects.emoji} {x.projects.name}</span>}
          {x.estimate_hours != null && <span className="text-xs text-faint">{hours(x.estimate_hours)}</span>}
          {x.due_date && <span className="text-xs text-faint">{formatDay(x.due_date)}</span>}
          <form action={moveToSprint.bind(null, x.id, sprintId)}>
            <button className="rounded bg-surface px-2 py-0.5 text-xs text-muted hover:text-ink">+ Sprint</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

/** Burndown: linha ideal tracejada e o que realmente faltava a cada dia. */
function Burndown({ burn, total }: { burn: (number | null)[]; total: number }) {
  const W = 300;
  const H = 120;
  const n = Math.max(1, burn.length - 1);
  const max = Math.max(1, total);
  const x = (i: number) => (i / n) * W;
  const y = (v: number) => H - (v / max) * H;
  const real = burn
    .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <figure className="rounded-lg border border-line bg-panel p-3">
      <figcaption className="mb-1 text-xs text-faint">Burndown: tarefas que faltam por dia</figcaption>
      <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="h-28 w-full" role="img" aria-label="Gráfico de burndown da sprint">
        <line x1={0} y1={y(total)} x2={W} y2={H} stroke="var(--line)" strokeWidth={1.5} strokeDasharray="4 4" />
        {real && <polyline points={real} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />}
      </svg>
    </figure>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{children}</dd>
    </div>
  );
}
