"use client";

import { useEffect, useState } from "react";
import { applyPrefs, DEFAULT_PREFS, PREFS_KEY, type Prefs } from "@/lib/prefs";

const PALETTES: { id: Prefs["palette"]; name: string; colors: [string, string] }[] = [
  { id: "knoweb", name: "Knoweb", colors: ["#23877b", "#e0a64f"] },
  { id: "ambar", name: "Âmbar", colors: ["#a8691a", "#f0bd6e"] },
  { id: "cobalto", name: "Cobalto", colors: ["#2f5fb3", "#9db9f4"] },
  { id: "violeta", name: "Violeta", colors: ["#7046b0", "#c4b0f4"] },
  { id: "grafite", name: "Grafite", colors: ["#3a4048", "#6cc3b5"] },
];

/** Ajustes visuais deste aparelho: tema, paleta, tamanho do texto e animações. Mudam na hora. */
export function SettingsView() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") });
    } catch {
      /* sem armazenamento: fica o padrão */
    }
  }, []);

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* vale só até fechar */
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl md:text-4xl">Configurações</h1>
          <p className="mt-1 text-muted">Ajustes deste aparelho. Mudam na hora.</p>
        </div>
        {saved && (
          <span className="pop rounded-full bg-[#2F9D6B]/15 px-3 py-1 text-sm font-medium text-[#2F9D6B]" role="status">
            ✓ Salvo
          </span>
        )}
      </header>

      <Section title="Tema">
        <Choices
          value={prefs.theme}
          onChange={(theme) => update({ theme })}
          options={[
            ["auto", "Automático", "Segue o sistema"],
            ["light", "Claro", ""],
            ["dark", "Escuro", ""],
          ]}
        />
      </Section>

      <Section title="Paleta de cores" hint="A logo não muda; a paleta pinta botões, destaques e links.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => update({ palette: p.id })}
              aria-pressed={prefs.palette === p.id}
              className={`press flex flex-col items-center gap-2 rounded-xl border p-3 text-sm ${
                prefs.palette === p.id ? "border-accent bg-accent/10 font-semibold text-ink ring-2 ring-accent/30" : "border-line bg-panel text-muted hover:border-accent/50"
              }`}
            >
              <span className="flex">
                <span className="h-7 w-7 rounded-full ring-2 ring-panel" style={{ background: p.colors[0] }} />
                <span className="-ml-2 h-7 w-7 rounded-full ring-2 ring-panel" style={{ background: p.colors[1] }} />
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Tamanho do texto">
        <Choices
          value={prefs.size}
          onChange={(size) => update({ size })}
          options={[
            ["normal", "Normal", ""],
            ["grande", "Grande", "Mais fácil de ler no celular"],
          ]}
        />
      </Section>

      <Section title="Animações">
        <Choices
          value={prefs.motion}
          onChange={(motion) => update({ motion })}
          options={[
            ["auto", "Ligadas", "Transições suaves entre telas"],
            ["reduce", "Reduzidas", "Sem movimento"],
          ]}
        />
      </Section>

      <Notifications />

      <section className="rounded-lg border border-line bg-panel p-4">
        <p className="mb-3 text-sm text-muted">Prévia</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent">Botão principal</button>
          <span className="rounded-full border border-accent/50 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">Etiqueta</span>
          <a className="text-link underline underline-offset-2">Um link</a>
        </div>
      </section>
    </div>
  );
}

const isNativeApp = () => typeof window !== "undefined" && "Capacitor" in window;
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const vapidBytes = (b64: string) => Uint8Array.from(atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** Resumo diário (vencidas, perto do prazo, sprints, sugestões…) neste aparelho, via Web Push. */
function Notifications() {
  const [state, setState] = useState<"loading" | "native" | "unsupported" | "denied" | "off" | "on">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (isNativeApp()) return setState("native");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.getRegistration().then(async (reg) => setState((await reg?.pushManager.getSubscription()) ? "on" : "off"));
  }, []);

  async function turnOn() {
    setMsg("");
    if ((await Notification.requestPermission()) !== "granted") return setState("denied");
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(VAPID) });
      const res = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "O servidor recusou.");
      setState("on");
    } catch (e) {
      setMsg(`Não deu para ligar: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function turnOff() {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }

  async function test() {
    setMsg("Enviando…");
    const res = await fetch("/api/notifications", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Enviado para ${j.sent} aparelho${j.sent === 1 ? "" : "s"}.` : `Falhou: ${j.error ?? res.status}`);
  }

  const hint = {
    loading: "",
    native: "No app Android o resumo já vem ligado e chega por volta das 8h. Para silenciar, desligue o canal “Resumo diário” nas configurações do Android.",
    unsupported: "Este navegador não recebe notificações. No iPhone, adicione o Knoweb à tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.",
    denied: "As notificações estão bloqueadas para este site. Libere nas configurações do navegador e volte aqui.",
    off: "Uma vez por dia, de manhã: tarefas vencidas e perto do prazo, sprints e projetos terminando, trabalho parado, sugestões do Claude e gravações com erro.",
    on: "Ligado neste aparelho. O resumo chega por volta das 8h, só quando há algo pendente.",
  }[state];

  return (
    <Section title="Notificações" hint={hint}>
      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap items-center gap-2">
          {state === "off" ? (
            <button onClick={turnOn} className="press rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent">
              Ligar neste aparelho
            </button>
          ) : (
            <>
              <button onClick={test} className="press rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent">
                Mandar resumo agora
              </button>
              <button onClick={turnOff} className="press rounded-md border border-line px-4 py-1.5 text-sm text-muted hover:text-ink">
                Desligar neste aparelho
              </button>
            </>
          )}
        </div>
      )}
      {msg && (
        <p className="text-sm text-muted" role="status">
          {msg}
        </p>
      )}
    </Section>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="-mt-1 text-sm text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function Choices<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string, string][] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([id, label, hint]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={`press min-w-28 rounded-lg border px-4 py-2 text-left text-sm ${
            value === id ? "border-accent bg-accent/10 font-semibold text-ink" : "border-line bg-panel text-muted hover:border-accent/50"
          }`}
        >
          {label}
          {hint && <span className="block text-xs font-normal text-faint">{hint}</span>}
        </button>
      ))}
    </div>
  );
}
