import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { serverError, unauthorized } from "@/lib/server/http";
import { buildDigest, sendDigest } from "@/lib/server/digest";

/** Resumo de hoje (o app Android busca aqui para montar a notificação dele). */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json({ digest: await buildDigest(supabase, user.id) });
  } catch (e) {
    return serverError(e);
  }
}

/** Testar: manda o resumo agora para os aparelhos ligados desta conta. */
export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  try {
    const { data: subs, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
    if (error) throw error;
    const digest = (await buildDigest(supabase, user.id)) ?? { title: "Notificações ligadas", body: "Nada pendente hoje. O resumo chega uma vez por dia, de manhã.", url: "/" };
    const gone = await sendDigest(subs ?? [], digest);
    if (gone.length) await supabase.from("push_subscriptions").delete().in("endpoint", gone);
    return NextResponse.json({ sent: (subs?.length ?? 0) - gone.length });
  } catch (e) {
    return serverError(e);
  }
}
