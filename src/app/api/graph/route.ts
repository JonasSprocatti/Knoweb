import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { serverError, unauthorized } from "@/lib/server/http";
import type { GraphLink, GraphNode } from "@/lib/types";

/** Nós (notas + temas) e arestas (nota↔tema, wikilinks, ligações do Claude). */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const [notes, topics, noteTopics, links] = await Promise.all([
    supabase.from("notes").select("id, title, kind").limit(3000),
    supabase.from("topics").select("id, name, slug"),
    supabase.from("note_topics").select("note_id, topic_id"),
    supabase.from("note_links").select("source_id, target_id, kind"),
  ]);
  const err = notes.error || topics.error || noteTopics.error || links.error;
  if (err) return serverError(err);

  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  const graphLinks: GraphLink[] = [];
  for (const nt of noteTopics.data ?? []) {
    graphLinks.push({ source: nt.note_id, target: `t:${nt.topic_id}`, kind: "topic" });
    bump(nt.note_id);
    bump(`t:${nt.topic_id}`);
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

  const nodes: GraphNode[] = [
    ...(notes.data ?? []).map((n) => ({
      id: n.id as string,
      label: n.title as string,
      type: (n.kind === "recording" ? "recording" : "note") as GraphNode["type"],
      weight: degree.get(n.id as string) ?? 0,
    })),
    ...(topics.data ?? []).map((t) => ({
      id: `t:${t.id}`,
      label: t.name as string,
      type: "topic" as const,
      slug: t.slug as string,
      weight: degree.get(`t:${t.id}`) ?? 0,
    })),
  ];

  return NextResponse.json({ nodes, links: graphLinks });
}
