import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { slugify } from "@/lib/text";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

type Params = { params: Promise<{ id: string }> };

/** Adiciona um tema manualmente a uma nota (cria o tema se precisar). */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  const clean = name?.trim();
  const slug = clean ? slugify(clean) : "";
  if (!clean || !slug) return badRequest("Nome do tema obrigatório.");

  let { data: topic } = await supabase.from("topics").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!topic) {
    const { data, error } = await supabase.from("topics").insert({ name: clean, slug }).select("id, name, slug").single();
    if (error) return serverError(error);
    topic = data;
  }

  const { error } = await supabase
    .from("note_topics")
    .upsert({ note_id: id, topic_id: topic.id, relevance: 1, source: "manual" }, { onConflict: "note_id,topic_id" });
  if (error) return serverError(error);
  return NextResponse.json(topic);
}

/** Remove um tema da nota. */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { topicId } = (await request.json().catch(() => ({}))) as { topicId?: string };
  if (!topicId) return badRequest("topicId obrigatório.");

  const { error } = await supabase.from("note_topics").delete().eq("note_id", id).eq("topic_id", topicId);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}
