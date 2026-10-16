"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ANY_ACCEPT } from "@/lib/files";
import { supabaseBrowser } from "@/lib/supabase/client";
import { checkFiles, notesFromFiles } from "@/lib/upload";

/**
 * Entrada do projeto: um arquivo e/ou uma anotação do que precisa ser feito.
 * Vira uma nota ligada ao projeto; o Claude lê, sugere as tarefas aqui (com
 * responsáveis) e liga tudo na teia. Você confirma o que for criado.
 */
export function ProjectInbox({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length && !text.trim()) return setError("Escolha arquivos ou escreva o que precisa ser feito.");
    setBusy(true);
    setError(null);
    try {
      let ids: string[];
      if (files.length) {
        const { data } = await supabaseBrowser().auth.getUser();
        if (!data.user) throw new Error("Sua sessão expirou. Entre de novo.");
        ids = await notesFromFiles({ userId: data.user.id, files, content: text, projectId });
      } else {
        const note = await api.createNote({ title: text.trim().split("\n")[0].slice(0, 80), content: text, project_id: projectId });
        api.analyze(note.id).catch(() => undefined); // continua no servidor enquanto a nota abre
        ids = [note.id];
      }
      // Uma nota: abre ela (lá aparece o que o Claude quer criar). Várias (áudios): fica no projeto
      if (ids.length === 1) router.push(`/notes/${ids[0]}`);
      else {
        setFiles([]);
        setText("");
        setBusy(false);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <details className="group rounded-lg border border-dashed border-accent/60 bg-panel/50">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden>📎</span> Enviar arquivo ou anotação para o projeto
        <span className="ml-auto text-faint transition group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <form onSubmit={submit} className="flex flex-col gap-2 px-4 pb-4">
        <p className="text-sm text-muted">
          Word, PowerPoint, PDF, prints ou áudio (até 10 de uma vez), com uma anotação do que fazer. Os documentos entram juntos numa nota; o Claude
          lê tudo, sugere as tarefas neste projeto já com responsáveis e liga na teia. Nada é criado sem você confirmar.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Ex.: proposta do cliente. Revisar o escopo com a Ana e montar o cronograma até sexta."
          aria-label="Anotação"
          className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ANY_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = "";
              try {
                checkFiles(picked);
                setError(null);
                setFiles((prev) => [...prev, ...picked].slice(0, 10));
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press min-w-0 max-w-full truncate rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink"
          >
            {files.length ? "+ Mais arquivos" : "Escolher arquivos"}
          </button>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="flex max-w-full items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs text-muted">
              <span className="truncate">📎 {f.name}</span>
              <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`Tirar ${f.name}`} className="px-0.5 text-faint hover:text-ink">
                ×
              </button>
            </span>
          ))}
          <button disabled={busy} className="press ml-auto rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-60">
            {busy ? "Enviando…" : "Enviar e analisar"}
          </button>
        </div>
        {error && <p className="text-sm text-rec">{error}</p>}
      </form>
    </details>
  );
}
