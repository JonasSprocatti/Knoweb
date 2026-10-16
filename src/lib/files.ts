/** Tipos de arquivo que o Knoweb sabe ler (além de áudio). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|xml|ya?ml|log)$/i;

export const DOC_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.tsv,.json,.html,.xml,.yaml,.yml,.log";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // limite do Claude por imagem
export const MAX_DOC_BYTES = 25 * 1024 * 1024;

export function fileKind(name: string, mime: string): "audio" | "image" | "pdf" | "text" | null {
  if (mime.startsWith("audio/") || mime.startsWith("video/") || /\.(m4a|mp3|wav|ogg|webm|opus)$/i.test(name)) return "audio";
  if (IMAGE_TYPES.includes(mime)) return "image";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(name)) return "text";
  return null;
}
