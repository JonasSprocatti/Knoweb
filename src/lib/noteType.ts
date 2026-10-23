/**
 * O tipo que a nota mostra nas listas: gravação (microfone), arquivo (nota criada
 * de um documento ou com anexos) ou escrita (lápis).
 */
export type NoteType = "recording" | "file" | "note";

export const NOTE_TYPE: Record<NoteType, { icon: string; label: string }> = {
  recording: { icon: "mic", label: "Gravação" },
  file: { icon: "file", label: "Arquivo" },
  note: { icon: "write", label: "Anotação" },
};

export function noteType(note: { kind: string; files?: number }): NoteType {
  if (note.kind === "recording") return "recording";
  return (note.files ?? 0) > 0 ? "file" : "note";
}
