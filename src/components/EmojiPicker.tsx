"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Entry = { emoji: string; words: string };
type Group = { name: string; icon: string; entries: Entry[] };

const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// O catálogo (~1.900 emojis) só é baixado quando alguém abre o seletor
let catalog: Promise<Group[]> | null = null;
const loadCatalog = () =>
  (catalog ??= import("@/lib/emojis").then(({ EMOJI_GROUPS }) =>
    EMOJI_GROUPS.map((g) => ({
      name: g.name,
      icon: g.icon,
      entries: g.items.split("|").map((entry) => {
        const i = entry.indexOf(" ");
        return { emoji: entry.slice(0, i), words: ` ${entry.slice(i + 1)}` };
      }),
    })),
  ));

const RECENT_KEY = "knoweb:emojis-recentes";
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const saveRecent = (emoji: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, 24)));
  } catch {}
};

/**
 * Campo de emoji para formulários: um botão abre o seletor (grupos + busca) e o
 * valor vai num input escondido com o mesmo `name`. Também aceita colar qualquer emoji.
 */
export function EmojiPicker({
  name = "emoji",
  defaultValue = "",
  placeholder = "🙂",
  label = "Emoji",
  className = "",
}: {
  name?: string;
  defaultValue?: string | null;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [group, setGroup] = useState<number | null>(null); // null = aba padrão
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  // Fecha ao tocar fora ou com Esc
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  // Abas: "Recentes" (se houver) e depois os grupos do catálogo
  const tabs = useMemo(() => {
    const list: Group[] = groups ?? [];
    return recent.length ? [{ name: "Recentes", icon: "🕘", entries: recent.map((emoji) => ({ emoji, words: "" })) }, ...list] : list;
  }, [groups, recent]);
  const active = group ?? 0;
  const current = tabs[Math.min(active, tabs.length - 1)];

  // Cada palavra digitada precisa começar alguma palavra do emoji ("sol" acha ☀️, não "consolo")
  const results = useMemo(() => {
    const terms = plain(query.trim()).split(/[^a-z0-9]+/).filter(Boolean);
    if (!terms.length || !groups) return null;
    // As palavras vêm na ordem nome → etiquetas, então achar mais cedo = mais relevante
    const seen = new Set<string>();
    const found: { emoji: string; at: number }[] = [];
    for (const g of groups)
      for (const e of g.entries) {
        if (seen.has(e.emoji)) continue;
        const at = terms.map((t) => e.words.indexOf(` ${t}`));
        if (at.some((i) => i < 0)) continue;
        seen.add(e.emoji);
        found.push({ emoji: e.emoji, at: Math.max(...at) });
      }
    return found.sort((a, b) => a.at - b.at).map((f) => f.emoji);
  }, [groups, query]);

  const shown = results ?? current?.entries.map((e) => e.emoji) ?? [];

  function pick(emoji: string) {
    setValue(emoji);
    setQuery("");
    if (emoji) saveRecent(emoji);
    if (ref.current) ref.current.open = false;
  }

  function choose(i: number) {
    setGroup(i);
    grid.current?.scrollTo({ top: 0 });
  }

  // Busca: se o texto já for um emoji (colado ou do teclado do sistema), Enter usa ele mesmo
  const typedEmoji = /\p{Extended_Pictographic}/u.test(query) ? query.trim() : "";
  const same = (a: string, b: string) => a.replace(/\uFE0F/g, "") === b.replace(/\uFE0F/g, "");

  return (
    <details
      ref={ref}
      className={`relative ${className}`}
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open) return;
        setRecent(readRecent());
        setGroup(null);
        loadCatalog().then(setGroups);
        if (window.matchMedia("(pointer: fine)").matches) search.current?.focus();
      }}
    >
      <input type="hidden" name={name} value={value} />
      <summary
        aria-label={value ? `${label}: ${value}. Trocar` : `Escolher ${label.toLowerCase()}`}
        title="Escolher emoji"
        className="press flex h-[34px] min-w-[3rem] cursor-pointer list-none items-center justify-center rounded-md border border-line bg-panel px-2 text-lg leading-none hover:border-accent focus-visible:border-accent [&::-webkit-details-marker]:hidden"
      >
        {value || <span className="opacity-40 grayscale">{placeholder}</span>}
      </summary>
      <div className="absolute left-0 z-30 mt-1 flex w-[23rem] max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-lg border border-line bg-panel p-2 shadow-xl">
        <input
          ref={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // não envia o formulário
              const first = typedEmoji || (results ?? [])[0];
              if (first) pick(first);
            }
          }}
          placeholder="Buscar (ex.: banco, ideia, viagem) ou colar"
          aria-label="Buscar emoji"
          className="rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {!query && tabs.length > 0 && (
          <div className="-mx-0.5 flex justify-between gap-0.5 overflow-x-auto overscroll-contain pb-0.5 [scrollbar-width:none]" role="tablist" aria-label="Grupos de emoji">
            {tabs.map((g, i) => (
              <button
                key={g.name}
                type="button"
                role="tab"
                aria-selected={active === i}
                aria-label={g.name}
                title={g.name}
                onClick={() => choose(i)}
                className={`shrink-0 rounded-md px-1 py-1 text-base leading-none transition ${active === i ? "bg-surface" : "opacity-55 hover:opacity-100"}`}
              >
                {g.icon}
              </button>
            ))}
          </div>
        )}
        <p className="px-1 text-xs text-muted">
          {!groups ? "Carregando emojis…" : results ? `${results.length} ${results.length === 1 ? "resultado" : "resultados"}` : current?.name}
        </p>
        <div ref={grid} className="grid max-h-60 grid-cols-8 sm:grid-cols-9 gap-0.5 overflow-y-auto overscroll-contain">
          {typedEmoji && !shown.some((e) => same(e, typedEmoji)) && (
            <button type="button" onClick={() => pick(typedEmoji)} className="rounded-md p-1 text-xl leading-none hover:bg-surface" title="Usar este">
              {typedEmoji}
            </button>
          )}
          {shown.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => pick(e)}
              aria-label={e}
              className={`rounded-md p-1 text-xl leading-none hover:bg-surface ${same(value, e) ? "bg-accent/15 ring-1 ring-accent" : ""}`}
            >
              {e}
            </button>
          ))}
          {groups && results && !results.length && !typedEmoji && (
            <p className="col-span-full px-1 py-2 text-xs text-faint">Nada encontrado. Dá para colar qualquer emoji na busca.</p>
          )}
        </div>
        {value && (
          <button type="button" onClick={() => pick("")} className="self-start text-xs text-muted hover:text-ink hover:underline">
            Remover emoji
          </button>
        )}
      </div>
    </details>
  );
}
