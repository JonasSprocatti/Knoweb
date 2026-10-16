import type { SupabaseClient } from "@supabase/supabase-js";

/** Apaga notas junto com os áudios e imagens delas no Storage. */
export async function deleteNotes(supabase: SupabaseClient, ids: string[]) {
  if (!ids.length) return;
  const [{ data: segs }, { data: notes }] = await Promise.all([
    supabase.from("audio_segments").select("storage_path").in("note_id", ids),
    supabase.from("notes").select("cover_path, file_path").in("id", ids),
  ]);
  const audio = (segs ?? []).map((s) => s.storage_path as string);
  const images = (notes ?? []).map((n) => n.cover_path as string | null).filter((p): p is string => !!p);
  if (audio.length) await supabase.storage.from("audio").remove(audio);
  if (images.length) await supabase.storage.from("images").remove(images);
  const files = (notes ?? []).map((n) => n.file_path as string | null).filter((p): p is string => !!p);
  if (files.length) await supabase.storage.from("files").remove(files);
  const { error } = await supabase.from("notes").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
