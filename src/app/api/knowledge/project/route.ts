import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { writeProjectDoc } from "@/lib/server/projectDoc";
import { badRequest, unauthorized } from "@/lib/server/http";

export const maxDuration = 300;

/**
 * Escreve o documento de um projeto concluído que está na fila. Só uma chamada
 * pega cada documento (queued → writing); as outras voltam sem fazer nada.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const { docId } = (await request.json().catch(() => ({}))) as { docId?: string };
  if (!docId) return badRequest("docId obrigatório.");

  const { data: claimed } = await supabase
    .from("knowledge")
    .update({ status: "writing", updated_at: new Date().toISOString() })
    .eq("id", docId)
    .eq("status", "queued")
    .select("id, project_id")
    .maybeSingle();
  if (!claimed?.project_id) return NextResponse.json({ started: false });

  try {
    await writeProjectDoc(supabase, docId, claimed.project_id as string);
    return NextResponse.json({ started: true, done: true });
  } catch (err) {
    await supabase.from("knowledge").update({ status: "error" }).eq("id", docId);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
