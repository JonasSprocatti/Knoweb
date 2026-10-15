import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { serverError, unauthorized } from "@/lib/server/http";
import { topicColor } from "@/lib/topicColor";
import type { GraphLink, GraphNode } from "@/lib/types";

const NO_TOPIC_COLOR = "#C9CDEB";

/** Nós (notas + temas) e arestas (nota↔tema, wikilinks, ligações do Claude). */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const [notes, topics, noteTopics, links] = await Promise.all([
    supabase.from("notes").select("id, title, kind, created_at, cover_path").limit(3000),
    supabase.from("topics").select("id, name, slug, color, emoji, cover_path, created_at"),
    supabase.from("note_topics").select("note_id, topic_id, relevance"),
    supabase.from("note_links").select("source_id, target_id, kind"),
  ]);
  const err = notes.error || topics.error || noteTopics.error || links.error;
  if (err) return serverError(err);

  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  const colorByTopic = new Map((topics.data ?? []).map((t) => [t.id as string, topicColor(t)]));
  // A nota herda a cor do tema em que ela é mais relevante
  const mainTopic = new Map<string, { topic: string; relevance: number }>();

  const graphLinks: GraphLink[] = [];
  for (const nt of noteTopics.data ?? []) {
    graphLinks.push({ source: nt.note_id, target: `t:${nt.topic_id}`, kind: "topic" });
    bump(nt.note_id);
    bump(`t:${nt.topic_id}`);
    const rel = Number(nt.relevance) || 0;
    if ((mainTopic.get(nt.note_id)?.relevance ?? -1) < rel) mainTopic.set(nt.note_id, { topic: nt.topic_id, relevance: rel });
  }
  const seenPairs = new Set<string>();
  for (const l of links.data ?? []) {
    const key = [l.source_id, l.target_id].sort().join("|") + l.kind;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    graphLinks.push({ source: l.source_id, target: l.target_id, kind: l.kind as GraphLink["kind"] });
    bump(l.source_id);
    bump(l.target_id);
  }

  // Imagens: URLs assinadas de uma vez só (bucket privado)
  const paths = [...(notes.data ?? []), ...(topics.data ?? [])].map((r) => r.cover_path as string | null).filter((p): p is string => !!p);
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("images").createSignedUrls(paths, 60 * 60 * 6);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  const imageOf = (p: string | null) => (p ? (urlByPath.get(p) ?? null) : null);

  const nodes: GraphNode[] = [
    ...(notes.data ?? []).map((n) => {
      const main = mainTopic.get(n.id as string);
      return {
        id: n.id as string,
        label: n.title as string,
        type: (n.kind === "recording" ? "recording" : "note") as GraphNode["type"],
        weight: degree.get(n.id as string) ?? 0,
        color: (main && colorByTopic.get(main.topic)) || NO_TOPIC_COLOR,
        image: imageOf(n.cover_path as string | null),
        created_at: n.created_at as string,
      };
    }),
    ...(topics.data ?? []).map((t) => ({
      id: `t:${t.id}`,
      label: t.name as string,
      type: "topic" as const,
      slug: t.slug as string,
      weight: degree.get(`t:${t.id}`) ?? 0,
      color: colorByTopic.get(t.id as string)!,
      emoji: t.emoji as string | null,
      image: imageOf(t.cover_path as string | null),
      created_at: t.created_at as string,
    })),
  ];

  return NextResponse.json({ nodes, links: graphLinks });
}
