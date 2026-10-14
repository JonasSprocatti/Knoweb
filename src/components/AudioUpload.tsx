"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { MAX_UPLOAD_BYTES, readAudioDuration } from "@/lib/audio";
import { finishRecording, requestTranscription, uploadSegment } from "@/lib/upload";

/** Envia um áudio que já existe (gravador do celular, WhatsApp, Teams…). */
export function AudioUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        "Arquivo maior que 25 MB (limite do Whisper). Exporte em MP3/M4A com qualidade menor ou divida o áudio e envie as partes.",
      );
      return;
    }
    setBusy(true);
    try {
      const duration = await readAudioDuration(file);
      const title = file.name.replace(/\.[^.]+$/, "");
      const note = await api.createNote({ title, kind: "recording", status: "recording" });
      const segmentId = await uploadSegment({
        userId,
        noteId: note.id,
        seq: 0,
        blob: file,
        mime: file.type || "audio/mpeg",
        durationSeconds: duration,
      });
      await finishRecording(note.id); // marca como "transcrevendo"; análise roda ao fim
      requestTranscription(segmentId).catch(() => undefined);
      router.push(`/notes/${note.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.webm,.opus"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-dashed border-line px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-ink disabled:opacity-60"
      >
        {busy ? "Enviando…" : "Ou envie um arquivo de áudio (até 25 MB)"}
      </button>
      {error && <p className="max-w-md text-sm text-rec">{error}</p>}
    </div>
  );
}
