import type { TaskStatus } from "@/lib/types";

/** Nome e cor de cada status de tarefa (as mesmas cores no app inteiro). */
export const TASK_STATUS: Record<TaskStatus, { label: string; color: string }> = {
  suggested: { label: "Sugerida", color: "#8E5B8A" },
  todo: { label: "A fazer", color: "#8A8073" },
  doing: { label: "Fazendo", color: "#C27C1E" },
  blocked: { label: "Bloqueada", color: "#D23C32" },
  done: { label: "Feita", color: "#2F9D6B" },
  canceled: { label: "Cancelada", color: "#9C9386" },
};
