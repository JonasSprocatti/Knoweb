import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { addComment, addDependency, deleteComment, deleteTask, logTime, removeDependency, saveTask } from "@/lib/work-actions";
import {
  cycleDays,
  days,
  formatDay,
  hours,
  normalizeTasks,
  one,
  PRIORITY,
  projectColor,
  RECURRENCE,
  QuickTask,
  StatusDot,
  TASK_COLUMNS,
  TASK_STATUS,
  taskCode,
  TaskList,
} from "@/components/Work";
import { relativeDate } from "@/lib/text";
import { ConfirmDelete, DeleteOption } from "@/components/ConfirmDelete";
import type { TaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

const PRIORITY_KEYS = PRIORITY as Record<string, string>;
const STATUS_LABEL = (s: string | null) => (s ? (TASK_STATUS[s as TaskStatus]?.label ?? s) : "—");

/** Uma linha do histórico em português. */
function describe(e: { kind: string; old_value: string | null; new_value: string | null }) {
  switch (e.kind) {
    case "created":
      return e.new_value === "ai" ? "Sugerida pelo Claude" : "Criada";
    case "status":
      return `Status: ${STATUS_LABEL(e.old_value)} → ${STATUS_LABEL(e.new_value)}`;
    case "due_date":
      return `Prazo: ${e.old_value ? formatDay(e.old_value) : "—"} → ${e.new_value ? formatDay(e.new_value) : "sem prazo"}`;
    case "project":
      return `Projeto: ${e.old_value ?? "—"} → ${e.new_value ?? "sem projeto"}`;
    case "priority":
      return `Prioridade: ${PRIORITY_KEYS[e.old_value ?? ""] ?? "—"} → ${PRIORITY_KEYS[e.new_value ?? ""] ?? "—"}`;
    case "estimate":
      return `Estimativa: ${hours(e.old_value == null ? null : Number(e.old_value))} → ${hours(e.new_value == null ? null : Number(e.new_value))}`;
    case "spent":
      return `Tempo gasto: ${hours(Number(e.old_value ?? 0))} → ${hours(Number(e.new_value ?? 0))}`;
    case "title":
      return `Renomeada de “${e.old_value}”`;
    case "sprint":
      return `Sprint: ${e.old_value ?? "backlog"} → ${e.new_value ?? "backlog"}`;
    case "recurred":
      return `Concluída; a próxima repetição é ${e.new_value}`;
    case "assigned":
      return `${e.new_value} entrou como responsável`;
    case "unassigned":
      return `${e.new_value} saiu da tarefa`;
    default:
      return e.kind;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("tasks").select("number, title").eq("id", id).maybeSingle();
  return { title: data ? `${taskCode(data.number)} ${data.title}` : "Tarefa" };
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: row } = await supabase
    .from("tasks")
    .select(`${TASK_COLUMNS}, notes(id, title), parent:parent_id(id, number, title)`)
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();
  const [task] = normalizeTasks([row]);
  const note = one(row.notes as { id: string; title: string } | null);
  const parent = one(row.parent as { id: string; number: number; title: string } | null);

  const [{ data: subs }, { data: events }, { data: blockedBy }, { data: blocks }, { data: people }, { data: projects }, { data: sprints }] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("parent_id", id).order("created_at"),
    supabase.from("task_events").select("id, kind, old_value, new_value, created_at").eq("task_id", id).order("created_at", { ascending: false }),
    supabase.from("task_dependencies").select("tasks!task_dependencies_blocked_by_fkey(id, number, title, status)").eq("task_id", id),
    supabase.from("task_dependencies").select("tasks!task_dependencies_task_id_fkey(id, number, title, status)").eq("blocked_by", id),
    supabase.from("people").select("id, name, is_me").order("name"),
    supabase.from("projects").select("id, name, emoji").not("status", "in", "(archived)").order("name"),
    supabase.from("sprints").select("id, name, end_date").order("start_date", { ascending: false }).limit(20),
  ]);

  type Dep = { id: string; number: number; title: string; status: TaskStatus };
  const deps = (rows: { tasks: unknown }[] | null) => (rows ?? []).map((r) => one(r.tasks as Dep | null)).filter((d): d is Dep => !!d);
  const blockers = deps(blockedBy);
  const blocking = deps(blocks);
  const subtasks = normalizeTasks(subs);
  const assigned = new Set(task.task_assignees.map((a) => a.people?.id));
  const cycle = cycleDays(task);
  const over = task.estimate_hours != null && task.spent_hours > task.estimate_hours;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-faint">
          <Link href="/tasks" className="hover:text-ink hover:underline">Tarefas</Link>
          <span>/</span>
          {task.projects && (
            <>
              <Link href={`/projects/${task.projects.slug}`} className="flex items-center gap-1 hover:text-ink hover:underline">
                <span className="h-2 w-2 rounded-full" style={{ background: projectColor(task.projects) }} aria-hidden />
                {task.projects.emoji} {task.projects.name}
              </Link>
              <span>/</span>
            </>
          )}
          {parent && (
            <>
              <Link href={`/tasks/${parent.id}`} className="hover:text-ink hover:underline">{taskCode(parent.number)}</Link>
              <span>/</span>
            </>
          )}
          <span className="tabular-nums">{taskCode(task.number)}</span>
        </div>

        <h1 className="flex items-center gap-3 text-2xl font-semibold leading-tight md:text-3xl">
          <StatusDot status={task.status} /> {task.title}
        </h1>

        <form action={saveTask} className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="assignees_present" value="1" />
          <input name="title" required defaultValue={task.title} aria-label="Título" className={`${input} text-base`} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Status">
              <select name="status" defaultValue={task.status} className={input}>
                {Object.entries(TASK_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Prioridade">
              <select name="priority" defaultValue={task.priority} className={input}>
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Projeto">
              <select name="project_id" defaultValue={task.project_id ?? ""} className={input}>
                <option value="">Sem projeto</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Prazo">
              <input type="date" name="due_date" defaultValue={task.due_date ?? ""} className={input} />
            </Field>
            <Field label="Sprint">
              <select name="sprint_id" defaultValue={task.sprint_id ?? ""} className={input}>
                <option value="">Backlog (sem sprint)</option>
                {(sprints ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Repetir">
              <select name="recurrence" defaultValue={task.recurrence ?? ""} className={input}>
                <option value="">Não repete</option>
                {Object.entries(RECURRENCE).map(([k, v]) => (
                  <option key={k} value={k}>↻ {v}</option>
                ))}
              </select>
            </Field>
            <Field label="Estimativa (h)">
              <input name="estimate_hours" inputMode="decimal" defaultValue={task.estimate_hours ?? ""} className={input} />
            </Field>
            <Field label="Gasto (h)">
              <input name="spent_hours" inputMode="decimal" defaultValue={task.spent_hours ?? 0} className={input} />
            </Field>
          </div>
          <fieldset className="flex flex-wrap items-center gap-2 text-sm">
            <legend className="mb-1 text-xs text-faint">Responsáveis</legend>
            {(people ?? []).map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 has-checked:border-accent has-checked:text-accent">
                <input type="checkbox" name="assignee" value={p.id} defaultChecked={assigned.has(p.id)} className="accent-accent" />
                {p.is_me ? `Eu (${p.name})` : p.name}
              </label>
            ))}
            <input name="new_assignees" placeholder="+ pessoa nova (vírgula para várias)" aria-label="Novos responsáveis" className={`${input} w-64`} />
          </fieldset>
          <textarea name="description" defaultValue={task.description} rows={5} placeholder="Detalhes, critérios de pronto, links…" aria-label="Descrição" className={input} />
          <div className="flex items-center justify-between">
            <button className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110">Salvar</button>
          </div>
        </form>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Subtarefas</h2>
          <TaskList tasks={subtasks} showProject={false} empty="Nenhuma subtarefa." />
          <QuickTask projects={projects ?? []} people={people ?? []} projectId={task.project_id ?? undefined} parentId={task.id} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Histórico e comentários</h2>
          <form action={addComment.bind(null, task.id)} className="flex gap-2">
            <input name="body" placeholder="Escreva um comentário ou atualização…" aria-label="Comentário" className={`${input} flex-1`} />
            <button className="rounded-md bg-surface px-3 text-sm text-muted hover:text-ink">Comentar</button>
          </form>
          <ol className="flex flex-col border-l border-line pl-4">
            {(events ?? []).map((e) => (
              <li key={e.id} className="relative py-1.5 text-sm">
                <span className={`absolute -left-[1.3rem] top-3 h-2 w-2 rounded-full ${e.kind === "comment" ? "bg-accent" : "bg-line"}`} aria-hidden />
                {e.kind === "comment" ? <p className="whitespace-pre-wrap text-ink">{e.new_value}</p> : <span className="text-muted">{describe(e)}</span>}
                <span className="ml-2 text-xs text-faint">{relativeDate(e.created_at)}</span>
                {e.kind === "comment" && (
                  <span className="ml-2 inline-block">
                    <ConfirmDelete action={deleteComment.bind(null, e.id)} title="Excluir este comentário?" label="excluir" className="text-xs text-faint hover:text-rec" />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </article>

      <aside className="flex flex-col gap-7 text-sm">
        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="mb-2 text-base font-semibold">Tempo</h2>
          <dl className="grid grid-cols-2 gap-y-1.5">
            <dt className="text-faint">Estimado</dt>
            <dd className="text-right tabular-nums">{hours(task.estimate_hours)}</dd>
            <dt className="text-faint">Gasto</dt>
            <dd className={`text-right tabular-nums ${over ? "font-semibold text-rec" : ""}`}>{hours(task.spent_hours)}</dd>
            <dt className="text-faint">Começou</dt>
            <dd className="text-right">{task.started_at ? formatDay(task.started_at) : "—"}</dd>
            <dt className="text-faint">Terminou</dt>
            <dd className="text-right">{task.completed_at ? formatDay(task.completed_at) : "—"}</dd>
            <dt className="text-faint">{task.completed_at ? "Levou" : "Em andamento há"}</dt>
            <dd className="text-right">{days(cycle)}</dd>
            <dt className="text-faint">Criada</dt>
            <dd className="text-right">{formatDay(task.created_at)}</dd>
          </dl>
          <form action={logTime.bind(null, task.id)} className="mt-3 flex gap-2">
            <input name="hours" inputMode="decimal" placeholder="horas" aria-label="Horas trabalhadas" className={`${input} w-20`} />
            <button className="flex-1 rounded-md bg-surface px-3 text-muted hover:text-ink">+ Registrar horas</button>
          </form>
        </section>

        {note && (
          <section>
            <h2 className="mb-1 text-base font-semibold">Saiu da nota</h2>
            <Link href={`/notes/${note.id}`} className="text-ink hover:underline">{note.title}</Link>
          </section>
        )}

        <section>
          <h2 className="mb-1 text-base font-semibold">Bloqueada por</h2>
          <DepList items={blockers} remove={(d) => removeDependency.bind(null, task.id, d)} />
          <form action={addDependency.bind(null, task.id)} className="mt-2 flex gap-2">
            <input name="blocked_by" placeholder="T-12" aria-label="Número da tarefa que bloqueia" className={`${input} w-24`} />
            <button className="rounded-md bg-surface px-3 text-muted hover:text-ink">Adicionar</button>
          </form>
        </section>

        {blocking.length > 0 && (
          <section>
            <h2 className="mb-1 text-base font-semibold">Bloqueia</h2>
            <DepList items={blocking} />
          </section>
        )}

        <ConfirmDelete
          action={deleteTask.bind(null, task.id, parent ? `/tasks/${parent.id}` : task.projects ? `/projects/${task.projects.slug}` : "/tasks")}
          title={`Excluir ${taskCode(task.number)} “${task.title}”?`}
          label="Excluir tarefa"
        >
          {subtasks.length > 0 ? (
            <>
              <DeleteOption name="subtasks" value="keep" defaultChecked label={`Manter as ${subtasks.length} subtarefas`} hint="Viram tarefas soltas, no mesmo projeto." />
              <DeleteOption name="subtasks" value="delete" label="Excluir as subtarefas junto" />
            </>
          ) : (
            <p className="text-muted">O histórico e os comentários dela também somem.</p>
          )}
        </ConfirmDelete>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-faint">{label}</span>
      {children}
    </label>
  );
}

function DepList({
  items,
  remove,
}: {
  items: { id: string; number: number; title: string; status: TaskStatus }[];
  remove?: (id: string) => () => Promise<void>;
}) {
  if (!items.length) return <p className="text-faint">Nenhuma.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((d) => (
        <li key={d.id} className="flex items-center gap-2">
          <StatusDot status={d.status} />
          <Link href={`/tasks/${d.id}`} className={`flex-1 hover:underline ${d.status === "done" ? "text-faint line-through" : "text-ink"}`}>
            <span className="mr-1 text-xs text-faint">{taskCode(d.number)}</span>
            {d.title}
          </Link>
          {remove && (
            <form action={remove(d.id)}>
              <button className="px-1 text-faint hover:text-ink" aria-label="Remover dependência">×</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
