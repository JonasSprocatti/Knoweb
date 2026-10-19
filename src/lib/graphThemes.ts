import type { GraphLink, GraphNode } from "@/lib/types";

export type SimNode = GraphNode & { x?: number; y?: number };
export type SimLink = Omit<GraphLink, "source" | "target"> & { source: string | SimNode; target: string | SimNode };

export type ThemeId = "executivo" | "etiquetas" | "relevo" | "sinapse" | "abissal";

export interface NodeState {
  r: number;
  lit: boolean;
  hovered: boolean;
  scale: number;
  t: number;
  /** Família da fonte do app (o canvas não entende var(--...)) */
  font: string;
}

export interface GraphTheme {
  id: ThemeId;
  name: string;
  bg: string;
  label: string;
  /** Precisa redesenhar continuamente (brilho, deriva) */
  animated: boolean;
  /** O próprio tema escreve o nome deste ponto (a teia não põe rótulo nem emoji por cima) */
  ownLabel?: (n: SimNode) => boolean;
  /** Área de toque quando o desenho não é um círculo de raio r */
  hit?: (ctx: CanvasRenderingContext2D, n: SimNode, r: number, font: string) => void;
  curvature: number;
  linkColor: (l: SimLink, lit: boolean) => string;
  linkWidth: (l: SimLink) => number;
  particles: (l: SimLink) => number;
  particleColor: (l: SimLink) => string;
  /** Desenha antes dos nós. Recebe o contexto já no espaço do grafo. */
  backdrop: (ctx: CanvasRenderingContext2D, t: number, scale: number, nodes: SimNode[]) => void;
  node: (ctx: CanvasRenderingContext2D, n: SimNode, s: NodeState) => void;
}

const end = (e: string | SimNode) => (typeof e === "string" ? null : e);
const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0")}`;

// ---- Céu de fundo (espaço da tela, com leve paralaxe) --------------
type Star = { x: number; y: number; size: number; phase: number; depth: number };
const STARS: Star[] = Array.from({ length: 260 }, (_, i) => {
  const rnd = (k: number) => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  return { x: rnd(1), y: rnd(2), size: 0.4 + rnd(3) * 1.4, phase: rnd(4) * Math.PI * 2, depth: 0.02 + rnd(5) * 0.08 };
});

function sky(ctx: CanvasRenderingContext2D, t: number, color: string, twinkle: boolean) {
  const m = ctx.getTransform();
  const { width: w, height: h } = ctx.canvas;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  for (const s of STARS) {
    const x = (((s.x * w + m.e * s.depth) % w) + w) % w;
    const y = (((s.y * h + m.f * s.depth) % h) + h) % h;
    ctx.globalAlpha = twinkle ? 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + s.phase)) : 0.6;
    ctx.beginPath();
    ctx.arc(x, y, s.size * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Forma diz o tipo: tarefa quadrada, projeto losango, sprint triângulo, empresa hexágono, sistema retângulo, resto círculo. */
function typePath(ctx: CanvasRenderingContext2D, n: SimNode, x: number, y: number, r: number) {
  ctx.beginPath();
  if (n.type === "task") ctx.roundRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, r * 0.3);
  else if (n.type === "sprint") {
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r, y + r * 0.7);
    ctx.lineTo(x - r, y + r * 0.7);
  } else if (n.type === "project") {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.25, y);
    ctx.lineTo(x, y + r * 1.25);
    ctx.lineTo(x - r * 1.25, y);
  } else if (n.type === "company")
    for (let i = 0; i < 6; i++) ctx.lineTo(x + r * 1.15 * Math.cos((Math.PI / 3) * i), y + r * 1.15 * Math.sin((Math.PI / 3) * i));
  else if (n.type === "system") ctx.roundRect(x - r * 1.2, y - r * 0.75, r * 2.4, r * 1.5, r * 0.25);
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

const isHubNode = (n: SimNode) => n.type === "topic" || n.type === "project" || n.type === "company" || n.type === "system";
/** Mistura duas cores #rrggbb (a ligação fica com a cor dos dois lados). */
function mix(a: string, b: string) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) || 0;
  return `#${[0, 1, 2].map((i) => Math.round((p(a, i) + p(b, i)) / 2).toString(16).padStart(2, "0")).join("")}`;
}

