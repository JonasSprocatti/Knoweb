import type { SupabaseClient } from "@supabase/supabase-js";
import { extractWikilinks } from "@/lib/text";

/**
 * Recalcula as ligações [[wikilink]] que saem de uma nota.
 * Títulos que ainda não existem viram notas novas (como no Obsidian) só
 * quando você clica no link — aqui apenas ligamos o que já existe.
 */
export async function syncWikilinks(supabase: SupabaseClient, noteId: string, content: string) {
  const titles = extractWikilinks(content).map((t) => t.toLowerCase());

  await supabase.from("note_links").delete().eq("source_id", noteId).eq("kind", "wikilink");
  if (titles.length === 0) return;

  const { data: notes } = await supabase.from("notes").select("id, title");
  const byTitle = new Map<string, string>();
  for (const n of notes ?? []) byTitle.set(String(n.title).toLowerCase(), n.id as string);

  const rows = titles
    .map((t) => byTitle.get(t))
    .filter((id): id is string => !!id && id !== noteId)
    .map((target_id) => ({ source_id: noteId, target_id, kind: "wikilink" as const }));

  if (rows.length) {
    await supabase.from("note_links").upsert(rows, { onConflict: "source_id,target_id,kind" });
  }
}
