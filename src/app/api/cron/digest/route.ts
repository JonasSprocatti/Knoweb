import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverError } from "@/lib/server/http";
import { buildDigest, sendDigest } from "@/lib/server/digest";

export const maxDuration = 60;

/** Cron diário da Vercel (vercel.json): um resumo por usuário, para todos os aparelhos dele. */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Sem acesso." }, { status: 401 });
  // Roda sem usuário logado: a chave service_role ignora o RLS, então cada consulta filtra por user_id
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    const { data: subs, error } = await db.from("push_subscriptions").select("endpoint, p256dh, auth, user_id");
    if (error) throw error;
    const byUser = Map.groupBy(subs ?? [], (s) => s.user_id);
    let sent = 0;
    for (const [userId, list] of byUser) {
      const digest = await buildDigest(db, userId);
      if (!digest) continue;
      const gone = await sendDigest(list, digest);
      if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);
      sent += list.length - gone.length;
    }
    return NextResponse.json({ users: byUser.size, sent });
  } catch (e) {
    return serverError(e);
  }
}
