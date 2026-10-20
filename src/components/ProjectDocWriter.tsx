"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Documento de projeto na fila ou sendo escrito: pede para a IA escrever (se estiver
 * na fila) e atualiza a tela enquanto o texto chega. Some quando fica pronto.
 */
export function ProjectDocWriter({ docId, status }: { docId: string; status: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "queued" && !started.current) {
      started.current = true;
      fetch("/api/knowledge/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docId }) })
        .then(async (r) => {
          if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Erro ${r.status}`);
        })
        .catch(() => {}) // a escrita segue no servidor; a tela só para de acompanhar
        .finally(() => router.refresh());
    }
    if (status !== "queued" && status !== "writing") return;
    const t = setInterval(() => router.refresh(), 8_000); // o texto vai sendo salvo em partes
    return () => clearInterval(t);
  }, [docId, status, router]);

  if (error) return <p className="text-sm text-rec">Não deu para escrever o documento: {error}</p>;
  if (status !== "queued" && status !== "writing") return null;
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      {status === "queued" ? "Começando o documento do projeto…" : "A IA está escrevendo o documento do projeto (leva alguns minutos)…"}
    </p>
  );
}
