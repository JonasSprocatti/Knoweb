import Link from "@/components/Link";
import { SaveButton } from "@/components/SaveButton";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { deletePerson, savePerson, setMe } from "@/lib/work-actions";
import { cycleDays, days, formatDay, hours, normalizeTasks, one, Progress, projectColor, PROJECT_STATUS, TASK_COLUMNS, TASK_STATUS, TaskList, taskCode, today } from "@/components/Work";
import { relativeDate } from "@/lib/text";
import { ConfirmDelete, DeleteOption } from "@/components/ConfirmDelete";
import { ReanalyzeNotes } from "@/components/ReanalyzeNotes";
import type { ProjectStatus, TaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data: person } = await supabase.from("people").select("*").eq("slug", slug).maybeSingle();
  if (!person) notFound();

  const [{ data: taskRows }, { data: mentions }, { data: owned }, { data: companies }] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_COLUMNS.replace("task_assignees(", "mine:task_assignees!inner(person_id), task_assignees("))
      .eq("mine.person_id", person.id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("note_people").select("notes(id, title, summary, created_at)").eq("person_id", person.id),
    supabase.from("projects").select("id, name, slug, emoji, color, status").eq("owner_id", person.id),
    supabase.from("entities").select("id, name, slug").eq("kind", "company").order("name"),
  ]);
  const company = (companies ?? []).find((c) => c.id === person.company_id);

  const tasks = normalizeTasks(taskRows as unknown[] | null).filter((t) => t.status !== "canceled");
  const real = tasks.filter((t) => t.status !== "suggested");
  const open = real.filter((t) => t.status !== "done");
  const done = real.filter((t) => t.status === "done");
  const overdue = open.filter((t) => t.due_date && t.due_date < today());
  const onTime = done.filter((t) => t.due_date && t.completed_at).filter((t) => t.completed_at!.slice(0, 10) <= t.due_date!);
  const withDue = done.filter((t) => t.due_date && t.completed_at);
  const cycles = done.map(cycleDays).filter((d): d is number => d != null);
  const est = real.reduce((s, t) => s + Number(t.estimate_hours ?? 0), 0);
  const spent = real.reduce((s, t) => s + Number(t.spent_hours ?? 0), 0);

  // Projetos em que a pessoa está: os que ela lidera + os que têm tarefa dela
  const projects = new Map<string, { name: string; slug: string; emoji: string | null; color: string | null; status?: string; done: number; total: number; lead: boolean }>();
  for (const p of owned ?? []) projects.set(p.slug, { ...p, done: 0, total: 0, lead: true });
  for (const t of real) {
    if (!t.projects) continue;
    const cur = projects.get(t.projects.slug) ?? { ...t.projects, done: 0, total: 0, lead: false };
    cur.total++;
    if (t.status === "done") cur.done++;
    projects.set(t.projects.slug, cur);
  }

  const notes = (mentions ?? [])
    .map((m) => one(m.notes as unknown as { id: string; title: string; summary: string | null; created_at: string } | null))
    .filter((n): n is { id: string; title: string; summary: string | null; created_at: string } => !!n)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Atividade: o que aconteceu nas tarefas dela, mais recente primeiro
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const { data: events } = tasks.length
    ? await supabase.from("task_events").select("id, task_id, kind, new_value, created_at").in("task_id", [...byTask.keys()]).in("kind", ["status", "comment", "assigned"]).order("created_at", { ascending: false }).limit(30)
    : { data: [] };

  return (
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link href="/people" className="text-faint underline-offset-4 hover:text-ink hover:underline">Pessoas</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-3xl md:text-4xl">{person.name}</h1>
            {person.is_me && <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-sm font-medium text-accent">Você</span>}
            <form action={setMe.bind(null, person.is_me ? null : person.id)}>
              <button className="rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-ink">
                {person.is_me ? "Não sou eu" : "Esta pessoa sou eu"}
              </button>
            </form>
          </div>
          {(person.role || person.email) && <p className="text-muted">{[person.role, person.email].filter(Boolean).join(" · ")}</p>}
          {company && (
            <Link href={`/companies/${company.slug}`} className="self-start text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
              🏢 {company.name}
            </Link>
          )}
          {person.about && <p className="max-w-2xl text-muted">{person.about}</p>}
<details className="max-w-xl rounded-lg border border-line bg-panel p-4">
          <summary className="cursor-pointer font-semibold">Editar</summary>
          <form action={savePerson} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="id" value={person.id} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Nome
              <input name="name" required defaultValue={person.name} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Cargo / papel
              <input name="role" defaultValue={person.role ?? ""} placeholder="Ex.: analista de RH, cliente, designer" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Empresa
              <select name="company_id" defaultValue={person.company_id ?? ""} className={input}>
                <option value="">Nenhuma</option>
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              E-mail
              <input name="email" type="email" defaultValue={person.email ?? ""} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              O que faz
              <textarea name="about" defaultValue={person.about ?? ""} rows={4} placeholder="Do que cuida, em que é bom, que sistemas usa. O Claude usa isso para escolher a pessoa certa ao sugerir tarefas." className={input} />
            </label>
            <SaveButton />
          </form>
          <div className="mt-3">
            <ConfirmDelete action={deletePerson.bind(null, person.id)} title={`Excluir ${person.name}?`} label="Excluir pessoa">
              <DeleteOption name="tasks" value="keep" defaultChecked label="Manter as tarefas" hint="Ela sai das tarefas e das notas; as tarefas ficam." />
              <DeleteOption name="tasks" value="delete" label="Excluir as tarefas que só ela fazia" hint="Tarefas com outros responsáveis ficam." />
            </ConfirmDelete>
          </div>
        </details>
        </header>

        <dl className="stats [--stats-lg:6]">
          <Stat label="Abertas">{open.length}</Stat>
          <Stat label="Atrasadas"><span className={overdue.length ? "text-rec" : ""}>{overdue.length}</span></Stat>
          <Stat label="Feitas">{done.length}</Stat>
          <Stat label="No prazo">{withDue.length ? `${Math.round((onTime.length / withDue.length) * 100)}%` : "—"}</Stat>
          <Stat label="Horas (gasto/estim.)">{hours(spent)} / {hours(est)}</Stat>
          <Stat label="Tempo médio por tarefa">{days(cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null)}</Stat>
        </dl>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Tarefas em aberto</h2>
          <TaskList tasks={open} showProject empty="Nada em aberto." />
        </section>

        {tasks.some((t) => t.status === "suggested") && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Sugeridas pelo Claude</h2>
            <TaskList tasks={tasks.filter((t) => t.status === "suggested")} showProject />
          </section>
        )}

        <section>
          <h2 className="mb-2 text-lg font-semibold">Concluídas</h2>
          <TaskList tasks={[...done].sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))} showProject empty="Nenhuma ainda." />
        </section>

        {events && events.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Atividade</h2>
            <ol className="flex flex-col border-l border-line pl-4 text-sm">
              {/* Mesmo evento repetido em sequência (ex.: "Recebeu" duas vezes) aparece uma vez só */}
              {events.filter((e, i) => !(i > 0 && events[i - 1].task_id === e.task_id && events[i - 1].kind === e.kind && events[i - 1].new_value === e.new_value)).map((e) => {
                const t = byTask.get(e.task_id as string);
                return (
                  <li key={e.id} className="py-1.5">
                    <span className="text-muted">
                      {e.kind === "status" ? `Moveu para “${TASK_STATUS[e.new_value as TaskStatus]?.label ?? e.new_value}”` : e.kind === "comment" ? `Comentário: ${e.new_value}` : `Recebeu`}{" "}
                    </span>
                    {t && <Link href={`/tasks/${t.id}`} className="text-ink hover:underline">{taskCode(t.number)} {t.title}</Link>}
                    <span className="ml-2 text-xs text-faint">{relativeDate(e.created_at)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-7 text-sm">
        <section>
          <h2 className="mb-2 text-base font-semibold">Projetos</h2>
          {projects.size === 0 ? (
            <p className="text-faint">Nenhum ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...projects.values()].map((p) => (
                <li key={p.slug} className="flex flex-col gap-0.5">
                  <Link href={`/projects/${p.slug}`} className="flex items-center gap-2 font-medium text-ink hover:underline">
                    <span className="h-2 w-2 rounded-full" style={{ background: projectColor(p) }} aria-hidden />
                    {p.emoji} {p.name}
                    {p.lead && <span className="text-xs font-normal text-faint">lidera</span>}
                    {p.status && <span className="text-xs font-normal text-faint">{PROJECT_STATUS[p.status as ProjectStatus]}</span>}
                  </Link>
                  {p.total > 0 && <Progress done={p.done} total={p.total} color={projectColor(p)} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Aparece em</h2>
            <ReanalyzeNotes what="esta pessoa" noteIds={notes.map((n) => n.id)} name={person.name} />
          </div>
          {notes.length === 0 ? (
            <p className="text-faint">Nenhuma nota cita esta pessoa.</p>
          ) : (
            <ul className="flex flex-col">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link href={`/notes/${n.id}`} className="-mx-2 block rounded-md px-2 py-1.5 hover:bg-panel">
                    <span className="font-medium text-ink">{n.title}</span>
                    <span className="block text-xs text-faint">{formatDay(n.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link
          href={`/ask?q=${encodeURIComponent(`O que eu sei sobre ${person.name}? Em que projetos está envolvida, o que foi combinado e o que está pendente?`)}`}
          className="self-start rounded-md bg-accent px-4 py-2 font-semibold text-on-accent hover:brightness-110"
        >
          Perguntar ao Claude
        </Link>

      </aside>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{children}</dd>
    </div>
  );
}