// ---- Temas ---------------------------------------------------------
const abissal: GraphTheme = {
  id: "abissal",
  name: "Abissal",
  bg: "#021219",
  label: "#C9FFF4",
  animated: true,
  curvature: 0.08,
  linkColor: (l, lit) => (lit ? alpha(end(l.source)?.color ?? "#5EE6C3", 0.35) : "#5EE6C30a"),
  linkWidth: () => 0.7,
  particles: (l) => (l.kind === "topic" ? 1 : 3),
  particleColor: (l) => end(l.source)?.color ?? "#5EE6C3",
  backdrop: (ctx, t) => sky(ctx, t / 3, "#5EE6C3", true),
  node: (ctx, n, { r, lit, t }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const breath = 0.6 + 0.4 * Math.sin(t / 1100 + y * 0.05);
    ctx.globalAlpha = lit ? 1 : 0.15;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    g.addColorStop(0, alpha(n.color, 0.9 * breath));
    g.addColorStop(0.4, alpha(n.color, 0.25 * breath));
    g.addColorStop(1, alpha(n.color, 0));
    circle(ctx, x, y, r * 2.6);
    ctx.fillStyle = g;
    ctx.fill();
    circle(ctx, x, y, r * 0.55);
    ctx.fillStyle = "#EFFFFB";
    ctx.fill();
  },
};

/**
 * Relevo: mapa topográfico. Cada tema/projeto é um morro; quanto mais coisa ligada,
 * mais curvas de nível em volta. Papel claro, tinta azul-petróleo, retícula de mapa.
 */
const RELEVO_INK = "#1D3340";
const relevo: GraphTheme = {
  id: "relevo",
  name: "Relevo",
  bg: "#E6ECEE",
  label: RELEVO_INK,
  animated: false,
  curvature: 0,
  linkColor: (l, lit) => (lit ? (l.kind === "topic" ? "#1D334033" : "#1D334099") : "#1D33400f"),
  linkWidth: (l) => (l.kind === "wikilink" ? 1.2 : 0.6),
  particles: () => 0,
  particleColor: () => RELEVO_INK,
  backdrop: (ctx, _t, scale, nodes) => {
    // Retícula: cruzinhas a cada 120 unidades, como coordenadas num mapa
    const m = ctx.getTransform();
    const inv = m.inverse();
    const { width: w, height: h } = ctx.canvas;
    const a = inv.transformPoint({ x: 0, y: 0 });
    const b = inv.transformPoint({ x: w, y: h });
    const step = 120;
    const arm = 4 / scale;
    ctx.strokeStyle = "#1D33401c";
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step)
      for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) {
        ctx.moveTo(x - arm, y);
        ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm);
        ctx.lineTo(x, y + arm);
      }
    ctx.stroke();
    // Curvas de nível em volta dos pontos principais, levemente irregulares
    for (const n of nodes) {
      if (!isHubNode(n) || n.x == null || n.y == null) continue;
      const rings = Math.min(7, 1 + Math.round(Math.sqrt(n.weight) * 1.3));
      const seed = (n.id.charCodeAt(2) || 7) * 0.37;
      for (let k = 1; k <= rings; k++) {
        const base = 9 + k * 9;
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const ang = (i / 48) * Math.PI * 2;
          const wob = 1 + 0.09 * Math.sin(ang * 3 + seed + k * 0.6) + 0.05 * Math.sin(ang * 5 - seed * 2);
          const px = n.x + Math.cos(ang) * base * wob;
          const py = n.y + Math.sin(ang) * base * wob;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = alpha(n.color, k === rings ? 0.55 : 0.28);
        ctx.lineWidth = (k % 3 === 0 ? 1.4 : 0.8) / scale;
        ctx.stroke();
      }
    }
  },
  node: (ctx, n, { r, lit, scale }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    ctx.globalAlpha = lit ? 1 : 0.22;
    typePath(ctx, n, x, y, isHubNode(n) ? r * 0.8 : r * 0.75);
    ctx.fillStyle = isHubNode(n) ? n.color : n.type === "recording" || n.type === "person" ? "#E6ECEE" : RELEVO_INK;
    ctx.fill();
    ctx.lineWidth = isHubNode(n) ? 1.6 / scale : n.type === "recording" || n.type === "person" ? r * 0.3 : 1 / scale;
    ctx.strokeStyle = isHubNode(n) ? RELEVO_INK : n.type === "recording" || n.type === "person" ? RELEVO_INK : "#E6ECEE";
    ctx.stroke();
  },
};

