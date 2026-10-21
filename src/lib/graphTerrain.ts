import type { SimNode } from "@/lib/graphThemes";

/**
 * Relevo da teia: cada tema ou projeto é um morro e cada nota um montinho. As alturas
 * se somam (dois temas vizinhos viram uma serra só) e as curvas de nível saem desse
 * campo, como num mapa topográfico de verdade.
 */
export interface Terrain {
  /** Faixas de altura, um pixel por célula da grade (null se não houver pontos) */
  image: HTMLCanvasElement | null;
  /** Curvas de nível comuns e as mestras (a cada 4), já no espaço do grafo */
  lines: Path2D;
  index: Path2D;
  x0: number;
  y0: number;
  cell: number;
  cols: number;
  rows: number;
}

const isHub = (n: SimNode) => n.type === "topic" || n.type === "project" || n.type === "company" || n.type === "system";

/** Quanto cada ponto levanta o terreno e quão largo é o morro dele */
function bump(n: SimNode) {
  if (!isHub(n)) return { amp: 0.42, sigma: 13 };
  const w = Math.sqrt(Math.max(1, n.weight));
  return { amp: Math.min(6, 1 + w * 0.55), sigma: Math.min(70, 22 + w * 5) };
}

let cache: { key: string; at: number; terrain: Terrain } | null = null;

/** Chave barata das posições: muda quando algum ponto anda mais que ~2 unidades */
function keyOf(nodes: SimNode[]) {
  let h = nodes.length;
  for (const n of nodes) h = (Math.imul(h, 31) + (Math.round((n.x ?? 0) / 2) * 7919 + Math.round((n.y ?? 0) / 2))) | 0;
  return String(h);
}

/**
 * Calcula (ou reaproveita) o terreno. Enquanto a teia ainda se mexe, recalcula no máximo
 * a cada 120 ms; parada, só quando algum ponto muda de lugar.
 */
export function terrainFor(nodes: SimNode[], bands: string[]): Terrain | null {
  const placed = nodes.filter((n) => n.x != null && n.y != null);
  if (!placed.length) return null;
  const key = keyOf(placed);
  const now = typeof performance === "undefined" ? 0 : performance.now();
  if (cache && (cache.key === key || now - cache.at < 120)) return cache.terrain;
  const terrain = build(placed, bands);
  cache = { key, at: now, terrain };
  return terrain;
}

function build(nodes: SimNode[], bands: string[]): Terrain {
  const bumps = nodes.map(bump);
  const reach = Math.max(...bumps.map((b) => b.sigma)) * 3;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x!);
    minY = Math.min(minY, n.y!);
    maxX = Math.max(maxX, n.x!);
    maxY = Math.max(maxY, n.y!);
  }
  const x0 = minX - reach;
  const y0 = minY - reach;
  const w = maxX - minX + reach * 2;
  const h = maxY - minY + reach * 2;
  // Grade de no máximo ~50 mil células, com células de pelo menos 4 unidades
  const cell = Math.max(4, Math.sqrt((w * h) / 50_000));
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const field = new Float32Array(cols * rows);

  nodes.forEach((n, k) => {
    const { amp, sigma } = bumps[k];
    const inv = 1 / (2 * sigma * sigma);
    const cx = (n.x! - x0) / cell;
    const cy = (n.y! - y0) / cell;
    const R = Math.ceil((sigma * 3) / cell);
    const i0 = Math.max(0, Math.floor(cx - R));
    const i1 = Math.min(cols - 1, Math.ceil(cx + R));
    const j0 = Math.max(0, Math.floor(cy - R));
    const j1 = Math.min(rows - 1, Math.ceil(cy + R));
    for (let j = j0; j <= j1; j++) {
      const dy = (j - cy) * cell;
      for (let i = i0; i <= i1; i++) {
        const dx = (i - cx) * cell;
        field[j * cols + i] += amp * Math.exp(-(dx * dx + dy * dy) * inv);
      }
    }
  });

  let max = 0;
  for (const v of field) if (v > max) max = v;
  // Uma curva a cada `step` de altura, no máximo umas 16 curvas no morro mais alto
  const step = Math.max(0.2, max / 16);

  // Faixas de altura (uma a cada 2 curvas); o chão fica transparente e mostra o papel
  let image: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    image = document.createElement("canvas");
    image.width = cols;
    image.height = rows;
    const ictx = image.getContext("2d")!;
    const img = ictx.createImageData(cols, rows);
    const rgb = bands.map((c) => [1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16)));
    for (let p = 0; p < field.length; p++) {
      const band = Math.floor(field[p] / (step * 2));
      if (band < 1) continue;
      const [r, g, b] = rgb[Math.min(band - 1, rgb.length - 1)];
      img.data[p * 4] = r;
      img.data[p * 4 + 1] = g;
      img.data[p * 4 + 2] = b;
      img.data[p * 4 + 3] = 255;
    }
    ictx.putImageData(img, 0, 0);
  }

  // Curvas de nível (marching squares), interpoladas entre os cantos de cada célula
  const lines = new Path2D();
  const index = new Path2D();
  const levels = Math.floor(max / step);
  for (let k = 1; k <= levels; k++) {
    const level = k * step;
    const path = k % 4 === 0 ? index : lines;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = field[j * cols + i];
        const b = field[j * cols + i + 1];
        const c = field[(j + 1) * cols + i + 1];
        const d = field[(j + 1) * cols + i];
        const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const px = x0 + i * cell;
        const py = y0 + j * cell;
        const t = (p: number, q: number) => (level - p) / (q - p);
        const top = () => [px + cell * t(a, b), py] as const;
        const right = () => [px + cell, py + cell * t(b, c)] as const;
        const bottom = () => [px + cell * t(d, c), py + cell] as const;
        const left = () => [px, py + cell * t(a, d)] as const;
        const seg = (p: readonly [number, number], q: readonly [number, number]) => {
          path.moveTo(p[0], p[1]);
          path.lineTo(q[0], q[1]);
        };
        switch (code) {
          case 1: case 14: seg(left(), bottom()); break;
          case 2: case 13: seg(bottom(), right()); break;
          case 3: case 12: seg(left(), right()); break;
          case 4: case 11: seg(top(), right()); break;
          case 6: case 9: seg(top(), bottom()); break;
          case 7: case 8: seg(left(), top()); break;
          case 5: seg(left(), top()); seg(bottom(), right()); break;
          case 10: seg(top(), right()); seg(left(), bottom()); break;
        }
      }
    }
  }
  return { image, lines, index, x0, y0, cell, cols, rows };
}
