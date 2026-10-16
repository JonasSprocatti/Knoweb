"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, debounce } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ingestDocument, requestTranscription, uploadDocument } from "@/lib/upload";
import { DOC_ACCEPT, fileKind, readByAI, UNSUPPORTED, type FileKind, type NoteFile } from "@/lib/files";
import { formatDuration, relativeDate } from "@/lib/text";
import type { AudioSegment, Note } from "@/lib/types";
import { Markdown } from "@/components/Markdown";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/NoteCard";
import { WikiEditor } from "@/components/WikiEditor";
import { Transcript } from "@/components/Transcript";
import { TopicChip } from "@/components/TopicChip";
import { CoverPicker } from "@/components/CoverPicker";
import { ConfirmDelete, DeleteOption } from "@/components/ConfirmDelete";
import { deleteNote } from "@/lib/work-actions";

export interface NoteTopic {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  emoji?: string | null;
  relevance: number;
  source: "ai" | "manual";
}

export interface LinkedNote {
  id: string;
  title: string;
  kind: "wikilink" | "ai";
  reason: string | null;
  direction: "in" | "out";
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function NoteView({
  initialNote,
  initialSegments,
  initialFiles,
  toReview = 0,
  newVersion = null,
  initialTopics,
  linked,
  startEditing,
  work,
}: {
  initialNote: Note;
  initialSegments: AudioSegment[];
  initialFiles: NoteFile[];
  /** Quantas coisas o Claude quer criar a partir da nota (temas, pessoas, projetos, tarefas) */
  toReview?: number;
  /** A nota acabou de receber uma versão nova de um documento: mostra o que mudou */
  newVersion?: { id: string; changes: string } | null;
  initialTopics: NoteTopic[];
  linked: LinkedNote[];
  startEditing: boolean;
  /** Projetos, tarefas e pessoas (renderizado no servidor) */
  work?: React.ReactNode;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [segments, setSegments] = useState(initialSegments);
  const [topics, setTopics] = useState(initialTopics);
  const [title, setTitle] = useState(initialNote.title);
  const [content, setContent] = useState(initialNote.content);
  const [editing, setEditing] = useState(startEditing || (!initialNote.content && initialNote.kind === "note" && initialNote.status !== "analyzing"));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState("");
  const [files, setFiles] = useState(initialFiles);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirtyRef = useRef({ title: false, content: false });

  useEffect(() => setTopics(initialTopics), [initialTopics]);
  useEffect(() => setFiles(initialFiles), [initialFiles]); // nota nova: o anexo entra enquanto ela é lida

  // Ao recarregar do servidor (fim da análise), o que veio de lá vale, menos o que você está digitando.
  // Cobre o caso de o aviso em tempo real não chegar (textos muito grandes passam do limite dele).
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    setNote(initialNote);
    if (!dirtyRef.current.title) setTitle(initialNote.title);
    if (!dirtyRef.current.content && !editingRef.current) setContent(initialNote.content);
  }, [initialNote]);

  // ---- Autosave ------------------------------------------------------
  const save = useMemo(
    () =>
      debounce(async (body: { title?: string; content?: string }) => {
        setSaveState("saving");
        try {
          await api.updateNote(initialNote.id, body);
          dirtyRef.current = { title: false, content: false };
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, 900),
    [initialNote.id],
  );

  // Salva o que estiver pendente ao sair da página ou fechar o app
  const latestRef = useRef({ title, content });
  latestRef.current = { title, content };
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current.title || dirtyRef.current.content) save.flush(latestRef.current);
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [save]);

