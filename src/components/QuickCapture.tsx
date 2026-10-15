"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

/** Captura rápida: escreva e salve. A primeira linha vira o título. */
export function QuickCapture() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyze, setAnalyze] = useState(true);

  async function save() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      const [first, ...rest] = value.split("\n");
      const title = first.replace(/^#+\s*/, "").slice(0, 120);
      const note = await api.createNote({ title, content: rest.join("\n").trim() || value });
      if (analyze) api.analyze(note.id).catch(() => undefined);
      setText("");
      router.push(`/notes/${note.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-3 focus-within:border-accent">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
        rows={3}
        placeholder="Anote uma ideia, um insight, algo que alguém disse… Use [[Outra nota]] para ligar."
        className="w-full resize-none bg-transparent p-1 text-ink placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3 pt-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} className="accent-accent" />
          Analisar com Claude ao salvar
        </label>
        <button
          onClick={save}
          disabled={busy || !text.trim()}
          className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-on-accent transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Salvando…" : "Salvar nota"}
        </button>
      </div>
    </div>
  );
}
