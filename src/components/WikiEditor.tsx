"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Editor markdown com autocompletar de [[wikilinks]]: ao digitar "[[",
 * aparecem os títulos das suas notas.
 */
export function WikiEditor({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    supabaseBrowser()
      .from("notes")
      .select("title")
      .order("updated_at", { ascending: false })
      .limit(3000)
      .then(({ data }) => {
        const rows = (data ?? []) as { title: string }[];
        setTitles([...new Set(rows.map((n) => n.title))]);
      });
  }, []);

  // Cresce com o conteúdo
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(260, el.scrollHeight + 4)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const suggestions =
    query === null
      ? []
      : titles.filter((t) => t.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  const showCreate = query !== null && query.trim() && !titles.some((t) => t.toLowerCase() === query.trim().toLowerCase());
  const options = [...suggestions, ...(showCreate ? [query!.trim()] : [])];

  function detect(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = before.match(/\[\[([^\[\]\n]*)$/);
    setQuery(m ? m[1] : null);
    setHighlight(0);
  }

  function pick(title: string) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/\[\[([^\[\]\n]*)$/, `[[${title}]]`);
    const after = value.slice(caret).replace(/^[^\[\]\n]*\]\]/, "");
    const next = before + after;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = before.length;
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (query === null || options.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + options.length) % options.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(options[highlight]);
          } else if (e.key === "Escape") {
            setQuery(null);
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={"Escreva em markdown…\n\n# Título\n- lista\n- [ ] tarefa\n[[Outra nota]] cria uma ligação"}
        className="w-full resize-none rounded-xl border border-line bg-panel p-4 font-mono text-[15px] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        spellCheck
      />
      {query !== null && options.length > 0 && (
        // Fixo no topo da tela: fica visível mesmo com o teclado do celular aberto
        <ul className="fixed inset-x-4 top-16 z-40 max-h-64 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-xl md:inset-x-auto md:right-8 md:top-8 md:w-80">
          <li className="px-3 pb-1 pt-0.5 text-[11px] uppercase tracking-wider text-faint">Ligar a</li>
          {options.map((t, i) => {
            const isCreate = showCreate && i === options.length - 1;
            return (
              <li key={`${t}-${i}`}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(t);
                  }}
                  className={`block w-full truncate px-3 py-1.5 text-left text-sm ${i === highlight ? "bg-accent/15 text-ink" : "text-muted"}`}
                >
                  {isCreate ? (
                    <>
                      <span className="text-faint">Nova nota: </span>
                      {t}
                    </>
                  ) : (
                    t
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
