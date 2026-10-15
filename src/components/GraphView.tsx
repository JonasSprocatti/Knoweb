"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { THEME_LIST, themeFor, type SimLink, type SimNode, type ThemeId } from "@/lib/graphThemes";
import type { GraphLink, GraphNode } from "@/lib/types";

// O canvas do grafo só existe no navegador; o 3D (three.js) só carrega quando é ligado
const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), { ssr: false });
const GraphCanvas3D = dynamic(() => import("@/components/GraphCanvas3D"), { ssr: false });

const idOf = (end: string | SimNode) => (typeof end === "string" ? end : end.id);
const radius = (n: SimNode) => (n.type === "topic" ? 4.5 + Math.sqrt(n.weight) * 1.7 : 2.6 + Math.sqrt(n.weight)) * (n.image ? 1.5 : 1);
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });

/** Preferência guardada só neste navegador; se o armazenamento falhar, vale o padrão. */
function usePref<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved != null) setValue(JSON.parse(saved));
    } catch {
      /* sem armazenamento */
    }
  }, [key]);
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* sem armazenamento */
    }
  };
  return [value, set] as const;
}

export function GraphView() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [raw, setRaw] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [themeId, setThemeId] = usePref<ThemeId>("teia:visual", "executivo");
  const [threeD, setThreeD] = usePref("teia:3d", false);
  const [clouds, setClouds] = usePref("teia:nuvens", false);
  const [showTopics, setShowTopics] = useState(true);
  const [showAi, setShowAi] = useState(true);
  const [hideOrphans, setHideOrphans] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [step, setStep] = useState<number | null>(null); // linha do tempo: null = tudo
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [font, setFont] = useState("sans-serif");
  const [, setImagesLoaded] = useState(0);
  const nodeCache = useRef(new Map<string, SimNode>());
  const images = useRef(new Map<string, HTMLImageElement>());

  const [dark, setDark] = useState(false);
  const theme = useMemo(() => themeFor(themeId, dark), [themeId, dark]);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    setFont(getComputedStyle(document.body).fontFamily || "sans-serif");
    fetch("/api/graph")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Não deu para carregar a teia. Recarregue a página."))))
      .then(setRaw)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Imagens dos pontos: carrega uma vez e redesenha quando chegam
  useEffect(() => {
    for (const n of raw?.nodes ?? []) {
      if (!n.image || images.current.has(n.image)) continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => setImagesLoaded((x) => x + 1);
      img.src = n.image;
      images.current.set(n.image, img);
    }
  }, [raw]);

  // Linha do tempo: cada passo é o momento em que um ponto nasceu
  const times = useMemo(() => [...new Set((raw?.nodes ?? []).map((n) => n.created_at))].sort(), [raw]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setStep((s) => {
        const next = (s ?? -1) + Math.max(1, Math.ceil(times.length / 80));
        if (next >= times.length - 1) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 110);
    return () => clearInterval(timer);
  }, [playing, times.length]);

  const data = useMemo(() => {
    if (!raw) return { nodes: [] as SimNode[], links: [] as SimLink[] };
    const cutoff = step == null ? null : times[step];
    let nodes = raw.nodes.filter((n) => (showTopics || n.type !== "topic") && (!cutoff || n.created_at <= cutoff));
    const ids = new Set(nodes.map((n) => n.id));
    const links = raw.links.filter(
      (l) => (showTopics || l.kind !== "topic") && (showAi || l.kind !== "ai") && ids.has(l.source) && ids.has(l.target),
    );
    if (hideOrphans) {
      const connected = new Set(links.flatMap((l) => [l.source, l.target]));
      nodes = nodes.filter((n) => connected.has(n.id));
    }
    // Reaproveita os objetos: a simulação guarda a posição neles, então a teia não se embaralha a cada filtro
    const cache = nodeCache.current;
    return {
      nodes: nodes.map((n) => {
        const cached = cache.get(n.id);
        if (cached) return Object.assign(cached, n);
        const fresh = { ...n } as SimNode;
        cache.set(n.id, fresh);
        return fresh;
      }),
      links: links.map((l) => ({ ...l })) as SimLink[],
    };
  }, [raw, showTopics, showAi, hideOrphans, step, times]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of data.links) {
      const a = idOf(l.source);
      const b = idOf(l.target);
      if (!map.has(a)) map.set(a, new Set());
      if (!map.has(b)) map.set(b, new Set());
      map.get(a)!.add(b);
      map.get(b)!.add(a);
    }
    return map;
  }, [data]);

  const focusOn = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q || !fgRef.current) return;
      const node = data.nodes.find((n) => n.label.toLowerCase().includes(q)) as (SimNode & { z?: number }) | undefined;
      if (!node || node.x == null || node.y == null) return;
      if (threeD) {
        fgRef.current.cameraPosition({ x: node.x, y: node.y, z: (node.z ?? 0) + 120 }, node, 900);
      } else {
        fgRef.current.centerAt(node.x, node.y, 600);
        fgRef.current.zoom(3, 600);
      }
      setHover(node.id);
    },
    [data, threeD],
  );

  const isLit = (id: string) => !hover || hover === id || !!neighbors.get(hover)?.has(id);
  const openNode = (n: SimNode) => {
    if (n.type === "topic") {
      if (n.slug) router.push(`/topics/${n.slug}`);
    } else router.push(`/notes/${n.id}`);
  };
  const tooltip = (n: SimNode) => escapeHtml(n.emoji ? `${n.emoji} ${n.label}` : n.label);
  const particles = (l: SimLink) => (reduced ? 0 : theme.particles(l));

  return (
    <div className="-mx-4 -mb-28 -mt-5 flex h-[calc(100dvh-7.5rem)] flex-col md:-mx-8 md:-mb-10 md:-mt-8 md:h-dvh">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-2 text-sm [scrollbar-width:none] md:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            focusOn(find);
          }}
          className="shrink-0"
        >
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Achar um ponto"
            aria-label="Achar um ponto na teia"
            className="w-36 rounded-md border border-line bg-panel px-3 py-1.5 text-ink placeholder:text-faint focus:border-accent focus:outline-none sm:w-48"
          />
        </form>

        <div role="radiogroup" aria-label="Visual da teia" className="flex shrink-0 gap-0.5 rounded-md border border-line bg-panel p-0.5">
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={themeId === t.id}
              onClick={() => setThemeId(t.id)}
              className={`rounded px-2.5 py-1 transition ${themeId === t.id ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink"}`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
        <Toggle on={threeD} set={setThreeD} label="3D" />
        <Toggle on={clouds} set={setClouds} label="Nuvens" />
        <Toggle on={showTopics} set={setShowTopics} label="Temas" />
        <Toggle on={showAi} set={setShowAi} label="Ligações do Claude" />
        <Toggle on={hideOrphans} set={setHideOrphans} label="Esconder soltos" />
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1" style={{ background: theme.bg }}>
        {error && <p className="p-6 text-sm text-rec">{error}</p>}
        {raw && raw.nodes.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
            Grave uma conversa ou escreva uma nota. Cada uma vira um ponto aqui, ligado aos temas que o Claude encontrar.
          </p>
        )}

        {raw && raw.nodes.length > 0 && threeD && (
          <GraphCanvas3D
            fgRef={fgRef}
            width={size.w}
            height={size.h}
            graphData={data}
            backgroundColor={theme.bg}
            nodeId="id"
            nodeLabel={tooltip}
            nodeColor={(n: SimNode) => n.color}
            nodeVal={(n: SimNode) => (n.type === "topic" ? 4 + n.weight : 1 + n.weight * 0.5)}
            nodeOpacity={0.95}
            nodeResolution={16}
            linkColor={(l: SimLink) => theme.linkColor(l, true)}
            linkOpacity={0.45}
            linkDirectionalParticles={particles}
            linkDirectionalParticleColor={theme.particleColor}
            linkDirectionalParticleWidth={1.6}
            onNodeClick={openNode}
          />
        )}

        {raw && raw.nodes.length > 0 && !threeD && (
          <GraphCanvas
            fgRef={fgRef}
            width={size.w}
            height={size.h}
            graphData={data}
            backgroundColor={theme.bg}
            nodeId="id"
            cooldownTicks={140}
            autoPauseRedraw={!(theme.animated && !reduced)}
            linkCurvature={theme.curvature}
            linkColor={(l: SimLink) => theme.linkColor(l, !hover || idOf(l.source) === hover || idOf(l.target) === hover)}
            linkWidth={theme.linkWidth}
            linkLineDash={(l: SimLink) => (l.kind === "ai" ? [3, 3] : null)}
            linkDirectionalParticles={particles}
            linkDirectionalParticleColor={theme.particleColor}
            linkDirectionalParticleWidth={1.8}
            linkDirectionalParticleSpeed={0.004}
            nodeVal={(n: SimNode) => (n.type === "topic" ? 3 + n.weight : 1 + n.weight * 0.6)}
            nodeLabel={tooltip}
            onNodeHover={(n: SimNode | null) => setHover(n ? n.id : null)}
            onNodeClick={openNode}
            onRenderFramePre={(ctx: CanvasRenderingContext2D, scale: number) => {
              const t = reduced ? 0 : performance.now();
              theme.backdrop(ctx, t, scale);
              if (!clouds) return;
              // Nuvem na cor do tema em volta de cada ponto: grupos do mesmo tema viram nebulosas
              ctx.save();
              ctx.globalCompositeOperation = "lighter";
              for (const n of data.nodes) {
                if (n.x == null || n.y == null) continue;
                const r = n.type === "topic" ? 90 : 48;
                const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
                g.addColorStop(0, `${n.color}1f`);
                g.addColorStop(1, `${n.color}00`);
                ctx.fillStyle = g;
                ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2);
              }
              ctx.restore();
            }}
            nodeCanvasObject={(node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
              const r = radius(node);
              const lit = isLit(node.id);
              const x = node.x ?? 0;
              const y = node.y ?? 0;
              ctx.save();
              theme.node(ctx, node, { r, lit, hovered: hover === node.id, scale, t: reduced ? 0 : performance.now(), font });

              const img = node.image ? images.current.get(node.image) : undefined;
              if (img?.complete && img.naturalWidth) {
                const side = Math.min(img.naturalWidth, img.naturalHeight);
                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, x - r, y - r, r * 2, r * 2);
                ctx.restore();
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.strokeStyle = node.color;
                ctx.lineWidth = Math.max(1, r * 0.12);
                ctx.stroke();
              } else if (node.type === "topic" && node.emoji && !theme.topicIsLabel) {
                ctx.font = `${r * 1.1}px ${font}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(node.emoji, x, y + r * 0.05);
              }

              if (hover === node.id) {
                ctx.beginPath();
                ctx.arc(x, y, r + 2.5 / scale, 0, Math.PI * 2);
                ctx.strokeStyle = theme.label;
                ctx.lineWidth = 1.2 / scale;
                ctx.stroke();
              }

              const isTopicLabel = node.type === "topic" && theme.topicIsLabel;
              const showLabel = !isTopicLabel && (node.type === "topic" ? scale > 0.6 : scale > 1.6 || hover === node.id || (hover && lit));
              if (showLabel) {
                const fontSize = (node.type === "topic" ? 13 : 11) / scale;
                ctx.font = `${node.type === "topic" ? 650 : 450} ${fontSize}px ${font}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = node.type === "topic" ? node.color : theme.label;
                const label = node.label.length > 40 ? `${node.label.slice(0, 38)}…` : node.label;
                ctx.fillText(label, x, y + r + 3 / scale);
              }
              ctx.restore();
            }}
            nodePointerAreaPaint={(node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, radius(node) + 4, 0, 2 * Math.PI);
              ctx.fill();
            }}
          />
        )}

        {times.length > 1 && (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-md border border-line bg-panel/95 px-3 py-2 text-sm text-ink backdrop-blur md:inset-x-auto md:left-6 md:w-[28rem]">
            <button
              onClick={() => {
                if (playing) return setPlaying(false);
                setStep(0);
                setPlaying(true);
              }}
              className="shrink-0 rounded-md bg-surface px-3 py-1 hover:bg-line"
            >
              {playing ? "Parar" : "Ver crescer"}
            </button>
            <input
              type="range"
              min={0}
              max={times.length - 1}
              value={step ?? times.length - 1}
              onChange={(e) => {
                setPlaying(false);
                const v = Number(e.target.value);
                setStep(v >= times.length - 1 ? null : v);
              }}
              aria-label="Linha do tempo da teia"
              className="min-w-0 flex-1 accent-accent"
            />
            <span className="shrink-0 tabular-nums text-muted">{step == null ? "hoje" : dayLabel(times[step])}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => set(!on)}
      aria-pressed={on}
      className={`shrink-0 rounded-md border px-3 py-1 transition ${on ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );
}
