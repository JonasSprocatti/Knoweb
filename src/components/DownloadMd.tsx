"use client";

/** Baixa o texto como arquivo .md (abre no Obsidian, Word, etc.). */
export function DownloadMd({ title, content }: { title: string; content: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([`# ${title}\n\n${content}`], { type: "text/markdown" }));
        a.download = `${title.replace(/[\\/:*?"<>|]+/g, "").trim() || "documento"}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
      }}
      className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink"
    >
      Baixar .md
    </button>
  );
}
