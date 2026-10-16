"use client";

import { useRef } from "react";

/**
 * Botão "Excluir" que abre uma janela de confirmação. As opções (o que
 * fazer com o que está ligado) vêm como children e seguem no formulário.
 */
export function ConfirmDelete({
  action,
  title,
  label = "Excluir",
  confirmLabel = "Excluir",
  className = "text-sm text-rec hover:underline",
  children,
}: {
  action: (form: FormData) => void | Promise<void>;
  title: string;
  label?: React.ReactNode;
  confirmLabel?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={className}
        aria-label={typeof label === "string" ? undefined : title}
        title={typeof label === "string" ? undefined : title}
      >
        {label}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-panel p-0 text-ink shadow-xl backdrop:bg-black/40"
      >
        <form action={action} onSubmit={() => ref.current?.close()} className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          {children && <div className="flex flex-col gap-2 text-sm">{children}</div>}
          <p className="text-xs text-faint">Não dá para desfazer.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-md px-4 py-1.5 text-sm text-muted hover:text-ink">
              Cancelar
            </button>
            <button className="rounded-md bg-rec px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110">{confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Uma opção da janela (rádio com explicação). */
export function DeleteOption({ name = "mode", value, label, hint, defaultChecked, children }: {
  name?: string;
  value: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer gap-2.5 rounded-md border border-line p-2.5 has-checked:border-accent">
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} required className="mt-1 accent-accent" />
      <span className="flex flex-col gap-1">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
        {children}
      </span>
    </label>
  );
}
