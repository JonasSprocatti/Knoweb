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

export function Shell({ email, children }: { email: string; children: React.ReactNode }) {
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
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <Link href="/" className="mb-5 flex items-center gap-2 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight">Knoweb</span>
        </Link>

        <form onSubmit={search} className="mb-3">
          <label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm focus-within:border-accent">
            <Icon name="search" className="h-4 w-4 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="w-full bg-transparent text-ink placeholder:text-faint focus:outline-none"
            />
          </label>
        </form>

        <NewNoteButton className="mb-4 justify-center" />

        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition ${
                isActive(path, item.href) ? "bg-panel font-medium text-ink shadow-sm" : "text-muted hover:bg-panel/60 hover:text-ink"
              }`}
            >
              <Icon name={item.icon} className={`h-[18px] w-[18px] ${item.href === "/record" ? "text-rec" : ""}`} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-2 pt-3 text-xs text-faint">
          <span className="truncate" title={email}>
            {email}
          </span>
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
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/90 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <Link href="/" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="Knoweb" className="h-7 w-7" />
          </Link>
          <form onSubmit={search} className="flex-1">
            <label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm">
              <Icon name="search" className="h-4 w-4 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar na teia…"
                className="w-full bg-transparent text-ink placeholder:text-faint focus:outline-none"
              />
            </label>
          </form>
          <NewNoteButton label="" className="px-2.5" />
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      {/* ---------------- Navegação inferior (celular) ---------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_NAV.map((href) => {
            const item = NAV.find((n) => n.href === href)!;
            const active = isActive(path, href);
            if (href === "/record") {
              return (
                <Link key={href} href={href} className="flex flex-col items-center justify-center py-1.5" aria-label="Gravar">
                  <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-rec text-white shadow-lg shadow-rec/30">
                    <Icon name="mic" className="h-6 w-6" />
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-accent" : "text-faint"}`}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
