"use client";

import { useEffect, useState, useTransition } from "react";
import { setTaskStatus } from "@/lib/work-actions";
import { TASK_STATUS } from "@/lib/taskStatus";
import type { TaskStatus } from "@/lib/types";

/** Etiqueta colorida do status: muda na hora, confirma com um ✓ quando o servidor salva. */
export function StatusPicker({ id, status }: { id: string; status: TaskStatus }) {
  const [current, setCurrent] = useState(status);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  useEffect(() => setCurrent(status), [status]);
  const { color } = TASK_STATUS[current];

  return (
    <span className="relative inline-flex items-center">
      <select
        value={current}
        aria-label="Status"
        onChange={(e) => {
          const next = e.target.value as TaskStatus;
          setCurrent(next);
          start(async () => {
            await setTaskStatus(id, next);
            setSaved(true);
            setTimeout(() => setSaved(false), 1400);
          });
        }}
        className={`cursor-pointer appearance-none rounded-full border py-0.5 pl-2.5 pr-6 text-xs font-medium transition focus:outline-none ${pending ? "opacity-70" : ""}`}
        style={{
          color,
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        }}
      >
        {Object.entries(TASK_STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {k === "done" ? "✓ " : ""}
            {v.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-[10px]" style={{ color }} aria-hidden>
        {pending ? "…" : "▾"}
      </span>
      {saved && (
        <span className="pop absolute -right-5 text-sm" style={{ color: TASK_STATUS.done.color }} role="status" aria-label="Salvo">
          ✓
        </span>
      )}
    </span>
  );
}
