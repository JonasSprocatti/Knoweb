import type { GraphLink, GraphNode } from "@/lib/types";

export type SimNode = GraphNode & { x?: number; y?: number };
export type SimLink = Omit<GraphLink, "source" | "target"> & { source: string | SimNode; target: string | SimNode };

export type ThemeId = "executivo" | "espaco" | "teia" | "abissal" | "constelacao";

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
  /** O próprio tema já escreve o nome dos temas */
  topicIsLabel?: boolean;
  curvature: number;
  linkColor: (l: SimLink, lit: boolean) => string;
  linkWidth: (l: SimLink) => number;
  particles: (l: SimLink) => number;
  particleColor: (l: SimLink) => string;
  /** Desenha antes dos nós. Recebe o contexto já no espaço do grafo. */
  backdrop: (ctx: CanvasRenderingContext2D, t: number, scale: number) => void;
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

// ---- Temas ---------------------------------------------------------
const espaco: GraphTheme = {
  id: "espaco",
  name: "Espaço",
  bg: "#070A22",
  label: "#EDEFFF",
  animated: true,
  curvature: 0,
  linkColor: (l, lit) => (lit ? alpha(end(l.source)?.color ?? "#ffffff", l.kind === "topic" ? 0.25 : 0.6) : "#ffffff0d"),
  linkWidth: (l) => (l.kind === "wikilink" ? 1.4 : 0.6),
  particles: (l) => (l.kind === "topic" ? 0 : 2),
  particleColor: () => "#FFD23F",
  backdrop: (ctx, t) => sky(ctx, t, "#DCE3FF", true),
  node: (ctx, n, { r, lit, t }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    ctx.globalAlpha = lit ? 1 : 0.18;
    if (n.type === "topic") {
      // Planeta com luz vindo do alto à esquerda
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.25, n.color);
      g.addColorStop(1, alpha(n.color, 0.35));
      circle(ctx, x, y, r);
      ctx.fillStyle = g;
      ctx.fill();
      if (n.weight >= 5) {
        ctx.strokeStyle = alpha(n.color, 0.6);
        ctx.lineWidth = r * 0.12;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.7, r * 0.45, -0.35, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      const pulse = 0.85 + 0.15 * Math.sin(t / 700 + x);
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 10;
      circle(ctx, x, y, r * pulse);
      ctx.fillStyle = n.type === "recording" ? "#ffffff" : n.color;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (n.type === "recording") {
        ctx.strokeStyle = n.color;
        ctx.lineWidth = r * 0.35;
        ctx.stroke();
      }
    }
  },
};

