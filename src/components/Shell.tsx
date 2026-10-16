"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { NewNoteButton } from "@/components/NewNoteButton";

const NAV = [
  { href: "/", label: "Início", icon: "home" },
  { href: "/record", label: "Gravar", icon: "mic" },
  { href: "/notes", label: "Notas", icon: "notes" },
  { href: "/projects", label: "Projetos", icon: "folder" },
  { href: "/tasks", label: "Tarefas", icon: "check" },
  { href: "/sprints", label: "Sprints", icon: "sprint" },
  { href: "/people", label: "Pessoas", icon: "user" },
  { href: "/topics", label: "Temas", icon: "tag" },
  { href: "/companies", label: "Empresas", icon: "building" },
  { href: "/systems", label: "Sistemas", icon: "server" },
  { href: "/graph", label: "Teia", icon: "graph" },
  { href: "/ask", label: "Perguntar", icon: "ask" },
];

// No celular: quatro atalhos + "Mais" (gaveta com o resto, a conta e o sair)
const MOBILE_NAV = ["/", "/notes", "/record", "/tasks"];
const MORE = [...NAV.filter((n) => !MOBILE_NAV.includes(n.href)), { href: "/templates", label: "Modelos", icon: "folder" }, { href: "/settings", label: "Configurações", icon: "gear" }].sort(
  (a, b) => Number(b.href === "/graph") - Number(a.href === "/graph"),
);

// Telas de topo (no menu) não têm "voltar"; as de dentro (uma nota, um projeto…) têm
const TOP = new Set(["/", ...NAV.map((n) => n.href), "/templates", "/settings", "/search"]);
const parentOf = (path: string) => path.split("/").slice(0, -1).join("/") || "/";

function BackButton({ path, className = "" }: { path: string; className?: string }) {
  const router = useRouter();
  if (TOP.has(path)) return null;
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(parentOf(path)))}
      aria-label="Voltar"
      className={`press flex shrink-0 items-center gap-1 rounded-md text-muted hover:text-ink ${className}`}
    >
      <Icon name="back" className="h-5 w-5" />
      <span className="hidden text-sm md:inline">Voltar</span>
    </button>
  );
}

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

/** Escolhe quem transcreve, analisa e responde: Claude + Whisper ou Gemini. Fica num cookie lido pelo servidor. */
function AiSelect({ ai }: { ai: string }) {
  const router = useRouter();
  return (
    <select
      value={ai}
      onChange={(e) => {
        document.cookie = `ai=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      title="IA usada para transcrever, analisar e responder"
      aria-label="IA"
      className="rounded-lg border border-line bg-panel px-1.5 py-1 text-xs text-muted focus:border-accent focus:outline-none"
    >
      <option value="claude">Claude</option>
      <option value="gemini">Gemini</option>
    </select>
  );
}

export function Shell({ email, ai, children }: { email: string; ai: string | null; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const more = useRef<HTMLDialogElement>(null);
  useEffect(() => more.current?.close(), [path]); // fecha a gaveta ao trocar de tela
  const inMore = MORE.some((n) => isActive(path, n.href));

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="flex min-h-dvh">
      {/* ---------------- Barra lateral (desktop) ---------------- */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-1 text-lg font-semibold text-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          Knoweb
        </Link>

        <form onSubmit={search} className="mb-3">
          <label className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-sm focus-within:border-accent">
            <Icon name="search" className="h-4 w-4 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nas notas"
              className="w-full bg-transparent text-ink placeholder:text-faint focus:outline-none"
            />
          </label>
        </form>

        <NewNoteButton className="mb-5 justify-center" />

        <nav className="flex flex-col gap-0.5 text-sm">
          {NAV.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-2.5 py-2 transition ${
                  active ? "bg-panel font-medium text-ink shadow-[inset_2px_0_0_var(--accent)]" : "text-muted hover:bg-panel hover:text-ink"
                }`}
              >
                <Icon name={item.icon} className={`h-[18px] w-[18px] ${item.href === "/record" ? "text-rec" : active ? "text-accent" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-1 pt-3 text-xs text-faint">
          <span className="truncate" title={email}>
            {email}
          </span>
          {ai && <AiSelect ai={ai} />}
          <Link href="/settings" className="rounded p-1 hover:text-ink" title="Configurações" aria-label="Configurações">
            <Icon name="gear" className="h-4 w-4" />
          </Link>
          <form action="/auth/signout" method="post">
            <button className="rounded p-1 hover:text-ink" title="Sair" aria-label="Sair">
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* ---------------- Conteúdo ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo (celular) */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/95 px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          {TOP.has(path) ? (
            <Link href="/" className="shrink-0" aria-label="Knoweb, início">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" className="h-7 w-7" />
            </Link>
          ) : (
            <BackButton path={path} className="-ml-1 h-8 w-8 justify-center" />
          )}
          <form onSubmit={search} className="min-w-0 flex-1">
            <label className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-sm">
              <Icon name="search" className="h-4 w-4 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar"
                className="w-full bg-transparent text-ink placeholder:text-faint focus:outline-none"
              />
            </label>
          </form>
          {ai && <AiSelect ai={ai} />}
          <NewNoteButton label="" className="px-2.5" />
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 md:px-10 md:pb-12 md:pt-8">
          <BackButton path={path} className="mb-3 hidden md:flex" />
          {children}
        </main>
      </div>

      {/* ---------------- Navegação inferior (celular) ---------------- */}
      <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_NAV.map((href) => {
            const item = NAV.find((n) => n.href === href)!;
            const active = isActive(path, href);
            if (href === "/record") {
              return (
                <Link key={href} href={href} className="press flex flex-col items-center justify-center py-1.5" aria-label="Gravar">
                  <span className="-mt-6 flex h-15 w-15 items-center justify-center rounded-full bg-rec text-white shadow-lg shadow-rec/30 ring-4 ring-bg">
                    <Icon name="mic" className="h-6 w-6" />
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`press flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "font-semibold text-ink" : "text-faint"}`}
              >
                <Icon name={item.icon} className={`h-5 w-5 ${active ? "text-accent" : ""}`} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => more.current?.showModal()}
            aria-haspopup="dialog"
            className={`press flex flex-col items-center gap-0.5 py-2 text-xs ${inMore ? "font-semibold text-ink" : "text-faint"}`}
          >
            <Icon name="more" className={`h-5 w-5 ${inMore ? "text-accent" : ""}`} />
            Mais
          </button>
        </div>
      </nav>

      {/* ---------------- Gaveta "Mais" (celular) ---------------- */}
      <dialog
        ref={more}
        onClick={(e) => e.target === more.current && more.current?.close()}
        aria-label="Mais seções"
        className="sheet mt-auto mb-0 w-full max-w-none rounded-t-2xl border-t border-line bg-surface p-0 text-ink backdrop:bg-black/40 md:hidden"
      >
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
          <nav className="grid grid-cols-3 gap-2">
            {MORE.map((item) => {
              const active = isActive(path, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`press flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm ${
                    active ? "border-accent bg-panel font-semibold text-ink" : "border-line bg-panel text-muted"
                  }`}
                >
                  <Icon name={item.icon} className={`h-6 w-6 ${active ? "text-accent" : ""}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-sm text-faint">
            <span className="truncate">{email}</span>
            <form action="/auth/signout" method="post">
              <button className="press flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted hover:text-ink">
                <Icon name="logout" className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  );
}
