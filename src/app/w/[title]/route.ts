import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { syncWikilinks } from "@/lib/server/links";

/**
 * Destino de um [[wikilink]]. Abre a nota com esse título; se não existir,
 * cria (igual ao Obsidian) e religa as notas que já citavam esse título.
 */
export async function GET(request: Request, { params }: { params: Promise<{ title: string }> }) {
  const { title: raw } = await params;
  let title = raw;
  try {
    title = decodeURIComponent(raw);
  } catch {
    /* já veio decodificado */
  }
  title = title.trim();
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: existing } = await supabase.from("notes").select("id").ilike("title", escapeLike(title)).limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.redirect(new URL(`/notes/${existing[0].id}`, request.url));
  }

  const { data: created, error } = await supabase.from("notes").insert({ title }).select("id").single();
  if (error || !created) return NextResponse.redirect(new URL("/notes", request.url));

  // Notas que já tinham [[title]] passam a apontar para a nova
  const { data: mentioning } = await supabase.from("notes").select("id, content").ilike("content", `%[[${escapeLike(title)}%`);
  for (const n of mentioning ?? []) await syncWikilinks(supabase, n.id as string, n.content as string);

  return NextResponse.redirect(new URL(`/notes/${created.id}?edit=1`, request.url));
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
