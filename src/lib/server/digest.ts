import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

export interface Digest {
  title: string;
  body: string;
  url: string;
}

const OPEN = "(todo,doing,blocked)";
/** Data de hoje no Brasil (o cron da Vercel roda em UTC). */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const names = (rows: { number: number; title: string }[]) =>
  rows
    .slice(0, 2)
    .map((t) => `T-${t.number} ${t.title.length > 34 ? `${t.title.slice(0, 32)}…` : t.title}`)
    .join(", ") + (rows.length > 2 ? ` e mais ${rows.length - 2}` : "");
const when = (days: number) => (days <= 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`);
const daysUntil = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

/**
 * Resumo do dia de um usuário: tarefas vencidas e perto do vencimento, sprints e
 * projetos terminando, trabalho parado, sugestões do Claude e gravações com erro.
 * Nada pendente = null (não manda notificação vazia).
 */
export async function buildDigest(db: SupabaseClient, userId: string): Promise<Digest | null> {
  const d0 = today();
  const staleSince = new Date(Date.now() - 7 * 864e5).toISOString();
  const [overdue, soon, sprints, projects, stale, suggested, suggestedProjects, failed] = await Promise.all([
    db.from("tasks").select("number, title").eq("user_id", userId).filter("status", "in", OPEN).lt("due_date", d0).order("due_date"),
    db.from("tasks").select("number, title, due_date").eq("user_id", userId).filter("status", "in", OPEN).gte("due_date", d0).lte("due_date", addDays(d0, 2)).order("due_date"),
    db.from("sprints").select("name, end_date").eq("user_id", userId).gte("end_date", d0).lte("end_date", addDays(d0, 2)),
    db.from("projects").select("name, due_date").eq("user_id", userId).eq("status", "active").gte("due_date", d0).lte("due_date", addDays(d0, 7)).order("due_date"),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "doing").lt("updated_at", staleSince),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "suggested"),
    db.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "suggested"),
    db.from("notes").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "error"),
  ]);
  const err = [overdue, soon, sprints, projects, stale, suggested, suggestedProjects, failed].find((r) => r.error)?.error;
  if (err) throw err;

  const lines: string[] = [];
  const late = overdue.data ?? [];
  const dueToday = (soon.data ?? []).filter((t) => t.due_date === d0);
  const dueNext = (soon.data ?? []).filter((t) => t.due_date !== d0);
  if (late.length) lines.push(`${plural(late.length, "vencida", "vencidas")}: ${names(late)}`);
  if (dueToday.length) lines.push(`Vence hoje: ${names(dueToday)}`);
  if (dueNext.length) lines.push(`Nos próximos 2 dias: ${names(dueNext)}`);
  for (const s of sprints.data ?? []) lines.push(`Sprint ${s.name} termina ${when(daysUntil(d0, s.end_date))}`);
  for (const p of (projects.data ?? []).slice(0, 2)) lines.push(`Projeto ${p.name} vence ${when(daysUntil(d0, p.due_date))}`);
  if (stale.count) lines.push(`${plural(stale.count, "tarefa parada", "tarefas paradas")} em Fazendo há mais de 7 dias`);
  const ideas = (suggested.count ?? 0) + (suggestedProjects.count ?? 0);
  if (ideas) lines.push(`${plural(ideas, "sugestão", "sugestões")} do Claude para revisar`);
  if (failed.count) lines.push(`${plural(failed.count, "gravação", "gravações")} com erro na transcrição`);
  if (!lines.length) return null;

  return {
    title: late.length ? plural(late.length, "tarefa vencida", "tarefas vencidas") : dueToday.length ? "Tarefas para hoje" : "Seu dia no Knoweb",
    body: lines.join("\n"),
    url: late.length || dueToday.length || dueNext.length ? "/tasks" : ideas ? "/projects" : "/",
  };
}

type Sub = { endpoint: string; p256dh: string; auth: string };

/** Manda o resumo para os aparelhos; devolve os endpoints que não existem mais (para apagar). */
export async function sendDigest(subs: Sub[], digest: Digest) {
  webpush.setVapidDetails("mailto:knoweb@localhost", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const gone: string[] = [];
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(digest), { TTL: 12 * 3600 })
        .catch((e: { statusCode?: number }) => {
          if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint);
          else console.error("push", e);
        }),
    ),
  );
  return gone;
}
