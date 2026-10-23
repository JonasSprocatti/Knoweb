"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLOR_CHOICES, cleanColor } from "@/lib/topicColor";

const WIDTH = 236;
const same = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/**
 * Escolha de cor: “Automática” (a cor que já viria do tema ou do nome), uma da paleta
 * ou qualquer outra pelo seletor do sistema. Em formulário, o valor vai num input
 * escondido com `name` (vazio = automática); com `onChange`, quem usa salva na hora.
 * `children` troca o botão padrão (bolinha + nome) por outro gatilho, como um ícone.
 */
export function ColorPicker({
  name,
  defaultValue = null,
  auto,
  autoHint = "segue o tema",
  label = "Cor",
  onChange,
  children,
  className = "",
}: {
  name?: string;
  defaultValue?: string | null;
  /** A cor usada quando não há escolha */
  auto: string;
  autoHint?: string;
  label?: string;
  onChange?: (color: string | null) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState<string | null>(cleanColor(defaultValue));
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<React.CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const custom = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popId = useId();

  // O valor salvo mudou (servidor respondeu, ou o salvamento falhou e voltou): acompanha.
  // Assim o reset do formulário depois de salvar não traz a cor antiga de volta.
  useEffect(() => setValue(cleanColor(defaultValue)), [defaultValue]);

  const choose = (color: string | null, close = true) => {
    setValue(color);
    onChange?.(color);
    if (close) {
      setOpen(false);
      trigger.current?.focus();
    }
  };

  // Fecha ao tocar fora ou com Esc
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // O quadro vai solto no <body>, preso ao botão (telas animadas criam camadas próprias)
  useLayoutEffect(() => {
    if (!open) return setPlace(null);
    const measure = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 200 && r.top > below;
      setPlace({
        position: "fixed",
        width: WIDTH,
        left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)),
        ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  // Ao abrir, o foco vai para a cor escolhida (Tab anda pela paleta)
  const placed = place !== null;
  useEffect(() => {
    if (open && placed) pop.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]")?.focus();
  }, [open, placed]);

  const shown = value ?? auto;
  const inPalette = COLOR_CHOICES.some((c) => same(c, value));

  return (
    <>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`${label}: ${value ? value : "automática"}`}
        title={children ? `${label}: trocar` : undefined}
        className={
          children
            ? `press inline-flex items-center justify-center rounded-md transition hover:bg-panel ${className}`
            : `flex h-[34px] w-full items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-sm text-ink transition hover:border-faint ${className}`
        }
      >
        {children ?? (
          <>
            <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: shown }} aria-hidden />
            <span className="truncate">{value ? "Escolhida" : "Automática"}</span>
          </>
        )}
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={pop}
            id={popId}
            role="dialog"
            aria-label={label}
            style={place}
            className="z-50 flex flex-col gap-3 rounded-lg border border-line bg-panel p-3 shadow-lg"
          >
            <button
              type="button"
              aria-pressed={!value}
              onClick={() => choose(null)}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface ${!value ? "bg-surface" : ""}`}
            >
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: auto }} aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-ink">Automática</span>
                <span className="text-xs text-faint">{autoHint}</span>
              </span>
              {!value && <Check />}
            </button>
            <div className="grid grid-cols-6 gap-2 px-1" role="group" aria-label="Paleta">
              {COLOR_CHOICES.map((c) => {
                const on = same(c, value);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    aria-label={c}
                    title={c}
                    onClick={() => choose(c)}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-110"
                    style={{ background: c, boxShadow: on ? `0 0 0 2px var(--panel), 0 0 0 4px ${c}` : undefined }}
                  >
                    {on && <Check className="text-white" />}
                  </button>
                );
              })}
            </div>
            <label className="relative flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted transition hover:bg-surface hover:text-ink">
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-line"
                style={{ background: value && !inPalette ? value : "conic-gradient(#B5523B, #C08A2E, #6B7F3A, #2F7D73, #3F7A93, #8E5B8A, #B5523B)" }}
                aria-hidden
              />
              <span className="flex-1">{value && !inPalette ? `Outra cor · ${value}` : "Outra cor…"}</span>
              {value && !inPalette && <Check />}
              <input
                type="color"
                value={value ?? (auto.startsWith("#") ? auto : "#A8691A")}
                onChange={(e) => {
                  // O seletor do sistema muda a cada arrasto: espera parar para salvar
                  const color = cleanColor(e.target.value);
                  setValue(color);
                  if (custom.current) clearTimeout(custom.current);
                  custom.current = setTimeout(() => onChange?.(color), 400);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Outra cor"
              />
            </label>
          </div>,
          document.body,
        )}
    </>
  );
}

function Check({ className = "text-ink" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 shrink-0 ${className}`} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
