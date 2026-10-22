"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MultiOption = { value: string; label: string; hint?: string };

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Seleção múltipla com busca: os escolhidos viram chips removíveis dentro do campo
 * e a lista abaixo filtra pelo que se digita (sem ligar para acento).
 * Vai no formulário como um `<input name={name}>` por valor escolhido; com
 * `createName`, nomes que não estão na lista também viram chip e vão juntos,
 * separados por vírgula, em `<input name={createName}>`.
 */
export function MultiSelect({
  options,
  name,
  defaultValues = [],
  createName,
  placeholder = "Buscar…",
  empty = "Nada encontrado.",
  label,
  className = "",
}: {
  options: MultiOption[];
  name: string;
  defaultValues?: string[];
  createName?: string;
  placeholder?: string;
  empty?: string;
  label: string;
  className?: string;
}) {
  const [chosen, setChosen] = useState<string[]>(defaultValues);
  const [created, setCreated] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [place, setPlace] = useState<React.CSSProperties | null>(null);
  const listId = useId();
  const defaults = useRef(defaultValues);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const q = fold(query.trim());
  const matches = options.filter((o) => !chosen.includes(o.value) && (!q || fold(`${o.label} ${o.hint ?? ""}`).includes(q)));
  const exists = !!q && (options.some((o) => fold(o.label) === q) || created.some((c) => fold(c) === q));
  const canCreate = !!createName && !!q && !exists;
  const total = matches.length + (canCreate ? 1 : 0);

  // Fecha ao tocar fora
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  // O formulário volta ao começo depois de salvar (ação do servidor): os chips também
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const reset = () => {
      setChosen(defaults.current);
      setCreated([]);
      setQuery("");
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  useEffect(() => setActive(0), [query]);

  // A lista vai solta no <body>, presa ao campo: assim nada da tela passa por cima
  // (cartões e listas animados criam camadas próprias) e ela não é cortada.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 220 && r.top > below;
      setPlace({
        position: "fixed",
        left: r.left,
        width: Math.max(r.width, 224),
        maxHeight: Math.min(256, (up ? r.top : below) - 12),
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const pick = (i: number) => {
    if (i < matches.length) setChosen((c) => [...c, matches[i].value]);
    else if (canCreate) setCreated((c) => [...c, query.trim()]);
    setQuery("");
    setActive(0);
    field.current?.focus();
  };
  const drop = (value: string) => setChosen((c) => c.filter((v) => v !== value));
  const dropCreated = (n: string) => setCreated((c) => c.filter((v) => v !== n));

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (total) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : total - 1)) % total);
    } else if (e.key === "Enter") {
      // Enter escolhe da lista em vez de enviar o formulário
      if (open && total) {
        e.preventDefault();
        pick(Math.min(active, total - 1));
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === "Backspace" && !query) {
      if (created.length) setCreated((c) => c.slice(0, -1));
      else if (chosen.length) setChosen((c) => c.slice(0, -1));
    }
  };

  const chip = "inline-flex max-w-full items-center gap-1 rounded-full border border-accent/40 bg-accent/10 py-0.5 pl-2.5 pr-1 text-sm text-ink";
  const chipX = "grid h-4 w-4 shrink-0 place-items-center rounded-full text-muted hover:bg-accent/20 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div ref={root} className={`relative ${className}`}>
      {chosen.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      {createName && <input type="hidden" name={createName} value={created.join(", ")} />}
      <div
        ref={box}
        onClick={() => {
          field.current?.focus();
          setOpen(true);
        }}
        className="flex min-h-9 cursor-text flex-wrap items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 focus-within:border-accent"
      >
        {chosen.map((v) => {
          const o = byValue.get(v);
          return (
            <span key={v} className={chip}>
              <span className="truncate">{o?.label ?? v}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); drop(v); }} aria-label={`Tirar ${o?.label ?? v}`} className={chipX}>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </span>
          );
        })}
        {created.map((n) => (
          <span key={`new:${n}`} className={`${chip} border-dashed`} title="Pessoa nova: será criada ao salvar">
            <span className="truncate">{n}</span>
            <span className="text-xs text-faint">nova</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); dropCreated(n); }} aria-label={`Tirar ${n}`} className={chipX}>
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </span>
        ))}
        <input
          ref={field}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={chosen.length + created.length ? "" : placeholder}
          aria-label={label}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && total ? `${listId}-${Math.min(active, total - 1)}` : undefined}
          // O foco aparece na borda do campo inteiro; o contorno global ficaria dentro dele
          style={{ outline: "none" }}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm text-ink placeholder:text-faint"
        />
      </div>
      {open && place && createPortal(
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-multiselectable
          aria-label={label}
          style={place}
          className="z-50 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-lg"
        >
          {matches.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={false}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
              onPointerEnter={() => setActive(i)}
              className={`flex animate-none cursor-pointer items-baseline gap-1.5 rounded px-2 py-1.5 text-sm text-ink ${i === active ? "bg-surface" : ""}`}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="truncate text-xs text-faint">{o.hint}</span>}
            </li>
          ))}
          {canCreate && (
            <li
              id={`${listId}-${matches.length}`}
              role="option"
              aria-selected={false}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(matches.length)}
              onPointerEnter={() => setActive(matches.length)}
              className={`animate-none cursor-pointer rounded px-2 py-1.5 text-sm text-accent ${active === matches.length ? "bg-surface" : ""}`}
            >
              + Adicionar “{query.trim()}”
            </li>
          )}
          {!total && <li className="animate-none px-2 py-1.5 text-xs text-faint">{q ? empty : chosen.length ? "Todos já escolhidos." : empty}</li>}
        </ul>,
        document.body,
      )}
    </div>
  );
}
