"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, debounce } from "@/lib/api";
import { pickMimeType, requestWakeLock } from "@/lib/audio";
import { finishRecording, requestTranscription, uploadSegment } from "@/lib/upload";
import { supabaseBrowser } from "@/lib/supabase/client";
import { defaultRecordingTitle, formatDuration } from "@/lib/text";
import type { AudioSegment } from "@/lib/types";
import { FileUpload } from "@/components/FileUpload";

/** Cada pedaço tem no máximo 5 min: fica bem abaixo do limite do Whisper e transcreve enquanto você grava. */
const SEGMENT_SECONDS = 5 * 60;

type Phase = "idle" | "starting" | "recording" | "paused" | "stopping" | "unsent" | "error";

interface LocalSegment {
  seq: number;
  durationSeconds: number;
  state: "uploading" | "uploaded" | "failed";
  blob?: Blob;
  mime: string;
  segmentId?: string;
}

/** No app Android (Capacitor) liga o serviço que mantém o microfone vivo em segundo plano. */
function nativeRecording(method: "start" | "stop") {
  const cap = (window as { Capacitor?: { nativePromise?: (p: string, m: string, o: object) => Promise<unknown> } }).Capacitor;
  return cap?.nativePromise?.("RecordingService", method, {}).catch(() => undefined);
}
const isNativeApp = () => typeof window !== "undefined" && "Capacitor" in window;

