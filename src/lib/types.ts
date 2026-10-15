export type NoteKind = "note" | "recording";
export type NoteStatus = "ready" | "recording" | "transcribing" | "analyzing" | "error";

export interface Insights {
  key_points?: string[];
  action_items?: { text: string; owner?: string | null; due?: string | null }[];
  decisions?: string[];
  people?: string[];
  questions?: string[];
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  transcript: string;
  kind: NoteKind;
  status: NoteStatus;
  summary: string | null;
  insights: Insights;
  duration_seconds: number;
  pinned: boolean;
  cover_path?: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NoteListItem = Pick<Note, "id" | "title" | "kind" | "status" | "summary" | "updated_at" | "duration_seconds" | "pinned"> & {
  /** Temas da nota, quando a consulta traz (usado para a cor) */
  note_topics?: { relevance: number; topics: unknown }[];
};

export interface AudioSegment {
  id: string;
  note_id: string;
  seq: number;
  storage_path: string;
  mime_type: string;
  duration_seconds: number;
  status: "uploaded" | "transcribing" | "done" | "error";
  transcript: string | null;
  segments: { start: number; end: number; text: string }[] | null;
  error: string | null;
  created_at: string;
}

export interface Topic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  emoji?: string | null;
  cover_path?: string | null;
}

export interface TopicWithCount extends Topic {
  note_count: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "note" | "recording" | "topic";
  weight: number;
  slug?: string;
  /** Cor do tema (ou do tema principal da nota) */
  color: string;
  emoji?: string | null;
  /** URL assinada da imagem do ponto, válida por algumas horas */
  image?: string | null;
  created_at: string;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: "topic" | "wikilink" | "ai";
}
