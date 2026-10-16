"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Só e-mail e senha. Não há "criar conta" nem link por e-mail: o app é de uma
 * pessoa só, contas novas são criadas no painel do Supabase (e os cadastros
 * ficam desligados lá).
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const field = "rounded-md border border-line bg-panel px-3.5 py-2.5 text-ink placeholder:text-faint focus:border-accent focus:outline-none";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="mb-4 h-10 w-10" />
          <h1 className="display text-3xl">Entrar no Knoweb</h1>
          <p className="mt-2 text-muted">Grave, escreva e deixe o Claude ligar os pontos.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" aria-label="E-mail" className={field} />
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" aria-label="Senha" className={field} />
          <button disabled={busy} className="press mt-2 rounded-md bg-accent px-3 py-2.5 font-medium text-on-accent transition hover:brightness-110 disabled:opacity-60">
            {busy ? "Entrando…" : "Entrar"}
          </button>
          {error && <p className="text-sm text-rec">{error}</p>}
        </form>
      </div>
    </main>
  );
}