export function Recorder({ userId }: { userId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [liveNotes, setLiveNotes] = useState("");
  const [local, setLocal] = useState<LocalSegment[]>([]);
  const [remote, setRemote] = useState<Record<number, AudioSegment>>({});

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mimeRef = useRef("");
  const seqRef = useRef(0);
  const segmentStartMsRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const resumedAtRef = useRef<number | null>(null);
  const insertsRef = useRef<Promise<unknown>[]>([]);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const failedRef = useRef<Set<number>>(new Set());
  const [meeting, setMeeting] = useState(false);
  const [canCaptureSystem, setCanCaptureSystem] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Som do sistema só existe no navegador do computador (Chrome/Edge)
  useEffect(() => {
    setCanCaptureSystem(!!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  const activeMs = () =>
    accumulatedMsRef.current + (resumedAtRef.current != null ? performance.now() - resumedAtRef.current : 0);

  // ---- Autosave das anotações e do título durante a gravação -------
  const saveNotes = useRef(
    debounce((id: string, body: { title?: string; content?: string }) => {
      api.updateNote(id, body).catch(() => undefined);
    }, 800),
  ).current;

  // ---- Status dos pedaços em tempo real ----------------------------
  useEffect(() => {
    if (!noteId) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`segments-${noteId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audio_segments", filter: `note_id=eq.${noteId}` },
        (payload) => {
          const seg = payload.new as AudioSegment;
          if (seg?.seq != null) setRemote((prev) => ({ ...prev, [seg.seq]: seg }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [noteId]);

  // ---- Avisa antes de fechar a aba no meio da gravação -------------
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (phase === "recording" || phase === "paused" || phase === "stopping" || phase === "unsent") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // ---- O sistema solta o "manter tela acesa" quando a aba some; pede de novo ao voltar
  useEffect(() => {
    if (phase !== "recording" && phase !== "paused") return;
    const onVisible = async () => {
      if (document.visibilityState === "visible") wakeLockRef.current = await requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase]);

  // ---- Relógio + troca de pedaço a cada SEGMENT_SECONDS ------------
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      const ms = activeMs();
      setElapsed(ms / 1000);
      if ((ms - segmentStartMsRef.current) / 1000 >= SEGMENT_SECONDS) rotateSegment();
    }, 500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleSegmentBlob = useCallback(
    (seq: number, blob: Blob, durationSeconds: number) => {
      const id = noteIdRef.current;
      if (!id) return;
      // Pedaços vazios (ex.: parou logo após trocar) são descartados
      if (blob.size < 1024 || (durationSeconds < 0.5 && seq > 0)) return;

      const mime = mimeRef.current || blob.type;
      setLocal((prev) => [...prev, { seq, durationSeconds, state: "uploading", blob, mime }]);

      const insert = uploadSegment({ userId, noteId: id, seq, blob, mime, durationSeconds })
        .then((segmentId) => {
          failedRef.current.delete(seq);
          setLocal((prev) =>
            prev.map((s) => (s.seq === seq ? { ...s, state: "uploaded", segmentId, blob: undefined } : s)),
          );
          requestTranscription(segmentId).catch(() => undefined);
        })
        .catch(() => {
          failedRef.current.add(seq);
          setLocal((prev) => prev.map((s) => (s.seq === seq ? { ...s, state: "failed" } : s)));
        });
      insertsRef.current.push(insert);
    },
    [userId],
  );

  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const options: MediaRecorderOptions = { audioBitsPerSecond: 48_000 };
    if (mimeRef.current) options.mimeType = mimeRef.current;
    const rec = new MediaRecorder(stream, options);
    const chunks: Blob[] = [];
    const seq = seqRef.current++;
    const startMs = activeMs();
    segmentStartMsRef.current = startMs;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mimeRef.current || "audio/webm" });
      handleSegmentBlob(seq, blob, (activeMs() - startMs) / 1000);
    };
    rec.start(1000);
    recorderRef.current = rec;
  }, [handleSegmentBlob]);

  function rotateSegment() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    rec.stop();
    startSegment();
  }

  function startMeter(stream: MediaStream) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
        setLevel(Math.min(1, peak / 64));
        rafRef.current = requestAnimationFrame(loop);
      };
      ctx.resume().catch(() => undefined);
      loop();
      audioCtxRef.current = ctx;
    } catch {
      /* medidor é opcional */
    }
  }

  function stopMeter() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
  }

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não permite gravar áudio. No iPhone, use o Safari atualizado; no Android, o Chrome.");
      setPhase("error");
      return;
    }
    setPhase("starting");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      let stream = mic;
      cleanupRef.current = () => mic.getTracks().forEach((t) => t.stop());
      if (meeting) {
        // Reunião: mistura o som do PC (Teams, Zoom...) com o microfone
        const screen = await navigator.mediaDevices
          .getDisplayMedia({ video: true, audio: true, systemAudio: "include" } as DisplayMediaStreamOptions)
          .catch((err) => {
            mic.getTracks().forEach((t) => t.stop());
            throw err;
          });
        if (screen.getAudioTracks().length === 0) {
          screen.getTracks().forEach((t) => t.stop());
          mic.getTracks().forEach((t) => t.stop());
          throw new Error('O som do computador não veio. Escolha "Tela inteira" e marque "Compartilhar também o áudio do sistema".');
        }
        const ctx = new AudioContext();
        const out = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(mic).connect(out);
        ctx.createMediaStreamSource(new MediaStream(screen.getAudioTracks())).connect(out);
        stream = out.stream;
        cleanupRef.current = () => {
          [...mic.getTracks(), ...screen.getTracks()].forEach((t) => t.stop());
          ctx.close().catch(() => undefined);
        };
      }
      streamRef.current = stream;
      if (isNativeApp()) {
        await nativeRecording("start");
        const stopMic = cleanupRef.current;
        cleanupRef.current = () => {
          stopMic?.();
          nativeRecording("stop");
        };
      }
      mimeRef.current = pickMimeType();

      const initialTitle = title.trim() || defaultRecordingTitle();
      const note = await api.createNote({ title: initialTitle, content: liveNotes, kind: "recording", status: "recording" });
      noteIdRef.current = note.id;
      setNoteId(note.id);
      setTitle(note.title);

      wakeLockRef.current = await requestWakeLock();
      startMeter(stream);

      accumulatedMsRef.current = 0;
      resumedAtRef.current = performance.now();
      seqRef.current = 0;
      startSegment();
      setPhase("recording");
    } catch (err) {
      cleanupRef.current?.();
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? meeting
            ? "Permissão negada. Libere o microfone e escolha a tela para compartilhar o som."
            : "Permissão do microfone negada. Libere o microfone para este site nas configurações do navegador."
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
      setPhase("error");
    }
  }

  function pause() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    accumulatedMsRef.current = activeMs();
    resumedAtRef.current = null;
    setPhase("paused");
  }

  function resume() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    resumedAtRef.current = performance.now();
    setPhase("recording");
  }

  async function stop() {
    const id = noteIdRef.current;
    if (!id) return;
    setPhase("stopping");

    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const previous = rec.onstop;
        rec.onstop = (ev) => {
          previous?.call(rec, ev);
          resolve();
        };
        if (rec.state === "paused") rec.resume();
        rec.stop();
      });
    }
    accumulatedMsRef.current = activeMs();
    resumedAtRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    cleanupRef.current?.();
    stopMeter();
    wakeLockRef.current?.release().catch(() => undefined);

    saveNotes.flush(id, { title, content: liveNotes });
    await Promise.allSettled(insertsRef.current);
    if (failedRef.current.size > 0) {
      // Não finaliza: o áudio que não subiu só existe nesta aba.
      setPhase("unsent");
      return;
    }
    await finalize();
  }

  async function finalize() {
    const id = noteIdRef.current;
    if (!id) return;
    setPhase("stopping");
    // Não espera: se tudo já foi transcrito, a análise roda nessa chamada e pode levar alguns segundos.
    finishRecording(id).catch(() => undefined);
    router.push(`/notes/${id}`);
  }

  async function retry(seg: LocalSegment) {
    if (!seg.blob || !noteIdRef.current) return;
    setLocal((prev) => prev.map((s) => (s.seq === seg.seq ? { ...s, state: "uploading" } : s)));
    try {
      const segmentId = await uploadSegment({
        userId,
        noteId: noteIdRef.current,
        seq: seg.seq,
        blob: seg.blob,
        mime: seg.mime,
        durationSeconds: seg.durationSeconds,
      });
      failedRef.current.delete(seg.seq);
      setLocal((prev) => prev.map((s) => (s.seq === seg.seq ? { ...s, state: "uploaded", segmentId, blob: undefined } : s)));
      requestTranscription(segmentId).catch(() => undefined);
    } catch {
      setLocal((prev) => prev.map((s) => (s.seq === seg.seq ? { ...s, state: "failed" } : s)));
    }
  }

  function downloadFailed() {
    for (const s of local.filter((x) => x.state === "failed" && x.blob)) {
      const url = URL.createObjectURL(s.blob!);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trecho-${s.seq + 1}.${s.mime.includes("mp4") ? "m4a" : "webm"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  const active = phase === "recording" || phase === "paused";
  const failed = local.filter((s) => s.state === "failed");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (noteId) saveNotes(noteId, { title: e.target.value, content: liveNotes });
        }}
        placeholder="Assunto da conversa (opcional)"
        title="Opcional: o Claude dá um título depois"
        className="w-full border-0 border-b border-line bg-transparent pb-2 text-lg font-semibold md:text-xl text-ink placeholder:text-faint focus:border-accent focus:outline-none"
      />

      <section className="flex flex-col items-center gap-5 rounded-lg bg-panel px-6 py-10">
        <div className="text-6xl font-medium tabular-nums tracking-tight text-ink">{formatDuration(elapsed)}</div>

        <div className="flex h-8 items-end gap-1" aria-hidden>
          {Array.from({ length: 24 }).map((_, i) => {
            const h = active && phase === "recording" ? Math.max(0.08, level * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + elapsed * 3)))) : 0.08;
            return <span key={i} className="w-1.5 rounded-full bg-accent/80 transition-[height] duration-100" style={{ height: `${h * 100}%` }} />;
          })}
        </div>

        <div className="flex items-center gap-4">
          {(phase === "idle" || phase === "starting" || phase === "error") && (
            <button
              onClick={start}
              disabled={phase === "starting"}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-rec text-white transition hover:scale-105 disabled:opacity-60"
              aria-label="Começar a gravar"
            >
              <span className="h-7 w-7 rounded-full bg-white" />
            </button>
          )}
          {active && (
            <>
              <button
                onClick={phase === "recording" ? pause : resume}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface text-ink hover:border-accent"
                aria-label={phase === "recording" ? "Pausar" : "Continuar"}
              >
                {phase === "recording" ? (
                  <span className="flex gap-1.5">
                    <span className="h-5 w-1.5 rounded bg-ink" />
                    <span className="h-5 w-1.5 rounded bg-ink" />
                  </span>
                ) : (
                  <span className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-ink" />
                )}
              </button>
              <button
                onClick={stop}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-rec text-white transition hover:scale-105"
                aria-label="Parar e processar"
              >
                <span className="h-7 w-7 rounded-md bg-white" />
              </button>
            </>
          )}
          {phase === "stopping" && <p className="text-sm text-muted">Finalizando e enviando o áudio…</p>}
          {phase === "unsent" && (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-rec">Alguns trechos não subiram (conexão?). Reenvie abaixo antes de sair.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={downloadFailed} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:border-accent">
                  Baixar trechos pendentes
                </button>
                <button onClick={finalize} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent">
                  Finalizar com o que subiu
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-muted">
          {phase === "idle" && "Toque para gravar. O áudio é enviado em pedaços e transcrito enquanto você fala."}
          {phase === "starting" && (meeting ? 'Escolha "Tela inteira" e marque "Compartilhar também o áudio do sistema".' : "Pedindo acesso ao microfone…")}
          {phase === "recording" &&
            (canCaptureSystem
              ? "Gravando. Pode minimizar e trabalhar em outras janelas, só não feche o Knoweb."
              : isNativeApp()
                ? "Gravando. Pode apagar a tela ou usar outros apps."
                : "Gravando. No celular, mantenha esta tela aberta (ou use o app Android para gravar em segundo plano).")}
          {phase === "paused" && "Pausado."}
        </p>
        {canCaptureSystem && (phase === "idle" || phase === "error") && (
          <label className="flex max-w-md cursor-pointer items-start gap-2 text-sm text-muted">
            <input type="checkbox" checked={meeting} onChange={(e) => setMeeting(e.target.checked)} className="mt-1 accent-accent" />
            <span>
              <span className="font-medium text-ink">Reunião no computador</span> (Teams, Zoom, Meet…): grava o som do PC junto com o
              seu microfone. Use fone de ouvido para não duplicar as vozes.
            </span>
          </label>
        )}
        {error && <p className="rounded-lg bg-rec/10 px-4 py-2 text-center text-sm text-rec">{error}</p>}
      </section>

      {(active || phase === "stopping") && (
        <section className="flex flex-col gap-2">
          <label className="text-base font-semibold">Suas anotações</label>
          <textarea
            value={liveNotes}
            onChange={(e) => {
              setLiveNotes(e.target.value);
              if (noteId) saveNotes(noteId, { title, content: e.target.value });
            }}
            rows={5}
            placeholder="Escreva o que quiser destacar. Use [[Nome de outra nota]] para ligar ideias."
            className="w-full resize-y rounded-xl border border-line bg-panel p-4 text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </section>
      )}

      {local.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Transcrição ao vivo</h2>
          <ol className="flex flex-col gap-2">
            {local.map((s) => {
              const r = remote[s.seq];
              const status =
                s.state === "failed"
                  ? "falha no envio"
                  : s.state === "uploading"
                    ? "enviando…"
                    : r?.status === "done"
                      ? "transcrito"
                      : r?.status === "error"
                        ? "erro na transcrição"
                        : "transcrevendo…";
              return (
                <li key={s.seq} className="rounded-xl border border-line bg-panel p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between text-xs text-faint">
                    <span>
                      Trecho {s.seq + 1} · {formatDuration(s.durationSeconds)}
                    </span>
                    <span>{status}</span>
                  </div>
                  {r?.transcript && <p className="text-ink/90">{r.transcript}</p>}
                  {s.state === "failed" && (
                    <button onClick={() => retry(s)} className="mt-2 text-xs font-medium text-accent hover:underline">
                      Tentar enviar de novo
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {failed.length > 0 && (
            <p className="text-xs text-rec">Há trechos que não subiram. Não feche a página antes de reenviar.</p>
          )}
        </section>
      )}

      {phase === "idle" && (
        <section className="border-t border-line pt-6">
          <FileUpload userId={userId} />
        </section>
      )}
    </div>
  );
}
