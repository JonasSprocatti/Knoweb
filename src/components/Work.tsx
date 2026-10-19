import Link from "@/components/Link";
import { SaveButton } from "@/components/SaveButton";
import { StatusPicker } from "@/components/StatusPicker";
import { TASK_STATUS } from "@/lib/taskStatus";
import { AssigneePicker } from "@/components/AssigneePicker";
import { deleteTask, saveTask, setTaskStatus } from "@/lib/work-actions";
import { topicColor } from "@/lib/topicColor";
import type { Person, Project, ProjectStatus, Recurrence, TaskPriority, TaskRow, TaskStatus } from "@/lib/types";

/** Colunas das listas de tarefas, já com projeto e responsáveis. */
export const TASK_COLUMNS = "*, projects(id, name, slug, emoji, color), task_assignees(people(id, name, slug))";

export { TASK_STATUS };
export const BOARD: TaskStatus[] = ["todo", "doing", "blocked", "done"];

export const PRIORITY: Record<TaskPriority, string> = { urgent: "Urgente", high: "Alta", medium: "Média", low: "Baixa" };

export const RECURRENCE: Record<Recurrence, string> = {
  daily: "Todo dia",
  weekdays: "Dias úteis",
  weekly: "Toda semana",
  biweekly: "A cada 2 semanas",
  monthly: "Todo mês",
};

export const PROJECT_STATUS: Record<ProjectStatus, string> = {
  suggested: "Sugerido",
  idea: "Ideia",
  active: "Em andamento",
  paused: "Pausado",
  done: "Concluído",
  archived: "Arquivado",
};

export const projectColor = (p: { slug: string; color?: string | null }) => topicColor(p);
export const taskCode = (n: number) => `T-${n}`;

export const formatDay = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
export const isOpen = (s: TaskStatus) => s !== "done" && s !== "canceled";
export const hours = (h: number | null | undefined) =>
  h == null ? "—" : `${Number(h).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

/** Tempo entre começar e terminar (ou até agora). */
export function cycleDays(t: { started_at: string | null; completed_at: string | null }) {
  if (!t.started_at) return null;
  const end = t.completed_at ? new Date(t.completed_at) : new Date();
  return Math.max(0, (end.getTime() - new Date(t.started_at).getTime()) / 86_400_000);
}
export const days = (d: number | null) =>
  d == null ? "—" : d < 1 ? "menos de 1 dia" : `${Math.round(d)} ${Math.round(d) === 1 ? "dia" : "dias"}`;

/** Bolinha do status; feita vira um ✓ verde e cancelada um × apagado. */
export function StatusDot({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS[status];
  if (status === "done" || status === "canceled")
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: s.color }} title={s.label} aria-hidden>
        {status === "done" ? "✓" : "×"}
      </span>
    );
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${status === "doing" ? "status-doing" : ""}`}
      style={{ background: s.color, color: s.color }}
      title={s.label}
      aria-hidden
    />
  );
}

export function People({ people }: { people: (Pick<Person, "name" | "slug"> | null)[] }) {
  const list = people.filter((p): p is Pick<Person, "name" | "slug"> => !!p);
  if (!list.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((p) => (
        <Link key={p.slug} href={`/people/${p.slug}`} className="rounded bg-surface px-1.5 text-xs text-muted hover:text-ink">
          {p.name}
        </Link>
      ))}
    </span>
  );
}

export function Progress({ done, total, color }: { done: number; total: number; color?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2 text-xs tabular-nums text-faint">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color ?? "var(--accent)" }} />
      </span>
      {done}/{total}
    </span>
  );
}

/** Muda o status direto na lista (etiqueta colorida, muda na hora). */
export function StatusSelect({ id, status }: { id: string; status: TaskStatus }) {
  return <StatusPicker id={id} status={status} />;
}

