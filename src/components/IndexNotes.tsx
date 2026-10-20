"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Gera o vetor (busca por significado) das notas antigas, de 50 em 50. */
export function IndexNotes({ pending }: { pending: number }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    for (let remaining = pending; remaining > 0; ) {
      setLeft(remaining);
      const res = await fetch("/api/embeddings", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { remaining?: number; done?: number; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `Erro ${res.status}`);
        break;
      }
      if (!data.done) break;
      remaining = data.remaining ?? 0;
    }
    setLeft(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={left !== null}
        className="self-start rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink disabled:opacity-60"
      >
        {left !== null ? `Indexando… faltam ${left}` : `Indexar ${pending} ${pending === 1 ? "nota antiga" : "notas antigas"}`}
      </button>
      {error && <p className="text-xs text-rec">{error}</p>}
    </div>
  );
}
