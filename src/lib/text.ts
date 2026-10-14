/** "Gestão Financeira & SAP" -> "gestao-financeira-sap" */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const WIKILINK_RE = /\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|([^\[\]]+))?\]\]/g;

/** Títulos citados como [[Título]] ou [[Título|apelido]] no markdown. */
export function extractWikilinks(markdown: string): string[] {
  const titles = new Set<string>();
  for (const match of markdown.matchAll(WIKILINK_RE)) {
    const title = match[1].trim();
    if (title) titles.add(title);
  }
  return [...titles];
}

/** Converte [[Título|apelido]] em links markdown comuns para o renderizador. */
export function wikilinksToMarkdown(markdown: string): string {
  return markdown.replace(WIKILINK_RE, (_all, title: string, alias?: string) => {
    const label = (alias ?? title).trim();
    return `[${label}](/w/${encodeURIComponent(title.trim())})`;
  });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatTimestamp(seconds: number): string {
  return formatDuration(seconds);
}

export function relativeDate(iso: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function defaultRecordingTitle(date = new Date()): string {
  return `Gravação ${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
