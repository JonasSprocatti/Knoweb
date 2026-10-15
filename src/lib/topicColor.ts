/** Uma cor por tema: a do banco, se houver; senão uma da paleta escolhida pelo nome (sempre a mesma). */
export const TOPIC_PALETTE = ["#3D6FD9", "#2F9E8F", "#C27A3A", "#7A5BD0", "#C2456E", "#5C8A3A", "#2E8FB5", "#9A7B3F"];

export function topicColor(t: { slug: string; color?: string | null }): string {
  if (t.color) return t.color;
  let h = 0;
  for (const ch of t.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TOPIC_PALETTE[h % TOPIC_PALETTE.length];
}
