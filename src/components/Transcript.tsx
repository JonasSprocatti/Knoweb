"use client";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatDuration } from "@/lib/text";
import type { AudioSegment } from "@/lib/types";

function parseTimestamp(ts: string): number {
  return ts.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** Transcrição com marcas de tempo clicáveis que tocam o trecho do áudio. */
export function Transcript({
  segments,
  transcript,
  processing,
  onRetry,
}: {
  segments: AudioSegment[];
  transcript: string;
  processing: boolean;
  onRetry: (seg: AudioSegment) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<{ seq: number; url: string } | null>(null);
  const [open, setOpen] = useState(true);
  const [full, setFull] = useState(false); // transcrição longa abre resumida
  const urlCache = useRef(new Map<string, string>());

  const offsets: { seg: AudioSegment; start: number; end: number }[] = [];
  let acc = 0;
  for (const seg of segments) {
    const d = Number(seg.duration_seconds) || 0;
    offsets.push({ seg, start: acc, end: acc + d });
    acc += d;
  }

  async function urlFor(seg: AudioSegment) {
    const cached = urlCache.current.get(seg.id);
    if (cached) return cached;
    const { data } = await supabaseBrowser().storage.from("audio").createSignedUrl(seg.storage_path, 60 * 60);
    if (!data?.signedUrl) throw new Error("Não foi possível abrir o áudio.");
    urlCache.current.set(seg.id, data.signedUrl);
    return data.signedUrl;
  }

  async function playAt(seconds: number) {
    const hit = offsets.find((o) => seconds >= o.start && seconds < o.end) ?? offsets[offsets.length - 1];
    if (!hit) return;
    const url = await urlFor(hit.seg);
    const audio = audioRef.current;
    if (!audio) return;
    const seekTo = Math.max(0, seconds - hit.start);
    if (current?.url !== url) {
      setCurrent({ seq: hit.seg.seq, url });
      audio.src = url;
      await new Promise<void>((resolve) => {
        audio.onloadedmetadata = () => resolve();
        setTimeout(resolve, 3000);
      });
    }
    audio.currentTime = seekTo;
    audio.play().catch(() => undefined);
  }

  // Ao terminar um trecho, segue para o próximo
  async function onEnded() {
    if (!current) return;
    const next = segments.find((s) => s.seq > current.seq);
    if (!next) return;
    const url = await urlFor(next);
    setCurrent({ seq: next.seq, url });
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play().catch(() => undefined);
    }
  }

  const paragraphs = transcript
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^\[(\d{1,2}(?::\d{2}){1,2})\]\s*([\s\S]*)$/);
      return m ? { ts: m[1], seconds: parseTimestamp(m[1]), text: m[2] } : { ts: null, seconds: 0, text: p };
    });

  const pending = segments.filter((s) => s.status === "uploaded" || s.status === "transcribing").length;
  const failed = segments.filter((s) => s.status === "error");

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-sm font-semibold">
          <span className={`inline-block transition ${open ? "rotate-90" : ""}`}>›</span>
          Transcrição
          {segments.length > 0 && (
            <span className="font-normal text-faint">
              · {segments.length} {segments.length === 1 ? "trecho" : "trechos"} · {formatDuration(acc)}
            </span>
          )}
        </button>
        {segments.length > 0 && (
          <button onClick={() => playAt(0)} className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-ink">
            ▶ Ouvir do início
          </button>
        )}
      </div>

      <audio ref={audioRef} controls onEnded={onEnded} className={`w-full ${current ? "" : "hidden"}`} preload="none" />

      {(processing || pending > 0) && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          Transcrevendo {pending > 0 ? `(${pending} ${pending === 1 ? "trecho" : "trechos"} na fila)` : "…"}
        </p>
      )}

      {failed.length > 0 && (
        <div className="rounded-lg bg-rec/10 p-3 text-sm text-rec">
          {failed.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2">
              <span>
                Trecho {s.seq + 1} falhou{s.error ? `: ${s.error.slice(0, 120)}` : ""}
              </span>
              <button onClick={() => onRetry(s)} className="shrink-0 font-medium underline">
                Tentar de novo
              </button>
            </div>
          ))}
        </div>
      )}

      {open && paragraphs.length > 0 && (
        <div className="relative flex flex-col gap-3 text-[15px] leading-relaxed">
          {(full ? paragraphs : paragraphs.slice(0, 2)).map((p, i) => (
            <p key={i} className="text-ink/90">
              {p.ts && (
                <button
                  onClick={() => playAt(p.seconds)}
                  className="mr-2 rounded bg-surface px-1.5 py-0.5 text-xs tabular-nums text-link hover:bg-accent/15"
                  title="Ouvir deste ponto"
                >
                  {p.ts}
                </button>
              )}
              {p.text}
            </p>
          ))}
          {paragraphs.length > 2 && (
            <button
              onClick={() => setFull((f) => !f)}
              className="press self-start rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:border-accent"
            >
              {full ? "Mostrar menos" : "Ver transcrição completa"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
