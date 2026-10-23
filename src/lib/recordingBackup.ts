"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { finishRecording, requestTranscription, uploadSegment } from "@/lib/upload";

/**
 * Cópia do áudio no próprio aparelho (IndexedDB) enquanto grava. O trecho atual
 * só sobe ao completar 5 min; até lá, cada pedaço de 1 s fica guardado aqui. Se a
 * aba fechar, o app cair ou você sair da tela no meio, o que ficou guardado sobe
 * na próxima vez que o Knoweb abrir neste aparelho, e a gravação é encerrada.
 */

const DB_NAME = "knoweb-gravacoes";
const CHUNKS = "chunks"; // chave [noteId, seq, idx] → { blob, ms, at }
const META = "meta"; // chave noteId → { noteId, userId, mime }

/** Evento que pede para subir agora o que ficou guardado (ex.: saiu da tela Gravar com trecho pendente). */
export const RESCUE_EVENT = "knoweb:resgatar-gravacoes";

type Meta = { noteId: string; userId: string; mime: string };
type Chunk = { blob: Blob; ms: number; at: number };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(CHUNKS);
        req.result.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

async function run<T = undefined>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | void) {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = fn(tx);
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

// Arrays vêm depois de qualquer número na ordem do IndexedDB: [id, []] fecha a faixa da nota inteira
const noteRange = (noteId: string) => IDBKeyRange.bound([noteId], [noteId, []]);
const segmentRange = (noteId: string, seq: number) => IDBKeyRange.bound([noteId, seq], [noteId, seq, []]);

/** A cópia é um extra: se o navegador não deixar guardar, a gravação segue igual. */
const quiet = (p: Promise<unknown>) => void p.catch(() => undefined);

export function backupStart(meta: Meta) {
  quiet(run([META], "readwrite", (tx) => void tx.objectStore(META).put(meta, meta.noteId)));
}

/** `ms` é o tempo gravado no trecho até este pedaço (vira a duração se precisar recuperar). */
export function backupChunk(noteId: string, seq: number, idx: number, blob: Blob, ms: number) {
  const row: Chunk = { blob, ms, at: Date.now() };
  quiet(run([CHUNKS], "readwrite", (tx) => void tx.objectStore(CHUNKS).put(row, [noteId, seq, idx])));
}

/** O trecho subiu (ou era vazio): a cópia dele não precisa mais ficar. */
export function backupDropSegment(noteId: string, seq: number) {
  quiet(run([CHUNKS], "readwrite", (tx) => void tx.objectStore(CHUNKS).delete(segmentRange(noteId, seq))));
}

export function backupDropRecording(noteId: string) {
  return run([CHUNKS, META], "readwrite", (tx) => {
    tx.objectStore(CHUNKS).delete(noteRange(noteId));
    tx.objectStore(META).delete(noteId);
  }).catch(() => undefined);
}

// ---- "Esta aba está gravando esta nota" -------------------------------
// Um lock do navegador por gravação: some sozinho se a aba fechar ou travar,
// então o que estiver livre é gravação abandonada.

const lockName = (noteId: string) => `knoweb-gravacao-${noteId}`;
const locks = () => (typeof navigator !== "undefined" ? navigator.locks : undefined);

/** Segura o lock enquanto grava. Devolve a função que solta. */
export function holdRecordingLock(noteId: string): () => void {
  let release = () => {};
  const done = new Promise<void>((resolve) => (release = resolve));
  locks()
    ?.request(lockName(noteId), () => done)
    .catch(() => undefined);
  return release;
}

/** Alguma aba deste navegador está gravando esta nota agora? */
export async function isRecordingHere(noteId: string) {
  const state = await locks()?.query().catch(() => null);
  return !!state?.held?.some((l) => l.name === lockName(noteId));
}

// ---- Recuperação ----------------------------------------------------------

type Leftover = { seq: number; blob: Blob; durationSeconds: number };

async function leftoversOf(meta: Meta) {
  const rows: { key: [string, number, number]; value: Chunk }[] = [];
  await run([CHUNKS], "readonly", (tx) => {
    const cursor = tx.objectStore(CHUNKS).openCursor(noteRange(meta.noteId));
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      rows.push({ key: c.key as [string, number, number], value: c.value as Chunk });
      c.continue();
    };
  });
  const bySeq = new Map<number, Chunk[]>(); // o cursor já entrega em ordem de trecho e de pedaço
  for (const { key, value } of rows) {
    if (!bySeq.has(key[1])) bySeq.set(key[1], []);
    bySeq.get(key[1])!.push(value);
  }
  const segments: Leftover[] = [...bySeq].map(([seq, chunks]) => ({
    seq,
    blob: new Blob(chunks.map((c) => c.blob), { type: meta.mime }),
    durationSeconds: Math.max(...chunks.map((c) => c.ms)) / 1000,
  }));
  const lastAt = Math.max(0, ...rows.map((r) => r.value.at));
  return { segments, lastAt };
}

