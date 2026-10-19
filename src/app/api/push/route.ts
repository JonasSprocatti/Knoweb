import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

/** Liga este aparelho no resumo diário (assinatura Web Push do navegador). */
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return badRequest("Assinatura inválida.");
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, user_id: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
  return error ? serverError(error) : NextResponse.json({ ok: true });
}

/** Desliga este aparelho. */
export async function DELETE(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const { endpoint } = await req.json().catch(() => ({}));
  if (!endpoint) return badRequest("Falta o endpoint.");
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return error ? serverError(error) : NextResponse.json({ ok: true });
}