const teia: GraphTheme = {
  id: "teia",
  name: "Teia de aranha",
  bg: "#0C0E16",
  label: "#E9ECF7",
  animated: false,
  curvature: 0.18,
  linkColor: (_l, lit) => (lit ? "#E6EAFFAA" : "#E6EAFF14"),
  linkWidth: (l) => (l.kind === "wikilink" ? 1.1 : 0.5),
  particles: () => 0,
  particleColor: () => "#ffffff",
  backdrop: (ctx, _t, scale) => {
    // Fios radiais e espirais caídas, centradas na origem do grafo
    const spokes = 14;
    const reach = 1600;
    ctx.strokeStyle = "#C9D1FF14";
    ctx.lineWidth = 1 / scale;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
      ctx.stroke();
    }
    for (let ring = 70; ring < reach; ring += 70 + ring * 0.08) {
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const px = Math.cos(a) * ring;
        const py = Math.sin(a) * ring;
        if (i === 0) ctx.moveTo(px, py);
        else {
          const mid = a - Math.PI / spokes;
          const sag = ring * 0.9;
          ctx.quadraticCurveTo(Math.cos(mid) * sag, Math.sin(mid) * sag, px, py);
        }
      }
      ctx.stroke();
    }
  },
  node: (ctx, n, { r, lit }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    ctx.globalAlpha = lit ? 1 : 0.2;
    // Gota de orvalho: corpo translúcido na cor do tema + brilho
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, alpha(n.color, 0.9));
    g.addColorStop(1, alpha(n.color, 0.25));
    circle(ctx, x, y, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#ffffff55";
    ctx.lineWidth = r * 0.08;
    ctx.stroke();
  },
};

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

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.32;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const constelacao: GraphTheme = {
  id: "constelacao",
  name: "Constelações",
  bg: "#0A0E28",
  label: "#F3F1FF",
  animated: false,
  topicIsLabel: true,
  curvature: 0,
  linkColor: (l, lit) => (l.kind === "topic" ? (lit ? "#ffffff22" : "#ffffff08") : lit ? "#ffffffaa" : "#ffffff14"),
  linkWidth: (l) => (l.kind === "topic" ? 0.4 : 0.9),
  particles: () => 0,
  particleColor: () => "#ffffff",
  backdrop: (ctx, t) => sky(ctx, t, "#ffffff", false),
  node: (ctx, n, { r, lit, scale, font }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    ctx.globalAlpha = lit ? 1 : 0.2;
    if (n.type === "topic") {
      // O tema é o nome da constelação, escrito no céu
      ctx.font = `italic 600 ${Math.max(14, r * 2.4)}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = alpha(n.color, 0.75);
      ctx.fillText(n.label, x, y);
      return;
    }
    ctx.shadowColor = n.color;
    ctx.shadowBlur = 6 / Math.max(scale, 0.5);
    sparkle(ctx, x, y, r * 1.5);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.shadowBlur = 0;
    circle(ctx, x, y, r * 0.35);
    ctx.fillStyle = n.color;
    ctx.fill();
  },
};

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
      // Forma diz o tipo: tarefa quadrada, projeto losango, sprint triângulo, pessoa anel, nota círculo
      if (n.type === "task") {
        ctx.beginPath();
        ctx.roundRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, r * 0.3);
      } else if (n.type === "sprint") {
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.15);
        ctx.lineTo(x + r, y + r * 0.7);
        ctx.lineTo(x - r, y + r * 0.7);
        ctx.closePath();
      } else if (n.type === "project") {
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.25);
        ctx.lineTo(x + r * 1.25, y);
        ctx.lineTo(x, y + r * 1.25);
        ctx.lineTo(x - r * 1.25, y);
        ctx.closePath();
      } else if (n.type === "company" || n.type === "system") {
        // Empresa hexágono, sistema retângulo
        ctx.beginPath();
        if (n.type === "company")
          for (let i = 0; i < 6; i++) ctx.lineTo(x + r * 1.15 * Math.cos((Math.PI / 3) * i), y + r * 1.15 * Math.sin((Math.PI / 3) * i));
        else ctx.roundRect(x - r * 1.2, y - r * 0.75, r * 2.4, r * 1.5, r * 0.25);
        ctx.closePath();
      } else circle(ctx, x, y, r);
      const hollow = n.type === "recording" || n.type === "person";
      ctx.fillStyle = hollow ? ring : n.color;
      ctx.fill();
      ctx.lineWidth = hollow ? r * 0.4 : 1.5 / scale;
      ctx.strokeStyle = hollow ? n.color : ring;
      ctx.stroke();
    },
  };
}

const PLAYFUL: Record<Exclude<ThemeId, "executivo">, GraphTheme> = { espaco, teia, abissal, constelacao };
export const THEME_LIST: { id: ThemeId; name: string }[] = [
  { id: "executivo", name: "Executivo" },
  ...[espaco, teia, abissal, constelacao].map((t) => ({ id: t.id, name: t.name })),
];
export function themeFor(id: ThemeId, dark: boolean): GraphTheme {
  return id === "executivo" ? executivo(dark) : (PLAYFUL[id] ?? executivo(dark));
}
