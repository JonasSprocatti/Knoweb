import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { syncWikilinks } from "@/lib/server/links";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

/** Cria uma nota (escrita ou gravação). */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    content?: string;
    kind?: "note" | "recording";
    status?: "ready" | "recording";
    /** Arquivo já enviado ao bucket "files" (PDF, print, texto), na pasta do usuário */
    file_path?: string;
    file_name?: string;
  };
  const kind = body.kind === "recording" ? "recording" : "note";
  const status = body.status === "recording" ? "recording" : "ready";
  if (body.title && body.title.length > 200) return badRequest("Título muito longo.");
  if (body.file_path && !body.file_path.startsWith(`${user.id}/`)) return badRequest("Arquivo inválido.");

  const { data, error } = await supabase
    .from("notes")
    .insert({
      title: body.title?.trim() || "Sem título",
      content: body.content ?? "",
      kind,
      status: body.file_path ? "analyzing" : status,
      file_path: body.file_path ?? null,
      file_name: body.file_name?.slice(0, 200) ?? null,
    })
    .select("*")
    .single();
  if (error) return serverError(error);

  if (data.content) await syncWikilinks(supabase, data.id, data.content);
  return NextResponse.json(data);
}
