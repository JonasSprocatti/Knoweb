"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphLink, GraphNode } from "@/lib/types";

// O canvas do grafo só existe no navegador
const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), { ssr: false });

type SimNode = GraphNode & { x?: number; y?: number };
type SimLink = Omit<GraphLink, "source" | "target"> & { source: string | SimNode; target: string | SimNode };

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const idOf = (end: string | SimNode) => (typeof end === "string" ? end : end.id);

export function GraphView() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [raw, setRaw] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTopics, setShowTopics] = useState(true);
  const [showAi, setShowAi] = useState(true);
  const [hideOrphans, setHideOrphans] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [colors, setColors] = useState({ note: "#ece6dc", recording: "#f0584d", topic: "#6cc3b5", link: "#3a352d", accent: "#e0a64f", text: "#ece6dc", bg: "#14120f" });

  useEffect(() => {
    setColors({
      note: cssVar("--muted", "#b3aa9c"),
      recording: cssVar("--rec", "#f0584d"),
      topic: cssVar("--topic", "#6cc3b5"),
      link: cssVar("--line", "#2f2b24"),
      accent: cssVar("--accent", "#e0a64f"),
      text: cssVar("--ink", "#ece6dc"),
      bg: cssVar("--bg", "#14120f"),
    });
    fetch("/api/graph")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar a teia"))))
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

  const data = useMemo(() => {
    if (!raw) return { nodes: [] as SimNode[], links: [] as SimLink[] };
    let links = raw.links.filter((l) => (showTopics || l.kind !== "topic") && (showAi || l.kind !== "ai"));
    let nodes = raw.nodes.filter((n) => showTopics || n.type !== "topic");
    const ids = new Set(nodes.map((n) => n.id));
    links = links.filter((l) => ids.has(l.source) && ids.has(l.target));
    if (hideOrphans) {
      const connected = new Set(links.flatMap((l) => [l.source, l.target]));
      nodes = nodes.filter((n) => connected.has(n.id));
    }
    // cópias: a simulação muta os objetos
    return { nodes: nodes.map((n) => ({ ...n })) as SimNode[], links: links.map((l) => ({ ...l })) as SimLink[] };
  }, [raw, showTopics, showAi, hideOrphans]);

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
      if (!q) return;
      const node = data.nodes.find((n) => n.label.toLowerCase().includes(q));
      if (node && node.x != null && node.y != null && fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 600);
        fgRef.current.zoom(3, 600);
        setHover(node.id);
      }
    },
    [data],
  );

  const isLit = (id: string) => !hover || hover === id || neighbors.get(hover)?.has(id);

  return (
    <div className="-mx-4 -mb-28 -mt-5 flex h-[calc(100dvh-7.5rem)] flex-col md:-mx-8 md:-mb-10 md:-mt-8 md:h-dvh">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/80 px-4 py-2 text-xs backdrop-blur md:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            focusOn(find);
          }}
          className="flex-1 sm:flex-none"
        >
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Encontrar nó…"
            className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none sm:w-56"
          />
        </form>
        <Toggle on={showTopics} set={setShowTopics} label="Temas" />
        <Toggle on={showAi} set={setShowAi} label="Ligações do Claude" />
        <Toggle on={hideOrphans} set={setHideOrphans} label="Esconder soltos" />
        <span className="ml-auto hidden items-center gap-3 text-faint sm:flex">
          <Legend color={colors.note} label="nota" />
          <Legend color={colors.recording} label="gravação" />
          <Legend color={colors.topic} label="tema" />
        </span>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {error && <p className="p-6 text-sm text-rec">{error}</p>}
        {raw && raw.nodes.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
            A teia aparece aqui conforme você cria notas e o Claude separa os temas.
          </p>
        )}
        {raw && raw.nodes.length > 0 && (
          <GraphCanvas
            fgRef={fgRef}
            width={size.w}
            height={size.h}
            graphData={data}
            backgroundColor={colors.bg}
            nodeId="id"
            cooldownTicks={120}
            linkColor={(l: SimLink) => {
              const lit = !hover || idOf(l.source) === hover || idOf(l.target) === hover;
              const base = l.kind === "wikilink" ? colors.accent : l.kind === "ai" ? colors.topic : colors.link;
              return lit ? base : `${colors.link}55`;
            }}
            linkWidth={(l: SimLink) => (l.kind === "wikilink" ? 1.6 : 0.8)}
            linkLineDash={(l: SimLink) => (l.kind === "ai" ? [3, 3] : null)}
            nodeVal={(n: SimNode) => (n.type === "topic" ? 3 + n.weight : 1 + n.weight * 0.6)}
            nodeLabel={(n: SimNode) => n.label}
            onNodeHover={(n: SimNode | null) => setHover(n ? n.id : null)}
            onNodeClick={(n: SimNode) => {
              if (n.type === "topic") {
                if (n.slug) router.push(`/topics/${n.slug}`);
              } else router.push(`/notes/${n.id}`);
            }}
            nodeCanvasObject={(node: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
              const r = node.type === "topic" ? 4 + Math.sqrt(node.weight) * 1.6 : 2.5 + Math.sqrt(node.weight);
              const lit = isLit(node.id);
              const color = node.type === "topic" ? colors.topic : node.type === "recording" ? colors.recording : colors.note;
              ctx.globalAlpha = lit ? 1 : 0.15;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              if (hover === node.id) {
                ctx.lineWidth = 1.5 / scale;
                ctx.strokeStyle = colors.accent;
                ctx.stroke();
              }
              const showLabel = node.type === "topic" ? scale > 0.6 : scale > 1.6 || hover === node.id || (hover && lit);
              if (showLabel) {
                const fontSize = (node.type === "topic" ? 13 : 11) / scale;
                ctx.font = `${node.type === "topic" ? 600 : 400} ${fontSize}px Inter, sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = node.type === "topic" ? colors.topic : colors.text;
                const label = node.label.length > 40 ? `${node.label.slice(0, 38)}…` : node.label;
                ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + r + 2 / scale);
              }
              ctx.globalAlpha = 1;
            }}
            nodePointerAreaPaint={(node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
              const r = node.type === "topic" ? 8 + Math.sqrt(node.weight) * 1.6 : 6 + Math.sqrt(node.weight);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
              ctx.fill();
            }}
          />
        )}
      </div>
    </div>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => set(!on)}
      className={`rounded-full border px-2.5 py-1 transition ${on ? "border-accent bg-accent/10 text-accent" : "border-line text-muted"}`}
    >
      {label}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
