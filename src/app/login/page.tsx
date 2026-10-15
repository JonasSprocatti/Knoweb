"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "magic";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = supabaseBrowser();
    const redirect = `${window.location.origin}/auth/callback`;
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
          return;
        }
        setMessage({ kind: "ok", text: "Conta criada. Confirme pelo link que chegou no seu e-mail." });
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        setMessage({ kind: "ok", text: "Enviamos um link de acesso para o seu e-mail." });
      }
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="display flex items-start gap-1 text-7xl">
            knoweb<span className="text-3xl text-accent">✦</span>
          </h1>
          <p className="mt-3 text-lg text-muted">Grave, escreva e deixe o Claude ligar os pontos.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="mb-2 grid grid-cols-3 gap-1 rounded-full bg-panel p-1 text-sm">
            {(
              [
                ["signin", "Entrar"],
                ["signup", "Criar conta"],
                ["magic", "Link por e-mail"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full px-2 py-1.5 transition ${mode === m ? "bg-ink font-semibold text-bg" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="rounded-2xl bg-panel px-4 py-3 text-lg text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {mode !== "magic" && (
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="rounded-2xl bg-panel px-4 py-3 text-lg text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
            />
          )}

          <button
            disabled={busy}
            className="mt-2 rounded-full bg-accent px-3 py-3 text-lg font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
          </button>

          {message && (
            <p className={`text-sm ${message.kind === "ok" ? "text-topic" : "text-rec"}`}>{message.text}</p>
          )}
        </form>
      </div>
    </main>
  );
}
