/** Tipos de arquivo que o Knoweb sabe ler (além de áudio). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|xml|ya?ml|log)$/i;

export const DOC_ACCEPT = ".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.tsv,.json,.html,.xml,.yaml,.yml,.log";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // limite do Claude por imagem
export const MAX_DOC_BYTES = 25 * 1024 * 1024;
export const UNSUPPORTED =
  "formato não suportado. Envie Word (.docx), PowerPoint (.pptx), PDF, imagem ou texto (.doc e .ppt antigos: salve como .docx/.pptx).";

export type FileKind = "audio" | "image" | "pdf" | "docx" | "pptx" | "text";

export function fileKind(name: string, mime: string): FileKind | null {
  if (mime.startsWith("audio/") || mime.startsWith("video/") || /\.(m4a|mp3|wav|ogg|webm|opus)$/i.test(name)) return "audio";
  if (IMAGE_TYPES.includes(mime)) return "image";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (/\.docx$/i.test(name)) return "docx";
  if (/\.pptx$/i.test(name)) return "pptx";
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(name)) return "text";
  return null;
}

/** Só PDF e imagem precisam do Claude para serem lidos; o resto é lido no próprio servidor. */
export const readByAI = (kind: FileKind) => kind === "pdf" || kind === "image";

/** Anexo de uma nota: o original fica no bucket privado "files". */
export interface NoteFile {
  id: string;
  note_id: string;
  path: string;
  name: string;
  created_at: string;
}
