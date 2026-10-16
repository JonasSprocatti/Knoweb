import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { QuickCapture } from "@/components/QuickCapture";
import { LIST_COLUMNS, NoteCard } from "@/components/NoteCard";
import { TopicChip } from "@/components/TopicChip";
import { Icon } from "@/components/Icon";
import { normalizeTasks, TASK_COLUMNS, TaskList } from "@/components/Work";
import type { Insights, NoteListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await supabaseServer();

  const [{ data: pinned }, { data: recent }, { data: topics }, { data: withActions }, { data: openTasks }, { count: sugProjects }, { count: sugTasks }, { data: me }] = await Promise.all([
    supabase.from("notes").select(LIST_COLUMNS).eq("pinned", true).order("updated_at", { ascending: false }).limit(6),
    supabase.from("notes").select(LIST_COLUMNS).order("updated_at", { ascending: false }).limit(9),
    supabase.from("topics").select("id, name, slug, color, emoji, note_topics(count)").limit(200),
    supabase
      .from("notes")
      .select("id, title, insights, created_at")
      .not("analyzed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase.from("tasks").select(TASK_COLUMNS).in("status", ["todo", "doing", "blocked"]).order("due_date", { ascending: true, nullsFirst: false }).limit(8),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "suggested"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "suggested"),
    supabase.from("people").select("id, slug").eq("is_me", true).maybeSingle(),
  ]);
  // Com "eu" definido, a lista é das suas tarefas
  const { data: myTasks } = me
    ? await supabase
        .from("tasks")
        .select(TASK_COLUMNS.replace("task_assignees(", "mine:task_assignees!inner(person_id), task_assignees("))
        .eq("mine.person_id", me.id)
        .in("status", ["todo", "doing", "blocked"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(8)
    : { data: null };
  const tasks = normalizeTasks((me ? myTasks : openTasks) as unknown[] | null);

  const topTopics = (topics ?? [])
    .map((t) => ({
      ...t,
      count: (t.note_topics as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);

  const actions = (withActions ?? [])
    .flatMap((n) =>
      ((n.insights as Insights)?.action_items ?? []).map((a) => ({ ...a, noteId: n.id as string, noteTitle: n.title as string })),
    )
    .slice(0, 8);

  const hour = new Date().toLocaleString("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" });
  const h = Number(hour);
  const greeting = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display text-3xl md:text-4xl">{greeting}.</h1>
          <p className="mt-1 text-muted">O que vale guardar hoje?</p>
        </div>
        <Link
          href="/record"
          className="hidden items-center gap-2 rounded-md bg-rec px-5 py-2.5 font-semibold text-white transition hover:brightness-110 md:inline-flex"
        >
          <Icon name="mic" className="h-4 w-4" />
          Gravar conversa
        </Link>
      </header>

      <QuickCapture />


      {((sugProjects ?? 0) > 0 || (sugTasks ?? 0) > 0) && (
        <Link href={(sugProjects ?? 0) > 0 ? "/projects" : "/tasks?estado=sugeridas"} className="flex items-center gap-3 rounded-lg border border-dashed border-accent/60 bg-panel px-4 py-3 text-sm hover:border-accent">
          <Icon name="sparkle" className="h-4 w-4 text-accent" />
          <span className="text-ink">
            O Claude sugeriu {[(sugProjects ?? 0) > 0 && `${sugProjects} ${sugProjects === 1 ? "projeto" : "projetos"}`, (sugTasks ?? 0) > 0 && `${sugTasks} ${sugTasks === 1 ? "tarefa" : "tarefas"}`].filter(Boolean).join(" e ")} a partir das suas notas.
          </span>
          <span className="ml-auto text-accent">Revisar</span>
        </Link>
      )}

      {(pinned ?? []).length > 0 && (
        <section>
          <SectionTitle>Fixadas</SectionTitle>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {(pinned as NoteListItem[]).map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-12 lg:grid-cols-[1fr_280px]">
        <section>
          <div className="flex items-baseline justify-between">
            <SectionTitle>Recentes</SectionTitle>
            <Link href="/notes" className="text-muted underline-offset-4 hover:text-ink hover:underline">
              Ver todas as notas
            </Link>
          </div>
          {(recent ?? []).length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col">
              {(recent as NoteListItem[]).map((n) => (
                <NoteCard key={n.id} note={n} />
              ))}
            </div>
          )}
        </section>

        {/* No celular vem antes das notas recentes: tarefas são o que mais se consulta na rua */}
        <aside className="order-first flex flex-col gap-8 lg:order-none">
          {tasks.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between">
                <SectionTitle>{me ? "Minhas próximas tarefas" : "Próximas tarefas"}</SectionTitle>
                <Link href={me ? `/people/${me.slug}` : "/tasks"} className="text-sm text-muted hover:text-ink hover:underline">Todas</Link>
              </div>
              <div className="text-sm">
                <TaskList tasks={tasks} showProject={false} />
              </div>
            </section>
          )}

          {!me && (
            <Link href="/people" className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted hover:border-accent hover:text-ink">
              Diga quem é você em <span className="font-medium text-ink">Pessoas</span>: suas tarefas aparecem aqui e você vem marcado ao criar coisas.
            </Link>
          )}

          {topTopics.length > 0 && (
            <section>
              <SectionTitle>Temas</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {topTopics.map((t) => (
                  <TopicChip key={t.id} topic={t} count={t.count} />
                ))}
              </div>
            </section>
          )}

          {tasks.length === 0 && actions.length > 0 && (
            <section>
              <SectionTitle>Próximos passos</SectionTitle>
              <ul className="flex flex-col gap-4">
                {actions.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-accent" aria-hidden />
                    <div>
                      <p className="leading-snug text-ink">{a.text}</p>
                      <p className="mt-0.5 text-sm text-faint">
                        {a.owner && <span className="mr-2">{a.owner}</span>}
                        {a.due && <span className="mr-2">até {a.due}</span>}
                        <Link href={`/notes/${a.noteId}`} className="underline-offset-2 hover:text-ink hover:underline">
                          de “{a.noteTitle}”
                        </Link>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold">{children}</h2>;
}

function EmptyState() {
  return (
    <div className="py-6 text-muted">
      <p className="mb-1 text-lg font-semibold text-ink">Nenhuma nota ainda.</p>
      <p>Escreva uma ideia aqui em cima ou grave uma conversa. O Claude resume, separa os temas e liga tudo sozinho.</p>
    </div>
  );
}
