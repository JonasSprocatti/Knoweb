"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ANY_ACCEPT } from "@/lib/files";
import { notesFromFiles } from "@/lib/upload";

/**
 * Envia arquivos que já existem: áudio (gravador, WhatsApp, Teams…) vai para a
 * transcrição; Word, PowerPoint e texto são lidos no servidor, PDF e print pelo Claude.
 * Cada arquivo vira uma nota nova (para pôr numa nota que já existe, use "Anexar" na nota).
 */
export function FileUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: File[]) {
    setError(null);
    setBusy(true);
    const ids: string[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        ids.push(...(await notesFromFiles({ userId, files: [file] }))); // aqui cada arquivo vira a sua nota
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
        accept={ANY_ACCEPT}
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
        {busy ? "Enviando…" : "Ou envie arquivos: áudio, Word, PowerPoint, PDF, prints, textos"}
      </button>
      <p className="text-xs text-faint">Cada arquivo vira uma nota nova ligada à teia. Para juntar a uma nota que já existe, abra a nota e use “Anexar arquivo”.</p>
      {error && <p className="max-w-md whitespace-pre-line text-sm text-rec">{error}</p>}
    </div>
  );
}
