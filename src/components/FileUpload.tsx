"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { MAX_UPLOAD_BYTES, readAudioDuration } from "@/lib/audio";
import { DOC_ACCEPT, fileKind, MAX_DOC_BYTES, MAX_IMAGE_BYTES } from "@/lib/files";
import { supabaseBrowser } from "@/lib/supabase/client";
import { finishRecording, requestTranscription, uploadSegment } from "@/lib/upload";

/**
 * Envia arquivos que já existem: áudio (gravador, WhatsApp, Teams…) vai para a
 * transcrição; PDF, print e texto são lidos pelo Claude. Cada arquivo vira uma nota.
 */
export function FileUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendAudio(file: File) {
    if (file.size > MAX_UPLOAD_BYTES)
      throw new Error(`${file.name}: maior que 25 MB (limite do Whisper). Exporte em MP3/M4A com qualidade menor ou divida o áudio.`);
    const duration = await readAudioDuration(file);
    const note = await api.createNote({ title: file.name.replace(/\.[^.]+$/, ""), kind: "recording", status: "recording" });
    const segmentId = await uploadSegment({ userId, noteId: note.id, seq: 0, blob: file, mime: file.type || "audio/mpeg", durationSeconds: duration });
    await finishRecording(note.id); // marca como "transcrevendo"; análise roda ao fim
    requestTranscription(segmentId).catch(() => undefined);
    return note.id;
  }

  async function sendDocument(file: File, kind: "image" | "pdf" | "text") {
    const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
    if (file.size > max) throw new Error(`${file.name}: maior que ${max / 1024 / 1024} MB.`);
    // Direto do navegador para o Storage, sem passar pelo limite de upload da Vercel
    const path = `${userId}/${crypto.randomUUID()}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabaseBrowser().storage.from("files").upload(path, file, { contentType: file.type || undefined });
    if (error) throw new Error(`${file.name}: ${error.message}`);
    const note = await api.createNote({ title: file.name.replace(/\.[^.]+$/, ""), file_path: path, file_name: file.name });
    // O servidor lê e analisa mesmo se você sair da página
    fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId: note.id }) }).catch(() => undefined);
    return note.id;
  }

  async function onFiles(files: File[]) {
    setError(null);
    setBusy(true);
    const ids: string[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const kind = fileKind(file.name, file.type);
      try {
        if (!kind) throw new Error(`${file.name}: formato não suportado. Envie áudio, PDF, imagem ou texto (Word: salve como PDF).`);
        ids.push(kind === "audio" ? await sendAudio(file) : await sendDocument(file, kind));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    setBusy(false);
    if (errors.length) setError(errors.join("\n"));
    if (ids.length === 1 && !errors.length) router.push(`/notes/${ids[0]}`);
    else if (ids.length) router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={`audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.webm,.opus,${DOC_ACCEPT}`}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-dashed border-line px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-ink disabled:opacity-60"
      >
        {busy ? "Enviando…" : "Ou envie arquivos: áudio, PDF, prints, textos"}
      </button>
      <p className="text-xs text-faint">Cada arquivo vira uma nota, lida pelo Claude e ligada à teia.</p>
      {error && <p className="max-w-md whitespace-pre-line text-sm text-rec">{error}</p>}
    </div>
  );
}
