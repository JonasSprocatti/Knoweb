import { NextResponse } from "next/server";
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

  const { data: segs } = await supabase.from("audio_segments").select("storage_path").eq("note_id", id);
  const paths = (segs ?? []).map((s) => s.storage_path as string);
  if (paths.length) await supabase.storage.from("audio").remove(paths);

  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}
