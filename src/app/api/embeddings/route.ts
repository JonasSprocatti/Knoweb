import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { embed, noteText, saveEmbedding } from "@/lib/server/embeddings";
import { unauthorized } from "@/lib/server/http";

export const maxDuration = 300;

/** Gera o vetor das notas que ainda não têm (as antigas), 50 por chamada. */
export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { data: notes, error } = await supabase
    .from("notes")
    .select("id, title, summary, content, transcript")
    .is("embedding", null)
    .is("merged_into", null)
    .limit(50);
  if (error) return NextResponse.json({ error: "Rode o SQL novo do supabase/schema.sql (busca por significado) no Supabase." }, { status: 400 });
  if (!notes.length) return NextResponse.json({ done: 0, remaining: 0 });

  const vectors = await embed(supabase, notes.map(noteText));
  if (!vectors) return NextResponse.json({ error: "Não consegui gerar os vetores (confira a OPENAI_API_KEY)." }, { status: 502 });
  await Promise.all(notes.map((n, i) => saveEmbedding(supabase, n.id, vectors[i])));

  const { count } = await supabase.from("notes").select("id", { count: "exact", head: true }).is("embedding", null).is("merged_into", null);
  return NextResponse.json({ done: notes.length, remaining: count ?? 0 });
}
