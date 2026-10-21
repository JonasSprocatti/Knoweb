import type { GraphLink, GraphNode } from "@/lib/types";
import { terrainFor } from "@/lib/graphTerrain";
import { metroFor, octilinear } from "@/lib/graphMetro";

export type SimNode = GraphNode & { x?: number; y?: number };
export type SimLink = Omit<GraphLink, "source" | "target"> & { source: string | SimNode; target: string | SimNode };

export type ThemeId = "executivo" | "etiquetas" | "metro" | "relevo" | "sinapse" | "abissal";

export interface NodeState {
  r: number;
  /** Fora do foco do dedo/mouse, o ponto se apaga */
  lit: boolean;
  /** Há um ponto em foco e este é ele ou um vizinho dele */
  focus: boolean;
  hovered: boolean;
  scale: number;
  t: number;
  /** Família da fonte do app (o canvas não entende var(--...)) */
  font: string;
}

/** O que o fundo recebe a cada quadro */
export interface Scene {
  t: number;
  scale: number;
  nodes: SimNode[];
  links: SimLink[];
  /** Ponto em foco (dedo ou mouse), se houver */
  hover: string | null;
  /** Família da fonte do app */
  font: string;
  /** Raio de cada ponto no espaço do grafo */
  radius: (n: SimNode) => number;
}

/** Retângulo no espaço do grafo: x0, y0, x1, y1 */
export type Box = [number, number, number, number];

export interface LinkState {
  lit: boolean;
  focus: boolean;
  scale: number;
}

export interface GraphTheme {
  id: ThemeId;
  name: string;
  bg: string;
  /** Cor dos nomes dos pontos */
  label: string;
  /** Cor do nome de temas e projetos (padrão: `label`) */
  hubLabel?: (n: SimNode) => string;
  /** Cor do céu de pontos no modo 3D (padrão: branco azulado) */
  stars?: string;
  /** Precisa redesenhar continuamente (brilho, deriva) */
  animated: boolean;
  /** A teia desenha o emoji de temas e projetos por cima do ponto (padrão: sim) */
  emoji?: boolean;
  /** O próprio tema escreve o nome deste ponto (a teia não põe rótulo nem emoji por cima) */
  ownLabel?: (n: SimNode) => boolean;
  /** Espaço já ocupado pelas etiquetas do tema neste quadro; os nomes da teia desviam dele */
  taken?: () => Box[];
  /** Área de toque quando o desenho não é um círculo de raio r */
  hit?: (ctx: CanvasRenderingContext2D, n: SimNode, r: number, font: string, scale: number) => void;
  curvature: number;
  linkColor: (l: SimLink, lit: boolean) => string;
  /** Espessura em pixels da tela */
  linkWidth: (l: SimLink) => number;
  /** Desenha a ligação inteira, no lugar da linha padrão */
  link?: (ctx: CanvasRenderingContext2D, l: SimLink, s: LinkState) => void;
  /** Quantos fluxos correm por esta ligação (0: nenhum) */
  particles: (l: SimLink) => number;
  particleColor: (l: SimLink) => string;
  /** Desenha um fluxo; tamanhos em pixels da tela, então divida por `scale` */
  particle?: (ctx: CanvasRenderingContext2D, x: number, y: number, l: SimLink, scale: number) => void;
  /** Fração da ligação que o fluxo anda por quadro (padrão 0,004) */
  particleSpeed?: number;
  /** Desenha antes das ligações e dos nós. Recebe o contexto já no espaço do grafo. */
  backdrop: (ctx: CanvasRenderingContext2D, scene: Scene) => void;
  /** Desenha por cima de tudo (antes dos nomes da teia), no espaço do grafo */
  overlay?: (ctx: CanvasRenderingContext2D, scene: Scene) => void;
  node: (ctx: CanvasRenderingContext2D, n: SimNode, s: NodeState) => void;
}

