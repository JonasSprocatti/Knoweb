"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Botão de enviar que mostra "Salvando…" e depois "✓ Salvo" por um instante. */
export function SaveButton({ children = "Salvar", className = "" }: { children?: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1800);
      return () => clearTimeout(t);
    }
    was.current = pending;
  }, [pending]);

  return (
    <button
      disabled={pending}
      className={`press inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition disabled:opacity-80 ${
        saved ? "bg-[#2F9D6B] text-white" : "bg-accent text-on-accent hover:brightness-110"
      } ${className}`}
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          Salvando…
        </>
      ) : saved ? (
        <span className="pop" role="status">✓ Salvo</span>
      ) : (
        children
      )}
    </button>
  );
}
