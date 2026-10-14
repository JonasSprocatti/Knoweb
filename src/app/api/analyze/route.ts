import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { analyzeNote } from "@/lib/server/analyze";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export const maxDuration = 300;

/** Pede ao Claude para resumir, separar temas e ligar a nota ao resto da teia. */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { noteId } = (await request.json().catch(() => ({}))) as { noteId?: string };
  if (!noteId) return badRequest("noteId obrigatório.");

  try {
    const result = await analyzeNote(supabase, noteId);
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
