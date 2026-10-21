import type { SimLink, SimNode } from "@/lib/graphThemes";

/**
 * Mapa de metrô da teia: cada tema ou projeto é uma linha que passa pelas notas ligadas
 * a ele. A linha é a árvore mais curta que liga o tema às suas estações (trechos curtos,
 * com ramais, sem idas e voltas), e cada trecho anda reto e em diagonais de 45°.
 */
export interface MetroLine {
  hub: SimNode;
  /** Estações da linha (ids), para acender a linha quando uma delas está em foco */
  stops: Set<string>;
  path: Path2D;
}
export interface Metro {
  lines: MetroLine[];
  /** Quantas linhas passam por cada estação (2 ou mais: baldeação) */
  transfers: Map<string, number>;
}

const isHub = (n: SimNode) => n.type === "topic" || n.type === "project" || n.type === "company" || n.type === "system";
const node = (e: string | SimNode) => (typeof e === "string" ? null : e);

/** Trecho de A até B: reto pelo eixo mais longo, depois diagonal de 45°, com a curva arredondada */
export function octilinear(path: CanvasPath, ax: number, ay: number, bx: number, by: number, bend: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const cx = adx > ady ? ax + Math.sign(dx) * (adx - ady) : ax;
  const cy = adx > ady ? ay : ay + Math.sign(dy) * (ady - adx);
  const straight = Math.abs(adx - ady);
  const diag = Math.min(adx, ady) * Math.SQRT2;
  path.moveTo(ax, ay);
  if (straight > 0.5 && diag > 0.5) path.arcTo(cx, cy, bx, by, Math.min(bend, straight / 2, diag / 2));
  path.lineTo(bx, by);
}

let cache: { key: string; at: number; metro: Metro } | null = null;

function keyOf(nodes: SimNode[], links: SimLink[]) {
  let h = nodes.length * 7 + links.length;
  for (const n of nodes) h = (Math.imul(h, 31) + (Math.round((n.x ?? 0) / 2) * 7919 + Math.round((n.y ?? 0) / 2))) | 0;
  return String(h);
}

/** Calcula (ou reaproveita) as linhas; enquanto a teia se mexe, no máximo a cada 120 ms. */
export function metroFor(nodes: SimNode[], links: SimLink[]): Metro {
  const key = keyOf(nodes, links);
  const now = typeof performance === "undefined" ? 0 : performance.now();
  if (!cache || (cache.key !== key && now - cache.at >= 120)) cache = { key, at: now, metro: build(links) };
  metroFor.last = cache.metro;
  return cache.metro;
}
/** O último mapa calculado (o fundo calcula antes dos pontos, a cada quadro) */
metroFor.last = null as Metro | null;

function build(links: SimLink[]): Metro {
  const members = new Map<SimNode, Set<SimNode>>();
  for (const l of links) {
    const s = node(l.source);
    const t = node(l.target);
    if (!s || !t || s.x == null || t.x == null) continue;
    const [hub, stop] = isHub(s) && !isHub(t) ? [s, t] : isHub(t) && !isHub(s) ? [t, s] : [null, null];
    if (!hub || !stop) continue;
    if (!members.has(hub)) members.set(hub, new Set());
    members.get(hub)!.add(stop);
  }

  const transfers = new Map<string, number>();
  const lines: MetroLine[] = [];
  for (const [hub, set] of members) {
    const pts = [hub, ...set];
    for (const p of set) transfers.set(p.id, (transfers.get(p.id) ?? 0) + 1);
    // Prim: árvore geradora mínima a partir do tema
    const n = pts.length;
    const inTree = new Uint8Array(n);
    const best = new Float64Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    best[0] = 0;
    const path = new Path2D();
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
      inTree[u] = 1;
      if (parent[u] >= 0) {
        const a = pts[parent[u]];
        const b = pts[u];
        octilinear(path, a.x!, a.y!, b.x!, b.y!, 8);
      }
      for (let i = 0; i < n; i++) {
        if (inTree[i]) continue;
        const d = Math.hypot(pts[i].x! - pts[u].x!, pts[i].y! - pts[u].y!);
        if (d < best[i]) {
          best[i] = d;
          parent[i] = u;
        }
      }
    }
    lines.push({ hub, stops: new Set([...set].map((p) => p.id)), path });
  }
  // Linhas maiores por baixo, as menores por cima (ficam visíveis)
  lines.sort((a, b) => b.stops.size - a.stops.size);
  return { lines, transfers };
}
