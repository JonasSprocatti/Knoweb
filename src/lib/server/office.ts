import { inflateRawSync } from "node:zlib";

/**
 * Lê Word (.docx) e PowerPoint (.pptx) aqui no servidor, sem mandar o arquivo
 * para nenhuma IA: são arquivos zip com XML dentro, e o texto sai direto dele.
 */

const MAX_ENTRY_BYTES = 50 * 1024 * 1024; // protege contra "zip bomb"

/** Arquivos de dentro do zip, pelo nome. Lê só o diretório central (sem zip64, que Office não usa abaixo de 4 GB). */
function unzip(buf: Buffer, want: (name: string) => boolean): Map<string, string> {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Arquivo corrompido ou não é .docx/.pptx.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Arquivo corrompido.");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (!want(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) out.set(name, data.toString("utf8"));
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8"));
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Texto de um parágrafo (<w:p> ou <a:p>), com tabulações e quebras de linha. */
function runs(p: string, ns: "w" | "a") {
  const re = new RegExp(`<${ns}:t(?: [^>]*)?>([^<]*)</${ns}:t>|<${ns}:(tab|br)\\b[^>]*/>`, "g");
  let text = "";
  for (const m of p.matchAll(re)) text += m[1] !== undefined ? decode(m[1]) : m[2] === "tab" ? "\t" : "\n";
  return text.trim();
}

function docxParagraph(p: string) {
  const text = runs(p, "w");
  if (!text) return "";
  // Estilos de título: "Heading1" no Word em inglês, "Ttulo1" no Word em português
  const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
  const level = style.match(/^(?:Heading|Ttulo|Titulo|Título)(\d)$/i)?.[1];
  if (level) return `${"#".repeat(Math.min(Number(level) + 1, 6))} ${text}`;
  if (/^(Title|Ttulo|Titulo|Título)$/i.test(style)) return `# ${text}`;
  if (/<w:numPr[ >/]/.test(p)) return `- ${text}`;
  return text;
}

function docxTable(tbl: string) {
  const rows = (tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((tr) =>
    (tr.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) ?? []).map((tc) =>
      (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => runs(p, "w")).filter(Boolean).join(" ").replace(/\|/g, "\\|").replace(/\n/g, " "),
    ),
  );
  if (!rows.length) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? "").join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(cols)}`, ...rows.slice(1).map(line)].join("\n");
}

export function docxToMarkdown(buf: Buffer) {
  const xml = unzip(buf, (n) => n === "word/document.xml").get("word/document.xml");
  if (!xml) throw new Error("Não achei o texto deste Word.");
  // ponytail: tabela dentro de tabela sai achatada; tratar aninhamento se aparecer
  const blocks = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  return blocks
    .map((b) => (b.startsWith("<w:tbl>") ? docxTable(b) : docxParagraph(b)))
    .filter(Boolean)
    .join("\n\n");
}

export function pptxToMarkdown(buf: Buffer) {
  const files = unzip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const num = (n: string) => Number(n.match(/(\d+)\.xml$/)![1]);
  const slides = [...files.keys()].sort((a, b) => num(a) - num(b));
  if (!slides.length) throw new Error("Não achei slides neste PowerPoint.");
  return slides
    .map((name, i) => {
      const lines = (files.get(name)!.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []).map((p) => runs(p, "a")).filter(Boolean);
      return [`## Slide ${i + 1}`, ...lines].join("\n\n");
    })
    .join("\n\n");
}
