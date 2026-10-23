import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { maybeFinishRecording } from "@/lib/server/transcribe";
import { serverError, unauthorized } from "@/lib/server/http";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Chamado quando a gravação para (ou quando você encerra uma que ficou presa).
 * Marca a nota como "transcrevendo"; a análise do Claude roda assim que o
 * último pedaço terminar. Também serve para destravar uma nota parada em
 * "transcrevendo": se nada está na fila, a análise roda aqui mesmo.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { error } = await supabase.from("notes").update({ status: "transcribing" }).eq("id", id).eq("status", "recording");
  if (error) return serverError(error);

  // Áudio guardado no aparelho que subiu depois da nota pronta: transcreve e analisa de novo com ele
  const { data: pending } = await supabase.from("audio_segments").select("id").eq("note_id", id).in("status", ["uploaded", "transcribing"]).limit(1);
  if (pending?.length) {
    await supabase.from("notes").update({ status: "transcribing" }).eq("id", id).in("status", ["ready", "error"]);
  }

  try {
    const result = await maybeFinishRecording(supabase, id);
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
