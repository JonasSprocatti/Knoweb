"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { baseMime, extensionFor } from "@/lib/audio";
import { MAX_DOC_BYTES, MAX_IMAGE_BYTES, type FileKind, type NoteFile } from "@/lib/files";

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastError;
}

/**
 * Envia um pedaço de áudio direto do navegador para o Supabase Storage
 * (sem passar pelo servidor, então não esbarra no limite de upload da Vercel)
 * e registra o segmento. Devolve o id do segmento.
 */
export async function uploadSegment(opts: {
  userId: string;
  noteId: string;
  seq: number;
  blob: Blob;
  mime: string;
  durationSeconds: number;
}): Promise<string> {
  const supabase = supabaseBrowser();
  const mime = baseMime(opts.mime || opts.blob.type);
  const path = `${opts.userId}/${opts.noteId}/${String(opts.seq).padStart(4, "0")}.${extensionFor(mime)}`;

  await withRetry(async () => {
    const { error } = await supabase.storage.from("audio").upload(path, opts.blob, { contentType: mime, upsert: true });
    if (error) throw error;
  });

  return withRetry(async () => {
    const { data, error } = await supabase
      .from("audio_segments")
      .upsert(
        {
          note_id: opts.noteId,
          seq: opts.seq,
          storage_path: path,
          mime_type: mime,
          duration_seconds: Math.max(0, Math.round(opts.durationSeconds * 10) / 10),
          status: "uploaded",
        },
        { onConflict: "note_id,seq" },
      )
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  });
}

/** Dispara a transcrição de um segmento (o servidor continua mesmo se você sair da página). */
export function requestTranscription(segmentId: string) {
  return fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segmentId }),
  }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Falha na transcrição");
    return r.json();
  });
}

export async function finishRecording(noteId: string) {
  const r = await fetch(`/api/notes/${noteId}/finish`, { method: "POST" });
  return r.ok;
}

/** Envia um documento (Word, PowerPoint, PDF, print, texto) direto para o Storage e devolve o caminho. */
export async function uploadDocument(userId: string, file: File, kind: FileKind): Promise<string> {
  const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if (file.size > max) throw new Error(`${file.name}: maior que ${max / 1024 / 1024} MB.`);
  const path = `${userId}/${crypto.randomUUID()}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabaseBrowser().storage.from("files").upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(`${file.name}: ${error.message}`);
  return path;
}

/**
 * Lê o arquivo já enviado e põe o conteúdo na nota. Com `attach`, junta ao fim
 * de uma nota que já existe (sem reanalisar); sem, preenche a nota nova e analisa.
 */
export async function ingestDocument(body: { noteId: string; path: string; name: string; attach?: boolean }) {
  const r = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Erro ${r.status}`);
  return data as { content?: string; file?: NoteFile };
}
