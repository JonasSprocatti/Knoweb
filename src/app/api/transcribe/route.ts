import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { maybeFinishRecording, transcribeSegment } from "@/lib/server/transcribe";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export const maxDuration = 300;

/** Transcreve um pedaço já enviado ao Storage. */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { segmentId } = (await request.json().catch(() => ({}))) as { segmentId?: string };
  if (!segmentId) return badRequest("segmentId obrigatório.");

  try {
    const noteId = await transcribeSegment(supabase, segmentId);
    const finish = await maybeFinishRecording(supabase, noteId);
    return NextResponse.json({ ok: true, noteId, analyzed: finish.finished });
  } catch (err) {
    // Um pedaço com erro não deve travar a análise do resto da gravação.
    const { data: seg } = await supabase.from("audio_segments").select("note_id").eq("id", segmentId).single();
    if (seg?.note_id) await maybeFinishRecording(supabase, seg.note_id as string).catch(() => undefined);
    return serverError(err);
  }
}
