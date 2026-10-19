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
const isHub = (n: SimNode) => n.type === "topic" || n.type === "project" || n.type === "company" || n.type === "system";
type NodeType = GraphNode["type"];
const TYPES: { type: NodeType; label: string }[] = [
  { type: "note", label: "Notas" },
  { type: "recording", label: "Gravações" },
  { type: "topic", label: "Temas" },
  { type: "project", label: "Projetos" },
  { type: "task", label: "Tarefas" },
  { type: "person", label: "Pessoas" },
  { type: "sprint", label: "Sprints" },
  { type: "company", label: "Empresas" },
  { type: "system", label: "Sistemas" },
];
const ALL_TYPES = TYPES.map((t) => t.type);
// Ao focar num projeto, a busca segue por tarefas e notas, mas não atravessa temas, pessoas e sprints
// (eles ligam tudo a tudo e trariam a teia inteira de volta)
const PASS_THROUGH = new Set<NodeType>(["task", "note", "recording"]);
const radius = (n: SimNode) => (isHub(n) ? 4.5 + Math.sqrt(n.weight) * 1.7 : 2.6 + Math.sqrt(n.weight)) * (n.image ? 1.5 : 1);
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
  const [types, setTypes] = usePref<NodeType[]>("teia:tipos", ALL_TYPES);
  const [focus, setFocus] = useState(""); // id do projeto em foco ("p:…") ou "" para tudo
  const [panel, setPanel] = useState(false);
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
    const shown = new Set(types);
    // Projeto em foco: ele, as tarefas e notas dele e o que está ligado a elas (2 passos)
    let around: Set<string> | null = null;
    if (focus) {
      const typeOf = new Map(raw.nodes.map((n) => [n.id, n.type]));
      const adj = new Map<string, string[]>();
      for (const l of raw.links) {
        adj.set(l.source, [...(adj.get(l.source) ?? []), l.target]);
        adj.set(l.target, [...(adj.get(l.target) ?? []), l.source]);
      }
      around = new Set([focus]);
      let frontier = [focus];
      for (let depth = 0; depth < 2; depth++) {
        const next: string[] = [];
        for (const id of frontier) {
          if (id !== focus && !PASS_THROUGH.has(typeOf.get(id)!)) continue;
          for (const nb of adj.get(id) ?? []) {
            if (typeOf.get(nb) === "project" || around.has(nb)) continue;
            around.add(nb);
            next.push(nb);
          }
        }
        frontier = next;
      }
    }
    let nodes = raw.nodes.filter(
      (n) => (shown.has(n.type) || n.id === focus) && (!around || around.has(n.id)) && (!cutoff || n.created_at <= cutoff),
    );
    const ids = new Set(nodes.map((n) => n.id));
    const links = raw.links.filter((l) => (showAi || l.kind !== "ai") && ids.has(l.source) && ids.has(l.target));
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
  }, [raw, types, focus, showAi, hideOrphans, step, times]);

  const projects = useMemo(
    () => (raw?.nodes ?? []).filter((n) => n.type === "project").sort((a, b) => a.label.localeCompare(b.label)),
    [raw],
  );
  // Ao trocar o foco, enquadra o que sobrou depois que a simulação assentar
  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit?.(600, 60), 900);
    return () => clearTimeout(t);
  }, [focus, types]);
  const toggleType = (t: NodeType) => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
  const filtered = types.length < ALL_TYPES.length || !!focus || hideOrphans || !showAi;

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

  // Só os 4 pontos principais têm nome visível de longe; o resto aparece ao aproximar ou passar o dedo
  const topHubs = useMemo(
    () => new Set(data.nodes.filter(isHub).sort((a, b) => b.weight - a.weight).slice(0, 4).map((n) => n.id)),
    [data],
  );
  const isLit = (id: string) => !hover || hover === id || !!neighbors.get(hover)?.has(id);
  const openNode = (n: SimNode) => {
    const taskId = n.id.slice(2);
    if (n.type === "topic") {
      if (n.slug) router.push(`/topics/${n.slug}`);
    } else if (n.type === "project") router.push(`/projects/${n.slug}`);
    else if (n.type === "person") router.push(`/people/${n.slug}`);
    else if (n.type === "task") router.push(`/tasks/${taskId}`);
    else if (n.type === "sprint") router.push(`/sprints/${taskId}`);
    else if (n.type === "company") router.push(`/companies/${n.slug}`);
    else if (n.type === "system") router.push(`/systems/${n.slug}`);
    else router.push(`/notes/${n.id}`);
  };
  const tooltip = (n: SimNode) => escapeHtml(n.emoji ? `${n.emoji} ${n.label}` : n.label);
  const particles = (l: SimLink) => (reduced ? 0 : theme.particles(l));

  return (
    <div className="-mx-4 -mb-28 -mt-5 flex h-[calc(100dvh-7.5rem)] flex-col md:-mx-8 md:-mb-10 md:-mt-8 md:h-dvh">
      <div className="relative z-10 border-b border-line bg-surface text-sm">
        <div className="flex items-center gap-2 px-4 py-2 md:px-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              focusOn(find);
            }}
            className="min-w-0 flex-1 sm:max-w-56 sm:flex-none"
          >
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Buscar ponto"
              aria-label="Achar um ponto na teia"
              className="w-full rounded-md border border-line bg-panel px-3 py-1.5 text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </form>
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            aria-label="Mostrar só um projeto"
            className={`min-w-0 max-w-[45%] rounded-md border px-2 py-1.5 sm:max-w-64 ${focus ? "border-accent bg-accent/10 text-accent" : "border-line bg-panel text-ink"}`}
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji ? `${p.emoji} ` : ""}
                {p.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setPanel(!panel)}
            aria-expanded={panel}
            className={`press relative shrink-0 rounded-md border px-3 py-1.5 ${panel ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:text-ink"}`}
          >
            Filtros
            {filtered && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface" aria-label="(com filtro)" />}
          </button>
        </div>

        {panel && (
          <div className="absolute inset-x-0 top-full flex flex-col gap-3 border-b border-line bg-surface px-4 py-3 shadow-lg md:px-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-faint">Mostrar</span>
              {TYPES.map((t) => (
                <Toggle key={t.type} on={types.includes(t.type)} set={() => toggleType(t.type)} label={t.label} />
              ))}
              <button onClick={() => setTypes(ALL_TYPES)} className="ml-1 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
                tudo
              </button>
              <button onClick={() => setTypes(["project", "task"])} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
                só trabalho
              </button>
              <button onClick={() => setTypes(["note", "recording", "topic"])} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
                só conhecimento
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-faint">Visual</span>
              <div role="radiogroup" aria-label="Visual da teia" className="flex flex-wrap gap-0.5 rounded-md border border-line bg-panel p-0.5">
                {THEME_LIST.map((t) => (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={theme.id === t.id}
                    onClick={() => setThemeId(t.id)}
                    className={`rounded px-2.5 py-1 transition ${theme.id === t.id ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-faint">Opções</span>
              <Toggle on={showAi} set={setShowAi} label="Ligações do Claude" />
              <Toggle on={hideOrphans} set={setHideOrphans} label="Esconder soltos" />
              <Toggle on={clouds} set={setClouds} label="Nuvens" />
              <Toggle on={threeD} set={setThreeD} label="3D" />
            </div>
          </div>
        )}
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1" style={{ background: theme.bg }}>
        {error && <p className="p-6 text-sm text-rec">{error}</p>}
        {raw && raw.nodes.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
            Grave uma conversa ou escreva uma nota. Cada uma vira um ponto aqui, ligado aos temas que o Claude encontrar.
          </p>
        )}

        {raw && raw.nodes.length > 0 && data.nodes.length === 0 && (
          <p className="absolute inset-0 z-[1] flex items-center justify-center p-6 text-center text-muted">
            Nada aparece com esses filtros. Abra <b className="mx-1 text-ink">Filtros</b> e marque mais tipos, ou volte para todos os projetos.
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
            nodeVal={(n: SimNode) => (isHub(n) ? 4 + n.weight : 1 + n.weight * 0.5)}
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
            linkLineDash={(l: SimLink) => (l.kind === "ai" || l.kind === "mention" ? [3, 3] : null)}
            linkDirectionalParticles={particles}
            linkDirectionalParticleColor={theme.particleColor}
            linkDirectionalParticleWidth={1.8}
            linkDirectionalParticleSpeed={0.004}
            nodeVal={(n: SimNode) => (isHub(n) ? 3 + n.weight : 1 + n.weight * 0.6)}
            nodeLabel={tooltip}
            onNodeHover={(n: SimNode | null) => setHover(n ? n.id : null)}
            onNodeClick={openNode}
            onRenderFramePre={(ctx: CanvasRenderingContext2D, scale: number) => {
              const t = reduced ? 0 : performance.now();
              theme.backdrop(ctx, t, scale, data.nodes);
              if (!clouds) return;
              // Nuvem na cor do tema em volta de cada ponto: grupos do mesmo tema viram nebulosas
              ctx.save();
              ctx.globalCompositeOperation = "lighter";
              for (const n of data.nodes) {
                if (n.x == null || n.y == null) continue;
                const r = isHub(n) ? 90 : 48;
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

              const own = !!theme.ownLabel?.(node);
              const img = node.image && !own ? images.current.get(node.image) : undefined;
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
              } else if (isHub(node) && node.emoji && !own) {
                ctx.font = `${r * 1.1}px ${font}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(node.emoji, x, y + r * 0.05);
              }

              if (hover === node.id && !own) {
                ctx.beginPath();
                ctx.arc(x, y, r + 2.5 / scale, 0, Math.PI * 2);
                ctx.strokeStyle = theme.label;
                ctx.lineWidth = 1.2 / scale;
                ctx.stroke();
              }

              const showLabel = !own && (isHub(node) ? scale > 1.5 || topHubs.has(node.id) || hover === node.id : scale > 1.6 || hover === node.id || (hover && lit));
              if (showLabel) {
                const fontSize = (isHub(node) ? 13 : 11) / scale;
                ctx.font = `${isHub(node) ? 650 : 450} ${fontSize}px ${font}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = isHub(node) ? node.color : theme.label;
                const label = node.label.length > 40 ? `${node.label.slice(0, 38)}…` : node.label;
                // Contorno da cor do fundo: o nome continua legível por cima das linhas
                ctx.lineJoin = "round";
                ctx.lineWidth = 3.5 / scale;
                ctx.strokeStyle = theme.bg;
                ctx.strokeText(label, x, y + r + 3 / scale);
                ctx.fillText(label, x, y + r + 3 / scale);
              }
              ctx.restore();
            }}
            nodePointerAreaPaint={(node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
              ctx.fillStyle = color;
              if (theme.ownLabel?.(node) && theme.hit) return theme.hit(ctx, node, radius(node), font);
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
