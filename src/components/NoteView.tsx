"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, debounce } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/client";
import { requestTranscription } from "@/lib/upload";
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
  initialTopics,
  linked,
  startEditing,
  work,
}: {
  initialNote: Note;
  initialSegments: AudioSegment[];
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
  const [editing, setEditing] = useState(startEditing || (!initialNote.content && initialNote.kind === "note"));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState("");
  const dirtyRef = useRef({ title: false, content: false });

  useEffect(() => setTopics(initialTopics), [initialTopics]);

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
          const next = payload.new as Note;
          setNote((prev) => {
            const finishedAnalysis = prev.status === "analyzing" && next.status === "ready";
            if (finishedAnalysis) setTimeout(() => router.refresh(), 300);
            return { ...prev, ...next };
          });
          if (!dirtyRef.current.title) setTitle(next.title);
          if (!dirtyRef.current.content && !editing) setContent(next.content);
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-faint">
          <Icon name={note.kind === "recording" ? "wave" : "notes"} className={`h-4 w-4 ${note.kind === "recording" ? "text-rec" : ""}`} />
          <span>
            {note.kind === "recording" ? "Gravação" : "Nota"} criada {relativeDate(note.created_at)}
          </span>
          {note.duration_seconds > 0 && <span>{formatDuration(note.duration_seconds)} de áudio</span>}
          <StatusBadge status={note.status} />
          <span className="ml-auto flex items-center gap-1">
            <span className="mr-2">
              {saveState === "saving" && "salvando…"}
              {saveState === "saved" && "salvo"}
              {saveState === "error" && <span className="text-rec">erro ao salvar</span>}
            </span>
            <IconButton title={note.pinned ? "Desafixar" : "Fixar"} onClick={togglePin} active={note.pinned} icon="pin" />
            <IconButton title="Exportar .md (compatível com Obsidian)" onClick={exportMarkdown} icon="notes" />
            <ConfirmDelete
              action={deleteNote.bind(null, note.id)}
              title="Excluir esta nota?"
              label={<Icon name="trash" className="h-4 w-4" />}
              className="rounded-md p-1.5 transition hover:bg-panel hover:text-ink"
            >
              <p className="text-muted">A nota e os áudios dela somem. Temas, projetos e pessoas continuam.</p>
              <DeleteOption name="tasks" value="keep" defaultChecked label="Manter as tarefas que saíram dela" />
              <DeleteOption name="tasks" value="delete" label="Excluir as tarefas que saíram dela" />
            </ConfirmDelete>
          </span>
        </div>

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
              aria-pressed={editing}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${editing ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
            >
              <Icon name="edit" className="h-3.5 w-3.5" /> Editar
            </button>
            <span className="ml-3 hidden text-faint sm:inline">Escreva em Markdown. Digite [[ para ligar outra nota.</span>
          </div>

          {editing ? (
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
