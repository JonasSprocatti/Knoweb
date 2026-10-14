"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Icon } from "@/components/Icon";

type Msg = { role: "user" | "assistant"; content: string; sources?: { id: string; title: string }[] };

const EXAMPLES = [
  "Quais tarefas ficaram pendentes nas últimas reuniões?",
  "O que já foi decidido sobre a integração com o SAP?",
  "Resuma as ideias que tive esta semana.",
  "Quem falou sobre prazos e o que foi combinado?",
];

/** "Perguntar à teia": chat com o Claude usando as suas notas como fonte. */
export function AskView({ initialQuestion }: { initialQuestion: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Falha ao perguntar." }));
        throw new Error(err.error);
      }
      let sources: Msg["sources"] = [];
      try {
        sources = JSON.parse(decodeURIComponent(res.headers.get("X-Sources") ?? "[]"));
      } catch {
        /* sem fontes */
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: text, sources }]);
      }
    } catch (err) {
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: `**Erro:** ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-3xl flex-col">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Icon name="sparkle" className="h-6 w-6 text-accent" /> Perguntar à teia
        </h1>
        <p className="text-sm text-muted">O Claude responde usando só as suas notas e transcrições, e cita de onde tirou.</p>
      </header>

      <div className="flex flex-1 flex-col gap-5">
        {messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => ask(ex)}
                className="rounded-xl border border-line bg-panel p-3 text-left text-sm text-muted transition hover:border-accent hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="self-end rounded-2xl rounded-br-md bg-accent/15 px-4 py-2.5 text-ink">
              {m.content}
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-2">
              {m.content ? (
                <Markdown>{m.content}</Markdown>
              ) : (
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Procurando nas suas notas…
                </span>
              )}
              {m.sources && m.sources.length > 0 && m.content && (
                <details className="text-xs text-faint">
                  <summary className="cursor-pointer select-none">Notas consultadas ({m.sources.length})</summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.sources.map((s) => (
                      <Link key={s.id} href={`/notes/${s.id}`} className="rounded-full border border-line px-2 py-0.5 hover:border-accent hover:text-ink">
                        {s.title}
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-24 mt-6 flex items-end gap-2 rounded-2xl border border-line bg-panel p-2 shadow-lg md:bottom-4"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          placeholder="Pergunte algo sobre o que você gravou ou anotou…"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-ink placeholder:text-faint focus:outline-none"
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-on-accent transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