/**
 * Sinapse: rede neural. Ligações curvas na mistura das cores dos dois lados,
 * pontos como neurônios (anel + núcleo), sinais correndo pelas ligações.
 */
const sinapse: GraphTheme = {
  id: "sinapse",
  name: "Sinapse",
  bg: "#0E0B1E",
  label: "#E9E5FF",
  animated: true,
  curvature: 0.22,
  linkColor: (l, lit) => {
    const a = end(l.source)?.color ?? "#9D8CFF";
    const b = end(l.target)?.color ?? a;
    return lit ? alpha(mix(a, b), l.kind === "topic" ? 0.3 : 0.6) : "#9D8CFF0d";
  },
  linkWidth: (l) => (l.kind === "wikilink" ? 1.3 : 0.7),
  particles: (l) => (l.kind === "topic" ? 0 : 1),
  particleColor: () => "#F4F1FF",
  backdrop: (ctx) => {
    // Vinheta: o centro levemente mais claro, as bordas somem no escuro
    const { width: w, height: h } = ctx.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, "#1D1745");
    g.addColorStop(1, "#0E0B1E00");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },
  node: (ctx, n, { r, lit, t, scale }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    ctx.globalAlpha = lit ? 1 : 0.16;
    const hub = isHubNode(n);
    // Anel na cor do tema, núcleo claro
    circle(ctx, x, y, r);
    ctx.fillStyle = alpha(n.color, 0.16);
    ctx.fill();
    ctx.lineWidth = Math.max(1 / scale, r * (hub ? 0.16 : 0.22));
    ctx.strokeStyle = n.color;
    ctx.stroke();
    circle(ctx, x, y, r * (hub ? 0.3 : 0.38));
    ctx.fillStyle = "#F4F1FF";
    ctx.fill();
    if (!hub) return;
    // Dendritos: arcos tracejados girando devagar em volta dos pontos principais
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((t / 9000) * (n.weight % 2 ? 1 : -1));
    ctx.setLineDash([r * 0.5, r * 0.35]);
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = alpha(n.color, 0.7);
    circle(ctx, 0, 0, r * 1.45);
    ctx.stroke();
    ctx.restore();
  },
};

/** Etiqueta: geometria compartilhada pelo desenho e pela área de toque. */
function chip(ctx: CanvasRenderingContext2D, n: SimNode, r: number, font: string) {
  const size = 3.5 + r * 0.55;
  ctx.font = `600 ${size}px ${font}`;
  const text = n.label.length > 28 ? `${n.label.slice(0, 26)}…` : n.label;
  const lead = n.emoji ? size * 1.35 : size * 0.9; // espaço do emoji ou da bolinha de cor
  const w = lead + ctx.measureText(text).width + size * 1.6;
  const h = size * 2;
  const x = (n.x ?? 0) - w / 2;
  const y = (n.y ?? 0) - h / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  return { x, y, w, h, size, text, lead };
}

