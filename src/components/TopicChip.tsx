import Link from "next/link";
import { topicColor } from "@/lib/topicColor";

/** Tema com a sua cor: o ponto colorido carrega a cor, o texto fica legível nos dois modos. */
export function TopicChip({
  topic,
  count,
  children,
}: {
  topic: { name: string; slug: string; color?: string | null; emoji?: string | null };
  count?: number;
  children?: React.ReactNode;
}) {
  const color = topicColor(topic);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-2.5 text-sm text-ink"
      style={{ borderColor: `${color}66`, background: `${color}14` }}
    >
      {topic.emoji ? <span aria-hidden>{topic.emoji}</span> : <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />}
      <Link href={`/topics/${topic.slug}`} className="hover:underline">
        {topic.name}
      </Link>
      {count != null && <span className="text-faint">{count}</span>}
      {children}
    </span>
  );
}
