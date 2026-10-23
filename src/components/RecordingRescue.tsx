"use client";

import Link from "@/components/Link";
import { Icon } from "@/components/Icon";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { rescueAll, RESCUE_EVENT } from "@/lib/recordingBackup";
import { formatDuration } from "@/lib/text";

/**
 * Sobe o áudio de gravações interrompidas que ficou guardado neste aparelho
 * (aba fechada, app fechado, tela trocada no meio) e encerra essas gravações.
 * Roda ao abrir o Knoweb, ao voltar para ele e quando a internet volta.
 */
export function RecordingRescue() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; noteId?: string } | null>(null);
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    const run = async (): Promise<void> => {
      if (running.current) return void (again.current = true); // pedido no meio de uma rodada: roda de novo no fim
      running.current = true;
      try {
        const done = await rescueAll((seconds) => setMsg({ text: `Enviando ${formatDuration(seconds)} de áudio de uma gravação interrompida…` }));
        const seconds = done.reduce((sum, r) => sum + r.seconds, 0);
        if (done.length) router.refresh(); // a lista deixa de mostrar "gravando"
        // Sem nada novo, some só o "Enviando…" (o aviso de pronto fica até você fechar)
        setMsg((prev) =>
          done.length
            ? { text: `${formatDuration(seconds)} de áudio de uma gravação interrompida foram enviados e vão ser transcritos.`, noteId: done[0].noteId }
            : prev?.noteId
              ? prev
              : null,
        );
      } finally {
        running.current = false;
      }
      if (again.current) {
        again.current = false;
        return run();
      }
    };
    const onVisible = () => document.visibilityState === "visible" && run();
    run();
    window.addEventListener("online", run);
    window.addEventListener(RESCUE_EVENT, run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener(RESCUE_EVENT, run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  if (!msg) return null;
  return (
    <div
      role="status"
      className="pop fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-start gap-3 rounded-lg border border-line bg-panel p-3 text-sm text-ink shadow-xl md:inset-x-auto md:bottom-6 md:right-6"
    >
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
      <p className="min-w-0 flex-1">
        {msg.text}{" "}
        {msg.noteId && (
          <Link href={`/notes/${msg.noteId}`} onClick={() => setMsg(null)} className="font-medium text-accent hover:underline">
            Ver gravação
          </Link>
        )}
      </p>
      {msg.noteId && (
        <button type="button" onClick={() => setMsg(null)} className="shrink-0 text-faint hover:text-ink" aria-label="Fechar">
          <Icon name="x" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