/** Etiquetas: limpo e legível de cara. Temas e projetos viram etiquetas com nome; o resto, pontos. Segue claro/escuro. */
function etiquetas(dark: boolean): GraphTheme {
  const bg = dark ? "#15171C" : "#F4F6F8";
  const card = dark ? "#23262E" : "#FFFFFF";
  const ink = dark ? "#E8EAF0" : "#1A1D24";
  const edge = dark ? "#3A3F4B" : "#D5DAE1";
  return {
    id: "etiquetas",
    name: "Etiquetas",
    bg,
    label: ink,
    animated: false,
    curvature: 0.12,
    ownLabel: isHubNode,
    hit: (ctx, n, r, font) => {
      chip(ctx, n, r, font);
      ctx.fill();
    },
    linkColor: (l, lit) => (lit ? (l.kind === "topic" ? (dark ? "#4A5060" : "#C3CAD4") : dark ? "#7C8496" : "#8A93A3") : dark ? "#23262E" : "#E6E9EE"),
    linkWidth: (l) => (l.kind === "wikilink" ? 1.3 : 0.7),
    particles: () => 0,
    particleColor: () => ink,
    backdrop: () => {},
    node: (ctx, n, { r, lit, hovered, scale, font }) => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      ctx.globalAlpha = lit ? 1 : 0.25;
      if (!isHubNode(n)) {
        typePath(ctx, n, x, y, r * 0.7);
        ctx.fillStyle = n.type === "recording" || n.type === "person" ? bg : n.color;
        ctx.fill();
        ctx.lineWidth = n.type === "recording" || n.type === "person" ? r * 0.35 : 1.2 / scale;
        ctx.strokeStyle = n.type === "recording" || n.type === "person" ? n.color : bg;
        ctx.stroke();
        return;
      }
      const c = chip(ctx, n, r, font);
      ctx.shadowColor = dark ? "#00000080" : "#1A1D2420";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1.5;
      ctx.fillStyle = card;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = (hovered ? 2 : 1) / scale;
      ctx.strokeStyle = hovered ? n.color : edge;
      ctx.stroke();
      // Emoji (ou bolinha na cor do tema) à esquerda: identifica o grupo sem pintar a etiqueta inteira
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      if (n.emoji) {
        ctx.font = `${c.size}px ${font}`;
        ctx.fillText(n.emoji, c.x + c.size * 0.65, y + c.size * 0.05);
      } else {
        circle(ctx, c.x + c.size * 1.05, y, c.size * 0.38);
        ctx.fillStyle = n.color;
        ctx.fill();
      }
      ctx.font = `600 ${c.size}px ${font}`;
      ctx.fillStyle = ink;
      ctx.fillText(c.text, c.x + c.size * 0.8 + c.lead, y + c.size * 0.04);
      if (n.type !== "topic") {
        // Projeto/empresa/sistema: um sublinhado na cor para separar dos temas
        ctx.fillStyle = n.color;
        ctx.fillRect(c.x + c.h / 2, c.y + c.h - 1.2 / scale, c.w - c.h, 1.2 / scale);
      }
    },
  };
}

/** Executivo: plano e sóbrio, segue o modo claro/escuro do app. */
function executivo(dark: boolean): GraphTheme {
  const bg = dark ? "#14120F" : "#F6F3EE";
  const ring = dark ? "#14120F" : "#FFFFFF";
  return {
    id: "executivo",
    name: "Executivo",
    bg,
    label: dark ? "#ECE6DC" : "#1F1B16",
    animated: false,
    curvature: 0,
    linkColor: (l, lit) => (lit ? (dark ? (l.kind === "topic" ? "#3D372E" : "#665D50") : l.kind === "topic" ? "#E0D8CB" : "#A89D8D") : dark ? "#26221C" : "#EFEAE2"),
    linkWidth: (l) => (l.kind === "wikilink" ? 1.4 : 0.8),
    particles: () => 0,
    particleColor: () => "#E0A64F",
    backdrop: () => {},
    node: (ctx, n, { r, lit, scale }) => {
      ctx.globalAlpha = lit ? 1 : 0.25;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      typePath(ctx, n, x, y, r);
      const hollow = n.type === "recording" || n.type === "person";
      ctx.fillStyle = hollow ? ring : n.color;
      ctx.fill();
      ctx.lineWidth = hollow ? r * 0.4 : 1.5 / scale;
      ctx.strokeStyle = hollow ? n.color : ring;
      ctx.stroke();
    },
  };
}

export const THEME_LIST: { id: ThemeId; name: string }[] = [
  { id: "executivo", name: "Executivo" },
  { id: "etiquetas", name: "Etiquetas" },
  { id: "relevo", name: "Relevo" },
  { id: "sinapse", name: "Sinapse" },
  { id: "abissal", name: "Abissal" },
];
/** Visual pelo id; um id antigo (Espaço, Teia, Constelações) cai no Executivo. */
export function themeFor(id: ThemeId, dark: boolean): GraphTheme {
  if (id === "etiquetas") return etiquetas(dark);
  if (id === "relevo") return relevo;
  if (id === "sinapse") return sinapse;
  if (id === "abissal") return abissal;
  return executivo(dark);
}
