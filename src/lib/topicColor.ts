/** Uma cor por tema: a do banco, se houver; senão uma da paleta escolhida pelo nome (sempre a mesma). */
export const TOPIC_PALETTE = ["#A8691A", "#2F7D73", "#B5523B", "#6B7F3A", "#8E5B8A", "#C08A2E", "#3F7A93", "#9A5A2E"];

export function topicColor(t: { slug: string; color?: string | null }): string {
  if (t.color) return t.color;
  let h = 0;
  for (const ch of t.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TOPIC_PALETTE[h % TOPIC_PALETTE.length];
}