// ---- Cores ----------------------------------------------------------
/** Qualquer cor do banco vira #rrggbb (as contas abaixo precisam disso) */
function hex(c: string | null | undefined, fallback = "#8A8073") {
  if (!c) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((d) => d + d).join("")}`;
  return fallback;
}
const end = (e: string | SimNode) => (typeof e === "string" ? null : e);
const idOf = (e: string | SimNode) => (typeof e === "string" ? e : e.id);
const colorOf = (n: SimNode | null | undefined, fallback?: string) => hex(n?.color, fallback);
const alpha = (c: string, a: number) =>
  `${hex(c)}${Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0")}`;
/** Mistura duas cores; `w` é quanto vem da segunda. */
function mix(a: string, b: string, w = 0.5) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) || 0;
  const [ha, hb] = [hex(a), hex(b)];
  return `#${[0, 1, 2].map((i) => Math.round(p(ha, i) * (1 - w) + p(hb, i) * w).toString(16).padStart(2, "0")).join("")}`;
}
/** Luminância relativa (WCAG), para escolher texto claro ou escuro sobre uma cor */
function luminance(c: string) {
  const h = hex(c);
  const ch = [1, 3, 5].map((o) => {
    const v = parseInt(h.slice(o, o + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// ---- Desenho ----------------------------------------------------------
type Star = { x: number; y: number; size: number; phase: number; depth: number };
const STARS: Star[] = Array.from({ length: 260 }, (_, i) => {
  const rnd = (k: number) => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  return { x: rnd(1), y: rnd(2), size: 0.4 + rnd(3) * 1.4, phase: rnd(4) * Math.PI * 2, depth: 0.02 + rnd(5) * 0.08 };
});

/** Céu de fundo (espaço da tela, com leve paralaxe). `fall`: pixels por segundo que ele desce. */
function sky(ctx: CanvasRenderingContext2D, t: number, color: string, twinkle: boolean, fall = 0) {
  const m = ctx.getTransform();
  const { width: w, height: h } = ctx.canvas;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  for (const s of STARS) {
    const x = (((s.x * w + m.e * s.depth) % w) + w) % w;
    const drift = fall ? (t / 1000) * fall * dpr * (0.4 + s.depth * 8) : 0;
    const y = (((s.y * h + m.f * s.depth + drift) % h) + h) % h;
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
function typePath(ctx: CanvasRenderingContext2D, type: SimNode["type"], x: number, y: number, r: number) {
  ctx.beginPath();
  if (type === "task") ctx.roundRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, r * 0.3);
  else if (type === "sprint") {
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r, y + r * 0.7);
    ctx.lineTo(x - r, y + r * 0.7);
  } else if (type === "project") {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.25, y);
    ctx.lineTo(x, y + r * 1.25);
    ctx.lineTo(x - r * 1.25, y);
  } else if (type === "company")
    for (let i = 0; i < 6; i++) ctx.lineTo(x + r * 1.15 * Math.cos((Math.PI / 3) * i), y + r * 1.15 * Math.sin((Math.PI / 3) * i));
  else if (type === "system") ctx.roundRect(x - r * 1.2, y - r * 0.75, r * 2.4, r * 1.5, r * 0.25);
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

export const isHubNode = (n: SimNode) => n.type === "topic" || n.type === "project" || n.type === "company" || n.type === "system";
/** Gravações e pessoas aparecem vazadas (anel); o resto, cheio */
const hollow = (n: SimNode) => n.type === "recording" || n.type === "person";

/** Número estável de 0 a 1 tirado do id (ângulos e variações que não mudam a cada quadro) */
function seeded(id: string, k = 0) {
  let h = 2166136261 ^ k;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Ponto de fluxo comum: um pingo de tamanho fixo na tela */
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Etiqueta (pílula ou cartão) com o nome: geometria compartilhada pelo desenho e pela área de toque. */
function chip(ctx: CanvasRenderingContext2D, n: SimNode, size: number, font: string, opts: { lead: number; count?: boolean }) {
  ctx.font = `600 ${size}px ${font}`;
  const text = n.label.length > 28 ? `${n.label.slice(0, 26)}…` : n.label;
  const tw = ctx.measureText(text).width;
  let cw = 0;
  if (opts.count) {
    ctx.font = `500 ${size}px ${font}`;
    cw = ctx.measureText(String(n.weight)).width + size * 0.5;
  }
  const w = opts.lead + tw + cw + size * 1.6;
  const h = size * 2;
  const x = (n.x ?? 0) - w / 2;
  const y = (n.y ?? 0) - h / 2;
  return { x, y, w, h, size, text, tw };
}

const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Onde a etiqueta de um tema ficou neste quadro */
interface Spot {
  n: SimNode;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  text: string;
  tw: number;
  /** Saiu de cima do ponto (o ponto aparece ao lado, como marcador) */
  moved: boolean;
}

/**
 * Onde cada etiqueta de tema cabe sem encostar nas outras. O ponto em foco e os vizinhos
 * vêm primeiro, depois os de mais ligações. A etiqueta tenta ficar em cima do ponto; se
 * não cabe, tenta acima, abaixo, à direita e à esquerda dele. Se nada cabe, o tema fica só
 * como marcador até você aproximar. Refeito a cada quadro, então o zoom revela mais nomes.
 */
function chipBoard(
  geom: (ctx: CanvasRenderingContext2D, n: SimNode, font: string, scale: number) => Omit<Spot, "n" | "moved">,
  /** Raio do marcador que fica no ponto quando a etiqueta sai de cima dele */
  mark: (n: SimNode, r: number, scale: number) => number,
) {
  const spots = new Map<string, Spot>();
  const boxes: Box[] = [];
  const near = new Set<string>();
  let hover: string | null = null;
  return {
    spots,
    boxes,
    lit: (id: string) => !hover || id === hover || near.has(id),
    place(ctx: CanvasRenderingContext2D, { nodes, links, scale, font, radius, ...scene }: Scene) {
      hover = scene.hover;
      near.clear();
      if (hover)
        for (const l of links) {
          const [s, t] = [idOf(l.source), idOf(l.target)];
          if (s === hover) near.add(t);
          else if (t === hover) near.add(s);
        }
      const rank = (n: SimNode) => (n.id === hover ? 2 : near.has(n.id) ? 1 : 0);
      const hubs = nodes.filter((n) => isHubNode(n) && n.x != null && n.y != null).sort((a, b) => rank(b) - rank(a) || b.weight - a.weight);
      spots.clear();
      boxes.length = 0;
      const pad = 3 / scale;
      const free = (b: Box) => !boxes.some((o) => overlaps(o, b));
      // Área visível, no espaço do grafo: uma etiqueta não sai cortada pela borda da tela
      const inv = ctx.getTransform().inverse();
      const a = inv.transformPoint({ x: 0, y: 0 });
      const b = inv.transformPoint({ x: ctx.canvas.width, y: ctx.canvas.height });
      const view = (n: SimNode) => n.x! >= a.x && n.x! <= b.x && n.y! >= a.y && n.y! <= b.y;
      const inside = (q: Box) => q[0] >= a.x && q[2] <= b.x && q[1] >= a.y && q[3] <= b.y;
      for (const n of hubs) {
        const g = geom(ctx, n, font, scale);
        const m = mark(n, radius(n), scale);
        const gap = 2 / scale;
        const dx = g.w / 2 + m + gap;
        const dy = g.h / 2 + m + gap;
        const dot: Box = [n.x! - m - pad, n.y! - m - pad, n.x! + m + pad, n.y! + m + pad];
        let pick: [number, number] | null = null;
        for (const [ox, oy] of [[0, 0], [0, -dy], [0, dy], [dx, 0], [-dx, 0]] as const) {
          const box: Box = [g.x + ox - pad, g.y + oy - pad, g.x + ox + g.w + pad, g.y + oy + g.h + pad];
          if (free(box) && (!view(n) || inside(box)) && (ox === 0 && oy === 0 ? true : free(dot))) {
            pick = [ox, oy];
            break;
          }
        }
        if (!pick && n.id === hover) pick = [0, 0];
        if (!pick) continue;
        const [ox, oy] = pick;
        const spot: Spot = { ...g, n, x: g.x + ox, y: g.y + oy, moved: ox !== 0 || oy !== 0 };
        boxes.push([spot.x - pad, spot.y - pad, spot.x + g.w + pad, spot.y + g.h + pad]);
        if (spot.moved) boxes.push(dot);
        spots.set(n.id, spot);
      }
    },
  };
}

// ---- Executivo --------------------------------------------------------
/**
 * Executivo: a figura de um relatório. Cor só onde informa: temas e projetos cheios na
 * cor deles; notas num tom apagado da cor do tema, que acende quando o vizinho entra em foco.
 * Nomes na cor do texto. Segue o claro/escuro do app.
 */
function executivo(dark: boolean): GraphTheme {
  const bg = dark ? "#14120F" : "#F6F3EE";
  const ink = dark ? "#ECE6DC" : "#1F1B16";
  const ring = dark ? "#14120F" : "#FFFFFF";
  return {
    id: "executivo",
    name: "Executivo",
    bg,
    label: ink,
    animated: false,
    curvature: 0,
    linkColor: (l, lit) =>
      lit
        ? dark
          ? l.kind === "topic" ? "#2B2722" : "#4E473D"
          : l.kind === "topic" ? "#E5DED2" : "#C2B7A5"
        : dark ? "#1A1814" : "#F0ECE5",
    linkWidth: (l) => (l.kind === "wikilink" ? 1.3 : 0.8),
    particles: () => 0,
    particleColor: () => ink,
    backdrop: () => {},
    node: (ctx, n, { r, lit, focus, scale }) => {
      ctx.globalAlpha = lit ? 1 : 0.22;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const c = colorOf(n);
      if (isHubNode(n)) {
        typePath(ctx, n.type, x, y, r);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = ring;
        ctx.stroke();
        return;
      }
      const tint = focus ? c : mix(c, bg, dark ? 0.45 : 0.4);
      typePath(ctx, n.type, x, y, r * 0.85);
      if (hollow(n)) {
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.lineWidth = r * 0.36;
        ctx.strokeStyle = tint;
        ctx.stroke();
      } else {
        ctx.fillStyle = tint;
        ctx.fill();
      }
    },
  };
}

// ---- Etiquetas --------------------------------------------------------
/**
 * Etiquetas: cada tema e projeto vira a mesma etiqueta das telas do app (cartão com a
 * bolinha da cor, o nome e quantas coisas ligam nele). Temas com bolinha, projetos
 * com losango. O resto são pontos pequenos. Segue o claro/escuro do app.
 */
function etiquetas(dark: boolean): GraphTheme {
  const bg = dark ? "#14120F" : "#F6F3EE";
  const card = dark ? "#201D18" : "#FFFFFF";
  const ink = dark ? "#ECE6DC" : "#1F1B16";
  const muted = dark ? "#B3AA9C" : "#5F574C";
  const edge = dark ? "#38332B" : "#E0D8CB";
  // Cresce com o número de ligações e com o zoom, mas fica entre 11 e 15 px na tela
  const size = (n: SimNode, scale: number) => Math.min(Math.max(Math.min(12, 4 + Math.sqrt(Math.max(1, n.weight)) * 0.9), 11 / scale), 15 / scale);
  const lead = (s: number) => s * 1.25;
  const geom = (ctx: CanvasRenderingContext2D, n: SimNode, font: string, scale: number) => {
    const sz = size(n, scale);
    return chip(ctx, n, sz, font, { lead: lead(sz), count: true });
  };
  const markR = (r: number, scale: number) => Math.max(r * 0.5, 4 / scale);
  const board = chipBoard(geom, (_n, r, scale) => markR(r, scale));
  /** O tema como marcador: a forma do tipo na cor dele, com borda do cartão */
  const marker = (ctx: CanvasRenderingContext2D, n: SimNode, r: number, scale: number, hovered: boolean) => {
    typePath(ctx, n.type, n.x ?? 0, n.y ?? 0, markR(r, scale));
    ctx.fillStyle = colorOf(n);
    ctx.fill();
    ctx.lineWidth = (hovered ? 2 : 1.5) / scale;
    ctx.strokeStyle = hovered ? ink : card;
    ctx.stroke();
  };
  return {
    id: "etiquetas",
    name: "Etiquetas",
    bg,
    label: ink,
    animated: false,
    curvature: 0.12,
    ownLabel: isHubNode,
    taken: () => board.boxes,
    hit: (ctx, n, r, _font, scale) => {
      const g = board.spots.get(n.id);
      ctx.beginPath();
      if (g) ctx.roundRect(g.x, g.y, g.w, g.h, g.h * 0.3);
      if (!g || g.moved) ctx.arc(n.x ?? 0, n.y ?? 0, markR(r, scale) + 3 / scale, 0, Math.PI * 2);
      ctx.fill();
    },
    linkColor: (l, lit) =>
      lit ? (l.kind === "topic" ? (dark ? "#2B2722" : "#E5DED2") : dark ? "#4E473D" : "#C2B7A5") : dark ? "#1A1814" : "#F0ECE5",
    linkWidth: (l) => (l.kind === "wikilink" ? 1.3 : 0.8),
    particles: () => 0,
    particleColor: () => ink,
    backdrop: (ctx, scene) => board.place(ctx, scene),
    // As etiquetas por cima de tudo: nenhum ponto ou ligação passa na frente do nome
    overlay: (ctx, { scale, font, hover }) => {
      const spots = [...board.spots.values()].reverse();
      for (const g of spots) {
        const n = g.n;
        const c = colorOf(n);
        const hovered = hover === n.id;
        const cy = g.y + g.h / 2;
        ctx.globalAlpha = board.lit(n.id) ? 1 : 0.25;
        ctx.beginPath();
        ctx.roundRect(g.x, g.y, g.w, g.h, g.h * 0.3);
        ctx.fillStyle = card;
        ctx.fill();
        ctx.lineWidth = (hovered ? 2 : 1) / scale;
        ctx.strokeStyle = hovered ? c : edge;
        ctx.stroke();
        // Emoji, ou a forma do tipo na cor: identifica o grupo sem pintar a etiqueta inteira
        const sx = g.x + g.size * 0.8 + lead(g.size) / 2 - g.size * 0.15;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        if (n.emoji) {
          ctx.font = `${g.size}px ${font}`;
          ctx.fillText(n.emoji, sx, cy + g.size * 0.05);
        } else {
          typePath(ctx, n.type === "topic" ? "note" : n.type, sx, cy, g.size * 0.36);
          ctx.fillStyle = c;
          ctx.fill();
        }
        ctx.textAlign = "left";
        ctx.font = `600 ${g.size}px ${font}`;
        ctx.fillStyle = ink;
        const tx = g.x + g.size * 0.8 + lead(g.size);
        ctx.fillText(g.text, tx, cy + g.size * 0.04);
        ctx.font = `500 ${g.size}px ${font}`;
        ctx.fillStyle = muted;
        ctx.fillText(String(n.weight), tx + g.tw + g.size * 0.5, cy + g.size * 0.04);
      }
      ctx.globalAlpha = 1;
    },
    node: (ctx, n, { r, lit, focus, hovered, scale }) => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const c = colorOf(n);
      ctx.globalAlpha = lit ? 1 : 0.25;
      if (isHubNode(n)) {
        // Com a etiqueta em cima do ponto, ela é o ponto; senão, o marcador fica aqui
        const g = board.spots.get(n.id);
        if (!g || g.moved) marker(ctx, n, r, scale, hovered);
        return;
      }
      const tint = focus ? c : mix(c, bg, 0.35);
      typePath(ctx, n.type, x, y, r * 0.7);
      if (hollow(n)) {
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.lineWidth = r * 0.34;
        ctx.strokeStyle = tint;
        ctx.stroke();
      } else {
        ctx.fillStyle = tint;
        ctx.fill();
      }
    },
  };
}

// ---- Metrô ------------------------------------------------------------
/**
 * Metrô: a teia como mapa de metrô. Cada tema e projeto é uma linha da cor dele que passa
 * pelas notas ligadas a ele (as estações), em trechos retos e diagonais de 45°. Nota em
 * duas linhas vira baldeação; notas ligadas entre si, passagens pontilhadas. A placa
 * com o nome da linha fica no ponto de partida. Segue o claro/escuro do app.
 */
function metro(dark: boolean): GraphTheme {
  const bg = dark ? "#14120F" : "#F6F3EE";
  const ink = dark ? "#ECE6DC" : "#1F1B16";
  const station = dark ? "#14120F" : "#FFFFFF";
  const passage = dark ? "#6E6558" : "#A39886";
  /** Espessura da linha: cresce com o zoom, mas fica entre 1,5 e 5 px na tela */
  const lineW = (scale: number) => Math.max(1.5 / scale, Math.min(2.6, 5 / scale));
  // Placa entre 10,5 e 14 px na tela
  const size = (n: SimNode, scale: number) => Math.min(Math.max(Math.min(11, 4.2 + Math.sqrt(Math.max(1, n.weight)) * 0.75), 10.5 / scale), 14 / scale);
  const geom = (ctx: CanvasRenderingContext2D, n: SimNode, font: string, scale: number) => chip(ctx, n, size(n, scale), font, { lead: 0 });
  const board = chipBoard(geom, (_n, _r, scale) => lineW(scale) * 2);
  /** Terminal: o ponto de partida da linha, na cor dela */
  const terminal = (ctx: CanvasRenderingContext2D, n: SimNode, scale: number, hovered: boolean) => {
    circle(ctx, n.x ?? 0, n.y ?? 0, lineW(scale) * 2);
    ctx.fillStyle = colorOf(n);
    ctx.fill();
    ctx.lineWidth = (hovered ? 2.5 : 1.5) / scale;
    ctx.strokeStyle = hovered ? ink : station;
    ctx.stroke();
  };
  const toHub = (l: SimLink) => isHubNode(end(l.source) ?? ({} as SimNode)) !== isHubNode(end(l.target) ?? ({} as SimNode));
  return {
    id: "metro",
    name: "Metrô",
    bg,
    label: ink,
    animated: false,
    emoji: false,
    curvature: 0,
    ownLabel: isHubNode,
    taken: () => board.boxes,
    hit: (ctx, n, _r, _font, scale) => {
      const g = board.spots.get(n.id);
      ctx.beginPath();
      if (g) ctx.roundRect(g.x, g.y, g.w, g.h, g.h / 2);
      if (!g || g.moved) ctx.arc(n.x ?? 0, n.y ?? 0, lineW(scale) * 2 + 3 / scale, 0, Math.PI * 2);
      ctx.fill();
    },
    linkColor: (l, lit) => {
      const s = end(l.source);
      const t = end(l.target);
      const hub = s && isHubNode(s) ? s : t && isHubNode(t) ? t : null;
      return hub ? alpha(colorOf(hub), lit ? 1 : 0.15) : alpha(passage, lit ? 0.8 : 0.15);
    },
    linkWidth: (l) => (toHub(l) ? 3 : 1),
    // As linhas saem do fundo (uma por tema); aqui só as passagens entre notas
    link: (ctx, l, { lit, scale }) => {
      if (toHub(l)) return;
      const s = end(l.source);
      const t = end(l.target);
      if (!s || !t || s.x == null || t.x == null) return;
      ctx.globalAlpha = lit ? 0.9 : 0.12;
      ctx.beginPath();
      octilinear(ctx, s.x, s.y!, t.x, t.y!, 6);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = passage;
      ctx.lineWidth = 1.3 / scale;
      ctx.setLineDash([0.1 / scale, 3.4 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
    particles: () => 0,
    particleColor: () => ink,
    backdrop: (ctx, scene) => {
      const { scale, nodes, links, hover } = scene;
      board.place(ctx, scene);
      const { lines } = metroFor(nodes, links);
      const w = lineW(scale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const line of lines) {
        const lit = !hover || hover === line.hub.id || line.stops.has(hover);
        ctx.globalAlpha = lit ? 1 : 0.12;
        // Contorno na cor do fundo separa as linhas onde elas se cruzam
        ctx.strokeStyle = bg;
        ctx.lineWidth = w + 2.2 / scale;
        ctx.stroke(line.path);
        ctx.strokeStyle = colorOf(line.hub);
        ctx.lineWidth = w;
        ctx.stroke(line.path);
      }
      ctx.globalAlpha = 1;
    },
    // Placas por cima de tudo. Sem espaço em cima do terminal, a placa fica ao lado dele,
    // como nos mapas de verdade; sem espaço nenhum, só o terminal até você aproximar.
    overlay: (ctx, { scale, font, hover }) => {
      for (const g of [...board.spots.values()].reverse()) {
        const n = g.n;
        const c = colorOf(n);
        const hovered = hover === n.id;
        ctx.globalAlpha = board.lit(n.id) ? 1 : 0.2;
        ctx.beginPath();
        ctx.roundRect(g.x, g.y, g.w, g.h, g.h / 2);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.lineWidth = (hovered ? 2.5 : 1.5) / scale;
        ctx.strokeStyle = hovered ? ink : station;
        ctx.stroke();
        ctx.font = `600 ${g.size}px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = contrast("#FFFFFF", c) >= contrast("#1F1B16", c) ? "#FFFFFF" : "#1F1B16";
        ctx.fillText(g.text, g.x + g.w / 2, g.y + g.h / 2 + g.size * 0.05);
      }
      ctx.globalAlpha = 1;
    },
    node: (ctx, n, { lit, hovered, scale }) => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      ctx.globalAlpha = lit ? 1 : 0.2;
      const w = lineW(scale);
      if (isHubNode(n)) {
        const g = board.spots.get(n.id);
        if (!g || g.moved) terminal(ctx, n, scale, hovered);
        return;
      }
      // Estação: branca com contorno; baldeação maior; tarefa quadrada; gravação com miolo
      const transfer = (metroFor.last?.transfers.get(n.id) ?? 0) > 1;
      const rs = transfer ? w * 1.55 : w * 1.05;
      typePath(ctx, n.type === "task" || n.type === "sprint" ? n.type : "note", x, y, rs);
      ctx.fillStyle = station;
      ctx.fill();
      ctx.lineWidth = transfer ? w * 0.6 : w * 0.5;
      ctx.strokeStyle = ink;
      ctx.stroke();
      if (n.type === "recording" || n.type === "person") {
        circle(ctx, x, y, rs * 0.4);
        ctx.fillStyle = ink;
        ctx.fill();
      }
    },
  };
}

// ---- Relevo -----------------------------------------------------------
/**
 * Relevo: mapa topográfico do que você sabe. Temas e projetos são morros e as notas em
 * volta os levantam; morros vizinhos se juntam em serras. Curvas de nível em sépia, as
 * mestras mais fortes, faixas de altura do verde ao ocre, picos marcados com ▲ na cor do tema.
 */
const PAPER = "#EEF0E8";
const RELEVO_INK = "#2B2A24";
const CONTOUR = "#8B6B4E";
const BANDS = ["#E5E9DA", "#DCE2CC", "#E1DCC5", "#DCD0B6", "#D5C5A7", "#CDB998", "#C4AC8A"];
const relevo: GraphTheme = {
  id: "relevo",
  name: "Relevo",
  bg: PAPER,
  label: RELEVO_INK,
  animated: false,
  emoji: false,
  curvature: 0,
  linkColor: (l, lit) => (lit ? (l.kind === "topic" ? "#2B2A2422" : "#2B2A2466") : "#2B2A240c"),
  linkWidth: (l) => (l.kind === "wikilink" ? 1.1 : 0.7),
  particles: () => 0,
  particleColor: () => RELEVO_INK,
  backdrop: (ctx, { scale, nodes }) => {
    const terrain = terrainFor(nodes, BANDS);
    if (!terrain) return;
    const { image, x0, y0, cell, cols, rows } = terrain;
    if (image) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, x0 - cell / 2, y0 - cell / 2, cols * cell, rows * cell);
      ctx.restore();
    }
    ctx.lineJoin = "round";
    ctx.strokeStyle = alpha(CONTOUR, 0.5);
    ctx.lineWidth = 0.8 / scale;
    ctx.stroke(terrain.lines);
    ctx.strokeStyle = alpha(CONTOUR, 0.9);
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke(terrain.index);
  },
  node: (ctx, n, { r, lit, scale }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    ctx.globalAlpha = lit ? 1 : 0.25;
    if (isHubNode(n)) {
      // Pico: triângulo na cor do tema (projetos e o resto mantêm a forma do tipo)
      const s = Math.max(r * 0.75, 3.5 / scale);
      typePath(ctx, n.type === "topic" ? "sprint" : n.type, x, y, s);
      ctx.fillStyle = colorOf(n);
      ctx.fill();
      ctx.lineWidth = 1.4 / scale;
      ctx.strokeStyle = RELEVO_INK;
      ctx.stroke();
      return;
    }
    // Povoados: pontos de tinta; gravações e pessoas vazadas
    const s = Math.max(r * 0.42, 1.6 / scale);
    typePath(ctx, n.type, x, y, s);
    if (hollow(n)) {
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.lineWidth = 1.1 / scale;
      ctx.strokeStyle = RELEVO_INK;
      ctx.stroke();
    } else {
      ctx.fillStyle = RELEVO_INK;
      ctx.fill();
    }
  },
};

// ---- Sinapse ----------------------------------------------------------
/**
 * Sinapse: a teia como tecido nervoso, em grafite. Cada ponto é um neurônio (corpo com
 * núcleo claro); temas e projetos têm dendritos na cor deles. Os sinais correm âmbar pelas
 * ligações, com um rastro curto, e disparam só pelos vizinhos do ponto em foco.
 */
const SIN_BG = "#0B0C0E";
const SIGNAL = "#F5B759";
const sinapse: GraphTheme = {
  id: "sinapse",
  name: "Sinapse",
  bg: SIN_BG,
  label: "#ECEAE6",
  hubLabel: (n) => mix(colorOf(n), "#F4F2EE", 0.55),
  stars: "#8F8C86",
  animated: true,
  emoji: false,
  curvature: 0.2,
  linkColor: (l, lit) => (lit ? (l.kind === "topic" ? "#2A2D33" : "#454A53") : "#15171A"),
  linkWidth: (l) => (l.kind === "wikilink" ? 1.2 : 0.7),
  particles: (l) => (l.kind === "wikilink" || l.kind === "ai" ? 2 : 1),
  particleColor: () => SIGNAL,
  particleSpeed: 0.008,
  particle: (ctx, x, y, l, scale) => {
    const s = end(l.source);
    const t = end(l.target);
    if (s?.x != null && t?.x != null) {
      // Rastro: um traço curto para trás, no sentido em que o sinal corre
      const dx = t.x - s.x;
      const dy = t.y! - s.y!;
      const len = Math.hypot(dx, dy) || 1;
      const tail = 9 / scale;
      ctx.beginPath();
      ctx.moveTo(x - (dx / len) * tail, y - (dy / len) * tail);
      ctx.lineTo(x, y);
      ctx.lineWidth = 1.6 / scale;
      ctx.lineCap = "round";
      ctx.strokeStyle = alpha(SIGNAL, 0.4);
      ctx.stroke();
    }
    dot(ctx, x, y, 1.7 / scale, "#FFE3B0");
  },
  backdrop: () => {},
  node: (ctx, n, { r, lit, t, scale }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const c = colorOf(n);
    ctx.globalAlpha = lit ? 1 : 0.18;
    const hub = isHubNode(n);
    if (hub) {
      // Dendritos: espinhos afinando, cada um com seu ângulo e um balanço lento
      const count = 7 + Math.floor(seeded(n.id) * 4);
      const base = seeded(n.id, 1) * Math.PI * 2;
      ctx.fillStyle = alpha(c, 0.55);
      for (let i = 0; i < count; i++) {
        const a = base + (i / count) * Math.PI * 2 + (seeded(n.id, i + 2) - 0.5) * 0.5 + 0.05 * Math.sin(t / 1600 + i);
        const len = r * (1.9 + seeded(n.id, i + 20) * 1.1);
        const w = r * 0.32;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(x + ca * r * 0.7 - sa * w, y + sa * r * 0.7 + ca * w);
        ctx.lineTo(x + ca * len, y + sa * len);
        ctx.lineTo(x + ca * r * 0.7 + sa * w, y + sa * r * 0.7 - ca * w);
        ctx.closePath();
        ctx.fill();
      }
    }
    circle(ctx, x, y, hub ? r : r * 0.85);
    ctx.fillStyle = "#17191D";
    ctx.fill();
    ctx.lineWidth = Math.max(1 / scale, r * (hub ? 0.2 : 0.26));
    ctx.strokeStyle = hub ? c : mix(c, SIN_BG, 0.2);
    ctx.stroke();
    circle(ctx, x, y, r * (hub ? 0.36 : 0.32));
    ctx.fillStyle = "#ECEAE6";
    ctx.fill();
  },
};

// ---- Abissal ----------------------------------------------------------
/**
 * Abissal: fundo do mar. Cada ponto é um bicho que brilha e respira devagar; a neve
 * marinha cai ao fundo. Temas e projetos ganham um anel de luz para se destacarem, e
 * os fluxos são pingos de luz que correm pelas ligações.
 */
const ABISSAL_GLOW = "#5EE6C3";
const abissal: GraphTheme = {
  id: "abissal",
  name: "Abissal",
  bg: "#021219",
  label: "#C9FFF4",
  // A cor do tema clareada: o nome continua daquele tema, mas legível no escuro
  hubLabel: (n) => mix(colorOf(n), "#E6FFFA", 0.4),
  stars: ABISSAL_GLOW,
  animated: true,
  curvature: 0.08,
  linkColor: (l, lit) => (lit ? alpha(colorOf(end(l.source), ABISSAL_GLOW), 0.35) : "#5EE6C30d"),
  linkWidth: () => 0.7,
  particles: (l) => (l.kind === "topic" ? 1 : 3),
  particleColor: (l) => colorOf(end(l.source), ABISSAL_GLOW),
  particle: (ctx, x, y, l, scale) => {
    const c = colorOf(end(l.source), ABISSAL_GLOW);
    // Halo e miolo somando luz, sempre do mesmo tamanho na tela
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.28;
    dot(ctx, x, y, 4 / scale, c);
    ctx.globalAlpha = 1;
    dot(ctx, x, y, 1.5 / scale, mix(c, "#F2FFFC", 0.55));
  },
  backdrop: (ctx, { t }) => sky(ctx, t / 3, ABISSAL_GLOW, true, 4),
  node: (ctx, n, { r, lit, t, scale }) => {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const c = colorOf(n);
    const breath = 0.6 + 0.4 * Math.sin(t / 1100 + y * 0.05);
    ctx.globalAlpha = lit ? 1 : 0.15;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    g.addColorStop(0, alpha(c, 0.9 * breath));
    g.addColorStop(0.4, alpha(c, 0.25 * breath));
    g.addColorStop(1, alpha(c, 0));
    circle(ctx, x, y, r * 2.6);
    ctx.fillStyle = g;
    ctx.fill();
    if (isHubNode(n)) {
      // Anel que pulsa junto com a respiração, como a borda de uma água-viva
      circle(ctx, x, y, r * (1.2 + 0.08 * breath));
      ctx.lineWidth = Math.max(0.6 / scale, r * 0.09);
      ctx.strokeStyle = alpha(mix(c, "#EFFFFB"), 0.35 + 0.35 * breath);
      ctx.stroke();
      // Com emoji, o emoji é o núcleo
      if (n.emoji) return;
    }
    circle(ctx, x, y, r * 0.55);
    ctx.fillStyle = "#EFFFFB";
    ctx.fill();
  },
};

export const THEME_LIST: { id: ThemeId; name: string }[] = [
  { id: "executivo", name: "Executivo" },
  { id: "etiquetas", name: "Etiquetas" },
  { id: "metro", name: "Metrô" },
  { id: "relevo", name: "Relevo" },
  { id: "sinapse", name: "Sinapse" },
  { id: "abissal", name: "Abissal" },
];
/** Visual pelo id; um id antigo (Espaço, Teia, Constelações) cai no Executivo. */
export function themeFor(id: ThemeId, dark: boolean): GraphTheme {
  if (id === "etiquetas") return etiquetas(dark);
  if (id === "metro") return metro(dark);
  if (id === "relevo") return relevo;
  if (id === "sinapse") return sinapse;
  if (id === "abissal") return abissal;
  return executivo(dark);
}
