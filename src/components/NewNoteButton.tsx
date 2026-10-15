"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";

export function NewNoteButton({ className = "", label = "Nova nota" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      aria-label={label || "Nova nota"}
      onClick={async () => {
        setBusy(true);
        try {
          const note = await api.createNote({});
          router.push(`/notes/${note.id}?edit=1`);
        } finally {
          setBusy(false);
        }
      }}
      className={`inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent transition hover:brightness-110 disabled:opacity-60 ${className}`}
    >
      <Icon name="plus" className="h-4 w-4" />
      {label}
    </button>
  );
}