export function TaskItem({ task, showProject = true }: { task: TaskRow; showProject?: boolean }) {
  const overdue = task.due_date && isOpen(task.status) && task.due_date < today();
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5 transition-opacity last:border-0 ${task.status === "done" || task.status === "canceled" ? "opacity-70" : ""}`}>
      {/* Em lista estreita (celular, coluna lateral) o título ocupa a linha inteira; as etiquetas vão para a linha de baixo */}
      <span className="flex min-w-0 basis-full items-center gap-3 @lg:basis-0 @lg:flex-1">
        <StatusDot status={task.status} />
        <Link href={`/tasks/${task.id}`} className={`min-w-0 flex-1 ${task.status === "done" ? "text-faint line-through" : "text-ink"} hover:underline`}>
          <span className="mr-2 text-xs tabular-nums text-faint">{taskCode(task.number)}</span>
          {task.title}
        </Link>
      </span>
      <span className="w-2.5 @lg:hidden" aria-hidden />
      {showProject && task.projects && (
        <Link href={`/projects/${task.projects.slug}`} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
          <span className="h-2 w-2 rounded-full" style={{ background: projectColor(task.projects) }} aria-hidden />
          {task.projects.emoji} {task.projects.name}
        </Link>
      )}
      <People people={task.task_assignees.map((a) => a.people)} />
      {task.recurrence && (
        <span className="text-xs text-faint" title={RECURRENCE[task.recurrence]}>
          ↻ {RECURRENCE[task.recurrence]}
        </span>
      )}
      {(task.priority === "high" || task.priority === "urgent") && (
        <span className="text-xs font-semibold text-rec">{PRIORITY[task.priority]}</span>
      )}
      {task.due_date && <span className={`text-xs tabular-nums ${overdue ? "font-semibold text-rec" : "text-faint"}`}>{formatDay(task.due_date)}</span>}
      {task.status === "suggested" ? (
        // Sugestão do Claude: aceita ou descarta uma a uma, antes de "aceitar todas"
        <span className="flex items-center gap-1">
          <form action={setTaskStatus.bind(null, task.id, "todo")}>
            <button className="press rounded-full border border-[#2F9D6B]/50 bg-[#2F9D6B]/10 px-2.5 py-0.5 text-xs font-medium text-[#2F9D6B]" title="Aceitar esta tarefa">
              ✓ Aceitar
            </button>
          </form>
          <form action={deleteTask.bind(null, task.id, null)}>
            <button className="press rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-rec hover:text-rec" title="Descartar esta sugestão">
              × Descartar
            </button>
          </form>
        </span>
      ) : (
        <StatusSelect id={task.id} status={task.status} />
      )}
    </li>
  );
}

export function TaskList({ tasks, showProject, empty }: { tasks: TaskRow[]; showProject?: boolean; empty?: string }) {
  if (!tasks.length) return <p className="py-3 text-sm text-faint">{empty ?? "Nenhuma tarefa."}</p>;
  return (
    <ul className="@container flex flex-col">
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} showProject={showProject} />
      ))}
    </ul>
  );
}

function BoardCard({ t, showProject }: { t: TaskRow; showProject?: boolean }) {
  return (
    <li className="rounded-md border border-line border-l-[3px] bg-panel p-2.5 text-sm" style={{ borderLeftColor: TASK_STATUS[t.status].color }}>
                  <Link href={`/tasks/${t.id}`} className="block text-ink hover:underline">
                    <span className="mr-1.5 text-xs text-faint">{taskCode(t.number)}</span>
                    {t.title}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {showProject && t.projects && <span className="text-xs text-muted">{t.projects.emoji} {t.projects.name}</span>}
                    <People people={t.task_assignees.map((a) => a.people)} />
                    {t.due_date && (
                      <span className={`text-xs ${isOpen(t.status) && t.due_date < today() ? "text-rec" : "text-faint"}`}>{formatDay(t.due_date)}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <StatusSelect id={t.id} status={t.status} />
                  </div>
                </li>
  );
}

/** Quadro (como o Board do Notion): uma coluna por status. */
export function TaskBoard({ tasks, showProject }: { tasks: TaskRow[]; showProject?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {BOARD.map((s) => {
        const col = tasks.filter((t) => t.status === s);
        if (s === "blocked" && !col.length) return null; // coluna vazia de bloqueadas não ocupa espaço
        return (
          <section key={s} className="rounded-lg border border-line bg-surface p-2">
            <h3 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
              <StatusDot status={s} /> {TASK_STATUS[s].label} <span className="font-normal text-faint">{col.length}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {(s === "done" ? col.slice(0, 4) : col).map((t) => (
                <BoardCard key={t.id} t={t} showProject={showProject} />
              ))}
            </ul>
            {/* Feitas: só as 4 mais recentes à vista, o resto num clique */}
            {s === "done" && col.length > 4 && (
              <details className="mt-2">
                <summary className="cursor-pointer px-1 text-sm text-muted hover:text-ink">Ver mais {col.length - 4} feitas</summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {col.slice(4).map((t) => (
                    <BoardCard key={t.id} t={t} showProject={showProject} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Linha do tempo (como o Timeline do Notion): barras do início ao prazo. */
export function Timeline({ items }: { items: { id: string; label: string; href: string; start: string; end: string; color: string; done?: boolean }[] }) {
  if (!items.length) return <p className="py-3 text-sm text-faint">Dê datas de início e prazo para ver a linha do tempo.</p>;
  const t = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).getTime();
  const min = Math.min(...items.map((i) => t(i.start)), t(today()));
  const max = Math.max(...items.map((i) => t(i.end)), t(today())) + 86_400_000;
  const pos = (d: string) => ((t(d) - min) / (max - min)) * 100;
  return (
    <div className="relative flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-3">
      <span className="absolute inset-y-0 w-px bg-rec/60" style={{ left: `calc(${pos(today())}% )` }} title="Hoje" aria-hidden />
      <div className="flex justify-between text-xs text-faint">
        <span>{formatDay(new Date(min).toISOString())}</span>
        <span>{formatDay(new Date(max - 86_400_000).toISOString())}</span>
      </div>
      {items.map((i) => (
        <Link key={i.id} href={i.href} className="relative block h-6" title={`${i.label}: ${formatDay(i.start)} → ${formatDay(i.end)}`}>
          <span
            className={`absolute inset-y-0 flex items-center overflow-hidden whitespace-nowrap rounded px-2 text-xs font-medium text-white ${i.done ? "opacity-50" : ""}`}
            style={{ left: `${pos(i.start)}%`, width: `max(${pos(i.end) - pos(i.start)}%, 6px)`, minWidth: "1.5rem", background: i.color }}
          >
            {i.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

const input = "max-w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

/** Criação rápida de tarefa: título, projeto, responsáveis, prazo e estimativa. */
export function QuickTask({
  projects,
  people,
  projectId,
  noteId,
  parentId,
  sprintId,
}: {
  projects: Pick<Project, "id" | "name" | "emoji">[];
  people: Pick<Person, "id" | "name" | "is_me">[];
  projectId?: string;
  noteId?: string;
  parentId?: string;
  sprintId?: string;
}) {
  return (
    <form action={saveTask} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-2.5">
      <input type="hidden" name="assignees_present" value="1" />
      {noteId && <input type="hidden" name="note_id" value={noteId} />}
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      {sprintId && <input type="hidden" name="sprint_id" value={sprintId} />}
      <input name="title" required placeholder={parentId ? "+ Subtarefa" : "+ Nova tarefa"} aria-label="Tarefa" className={`${input} min-w-0 basis-full sm:min-w-48 sm:basis-auto sm:flex-1`} />
      {projectId ? (
        <input type="hidden" name="project_id" value={projectId} />
      ) : (
        <select name="project_id" aria-label="Projeto" className={input} defaultValue="">
          <option value="">Sem projeto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name}
            </option>
          ))}
        </select>
      )}
      <AssigneePicker people={people} />
      <input type="date" name="due_date" aria-label="Prazo" className={input} />
      <input name="estimate_hours" inputMode="decimal" placeholder="horas" aria-label="Estimativa em horas" className={`${input} w-20`} />
      <select name="priority" aria-label="Prioridade" defaultValue="medium" className={input}>
        {Object.entries(PRIORITY).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <select name="recurrence" aria-label="Repetir" defaultValue="" className={input}>
        <option value="">Não repete</option>
        {Object.entries(RECURRENCE).map(([k, v]) => (
          <option key={k} value={k}>
            ↻ {v}
          </option>
        ))}
      </select>
      <SaveButton className="ml-auto">Criar</SaveButton>
    </form>
  );
}

/** Junta as relações do Supabase (que podem vir como lista) num objeto só. */
export const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
export function normalizeTasks(rows: unknown[] | null): TaskRow[] {
  return ((rows ?? []) as TaskRow[]).map((t) => ({
    ...t,
    projects: one(t.projects),
    task_assignees: (t.task_assignees ?? []).map((a) => ({ people: one(a.people) })),
  }));
}

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** Calendário do mês (como a visão Calendar do Notion): tarefas no dia do prazo, projetos no dia da entrega. */
export function Calendar({
  month,
  tasks,
  projects = [],
  hrefFor,
}: {
  /** AAAA-MM */
  month: string;
  tasks: TaskRow[];
  projects?: { id: string; name: string; slug: string; emoji: string | null; color: string | null; due_date: string | null }[];
  hrefFor: (month: string) => string;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // semana começa na segunda
  const iso = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const shift = (n: number) => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  const now = today();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Link href={hrefFor(shift(-1))} className="rounded-md border border-line px-2.5 py-1 text-muted hover:text-ink" aria-label="Mês anterior">‹</Link>
        <h2 className="min-w-40 text-center font-semibold capitalize">
          {first.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}
        </h2>
        <Link href={hrefFor(shift(1))} className="rounded-md border border-line px-2.5 py-1 text-muted hover:text-ink" aria-label="Próximo mês">›</Link>
        <Link href={hrefFor(now.slice(0, 7))} className="text-sm text-muted hover:text-ink">Hoje</Link>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[42rem] grid-cols-7 overflow-hidden rounded-lg border border-line bg-line [gap:1px]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-surface px-2 py-1 text-xs font-semibold text-faint">{d}</div>
          ))}
          {cells.map((d, i) => {
            if (d == null) return <div key={`x${i}`} className="min-h-24 bg-surface/60" />;
            const day = iso(d);
            const dayTasks = tasks.filter((t) => t.due_date === day);
            const dayProjects = projects.filter((p) => p.due_date === day);
            return (
              <div key={day} className={`flex min-h-24 flex-col gap-1 bg-panel p-1.5 ${day === now ? "ring-2 ring-inset ring-accent" : ""}`}>
                <span className={`text-xs tabular-nums ${day === now ? "font-bold text-accent" : "text-faint"}`}>{d}</span>
                {dayProjects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.slug}`} className="truncate rounded px-1 text-xs font-semibold text-white" style={{ background: projectColor(p) }}>
                    {p.emoji} {p.name}
                  </Link>
                ))}
                {dayTasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    title={t.title}
                    className={`flex items-center gap-1 truncate text-xs hover:underline ${t.status === "done" ? "text-faint line-through" : isOpen(t.status) && day < now ? "text-rec" : "text-ink"}`}
                  >
                    <StatusDot status={t.status} />
                    <span className="truncate">{t.title}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
