"use client";

import type { Person } from "@/lib/types";
import { MultiSelect } from "@/components/MultiSelect";

/**
 * Responsáveis de uma tarefa: busca com os escolhidos em chips. Numa tarefa nova
 * você já vem escolhido; nomes que não existem viram pessoas novas ao salvar.
 */
export function AssigneePicker({
  people,
  defaultIds,
  className = "",
}: {
  people: Pick<Person, "id" | "name" | "is_me">[];
  defaultIds?: string[];
  className?: string;
}) {
  const sorted = [...people].sort((a, b) => Number(!!b.is_me) - Number(!!a.is_me));
  return (
    <MultiSelect
      name="assignee"
      createName="new_assignees"
      label="Responsáveis"
      placeholder="Buscar ou adicionar pessoa…"
      empty="Ninguém com esse nome."
      options={sorted.map((p) => (p.is_me ? { value: p.id, label: "Eu", hint: p.name } : { value: p.id, label: p.name }))}
      defaultValues={defaultIds ?? sorted.filter((p) => p.is_me).map((p) => p.id)}
      className={className}
    />
  );
}
