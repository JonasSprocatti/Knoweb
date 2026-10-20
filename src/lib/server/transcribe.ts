import { toFile } from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeNote } from "@/lib/server/analyze";
import { aiProvider, gemini, GEMINI_MODEL } from "@/lib/server/gemini";
import { openai } from "@/lib/server/embeddings";
import { trackGemini, trackUsage } from "@/lib/server/usage";
import { formatTimestamp } from "@/lib/text";

const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const LANGUAGE = process.env.TRANSCRIBE_LANGUAGE || "pt";


const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function extFor(mime: string, path: string) {
  const base = mime.split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[base] ?? path.split(".").pop() ?? "webm";
}

type WhisperSegment = { start: number; end: number; text: string };

const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: { start: { type: "number" }, end: { type: "number" }, text: { type: "string" } },
        required: ["start", "end", "text"],
      },
    },
  },
  required: ["segments"],
};

/** Baixa um pedaço de áudio do Storage, manda para o Whisper ou o Gemini e salva o texto. */
export async function transcribeSegment(supabase: SupabaseClient, segmentId: string) {
  const { data: seg, error } = await supabase
    .from("audio_segments")
    .select("id, note_id, seq, storage_path, mime_type, status")
    .eq("id", segmentId)
    .single();
  if (error || !seg) throw new Error("Segmento não encontrado.");
  if (seg.status === "done") return seg.note_id as string;

  await supabase.from("audio_segments").update({ status: "transcribing", error: null }).eq("id", segmentId);

  try {
    const { data: blob, error: dlError } = await supabase.storage.from("audio").download(seg.storage_path);
    if (dlError || !blob) throw new Error(`Falha ao baixar o áudio: ${dlError?.message ?? "vazio"}`);

    let text = "";
    let segments: WhisperSegment[] = [];

    if ((await aiProvider()) === "gemini") {
      // ponytail: áudio vai inline (limite ~20 MB por pedido); arquivos enviados maiores pedem a Files API do Gemini
      const audio = Buffer.from(await blob.arrayBuffer()).toString("base64");
      const result = await gemini<{ segments: WhisperSegment[] }>(
        `Transcreva o áudio literalmente, no idioma "${LANGUAGE}". Não resuma nem traduza. Divida em trechos de uma ou poucas frases, com início e fim em segundos desde o começo do áudio.`,
        [{ role: "user", parts: [{ inline_data: { mime_type: seg.mime_type.split(";")[0], data: audio } }] }],
        GEMINI_SCHEMA,
        (u) => trackGemini(supabase, "transcribe", GEMINI_MODEL, u),
      );
      segments = (result.segments ?? []).map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: s.text.trim() }));
      text = segments.map((s) => s.text).join(" ");
    } else {
      const file = await toFile(blob, `segmento-${seg.seq}.${extFor(seg.mime_type, seg.storage_path)}`, {
        type: seg.mime_type.split(";")[0],
      });

      if (MODEL === "whisper-1") {
        const result = await openai().audio.transcriptions.create({
          file,
          model: MODEL,
          language: LANGUAGE,
          response_format: "verbose_json",
          timestamp_granularities: ["segment"],
        });
        text = result.text ?? "";
        segments = (result.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
        await trackUsage(supabase, { kind: "transcribe", provider: "openai", model: MODEL, audioSeconds: Number(result.duration) || segments.at(-1)?.end || 0 });
      } else {
        const result = await openai().audio.transcriptions.create({ file, model: MODEL, language: LANGUAGE });
        text = result.text ?? "";
        // ponytail: modelos novos cobram por token de áudio; registra a duração do pedaço como se fosse Whisper
        const { data: d } = await supabase.from("audio_segments").select("duration_seconds").eq("id", segmentId).single();
        await trackUsage(supabase, { kind: "transcribe", provider: "openai", model: MODEL, audioSeconds: Number(d?.duration_seconds) || 0 });
      }
    }

    await supabase
      .from("audio_segments")
      .update({ status: "done", transcript: text.trim(), segments, error: null })
      .eq("id", segmentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("audio_segments").update({ status: "error", error: message }).eq("id", segmentId);
    await rebuildTranscript(supabase, seg.note_id as string);
    throw err;
  }

  await rebuildTranscript(supabase, seg.note_id as string);
  return seg.note_id as string;
}

/** Junta os pedaços em ordem, com marcas de tempo a cada ~minuto. */
export async function rebuildTranscript(supabase: SupabaseClient, noteId: string) {
  const { data: segs } = await supabase
    .from("audio_segments")
    .select("seq, duration_seconds, status, transcript, segments")
    .eq("note_id", noteId)
    .order("seq");

  let offset = 0;
  const paragraphs: string[] = [];
  let total = 0;

  for (const s of segs ?? []) {
    const duration = Number(s.duration_seconds) || 0;
    if (s.status === "done") {
      const parts = (s.segments as WhisperSegment[] | null) ?? [];
      if (parts.length) {
        let bucket: string[] = [];
        let bucketStart = parts[0].start;
        for (const p of parts) {
          if (bucket.length && p.start - bucketStart >= 60) {
            paragraphs.push(`[${formatTimestamp(offset + bucketStart)}] ${bucket.join(" ")}`);
            bucket = [];
            bucketStart = p.start;
          }
          bucket.push(p.text);
        }
        if (bucket.length) paragraphs.push(`[${formatTimestamp(offset + bucketStart)}] ${bucket.join(" ")}`);
      } else if (s.transcript) {
        paragraphs.push(`[${formatTimestamp(offset)}] ${s.transcript}`);
      }
    } else if (s.status === "error") {
      paragraphs.push(`[${formatTimestamp(offset)}] (falha ao transcrever este trecho)`);
    }
    offset += duration;
    total += duration;
  }

  await supabase
    .from("notes")
    .update({ transcript: paragraphs.join("\n\n"), duration_seconds: Math.round(total) })
    .eq("id", noteId);
}

/**
 * Se a gravação já terminou e todos os pedaços foram processados, roda a
 * análise do Claude. O update condicional garante que só uma chamada vença.
 */
export async function maybeFinishRecording(supabase: SupabaseClient, noteId: string) {
  const { data: pending } = await supabase
    .from("audio_segments")
    .select("id")
    .eq("note_id", noteId)
    .in("status", ["uploaded", "transcribing"]);
  if ((pending ?? []).length > 0) return { finished: false };

  const { data: claimed } = await supabase
    .from("notes")
    .update({ status: "analyzing" })
    .eq("id", noteId)
    .eq("status", "transcribing")
    .select("id");
  if (!claimed || claimed.length === 0) return { finished: false };

  await analyzeNote(supabase, noteId);
  return { finished: true };
}
