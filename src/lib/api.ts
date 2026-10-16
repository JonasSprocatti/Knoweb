"use client";

import type { Note } from "@/lib/types";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  return data as T;
}

export const api = {
  createNote: (body: { title?: string; content?: string; kind?: "note" | "recording"; status?: "ready" | "recording"; file_path?: string; file_name?: string }) =>
    fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(
      (r) => json<Note>(r),
    ),

  updateNote: (id: string, body: { title?: string; content?: string; pinned?: boolean }) =>
    fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<{ id: string; title: string; updated_at: string }>(r)),


  analyze: (noteId: string) =>
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    }).then((r) => json<{ skipped: boolean }>(r)),

  addTopic: (noteId: string, name: string) =>
    fetch(`/api/notes/${noteId}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => json<{ id: string; name: string; slug: string }>(r)),

  removeTopic: (noteId: string, topicId: string) =>
    fetch(`/api/notes/${noteId}/topics`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId }),
    }).then((r) => json<{ ok: true }>(r)),
};

/** Debounce simples para autosave. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  debounced.flush = (...args: A) => {
    if (t) clearTimeout(t);
    fn(...args);
  };
  return debounced;
}
