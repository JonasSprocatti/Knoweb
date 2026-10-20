import Link from "@/components/Link";
import { EmojiPicker } from "@/components/EmojiPicker";
import { PersonSelect } from "@/components/PersonSelect";
import { ReanalyzeNotes } from "@/components/ReanalyzeNotes";
import { ProjectDocWriter } from "@/components/ProjectDocWriter";
import { Icon } from "@/components/Icon";
import { SystemLinks } from "@/components/SystemLinks";
import { SaveButton } from "@/components/SaveButton";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { acceptSuggested, createProjectDoc, deleteProject, linkNote, saveProject, setProjectStatus, templateFromProject, unlinkNote } from "@/lib/work-actions";
import {
  Calendar,
  cycleDays,
  days,
  formatDay,
  hours,
  isOpen,
  normalizeTasks,
  one,
  Progress,
  PROJECT_STATUS,
  projectColor,
  QuickTask,
  TASK_COLUMNS,
  TaskBoard,
  TaskList,
  Timeline,
  TASK_STATUS,
  today,
} from "@/components/Work";
import { TopicChip } from "@/components/TopicChip";
import { ConfirmDelete, DeleteOption } from "@/components/ConfirmDelete";
import { ProjectInbox } from "@/components/ProjectInbox";
import type { ProjectStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ visao?: string; mes?: string }> }) {
  const { slug } = await params;
  const { visao = "quadro", mes } = await searchParams;
  const supabase = await supabaseServer();

  const { data: project } = await supabase
    .from("projects")
    .select("*, owner:people!projects_owner_id_fkey(id, name, slug), origin:notes!projects_origin_note_id_fkey(id, title)")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: taskRows }, { data: links }, { data: people }, { data: projects }, { data: recentNotes }] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("project_id", project.id).order("created_at"),
    supabase
      .from("project_notes")
      .select("source, notes(id, title, summary, created_at, note_topics(topics(id, name, slug, color, emoji)))")
      .eq("project_id", project.id),
    supabase.from("people").select("id, name, is_me").order("name"),
    supabase.from("projects").select("id, name, emoji").neq("status", "archived").order("name"),
    supabase.from("notes").select("id, title").order("updated_at", { ascending: false }).limit(60),
  ]);

  // Documento do projeto na base de conhecimento (sem a tabela ainda, fica null)
  const { data: doc } = await supabase.from("knowledge").select("id, status").eq("kind", "project").eq("project_id", project.id).maybeSingle();
  const tasks = normalizeTasks(taskRows);
  const suggested = tasks.filter((t) => t.status === "suggested");
  const real = tasks.filter((t) => t.status !== "suggested" && t.status !== "canceled");
  const done = real.filter((t) => t.status === "done");
  const owner = one(project.owner as { id: string; name: string; slug: string } | null);
  const origin = one(project.origin as { id: string; title: string } | null);
  const color = projectColor(project);

  type JoinedNote = { id: string; title: string; summary: string | null; created_at: string; note_topics: { topics: unknown }[] };
  const notes = (links ?? []).map((l) => ({ ...one(l.notes as unknown as JoinedNote)!, source: l.source as string })).filter((n) => n.id);

  // Temas: vêm das notas ligadas ao projeto
  const topicCount = new Map<string, { t: { name: string; slug: string; color: string | null; emoji: string | null }; n: number }>();
  for (const n of notes)
    for (const nt of n.note_topics ?? []) {
      const t = one(nt.topics as { id: string; name: string; slug: string; color: string | null; emoji: string | null } | null);
      if (t) topicCount.set(t.slug, { t, n: (topicCount.get(t.slug)?.n ?? 0) + 1 });
    }
  const topics = [...topicCount.values()].sort((a, b) => b.n - a.n);

  // Pessoas envolvidas: quem tem tarefa no projeto
  const involvement = new Map<string, { name: string; slug: string; open: number; done: number; est: number; spent: number }>();
  for (const t of real)
    for (const a of t.task_assignees) {
      if (!a.people) continue;
      const cur = involvement.get(a.people.slug) ?? { name: a.people.name, slug: a.people.slug, open: 0, done: 0, est: 0, spent: 0 };
      if (t.status === "done") cur.done++;
      else cur.open++;
      cur.est += Number(t.estimate_hours ?? 0);
      cur.spent += Number(t.spent_hours ?? 0);
      involvement.set(a.people.slug, cur);
    }

  const est = real.reduce((s, t) => s + Number(t.estimate_hours ?? 0), 0);
  const spent = real.reduce((s, t) => s + Number(t.spent_hours ?? 0), 0);
  const overdue = real.filter((t) => isOpen(t.status) && t.due_date && t.due_date < today()).length;
  const cycles = done.map(cycleDays).filter((d): d is number => d != null);
  const avgCycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;
  const linkedIds = new Set(notes.map((n) => n.id));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Link href="/projects" className="text-faint underline-offset-4 hover:text-ink hover:underline">
          Todos os projetos
        </Link>
        <h1 className="display flex items-center gap-3 text-3xl md:text-4xl">
          <span className="h-3 w-3 rounded-full" style={{ background: color }} aria-hidden />
          {project.emoji} {project.name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="rounded bg-surface px-2 py-0.5">{PROJECT_STATUS[project.status as ProjectStatus]}</span>
          {owner && (
            <span>
              Responsável: <Link href={`/people/${owner.slug}`} className="text-ink hover:underline">{owner.name}</Link>
            </span>
          )}
          {project.start_date && <span>Início {formatDay(project.start_date)}</span>}
          {project.due_date && <span className={project.due_date < today() && project.status !== "done" ? "text-rec" : ""}>Prazo {formatDay(project.due_date)}</span>}
          {origin && (
            <span>
              Nasceu de <Link href={`/notes/${origin.id}`} className="text-ink hover:underline">“{origin.title}”</Link>
            </span>
          )}
        </div>
        {project.description && <p className="max-w-3xl text-muted">{project.description}</p>}
        {doc ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
            <Icon name="book" className="h-5 w-5 text-accent" />
            <Link href={`/knowledge/${doc.id}`} className="font-medium text-ink hover:underline">
              Documento do projeto na Base de conhecimento
            </Link>
            <ProjectDocWriter docId={doc.id} status={doc.status} />
          </div>
        ) : (
          project.status === "done" && (
            <form action={createProjectDoc.bind(null, project.id)}>
              <button className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink">
                <Icon name="book" className="h-4 w-4 text-accent" /> Gerar o documento completo do projeto
              </button>
            </form>
          )
        )}
        {project.status === "suggested" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-accent/60 bg-panel p-3 text-sm">
            <span className="flex-1 text-muted">O Claude sugeriu este projeto{project.reason ? `: ${project.reason}` : "."}</span>
            <form action={setProjectStatus.bind(null, project.id, "active")}>
              <button className="rounded-md bg-accent px-3 py-1 font-semibold text-on-accent hover:brightness-110">Criar projeto e tarefas</button>
            </form>
            <form action={deleteProject.bind(null, project.id, "/projects")}>
              <button className="rounded-md px-3 py-1 text-muted hover:text-ink">Descartar</button>
            </form>
          </div>
        )}
        <details className="max-w-xl rounded-lg border border-line bg-panel p-4">
            <summary className="cursor-pointer font-semibold">Editar projeto</summary>
            <form action={saveProject} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="id" value={project.id} />
              <div className="flex gap-2">
                <div className="flex w-16 flex-col gap-1 text-xs text-muted" title="Um emoji que aparece ao lado do nome e na teia">
                  Ícone
                  <EmojiPicker defaultValue={project.emoji} placeholder="📁" label="Ícone" />
                </div>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
                  Nome
                  <input name="name" required defaultValue={project.name} className={input} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Objetivo
                <textarea name="description" defaultValue={project.description ?? ""} rows={3} placeholder="O que este projeto precisa entregar" className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Status
              <select name="status" defaultValue={project.status} className={input}>
                {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Responsável
              <PersonSelect people={people ?? []} defaultValue={owner?.id ?? ""} className={input} />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-muted">Início <input type="date" name="start_date" defaultValue={project.start_date ?? ""} className={input} /></label>
              <label className="flex items-center justify-between gap-2 text-sm text-muted">Prazo <input type="date" name="due_date" defaultValue={project.due_date ?? ""} className={input} /></label>
              <SaveButton />
            </form>
            <form action={templateFromProject.bind(null, project.id)} className="mt-3">
              <button className="text-sm text-muted hover:text-ink hover:underline">Salvar como modelo</button>
            </form>
            <div className="mt-3">
              <ConfirmDelete action={deleteProject.bind(null, project.id, "/projects")} title={`Excluir o projeto “${project.name}”?`} label="Excluir projeto">
                <p className="font-medium">Tarefas ({real.length + suggested.length})</p>
                <DeleteOption name="tasks" value="keep" defaultChecked label="Manter as tarefas" hint="Elas continuam existindo, sem projeto." />
                <DeleteOption name="tasks" value="delete" label="Excluir as tarefas junto" />
                <p className="mt-2 font-medium">Notas ligadas ({notes.length})</p>
                <DeleteOption name="notes" value="keep" defaultChecked label="Manter as notas" hint="Só o vínculo com o projeto some." />
                <DeleteOption name="notes" value="delete" label="Excluir as notas ligadas também" hint="Inclui os áudios delas." />
              </ConfirmDelete>
            </div>
          </details>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Progresso"><Progress done={done.length} total={real.length} color={color} /></Stat>
        <Stat label="Em aberto">{real.length - done.length}</Stat>
        <Stat label="Atrasadas"><span className={overdue ? "text-rec" : ""}>{overdue}</span></Stat>
        <Stat label="Estimado">{hours(est)}</Stat>
        <Stat label="Gasto">{hours(spent)}</Stat>
        <Stat label="Tempo médio por tarefa">{days(avgCycle)}</Stat>
      </dl>

      <ProjectInbox projectId={project.id} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Tarefas</h2>
            <nav className="flex gap-0.5 rounded-md border border-line bg-panel p-0.5 text-sm">
              {[
                ["quadro", "Quadro"],
                ["lista", "Lista"],
                ["linha", "Linha do tempo"],
                ["calendario", "Calendário"],
              ].map(([k, label]) => (
                <Link key={k} href={`/projects/${slug}?visao=${k}`} className={`rounded px-3 py-1 ${visao === k ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink"}`}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {suggested.length > 0 && (
            <div className="rounded-lg border border-dashed border-accent/60 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Sugeridas pelo Claude</h3>
                <form action={acceptSuggested.bind(null, "project_id", project.id)}>
                  <button className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-on-accent hover:brightness-110">Aceitar todas</button>
                </form>
              </div>
              <TaskList tasks={suggested} showProject={false} />
            </div>
          )}

          <QuickTask projects={projects ?? []} people={people ?? []} projectId={project.id} />

          {visao === "calendario" ? (
            <Calendar
              month={/^\d{4}-(0[1-9]|1[0-2])$/.test(mes ?? "") ? mes! : today().slice(0, 7)}
              tasks={real}
              projects={[project]}
              hrefFor={(m) => `/projects/${slug}?visao=calendario&mes=${m}`}
            />
          ) : visao === "lista" ? (
            <TaskList tasks={real} showProject={false} />
          ) : visao === "linha" ? (
            <Timeline
              items={real
                .filter((t) => t.due_date)
                .map((t) => ({
                  id: t.id,
                  label: t.title,
                  href: `/tasks/${t.id}`,
                  start: t.started_at ?? t.created_at,
                  end: t.completed_at ?? t.due_date!,
                  color: TASK_STATUS[t.status].color,
                  done: t.status === "done",
                }))}
            />
          ) : (
            <TaskBoard tasks={real} />
          )}
        </section>

        <aside className="flex flex-col gap-7">
          <SystemLinks supabase={supabase} type="project" id={project.id} title="Sistemas do projeto" />
          {involvement.size > 0 && (
            <section>
              <h2 className="mb-2 text-base font-semibold">Pessoas</h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {[...involvement.values()].map((p) => (
                  <li key={p.slug} className="flex items-baseline justify-between gap-2">
                    <Link href={`/people/${p.slug}`} className="font-medium text-ink hover:underline">{p.name}</Link>
                    <span className="text-xs text-faint">
                      {p.open} abertas · {p.done} feitas · {hours(p.spent)}/{hours(p.est)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {topics.length > 0 && (
            <section>
              <h2 className="mb-2 text-base font-semibold">Temas</h2>
              <div className="flex flex-wrap gap-2">
                {topics.map(({ t, n }) => (
                  <TopicChip key={t.slug} topic={t} count={n} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-base font-semibold">Notas e gravações</h2>
            <ul className="flex flex-col">
              {notes.map((n) => (
                <li key={n.id} className="group flex items-start gap-2">
                  <Link href={`/notes/${n.id}`} className="-mx-2 block flex-1 rounded-md px-2 py-1.5 hover:bg-panel">
                    <span className="font-medium text-ink">{n.title}</span>
                    <span className="block text-xs text-faint">{formatDay(n.created_at)}{n.source === "ai" ? " · ligada pelo Claude" : ""}</span>
                  </Link>
                  <form action={unlinkNote.bind(null, project.id, n.id)}>
                    <button className="p-1.5 text-faint hover:text-ink can-hover:opacity-0 can-hover:group-hover:opacity-100 focus:opacity-100" aria-label={`Desligar ${n.title}`}>×</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={linkNote.bind(null, project.id)} className="mt-2 flex gap-2">
              <select name="note_id" aria-label="Ligar nota" className={`${input} min-w-0 flex-1`} defaultValue="">
                <option value="">Ligar uma nota…</option>
                {(recentNotes ?? []).filter((n) => !linkedIds.has(n.id)).map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </select>
              <button className="rounded-md bg-surface px-3 text-sm text-muted hover:text-ink">Ligar</button>
            </form>
            <div className="mt-3">
              <ReanalyzeNotes what="este projeto" noteIds={notes.map((n) => n.id)} name={project.name} />
            </div>
          </section>


          <Link
            href={`/ask?q=${encodeURIComponent(`Como está o projeto ${project.name}? Resuma o que foi discutido, decisões, riscos e próximos passos.`)}`}
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110"
          >
            Perguntar ao Claude sobre o projeto
          </Link>
        </aside>
      </div>
    </div>
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
