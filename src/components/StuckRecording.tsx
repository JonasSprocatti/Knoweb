"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isRecordingHere, localSeconds, rescueRecording } from "@/lib/recordingBackup";
import { finishRecording, requestTranscription } from "@/lib/upload";
import { formatDuration, relativeDate } from "@/lib/text";
import type { AudioSegment, Note } from "@/lib/types";

/** O servidor dá 5 min para cada trecho; parado há mais que isso, travou. */
const STALE_MS = 10 * 60_000;
/** Trecho novo chega a cada 5 min enquanto grava: sem nada há mais de 6 min, parou. */
const QUIET_MS = 6 * 60_000;

/**
 * Gravação que ficou em "gravando" (a tela fechou antes de parar) ou parada em
 * "transcrevendo": mostra até onde o áudio chegou e encerra, transcreve o que
 * falta e deixa a análise rodar.
 */
export function StuckRecording({ note, segments }: { note: Note; segments: AudioSegment[] }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null); // só no navegador: o servidor não sabe a hora de quem vê
  const [here, setHere] = useState(false);
  const [local, setLocal] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const open = note.status === "recording" || note.status === "transcribing";

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const check = async () => {
      const [h, l] = await Promise.all([isRecordingHere(note.id), localSeconds(note.id)]);
      if (!alive) return;
      setHere(h);
      setLocal(l);
      setNow(Date.now());
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open, note.id]);

  // Encerrou e ainda não andou depois de um tempo: deixa tentar de novo
  useEffect(() => {
    if (state !== "sent") return;
    const timer = setTimeout(() => setState("idle"), STALE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (!open || now === null || state === "sent") return null;

  const last = segments.reduce((max, s) => (Date.parse(s.created_at) > Date.parse(max) ? s.created_at : max), note.created_at);
  const quietMs = now - Date.parse(last);
  const when = relativeDate(last);
  const saved = segments.reduce((sum, s) => sum + (Number(s.duration_seconds) || 0), 0);
  const stalled = segments.filter(
    (s) => s.status === "uploaded" || (s.status === "transcribing" && now - Date.parse(s.created_at) > STALE_MS),
  );

  if (note.status === "recording" && here) {
    return <p className="-mb-2 text-sm text-muted">Gravando agora em outra aba deste navegador.</p>;
  }
  if (note.status === "transcribing" && quietMs < STALE_MS) return null; // ainda trabalhando

  // Áudio guardado aqui sem nenhuma aba gravando = gravação abandonada neste aparelho
  const maybeLive = note.status === "recording" && quietMs < QUIET_MS && local === 0;

  async function finish() {
    if (maybeLive && !window.confirm("Se ainda estiver gravando em outro aparelho, pare por lá. Encerrar aqui mesmo assim?")) return;
    setState("sending");
    setError(null);
    try {
      // O que ficou guardado neste aparelho sobe primeiro (e já encerra a gravação)
      await rescueRecording(note.id);
      for (const s of stalled) requestTranscription(s.id).catch(() => undefined);
      setState("sent");
      // Se tudo já estava transcrito, a análise roda nesta chamada: a tela acompanha pelo tempo real
      if (!(await finishRecording(note.id))) throw new Error("O servidor não respondeu. Tente de novo.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("idle");
    }
  }

  return (
    <div className="pop flex flex-col gap-3 rounded-lg border border-rec/50 bg-panel p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p className="font-semibold text-ink">
          {note.status === "recording" ? "Esta gravação não foi encerrada" : "A transcrição parou no meio"}
        </p>
        <p className="text-muted">
          {segments.length
            ? `${formatDuration(saved)} de áudio chegaram ao servidor em ${segments.length} ${segments.length === 1 ? "trecho" : "trechos"}; o último chegou ${/^(há|agora)/.test(when) ? when : `em ${when}`}.`
            : "Nenhum trecho de áudio chegou ao servidor."}{" "}
          {local > 0 && `Mais ${formatDuration(local)} estão guardados neste aparelho e vão junto. `}
          {maybeLive
            ? "Ela pode estar gravando em outro aparelho; se já parou, encerre aqui."
            : note.status === "recording"
              ? "A tela de gravação fechou antes de parar. Encerre para terminar a transcrição e rodar a análise."
              : "Retome para transcrever o que falta e rodar a análise."}
        </p>
        {error && <p className="text-rec">{error}</p>}
      </div>
      <button
        type="button"
        onClick={finish}
        disabled={state === "sending"}
        className="press shrink-0 self-start rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent disabled:opacity-60 sm:self-center"
      >
        {state === "sending" ? "Encerrando…" : note.status === "recording" ? "Encerrar gravação" : "Retomar"}
      </button>
    </div>
  );
}