/** Roda `fn` só se nenhuma aba estiver gravando a nota (sem Web Locks: só se a cópia está parada há 10 min). */
async function whenFree<T>(noteId: string, lastAt: () => Promise<number>, fn: () => Promise<T>): Promise<T | null> {
  const l = locks();
  if (l) return l.request(lockName(noteId), { ifAvailable: true }, (lock) => (lock ? fn() : null));
  return Date.now() - (await lastAt()) > 10 * 60_000 ? fn() : null;
}

export type Rescued = { noteId: string; seconds: number };

/**
 * Sobe o áudio que ficou guardado para uma nota e encerra a gravação.
 * Devolve quanto áudio subiu, ou null se ela está gravando agora ou não tinha nada.
 * Se algum trecho falhar (sem internet), a cópia fica para a próxima tentativa.
 */
export async function rescueRecording(noteId: string, onStart?: (seconds: number) => void): Promise<Rescued | null> {
  const meta = await run<Meta>([META], "readonly", (tx) => tx.objectStore(META).get(noteId)).catch(() => undefined);
  if (!meta) return null;
  let cache: Awaited<ReturnType<typeof leftoversOf>> | null = null;
  const load = async () => (cache ??= await leftoversOf(meta));

  return whenFree(
    noteId,
    async () => (await load()).lastAt,
    async () => {
      const supabase = supabaseBrowser();
      const { data: auth } = await supabase.auth.getSession();
      if (auth.session?.user.id !== meta.userId) return null; // gravação de outra conta neste navegador: fica para ela
      const { data: note, error } = await supabase.from("notes").select("id").eq("id", noteId).maybeSingle();
      if (error) throw error; // sem conexão: tenta de novo depois
      if (!note) {
        await backupDropRecording(noteId); // a nota foi excluída
        return null;
      }

      const { segments } = await load();
      const { data: existing, error: segError } = await supabase.from("audio_segments").select("seq").eq("note_id", noteId);
      if (segError) throw segError;
      const uploaded = new Set((existing ?? []).map((s) => s.seq as number));
      // Pedaço quase vazio (parou logo depois de trocar de trecho) não vale o envio, igual na gravação
      const toSend = segments.filter((s) => !uploaded.has(s.seq) && s.blob.size >= 1024 && s.durationSeconds >= 0.5);
      const seconds = toSend.reduce((sum, s) => sum + s.durationSeconds, 0);
      if (toSend.length) onStart?.(seconds);

      let failed = false;
      for (const s of toSend) {
        try {
          const segmentId = await uploadSegment({ userId: meta.userId, noteId, seq: s.seq, blob: s.blob, mime: meta.mime, durationSeconds: s.durationSeconds });
          backupDropSegment(noteId, s.seq);
          requestTranscription(segmentId).catch(() => undefined);
        } catch {
          failed = true;
        }
      }
      if (failed) return null;

      await backupDropRecording(noteId);
      // Marca como "transcrevendo"; a análise roda quando o último trecho terminar
      finishRecording(noteId).catch(() => undefined);
      return toSend.length ? { noteId, seconds } : null;
    },
  ).catch(() => null);
}

/** Procura gravações com áudio guardado neste aparelho e sobe todas que não estão gravando agora. */
export async function rescueAll(onStart?: (seconds: number) => void): Promise<Rescued[]> {
  const ids = await run<IDBValidKey[]>([META], "readonly", (tx) => tx.objectStore(META).getAllKeys()).catch(() => undefined);
  const done: Rescued[] = [];
  for (const id of ids ?? []) {
    const r = await rescueRecording(String(id), onStart);
    if (r) done.push(r);
  }
  return done;
}

/** Quanto áudio desta nota está guardado só neste aparelho (0 se nada). */
export async function localSeconds(noteId: string) {
  const meta = await run<Meta>([META], "readonly", (tx) => tx.objectStore(META).get(noteId)).catch(() => undefined);
  if (!meta) return 0;
  const { segments } = await leftoversOf(meta).catch(() => ({ segments: [] as Leftover[] }));
  return segments.reduce((sum, s) => sum + s.durationSeconds, 0);
}
