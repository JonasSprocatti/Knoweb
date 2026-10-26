"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { acceptSuggested, discardSuggested, setTaskStatus, deleteTask } from "@/lib/work-actions";

/**
 * Aceitar e descartar tarefas sugeridas pelo Claude.
 * A linha some (ou vira "aceita") na hora do clique, sem esperar a tela nova do servidor:
 * às vezes o Next/React fica preso sem trocar a tela depois de uma ação, e aí parecia
 * que o botão não fazia nada (a tarefa já tinha sido apagada no banco).
 */

type Choice = "accepted" | "discarded";
type Ctx = { done: Record<string, Choice>; mark: (ids: string[], c: Choice | null) => void };

const SuggestionsCtx = createContext<Ctx | null>(null);

/** Guarda o que já foi aceito ou descartado, para a lista e os botões de "todas" andarem juntos. */
export function SuggestionsProvider({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState<Record<string, Choice>>({});
  const mark = (ids: string[], c: Choice | null) =>
    setDone((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (c) next[id] = c;
        else delete next[id];
      }
      return next;
    });
  return <SuggestionsCtx.Provider value={{ done, mark }}>{children}</SuggestionsCtx.Provider>;
}

/** Fora de um SuggestionsProvider, cada linha guarda o próprio estado. */
function useSuggestions(): Ctx {
  const ctx = useContext(SuggestionsCtx);
  const [own, setOwn] = useState<Record<string, Choice>>({});
  if (ctx) return ctx;
  return {
    done: own,
    mark: (ids, c) => setOwn((prev) => Object.fromEntries([...Object.entries(prev).filter(([k]) => !ids.includes(k)), ...(c ? ids.map((id) => [id, c]) : [])])),
  };
}

/** Marca na hora e chama o servidor; se der erro, volta como estava e avisa. */
function useChoose() {
  const { mark } = useSuggestions();
  const [, start] = useTransition();
  return (ids: string[], c: Choice, action: () => Promise<unknown>) => {
    mark(ids, c);
    start(async () => {
      try {
        await action();
      } catch {
        mark(ids, null);
        alert(c === "accepted" ? "Não deu para aceitar. Tente de novo." : "Não deu para descartar. Tente de novo.");
      }
    });
  };
}

/** Linha de uma tarefa sugerida: some quando é descartada. */
export function SuggestedRow({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { done } = useSuggestions();
  if (done[id] === "discarded") return null;
  return <li className={className}>{children}</li>;
}

/** ✓ Aceitar / × Descartar de uma tarefa. */
export function SuggestionButtons({ id }: { id: string }) {
  const { done } = useSuggestions();
  const choose = useChoose();
  if (done[id] === "accepted")
    return (
      <span className="pop text-xs font-medium text-[#2F9D6B]" role="status">
        ✓ Aceita
      </span>
    );
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => choose([id], "accepted", () => setTaskStatus(id, "todo"))}
        className="press rounded-full border border-[#2F9D6B]/50 bg-[#2F9D6B]/10 px-2.5 py-0.5 text-xs font-medium text-[#2F9D6B]"
        title="Aceitar esta tarefa"
      >
        ✓ Aceitar
      </button>
      <button
        type="button"
        onClick={() => choose([id], "discarded", () => deleteTask(id, null))}
        className="press rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-rec hover:text-rec"
        title="Descartar esta sugestão"
      >
        × Descartar
      </button>
    </span>
  );
}

/** "Aceitar N sugeridas" e "Descartar todas", para as sugestões de uma nota ou de um projeto. */
export function SuggestionBulk({
  by,
  ownerId,
  ids,
  showCount = false,
  size = "sm",
}: {
  by: "note_id" | "project_id";
  ownerId: string;
  ids: string[];
  /** "Aceitar 3 sugeridas" em vez de "Aceitar todas" */
  showCount?: boolean;
  size?: "xs" | "sm";
}) {
  const { done } = useSuggestions();
  const choose = useChoose();
  const left = ids.filter((id) => !done[id]);
  if (!left.length) return null;
  const pad = size === "xs" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          if (left.length > 1 && !confirm(`Descartar as ${left.length} tarefas sugeridas?`)) return;
          choose(left, "discarded", () => discardSuggested(by, ownerId));
        }}
        className={`press rounded-md border border-line text-muted hover:border-rec hover:text-rec ${pad}`}
      >
        Descartar todas
      </button>
      <button
        type="button"
        onClick={() => choose(left, "accepted", () => acceptSuggested(by, ownerId))}
        className={`press rounded-md bg-accent font-semibold text-on-accent hover:brightness-110 ${pad}`}
      >
        {showCount ? `Aceitar ${left.length} ${left.length === 1 ? "sugerida" : "sugeridas"}` : "Aceitar todas"}
      </button>
    </span>
  );
}
