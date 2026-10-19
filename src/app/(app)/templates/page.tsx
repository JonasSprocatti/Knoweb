import Link from "@/components/Link";
import { SaveButton } from "@/components/SaveButton";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteTemplate, saveTemplate } from "@/lib/work-actions";
import { hours, RECURRENCE } from "@/components/Work";
import type { Template } from "@/lib/types";
import { ConfirmDelete, DeleteOption } from "@/components/ConfirmDelete";

export const metadata = { title: "Modelos" };
export const dynamic = "force-dynamic";

const input = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";
const HELP = "Uma tarefa por linha: Título ; dias depois do início ; horas\nEx.: Reunião de kickoff ; 0 ; 1\n       Entregar protótipo ; 14 ; 16";

const toText = (t: Template) =>
  t.tasks.map((x) => [x.title, x.offset_days ?? "", x.estimate_hours ?? ""].join(" ; ").replace(/( ; )+$/, "")).join("\n");

function TemplateForm({ t }: { t?: Template }) {
  return (
    <form action={saveTemplate} className="flex flex-col gap-2">
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="flex gap-2">
        <input name="emoji" defaultValue={t?.emoji ?? ""} placeholder="📋" aria-label="Emoji" className={`${input} w-14`} />
        <input name="name" required defaultValue={t?.name} placeholder="Nome do modelo (ex.: Lançamento de produto)" aria-label="Nome" className={`${input} flex-1`} />
      </div>
      <input name="description" defaultValue={t?.description ?? ""} placeholder="Objetivo padrão do projeto" aria-label="Descrição" className={input} />
      <textarea name="tasks" defaultValue={t ? toText(t) : ""} rows={6} placeholder={HELP} aria-label="Tarefas do modelo" className={`${input} font-mono`} />
      <SaveButton className="self-start">{t ? "Salvar" : "Criar modelo"}</SaveButton>
    </form>
  );
}

export default async function TemplatesPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("templates").select("*").order("name");
  const templates = (data ?? []) as Template[];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <Link href="/projects" className="text-faint underline-offset-4 hover:text-ink hover:underline">Projetos</Link>
        <h1 className="display mt-2 text-3xl md:text-4xl">Modelos de projeto</h1>
        <p className="mt-1 max-w-xl text-muted">
          Projetos que se repetem viram modelo: ao criar um projeto a partir dele, as tarefas nascem com prazo contado do início. Você também pode salvar um projeto pronto como modelo, na página dele.
        </p>
      </header>

      <details className="rounded-lg border border-line bg-panel p-4" open={templates.length === 0}>
        <summary className="cursor-pointer font-semibold">+ Novo modelo</summary>
        <div className="mt-3"><TemplateForm /></div>
      </details>

      <ul className="flex flex-col gap-4">
        {templates.map((t) => (
          <li key={t.id} className="rounded-lg border border-line bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">{t.emoji} {t.name}</h2>
              <Link href={`/projects?modelo=${t.id}`} className="text-sm font-semibold text-accent hover:underline">Usar modelo</Link>
            </div>
            {t.description && <p className="text-sm text-muted">{t.description}</p>}
            <ol className="mt-2 flex list-decimal flex-col gap-0.5 pl-5 text-sm">
              {t.tasks.map((x, i) => (
                <li key={i}>
                  {x.title}
                  <span className="text-faint">
                    {x.offset_days != null && ` · dia ${x.offset_days}`}
                    {x.estimate_hours != null && ` · ${hours(x.estimate_hours)}`}
                    {x.recurrence && ` · ↻ ${RECURRENCE[x.recurrence]}`}
                  </span>
                </li>
              ))}
            </ol>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted hover:text-ink">Editar</summary>
              <div className="mt-2"><TemplateForm t={t} /></div>
              <div className="mt-2">
                <ConfirmDelete action={deleteTemplate.bind(null, t.id)} title={`Excluir o modelo “${t.name}”?`} label="Excluir modelo">
                  <p className="text-muted">Projetos já criados a partir dele não mudam.</p>
                </ConfirmDelete>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
