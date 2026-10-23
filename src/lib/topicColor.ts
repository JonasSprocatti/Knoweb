/** Uma cor por tema: a do banco, se houver; senão uma da paleta escolhida pelo nome (sempre a mesma). */
export const TOPIC_PALETTE = ["#A8691A", "#2F7D73", "#B5523B", "#6B7F3A", "#8E5B8A", "#C08A2E", "#3F7A93", "#9A5A2E"];

/** As cores do seletor: a paleta automática e mais quatro no mesmo tom (escolhidas à mão). */
export const COLOR_CHOICES = [...TOPIC_PALETTE, "#4E8A55", "#B4485E", "#5C6F8F", "#7A6B58"];

/** Cor válida para gravar no banco (#rrggbb) ou null (= automática). */
export function cleanColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

export function topicColor(t: { slug: string; color?: string | null }): string {
  if (t.color) return t.color;
  let h = 0;
  for (const ch of t.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TOPIC_PALETTE[h % TOPIC_PALETTE.length];
}
