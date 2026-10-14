import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { maybeFinishRecording } from "@/lib/server/transcribe";
import { serverError, unauthorized } from "@/lib/server/http";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Chamado quando a gravação para. Marca a nota como "transcrevendo";
 * a análise do Claude roda assim que o último pedaço terminar.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { error } = await supabase.from("notes").update({ status: "transcribing" }).eq("id", id).eq("status", "recording");
  if (error) return serverError(error);

  try {
    const result = await maybeFinishRecording(supabase, id);
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
