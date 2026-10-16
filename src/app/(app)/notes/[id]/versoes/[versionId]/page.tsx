import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Markdown } from "@/components/Markdown";
import { SaveButton } from "@/components/SaveButton";
import { restoreVersion } from "@/lib/work-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comparar versões" };

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Versão anterior e atual de uma nota, lado a lado (no celular, uma embaixo da outra), com o que mudou. */
export default async function CompareVersions({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  const supabase = await supabaseServer();
  const [{ data: note }, { data: version }] = await Promise.all([
    supabase.from("notes").select("id, title, content, updated_at").eq("id", id).maybeSingle(),
    supabase.from("note_versions").select("id, content, changes, file_name, created_at").eq("id", versionId).eq("note_id", id).maybeSingle(),
  ]);
  if (!note || !version) notFound();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href={`/notes/${id}`} className="text-faint underline-offset-4 hover:text-ink hover:underline">← {note.title}</Link>
        <h1 className="display text-2xl md:text-3xl">Comparar versões</h1>
      </header>

      {version.changes && (
        <section className="rounded-lg border border-accent/60 bg-panel p-4">
          <h2 className="mb-1 font-semibold">O que mudou</h2>
          <Markdown className="text-sm">{version.changes}</Markdown>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-line bg-surface p-4">
          <div className="sticky top-14 z-10 -mx-4 -mt-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-line bg-surface px-4 py-2 md:top-0">
            <span className="text-sm font-semibold text-muted">Anterior · até {when(version.created_at)}</span>
            <form action={restoreVersion.bind(null, id, version.id)}>
              <SaveButton className="px-3 py-1 text-xs">Restaurar esta</SaveButton>
            </form>
          </div>
          <Markdown>{version.content || "_(vazia)_"}</Markdown>
        </section>
        <section className="min-w-0 rounded-lg border border-accent/40 bg-panel p-4">
          <div className="sticky top-14 z-10 -mx-4 -mt-4 mb-3 rounded-t-lg border-b border-line bg-panel px-4 py-2 md:top-0">
            <span className="text-sm font-semibold text-accent">Atual{version.file_name ? ` · ${version.file_name}` : ""}</span>
          </div>
          <Markdown>{note.content || "_(vazia)_"}</Markdown>
        </section>
      </div>
    </div>
  );
}
