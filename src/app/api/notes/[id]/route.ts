import { NextResponse } from "next/server";
import { deleteNotes } from "@/lib/server/deleteNotes";
import { requireUser } from "@/lib/supabase/server";
import { syncWikilinks } from "@/lib/server/links";
import { serverError, unauthorized } from "@/lib/server/http";

type Params = { params: Promise<{ id: string }> };

/** Salva título/conteúdo/fixação e recalcula os [[wikilinks]]. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    content?: string;
    pinned?: boolean;
  };
  const update: Record<string, unknown> = {};
  if (typeof body.title === "string") update.title = body.title.trim().slice(0, 200) || "Sem título";
  if (typeof body.content === "string") update.content = body.content;
  if (typeof body.pinned === "boolean") update.pinned = body.pinned;

  const { data, error } = await supabase
    .from("notes")
    .update(update)
    .eq("id", id)
    .select("id, title, updated_at")
    .single();
  if (error) return serverError(error);

  if (typeof body.content === "string") await syncWikilinks(supabase, id, body.content);
  return NextResponse.json(data);
}

/** Apaga a nota e os áudios dela. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  try {
    await deleteNotes(supabase, [id]);
  } catch (err) {
    return serverError(err);
  }
  return NextResponse.json({ ok: true });
}
