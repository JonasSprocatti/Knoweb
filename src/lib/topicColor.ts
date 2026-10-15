/** Uma cor por tema: a do banco, se houver; senão uma da paleta escolhida pelo nome (sempre a mesma). */
export const TOPIC_PALETTE = ["#FF8A5B", "#FFD23F", "#5EE6C3", "#7FB2FF", "#C38CFF", "#FF6FB5", "#9BE15D", "#4FD1FF"];

export function topicColor(t: { slug: string; color?: string | null }): string {
  if (t.color) return t.color;
  let h = 0;
  for (const ch of t.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TOPIC_PALETTE[h % TOPIC_PALETTE.length];
}
