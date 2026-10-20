import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteKnowledge, rewriteProjectDoc, saveKnowledge } from "@/lib/work-actions";
import { Markdown } from "@/components/Markdown";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { SaveButton } from "@/components/SaveButton";
import { DownloadMd } from "@/components/DownloadMd";
import { ProjectDocWriter } from "@/components/ProjectDocWriter";
import { formatDay, one } from "@/components/Work";
import { KIND_LABEL } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export default async function KnowledgeItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: k } = await supabase
    .from("knowledge")
    .select("id, title, content, kind, status, created_at, updated_at, session_id, projects(name, slug), notes(id, title)")
    .eq("id", id)
    .maybeSingle();
  if (!k) notFound();
  const project = one(k.projects as unknown as { name: string; slug: string } | null);
  const note = one(k.notes as unknown as { id: string; title: string } | null);
  const busy = k.status === "queued" || k.status === "writing";

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link href="/knowledge" className="text-sm text-muted hover:text-ink">
          Base de conhecimento
        </Link>
        <h1 className="display text-3xl md:text-4xl">{k.title}</h1>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-faint">
          <span>{KIND_LABEL[k.kind] ?? k.kind}</span>
          <span>atualizado {formatDay(k.updated_at)}</span>
          {project && (
            <Link href={`/projects/${project.slug}`} className="text-link hover:underline">
              projeto {project.name}
            </Link>
          )}
          {note && (
            <Link href={`/notes/${note.id}`} className="text-link hover:underline">
              nota {note.title}
            </Link>
          )}
          {k.session_id && (
            <Link href={`/ask?s=${k.session_id}`} className="text-link hover:underline">
              conversa de origem
            </Link>
          )}
        </p>
      </header>

      {k.kind === "project" && <ProjectDocWriter docId={k.id} status={k.status} />}
      {k.status === "error" && <p className="text-sm text-rec">A IA não terminou o documento. Use “Escrever de novo”.</p>}

      {k.content ? <Markdown>{k.content}</Markdown> : !busy && <p className="text-faint">Sem conteúdo ainda.</p>}

      {!busy && (
        <footer className="mt-4 flex flex-wrap items-start gap-3 border-t border-line pt-4">
          {k.content && <DownloadMd title={k.title} content={k.content} />}
          {k.kind === "project" && (
            <form action={rewriteProjectDoc.bind(null, k.id)}>
              <button className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink" title="A IA lê o projeto de novo e reescreve o documento">
                Escrever de novo
              </button>
            </form>
          )}
          <details className="w-full rounded-lg border border-line bg-panel p-4">
            <summary className="cursor-pointer font-semibold">Editar</summary>
            <form action={saveKnowledge} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="id" value={k.id} />
              <input name="title" required defaultValue={k.title} aria-label="Título" className={input} />
              <textarea name="content" rows={16} defaultValue={k.content} aria-label="Conteúdo" className={`${input} font-mono`} />
              <SaveButton />
            </form>
          </details>
          <ConfirmDelete action={deleteKnowledge.bind(null, k.id)} title={`Excluir “${k.title}” da base?`} />
        </footer>
      )}
    </article>
  );
}
