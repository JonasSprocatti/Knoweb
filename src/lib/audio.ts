"use client";

const CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2", // Safari / iPhone
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function baseMime(mime: string) {
  return (mime || "audio/webm").split(";")[0].trim();
}

export function extensionFor(mime: string) {
  const base = baseMime(mime);
  if (base.includes("mp4") || base.includes("m4a") || base.includes("aac")) return "m4a";
  if (base.includes("ogg")) return "ogg";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  if (base.includes("wav")) return "wav";
  return "webm";
}

/** Lê a duração de um arquivo de áudio no navegador (0 se não conseguir). */
export function readAudioDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) ? value : 0);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    audio.src = url;
  });
}

/** Mantém a tela acesa enquanto grava (celulares cortam o microfone ao bloquear). */
export async function requestWakeLock(): Promise<{ release: () => Promise<void> } | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    return (await nav.wakeLock?.request("screen")) ?? null;
  } catch {
    return null;
  }
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
