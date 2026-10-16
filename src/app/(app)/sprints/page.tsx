import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { saveSprint } from "@/lib/work-actions";
import { formatDay, hours, Progress, today } from "@/components/Work";

export const metadata = { title: "Sprints" };
export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export default async function SprintsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("sprints").select("*, tasks(status, estimate_hours, spent_hours)").order("start_date", { ascending: false });
  const now = today();
  const sprints = (data ?? []).map((s) => {
    const tasks = ((s.tasks ?? []) as { status: string; estimate_hours: number | null; spent_hours: number }[]).filter((t) => t.status !== "canceled" && t.status !== "suggested");
    return {
      ...s,
      done: tasks.filter((t) => t.status === "done").length,
      total: tasks.length,
      est: tasks.reduce((a, t) => a + Number(t.estimate_hours ?? 0), 0),
      phase: s.end_date < now ? "Encerradas" : s.start_date > now ? "Próximas" : "Em andamento",
    };
  });
  // Sugestão para a próxima: começa no dia seguinte à última e dura o mesmo
  const last = sprints[0];
  const nextStart = last ? addDays(last.end_date, 1) : now;
  const length = last ? Math.round((new Date(last.end_date).getTime() - new Date(last.start_date).getTime()) / 86_400_000) : 13;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="display text-3xl md:text-4xl">Sprints</h1>
        <p className="mt-1 max-w-xl text-muted">Ciclos curtos de trabalho. Puxe tarefas do backlog para a sprint, acompanhe e, ao encerrar, o que sobrou vai para a próxima.</p>
      </header>

      <form action={saveSprint} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-3">
        <input name="name" required defaultValue={`Sprint ${sprints.length + 1}`} aria-label="Nome" className={`${input} w-36`} />
        <label className="text-sm text-muted">De <input type="date" name="start_date" required defaultValue={nextStart} className={input} /></label>
        <label className="text-sm text-muted">até <input type="date" name="end_date" required defaultValue={addDays(nextStart, length)} className={input} /></label>
        <input name="goal" placeholder="Objetivo da sprint" aria-label="Objetivo" className={`${input} min-w-48 flex-1`} />
        <button className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110">Criar sprint</button>
      </form>

      {["Em andamento", "Próximas", "Encerradas"].map((phase) => {
        const group = sprints.filter((s) => s.phase === phase);
        if (!group.length) return null;
        return (
          <section key={phase}>
            <h2 className="mb-2 text-lg font-semibold">{phase}</h2>
            <ul className="flex flex-col rounded-lg border border-line bg-panel px-3">
              {group.map((s) => (
                <li key={s.id} className="border-b border-line last:border-0">
                  <Link href={`/sprints/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{s.name}</span>
                      {s.goal && <span className="line-clamp-1 text-sm text-muted">{s.goal}</span>}
                    </span>
                    <span className="text-xs text-faint">{formatDay(s.start_date)} → {formatDay(s.end_date)}</span>
                    <span className="text-xs text-faint">{hours(s.est)}</span>
                    <Progress done={s.done} total={s.total} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
