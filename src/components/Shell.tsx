"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { NewNoteButton } from "@/components/NewNoteButton";

const NAV = [
  { href: "/", label: "Início", icon: "home" },
  { href: "/record", label: "Gravar", icon: "mic" },
  { href: "/notes", label: "Notas", icon: "notes" },
  { href: "/topics", label: "Temas", icon: "tag" },
  { href: "/graph", label: "Teia", icon: "graph" },
  { href: "/ask", label: "Perguntar", icon: "ask" },
];

const MOBILE_NAV = ["/", "/notes", "/record", "/graph", "/ask"];

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

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="flex min-h-dvh">
      {/* ---------------- Barra lateral (desktop) ---------------- */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col px-5 py-7 md:flex">
        <Link href="/" className="display mb-8 flex items-start gap-1 text-5xl text-ink">
          knoweb
          <span className="text-2xl text-accent" aria-hidden>
            ✦
          </span>
        </Link>

        <form onSubmit={search} className="mb-3">
          <label className="flex items-center gap-2 rounded-full bg-panel px-3.5 py-2 focus-within:ring-2 focus-within:ring-accent">
            <Icon name="search" className="h-4 w-4 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nas notas"
              className="w-full bg-transparent text-ink placeholder:text-faint focus:outline-none"
            />
          </label>
        </form>

        <NewNoteButton className="mb-8 justify-center" />

        <nav className="flex flex-col gap-1 text-lg">
          {NAV.map((item) => {
            const active = isActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 py-1 transition ${active ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}
              >
                <span className={`w-4 text-center text-sm ${item.href === "/record" ? "text-rec" : "text-accent"}`} aria-hidden>
                  {active ? "✦" : item.href === "/record" ? "●" : ""}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm text-faint">
          <span className="truncate" title={email}>
            {email}
          </span>
          {ai && <AiSelect ai={ai} />}
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
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-bg/90 px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <Link href="/" className="display shrink-0 text-3xl text-ink" aria-label="Knoweb, início">
            kw<span className="text-accent">✦</span>
          </Link>
          <form onSubmit={search} className="min-w-0 flex-1">
            <label className="flex items-center gap-2 rounded-full bg-panel px-3 py-1.5">
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

        <main className="flex-1 px-4 pb-28 pt-5 md:px-10 md:pb-12 md:pt-10">{children}</main>
      </div>

      {/* ---------------- Navegação inferior (celular) ---------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_NAV.map((href) => {
            const item = NAV.find((n) => n.href === href)!;
            const active = isActive(path, href);
            if (href === "/record") {
              return (
                <Link key={href} href={href} className="flex flex-col items-center justify-center py-1.5" aria-label="Gravar">
                  <span className="-mt-6 flex h-15 w-15 items-center justify-center rounded-full bg-rec text-white ring-4 ring-bg">
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
                className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "font-semibold text-ink" : "text-faint"}`}
              >
                <Icon name={item.icon} className={`h-5 w-5 ${active ? "text-accent" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
