import type { EntityKind } from "@/lib/types";

/** Textos de cada tipo de entidade (empresa, sistema). */
export const ENTITY: Record<EntityKind, { one: string; many: string; path: string; icon: string; color: string; hint: string; newOne: string }> = {
  company: { one: "Empresa", many: "Empresas", path: "/companies", icon: "building", color: "#5B6BB5", hint: "Clientes, fornecedores, parceiros e a sua própria empresa.", newOne: "Nova empresa" },
  system: { one: "Sistema", many: "Sistemas", path: "/systems", icon: "server", color: "#3E8E9E", hint: "Sistemas e ferramentas que aparecem no trabalho (SAP, Senior, Teams…).", newOne: "Novo sistema" },
};
