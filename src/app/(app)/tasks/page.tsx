import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizeTasks, PRIORITY, QuickTask, TASK_COLUMNS, TaskBoard, TaskList, today } from "@/components/Work";

export const metadata = { title: "Tarefas" };
export const dynamic = "force-dynamic";

type Search = { estado?: string; pessoa?: string; projeto?: string; prioridade?: string; visao?: string };

const STATES: Record<string, string> = { abertas: "Abertas", atrasadas: "Atrasadas", sugeridas: "Sugeridas", feitas: "Feitas", todas: "Todas" };
const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { estado = "abertas", pessoa = "", projeto = "", prioridade = "", visao = "lista" } = sp;
  const supabase = await supabaseServer();

  // Filtro por pessoa: !inner faz a junção virar filtro
  const columns = pessoa ? TASK_COLUMNS.replace("task_assignees(", "filter:task_assignees!inner(person_id), task_assignees(") : TASK_COLUMNS;
  let q = supabase.from("tasks").select(columns).order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  if (estado === "abertas") q = q.in("status", ["todo", "doing", "blocked"]);
  if (estado === "atrasadas") q = q.in("status", ["todo", "doing", "blocked"]).lt("due_date", today());
  if (estado === "sugeridas") q = q.eq("status", "suggested");
  if (estado === "feitas") q = q.eq("status", "done");
  if (pessoa) q = q.eq("filter.person_id", pessoa);
  if (projeto === "nenhum") q = q.is("project_id", null);
  else if (projeto) q = q.eq("project_id", projeto);
  if (prioridade) q = q.eq("priority", prioridade);

  const [{ data, error }, { data: people }, { data: projects }] = await Promise.all([
    q,
    supabase.from("people").select("id, name").order("name"),
    supabase.from("projects").select("id, name, emoji").not("status", "in", "(archived,suggested)").order("name"),
  ]);
  const tasks = normalizeTasks(data as unknown[] | null);
  const href = (patch: Partial<Search>) => `/tasks?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl md:text-4xl">Tarefas</h1>
          <p className="mt-1 max-w-xl text-muted">Tudo o que precisa ser feito, de todos os projetos. O Claude sugere tarefas a partir das notas; você aceita, distribui e acompanha.</p>
        </div>
        <nav className="flex gap-0.5 rounded-md border border-line bg-panel p-0.5 text-sm">
          {[
            ["lista", "Lista"],
            ["quadro", "Quadro"],
          ].map(([k, label]) => (
            <Link key={k} href={href({ visao: k })} className={`rounded px-3 py-1 ${visao === k ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink"}`}>
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <QuickTask projects={projects ?? []} people={people ?? []} />

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {Object.entries(STATES).map(([k, label]) => (
          <Link key={k} href={href({ estado: k })} className={`rounded-md px-3 py-1 ${estado === k ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}>
            {label}
          </Link>
        ))}
        <form className="ml-auto flex flex-wrap gap-2">
          <input type="hidden" name="estado" value={estado} />
          <input type="hidden" name="visao" value={visao} />
          <select name="pessoa" defaultValue={pessoa} aria-label="Pessoa" className={input}>
            <option value="">Todas as pessoas</option>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="projeto" defaultValue={projeto} aria-label="Projeto" className={input}>
            <option value="">Todos os projetos</option>
            <option value="nenhum">Sem projeto</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
            ))}
          </select>
          <select name="prioridade" defaultValue={prioridade} aria-label="Prioridade" className={input}>
            <option value="">Qualquer prioridade</option>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="rounded-md bg-surface px-3 text-muted hover:text-ink">Filtrar</button>
        </form>
      </div>

      {error && <p className="text-sm text-rec">{error.message}</p>}
      {visao === "quadro" ? <TaskBoard tasks={tasks} showProject /> : <TaskList tasks={tasks} showProject empty="Nenhuma tarefa com esses filtros." />}
    </div>
  );
}
