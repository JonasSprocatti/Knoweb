"use client";

import { useEffect, useRef, useState } from "react";
import type { Person } from "@/lib/types";

/** Responsáveis de uma tarefa nova: caixinhas num menu, com você já marcado. */
export function AssigneePicker({ people, className = "" }: { people: Pick<Person, "id" | "name" | "is_me">[]; className?: string }) {
  const sorted = [...people].sort((a, b) => Number(!!b.is_me) - Number(!!a.is_me));
  const [chosen, setChosen] = useState(() => new Set(sorted.filter((p) => p.is_me).map((p) => p.id)));
  const ref = useRef<HTMLDetailsElement>(null);

  // Fecha ao tocar fora
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const names = sorted.filter((p) => chosen.has(p.id)).map((p) => (p.is_me ? "Eu" : p.name));

  return (
    <details ref={ref} className={`relative ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink hover:border-accent [&::-webkit-details-marker]:hidden">
        <span aria-hidden>👤</span>
        <span className="max-w-40 truncate">{names.length ? names.join(", ") : "Sem responsável"}</span>
        <span className="text-faint" aria-hidden>▾</span>
      </summary>
      <div className="absolute left-0 z-20 mt-1 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-lg border border-line bg-panel p-2 shadow-lg">
        {sorted.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface">
            <input type="checkbox" name="assignee" value={p.id} checked={chosen.has(p.id)} onChange={() => toggle(p.id)} className="accent-accent" />
            {p.is_me ? <span>Eu <span className="text-faint">({p.name})</span></span> : p.name}
          </label>
        ))}
        {!sorted.length && <p className="px-2 py-1 text-xs text-faint">Ninguém cadastrado ainda.</p>}
        <input
          name="new_assignees"
          placeholder="+ pessoa nova (vírgula para várias)"
          aria-label="Novos responsáveis"
          className="mt-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </div>
    </details>
  );
}
