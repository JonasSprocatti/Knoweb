"use client";

import { useState } from "react";

/**
 * Responsável num formulário: lista as pessoas e tem "+ Nova pessoa…", que troca
 * o select por um campo de nome. A pessoa é criada quando o formulário é salvo
 * (campo `new_<name>`), sem sair da tela.
 */
export function PersonSelect({
  people,
  name = "owner_id",
  defaultValue = "",
  className = "",
}: {
  people: { id: string; name: string; is_me?: boolean | null }[];
  name?: string;
  defaultValue?: string;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  if (adding)
    return (
      <span className="flex items-center gap-1">
        <input name={`new_${name}`} required autoFocus placeholder="Nome da pessoa nova" aria-label="Nome da pessoa nova" className={`${className} min-w-0`} />
        <button type="button" onClick={() => setAdding(false)} className="rounded-md px-2 py-1 text-sm text-muted hover:text-ink" title="Escolher da lista">
          ×
        </button>
      </span>
    );
  return (
    <select
      name={name}
      aria-label="Responsável"
      defaultValue={defaultValue}
      onChange={(e) => {
        if (e.target.value === "__new") setAdding(true);
      }}
      className={className}
    >
      <option value="">Sem responsável</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.is_me ? `Eu (${p.name})` : p.name}</option>
      ))}
      <option value="__new">+ Nova pessoa…</option>
    </select>
  );
}
