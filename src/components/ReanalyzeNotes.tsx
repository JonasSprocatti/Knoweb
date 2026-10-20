"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";

/**
 * Pede ao Claude para reanalisar um punhado de notas (as ligadas a um projeto ou
 * pessoa e as que citam o nome): ele reavalia temas, tarefas, responsáveis e
 * ligações com o que existe agora. Uma nota por vez, mostrando o andamento.
 */
export function ReanalyzeNotes({ noteIds, what }: { noteIds: string[]; what: string }) {
  const router = useRouter();
  const [done, setDone] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  if (!noteIds.length) return null;

  async function run() {
    const n = noteIds.length;
    if (!confirm(`Reanalisar ${n} ${n === 1 ? "nota" : "notas"} ligadas a ${what}? Cada nota é uma chamada à IA.`)) return;
    setFailed(0);
    for (let i = 0; i < n; i++) {
      setDone(i);
      await api.analyze(noteIds[i]).catch(() => setFailed((f) => f + 1));
    }
    setDone(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={done !== null}
        className="flex items-center gap-1.5 self-start rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink disabled:opacity-60"
        title="O Claude relê as notas e reavalia tarefas, responsáveis, temas e ligações"
      >
        <Icon name="sparkle" className="h-4 w-4 text-accent" />
        {done !== null ? `Reanalisando ${done + 1} de ${noteIds.length}…` : `Reanalisar notas com o Claude (${noteIds.length})`}
      </button>
      {failed > 0 && done === null && <p className="text-xs text-rec">{failed} não {failed === 1 ? "pôde" : "puderam"} ser reanalisada{failed === 1 ? "" : "s"}.</p>}
    </div>
  );
}
