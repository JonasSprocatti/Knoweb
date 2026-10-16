import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/server/claude";
import { analyzeNote } from "@/lib/server/analyze";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { fileKind } from "@/lib/files";

export const maxDuration = 300;

const SYSTEM = `Você lê arquivos (documentos, PDFs, prints de tela, fotos) para uma base de conhecimento pessoal.
Devolva o conteúdo do arquivo em Markdown, em português do Brasil, sem comentários antes ou depois:
- Texto: transcreva fielmente, mantendo títulos, listas e tabelas (como tabelas Markdown).
- Prints e fotos: transcreva todo texto visível e descreva em poucas frases o que a imagem mostra (tela de qual app, gráfico, conversa, quem fala o quê).
- Não invente nada que não esteja no arquivo.`;

/**
 * Lê o arquivo da nota (já enviado ao Storage pelo navegador), põe o conteúdo
 * no texto da nota e roda a análise, que liga a nota à teia.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const { noteId } = (await request.json().catch(() => ({}))) as { noteId?: string };
  if (!noteId) return badRequest("noteId obrigatório.");

  const { data: note } = await supabase.from("notes").select("id, file_path, file_name").eq("id", noteId).single();
  if (!note?.file_path) return badRequest("Esta nota não tem arquivo.");

  try {
    await supabase.from("notes").update({ status: "analyzing" }).eq("id", noteId);
    const { data: blob, error } = await supabase.storage.from("files").download(note.file_path);
    if (error || !blob) throw new Error(error?.message ?? "Arquivo não encontrado.");
    const mime = blob.type || "application/octet-stream";
    const kind = fileKind(note.file_name ?? "", mime);

    let content: string;
    if (kind === "text") {
      const text = await blob.text();
      content = /\.(md|markdown|txt)$/i.test(note.file_name ?? "") ? text : "```\n" + text + "\n```";
    } else if (kind === "image" || kind === "pdf") {
      const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
      const block: Anthropic.ContentBlockParam =
        kind === "pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
          : { type: "image", source: { type: "base64", media_type: mime as "image/png", data } };
      const msg = await anthropic()
        .messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 16000, // ponytail: documentos muito longos saem cortados; dividir por páginas se acontecer
          system: SYSTEM,
          messages: [{ role: "user", content: [block, { type: "text", text: `Arquivo: ${note.file_name}` }] }],
        })
        .finalMessage();
      content = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    } else {
      throw new Error("Formato não suportado. Envie PDF, imagem ou texto (Word: salve como PDF).");
    }

    await supabase.from("notes").update({ content }).eq("id", noteId);
    const result = await analyzeNote(supabase, noteId);
    return NextResponse.json(result);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    await supabase.from("notes").update({ status: "error", summary: `Não consegui ler o arquivo: ${why}` }).eq("id", noteId);
    return serverError(err);
  }
}