  // ---- Tempo real: status, transcrição e análise chegam sozinhos ----
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`note-${initialNote.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notes", filter: `id=eq.${initialNote.id}` },
        (payload) => {
          // Textos grandes que não mudaram não vêm no aviso (o Postgres só manda o que mudou):
          // campo ausente = mantém o que já está na tela
          const next = payload.new as Partial<Note> & { merged_into?: string | null };
          // O documento era nova versão de outra nota: ela foi atualizada e esta some
          if (next.merged_into) {
            router.replace(`/notes/${next.merged_into}?versao=nova`);
            return;
          }
          setNote((prev) => {
            const finishedAnalysis = prev.status === "analyzing" && next.status === "ready";
            if (finishedAnalysis) setTimeout(() => router.refresh(), 300);
            return { ...prev, ...next };
          });
          if (!dirtyRef.current.title && typeof next.title === "string") setTitle(next.title);
          if (!dirtyRef.current.content && !editing && typeof next.content === "string") setContent(next.content);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audio_segments", filter: `note_id=eq.${initialNote.id}` },
        (payload) => {
          const seg = payload.new as AudioSegment;
          if (!seg?.id) return;
          setSegments((prev) => {
            const others = prev.filter((s) => s.id !== seg.id);
            return [...others, seg].sort((a, b) => a.seq - b.seq);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialNote.id, editing, router]);

  // ---- Ações ---------------------------------------------------------
  async function runAnalysis() {
    save.flush({ title, content });
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      await api.analyze(note.id);
      router.refresh();
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function openFile(f: NoteFile) {
    const tab = window.open("", "_blank"); // abre já no clique, antes do await, para o navegador não bloquear
    const kind = fileKind(f.name, "");
    // Link vale 1 min; o que não é PDF nem imagem baixa em vez de abrir no navegador
    const { data } = await supabaseBrowser()
      .storage.from("files")
      .createSignedUrl(f.path, 60, kind === "pdf" || kind === "image" ? undefined : { download: f.name });
    if (data?.signedUrl && tab) tab.location.href = data.signedUrl;
    else tab?.close();
  }

  /** Junta arquivos a esta nota: o conteúdo lido entra no fim do texto, à vista, sem reanalisar. */
  async function attachFiles(picked: File[]) {
    setAttachError(null);
    const checked = picked.map((file) => ({ file, kind: fileKind(file.name, file.type) }));
    const bad = checked.find((c) => !c.kind || c.kind === "audio");
    if (bad) return setAttachError(`${bad.file.name}: ${bad.kind === "audio" ? "áudio entra pela tela Gravar." : UNSUPPORTED}`);
    const label = picked.length === 1 ? picked[0].name : `${picked.length} arquivos`;
    setAttaching(checked.some((c) => readByAI(c.kind!)) ? `Lendo ${label} com o Claude…` : `Lendo ${label}…`);
    setEditing(false); // nada de digitar enquanto o texto dos arquivos entra
    try {
      if (dirtyRef.current.title || dirtyRef.current.content) await save.flush({ title, content });
      const uploaded = await Promise.all(
        checked.map(async ({ file, kind }) => ({ path: await uploadDocument(note.user_id, file, kind as Exclude<FileKind, "audio">), name: file.name })),
      );
      const r = await ingestDocument({ noteId: note.id, files: uploaded, attach: true });
      if (r.content !== undefined) setContent(r.content);
      if (r.files) setFiles((prev) => [...prev, ...r.files!]);
      if (r.failed) setAttachError(`${r.failed} arquivo(s) não puderam ser lidos; o motivo está no texto da nota.`);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttaching(null);
    }
  }

  async function removeFile(f: NoteFile) {
    if (!window.confirm(`Apagar o arquivo "${f.name}"? O texto dele que já está na nota continua.`)) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.storage.from("files").remove([f.path]);
    if (!error) await supabase.from("note_files").delete().eq("id", f.id);
    if (error) setAttachError(error.message);
    else setFiles((prev) => prev.filter((x) => x.id !== f.id));
  }

  async function togglePin() {
    const pinned = !note.pinned;
    setNote((n) => ({ ...n, pinned }));
    await api.updateNote(note.id, { pinned }).catch(() => setNote((n) => ({ ...n, pinned: !pinned })));
  }

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    setNewTopic("");
    const t = await api.addTopic(note.id, name);
    setTopics((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, { ...t, relevance: 1, source: "manual" }]));
  }

  async function removeTopic(topicId: string) {
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
    await api.removeTopic(note.id, topicId).catch(() => router.refresh());
  }

  async function retrySegment(seg: AudioSegment) {
    setSegments((prev) => prev.map((s) => (s.id === seg.id ? { ...s, status: "transcribing" } : s)));
    try {
      await requestTranscription(seg.id);
      await runAnalysis();
    } catch {
      router.refresh();
    }
  }

  function exportMarkdown() {
    const front = [
      "---",
      `title: "${title.replace(/"/g, '\\"')}"`,
      `created: ${note.created_at}`,
      topics.length ? `tags: [${topics.map((t) => `"${t.name}"`).join(", ")}]` : null,
      "---",
    ]
      .filter(Boolean)
      .join("\n");
    const parts = [front, `# ${title}`, note.summary && `> ${note.summary}`, content, note.transcript && `## Transcrição\n\n${note.transcript}`];
    const blob = new Blob([parts.filter(Boolean).join("\n\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[\\/:*?"<>|]/g, "-")}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const busy = analyzing || note.status === "analyzing";
  const processing = note.status === "recording" || note.status === "transcribing";
  const insights = note.insights ?? {};
  const aiLinks = linked.filter((l) => l.kind === "ai");
  const outLinks = linked.filter((l) => l.kind === "wikilink" && l.direction === "out");
  const backlinks = linked.filter((l) => l.kind === "wikilink" && l.direction === "in");
  const hasAnalysis = !!note.summary;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ===================== Coluna principal ===================== */}
      <article className="flex min-w-0 flex-col gap-5">
        {newVersion && (
          <div className="pop rounded-lg border border-accent/60 bg-panel p-4">
            <p className="mb-2 font-semibold text-ink">📄 O documento enviado era uma nova versão desta nota. O texto foi atualizado; o anterior ficou guardado.</p>
            {newVersion.changes && (
              <>
                <p className="mb-1 text-sm font-medium text-muted">O que mudou</p>
                <Markdown className="text-sm">{newVersion.changes}</Markdown>
              </>
            )}
            <a href={`/notes/${note.id}/versoes/${newVersion.id}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              Ver as duas versões lado a lado →
            </a>
          </div>
        )}

        {/* No celular o painel lateral fica no fim da página: avisa em cima */}
        {toReview > 0 && (
          <a href="#criar" className="press flex items-center gap-2 rounded-lg border border-dashed border-accent/60 bg-panel px-3 py-2 text-sm text-ink lg:hidden">
            <Icon name="sparkle" className="h-4 w-4 shrink-0 text-accent" />
            O Claude quer criar {toReview} {toReview === 1 ? "coisa" : "coisas"} a partir desta nota
            <span className="ml-auto shrink-0 font-medium text-accent">Revisar ↓</span>
          </a>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-faint">
          <Icon name={note.kind === "recording" ? "wave" : "notes"} className={`h-4 w-4 ${note.kind === "recording" ? "text-rec" : ""}`} />
          <span>
            {note.kind === "recording" ? "Gravação" : "Nota"} criada {relativeDate(note.created_at)}
          </span>
          {note.duration_seconds > 0 && <span>{formatDuration(note.duration_seconds)} de áudio</span>}
          <StatusBadge status={note.status} />
          <span className="ml-auto flex items-center gap-1">
            <span className="mr-2">
              {saveState === "saving" && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                  salvando…
                </span>
              )}
              {saveState === "saved" && (
                <span key={note.updated_at ?? "s"} className="pop inline-flex items-center gap-1 rounded-full bg-[#2F9D6B]/15 px-2 py-0.5 font-medium text-[#2F9D6B]" role="status">
                  ✓ salvo
                </span>
              )}
              {saveState === "error" && <span className="font-medium text-rec">⚠ erro ao salvar, tentando de novo ao editar</span>}
            </span>
            <IconButton title={note.pinned ? "Desafixar" : "Fixar"} onClick={togglePin} active={note.pinned} icon="pin" />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={!!attaching || note.status === "analyzing"}
              title="Anexar arquivos a esta nota (Word, PowerPoint, PDF, prints, texto; vários de uma vez)"
              aria-label="Anexar arquivo"
              className="rounded-md p-1.5 transition hover:bg-panel hover:text-ink disabled:opacity-50"
            >
              📎
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={DOC_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = [...(e.target.files ?? [])].slice(0, 10);
                e.target.value = "";
                if (picked.length) attachFiles(picked);
              }}
            />
            <IconButton title="Exportar .md (compatível com Obsidian)" onClick={exportMarkdown} icon="notes" />
            <ConfirmDelete
              action={deleteNote.bind(null, note.id)}
              title="Excluir esta nota?"
              label={<Icon name="trash" className="h-4 w-4" />}
              className="rounded-md p-1.5 transition hover:bg-panel hover:text-ink"
            >
              <p className="text-muted">A nota e os áudios e arquivos dela somem. Temas, projetos e pessoas continuam.</p>
              <DeleteOption name="tasks" value="keep" defaultChecked label="Manter as tarefas que saíram dela" />
              <DeleteOption name="tasks" value="delete" label="Excluir as tarefas que saíram dela" />
            </ConfirmDelete>
          </span>
        </div>

        {(files.length > 0 || attaching || attachError) && (
          <div className="-mb-2 flex flex-wrap items-center gap-2 text-sm">
            {files.map((f) => (
              <span key={f.id} className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-muted">
                <button type="button" onClick={() => openFile(f)} className="hover:text-ink hover:underline" title="Abrir o arquivo original">
                  📎 {f.name}
                </button>
                <button type="button" onClick={() => removeFile(f)} className="rounded p-0.5 text-faint hover:text-rec" aria-label={`Apagar ${f.name}`}>
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </span>
            ))}
            {attaching && <span className="text-faint">{attaching}</span>}
            {attachError && <span className="text-rec">{attachError}</span>}
          </div>
        )}

        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            dirtyRef.current.title = true;
            save({ title: e.target.value, content });
          }}
          placeholder="Título"
          className="w-full bg-transparent text-2xl font-semibold leading-tight tracking-tight text-ink placeholder:text-faint focus:outline-none md:text-3xl"
        />

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={() => setEditing(false)}
              aria-pressed={!editing}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${!editing ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
            >
              <Icon name="eye" className="h-3.5 w-3.5" /> Ler
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={!!attaching}
              aria-pressed={editing}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${editing ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
            >
              <Icon name="edit" className="h-3.5 w-3.5" /> Editar
            </button>
            <span className="ml-3 hidden text-faint sm:inline">Escreva em Markdown. Digite [[ para ligar outra nota.</span>
          </div>

          {editing && !attaching ? (
            <WikiEditor
              value={content}
              autoFocus={startEditing}
              onChange={(v) => {
                setContent(v);
                dirtyRef.current.content = true;
                save({ title, content: v });
              }}
            />
          ) : content.trim() ? (
            <div onDoubleClick={() => setEditing(true)} className="min-h-[3rem]">
              <Markdown>{content}</Markdown>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-dashed border-line p-4 text-left text-faint hover:border-accent hover:text-muted"
            >
              {note.kind === "recording" ? "Adicionar anotações próprias a esta gravação…" : "Escreva algo…"}
            </button>
          )}
        </section>

        {(note.kind === "recording" || segments.length > 0) && (
          <Transcript
            segments={segments}
            transcript={note.transcript ?? ""}
            processing={processing}
            onRetry={retrySegment}
          />
        )}
      </article>

      {/* ===================== Painel do Claude ===================== */}
      <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pb-6">
        <section className="rounded-lg border border-line bg-panel p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-base font-semibold">
              <Icon name="sparkle" className="h-4 w-4 text-accent" />
              Análise do Claude
            </h2>
            <button
              onClick={runAnalysis}
              disabled={busy || processing}
              className="rounded-md bg-surface px-3 py-1 text-sm text-muted transition hover:text-ink disabled:opacity-50"
            >
              {busy ? "Analisando…" : hasAnalysis ? "Reanalisar" : "Analisar"}
            </button>
          </div>

          {analyzeError && <p className="mb-2 text-xs text-rec">{analyzeError}</p>}
          {processing && <p className="text-sm text-muted">A análise roda automaticamente quando a transcrição terminar.</p>}

          {hasAnalysis ? (
            <div className="flex flex-col gap-4 text-sm">
              <p className="leading-relaxed text-ink">{note.summary}</p>
              <InsightList label="Pontos-chave" items={insights.key_points} />
              {insights.action_items && insights.action_items.length > 0 && (
                <div>
                  <h3 className="mb-1.5 font-semibold text-ink">Próximos passos</h3>
                  <ul className="flex flex-col gap-1.5">
                    {insights.action_items.map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm border border-accent" />
                        <span>
                          {a.text}
                          {(a.owner || a.due) && <span className="text-faint"> — {[a.owner, a.due].filter(Boolean).join(", ")}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <InsightList label="Decisões" items={insights.decisions} />
              <InsightList label="Perguntas em aberto" items={insights.questions} />
              {insights.people && insights.people.length > 0 && (
                <p className="text-xs text-muted">
                  <span className="font-semibold text-ink">Pessoas: </span>
                  {insights.people.join(", ")}
                </p>
              )}
            </div>
          ) : (
            !processing && !busy && (
              <p className="text-sm text-muted">O Claude resume, extrai tarefas e decisões, separa os temas e liga esta nota às outras.</p>
            )
          )}
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold">Temas</h2>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <TopicChip key={t.id} topic={t}>
                <button onClick={() => removeTopic(t.id)} className="-mr-1 rounded-full p-0.5 text-faint hover:text-ink" aria-label={`Remover ${t.name}`}>
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </TopicChip>
            ))}
            <form onSubmit={addTopic}>
              <input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="+ tema"
                aria-label="Adicionar tema"
                className="w-28 rounded-md border border-dashed border-line bg-transparent px-3 py-0.5 text-sm text-ink placeholder:text-faint focus:w-40 focus:border-accent focus:outline-none"
              />
            </form>
          </div>
        </section>

        {work}

        <section>
          <h2 className="mb-2 text-base font-semibold">Imagem na teia</h2>
          <CoverPicker table="notes" id={note.id} initialPath={note.cover_path ?? null} />
        </section>

        <LinkGroup label="Relacionadas pelo Claude" links={aiLinks} showReason />
        <LinkGroup label="Links" links={outLinks} />
        <LinkGroup label="Mencionada em" links={backlinks} />
      </aside>
    </div>
  );
}

function IconButton({ icon, title, onClick, active }: { icon: string; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-md p-1.5 transition hover:bg-panel hover:text-ink ${active ? "text-accent" : ""}`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

function InsightList({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1.5 font-semibold text-ink">{label}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-4 marker:text-faint">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function LinkGroup({ label, links, showReason }: { label: string; links: LinkedNote[]; showReason?: boolean }) {
  if (links.length === 0) return null;
  const unique = [...new Map(links.map((l) => [l.id, l])).values()];
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{label}</h2>
      <ul className="flex flex-col">
        {unique.map((l) => (
          <li key={l.id}>
            <Link href={`/notes/${l.id}`} className="-mx-2 block rounded-xl px-2 py-1.5 transition hover:bg-panel">
              <span className="font-medium text-ink">{l.title}</span>
              {showReason && l.reason && <span className="block text-sm text-faint">{l.reason}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
