import Link from "next/link";
import { Icon } from "@/components/Icon";
import { formatDuration, relativeDate } from "@/lib/text";
import type { NoteListItem } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  recording: "gravando",
  transcribing: "transcrevendo",
  analyzing: "analisando",
  error: "erro",
};

export function StatusBadge({ status }: { status: string }) {
  if (!STATUS_LABEL[status]) return null;
  const tone =
    status === "error"
      ? "bg-rec/10 text-rec"
      : status === "recording"
        ? "bg-rec/10 text-rec"
        : "bg-accent/15 text-accent";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status !== "error" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function NoteCard({ note, snippet }: { note: NoteListItem; snippet?: string | null }) {
  return (
    <Link
      href={`/notes/${note.id}`}
      className="group flex flex-col gap-1.5 rounded-xl border border-line bg-panel p-4 transition hover:border-accent/60"
    >
      <div className="flex items-start gap-2">
        <Icon
          name={note.kind === "recording" ? "wave" : "notes"}
          className={`mt-0.5 h-4 w-4 shrink-0 ${note.kind === "recording" ? "text-rec" : "text-faint"}`}
        />
        <h3 className="line-clamp-2 flex-1 font-medium leading-snug text-ink group-hover:text-accent">{note.title}</h3>
        {note.pinned && <Icon name="pin" className="h-3.5 w-3.5 shrink-0 text-accent" />}
      </div>
      {snippet ? (
        <p
          className="line-clamp-3 text-sm text-muted"
          dangerouslySetInnerHTML={{
            __html: escapeHtml(snippet).replace(/&lt;&lt;/g, '<mark class="bg-accent/25 text-ink rounded px-0.5">').replace(/&gt;&gt;/g, "</mark>"),
          }}
        />
      ) : (
        note.summary && <p className="line-clamp-2 text-sm text-muted">{note.summary}</p>
      )}
      <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-faint">
        <span>{relativeDate(note.updated_at)}</span>
        {note.kind === "recording" && note.duration_seconds > 0 && <span>· {formatDuration(note.duration_seconds)}</span>}
        <span className="ml-auto">
          <StatusBadge status={note.status} />
        </span>
      </div>
    </Link>
  );
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
