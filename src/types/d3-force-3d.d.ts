// Sem tipos publicados; usamos só forceX/forceY
declare module "d3-force-3d" {
  type Strength = number | ((node: { weight?: number }) => number);
  export function forceX(x?: number): { strength(s: Strength): unknown };
  export function forceY(y?: number): { strength(s: Strength): unknown };
}
