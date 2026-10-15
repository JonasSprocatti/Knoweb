import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatDuration, relativeDate } from "@/lib/text";
import { topicColor } from "@/lib/topicColor";
import type { NoteListItem } from "@/lib/types";

/** Colunas das listas de notas, já com o tema principal de cada uma (para a cor). */
export const LIST_COLUMNS =
  "id, title, kind, status, summary, updated_at, duration_seconds, pinned, note_topics(relevance, topics(name, slug, color, emoji))";

const STATUS_LABEL: Record<string, string> = {
  recording: "gravando",
  transcribing: "transcrevendo",
  analyzing: "analisando",
  error: "erro",
};

export function StatusBadge({ status }: { status: string }) {
  if (!STATUS_LABEL[status]) return null;
  const tone = status === "error" || status === "recording" ? "text-rec" : "text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${tone}`}>
      {status !== "error" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

type JoinedTopic = { name: string; slug: string; color: string | null; emoji: string | null };

function mainTopic(note: NoteListItem): JoinedTopic | null {
  const rows = (note.note_topics ?? [])
    .map((r) => ({ relevance: r.relevance, topic: (Array.isArray(r.topics) ? r.topics[0] : r.topics) as JoinedTopic | null }))
    .filter((r) => r.topic)
    .sort((a, b) => b.relevance - a.relevance);
  return rows[0]?.topic ?? null;
}

/** Uma nota numa lista: ponto na cor do tema, título, resumo e de onde ela veio. */
export function NoteCard({ note, snippet }: { note: NoteListItem; snippet?: string | null }) {
  const topic = mainTopic(note);
  const color = topic ? topicColor(topic) : "var(--faint)";
  const recording = note.kind === "recording";
  return (
    <Link href={`/notes/${note.id}`} className="group -mx-3 flex gap-3 rounded-xl px-3 py-3 transition hover:bg-panel">
      <span className="mt-[0.45rem] flex h-3 w-3 shrink-0 items-center justify-center" aria-hidden>
        {recording ? (
          <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: color }} />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 font-medium leading-snug text-ink">
          {note.pinned && <Icon name="pin" className="mr-1.5 inline h-3.5 w-3.5 align-[-1px] text-accent" />}
          {note.title}
        </h3>
        {snippet ? (
          <p
            className="line-clamp-3 text-muted"
            dangerouslySetInnerHTML={{
              __html: escapeHtml(snippet).replace(/&lt;&lt;/g, '<mark class="bg-accent/25 text-ink rounded px-0.5">').replace(/&gt;&gt;/g, "</mark>"),
            }}
          />
        ) : (
          note.summary && <p className="line-clamp-2 text-sm text-muted">{note.summary}</p>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
          {topic && <span style={{ color: `color-mix(in srgb, ${color} 60%, var(--ink))` }}>{topic.name}</span>}
          <span>{recording ? (note.duration_seconds > 0 ? `gravação de ${formatDuration(note.duration_seconds)}` : "gravação") : "escrita"}</span>
          <span>{relativeDate(note.updated_at)}</span>
          <StatusBadge status={note.status} />
        </p>
      </div>
    </Link>
  );
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
