export type NoteKind = "note" | "recording";
export type NoteStatus = "ready" | "recording" | "transcribing" | "analyzing" | "error";

export interface Insights {
  key_points?: string[];
  action_items?: { text: string; owner?: string | null; due?: string | null; assignees?: string[]; project?: string | null; recurrence?: string | null }[];
  decisions?: string[];
  people?: string[];
  questions?: string[];
  /** O que a análise quer criar e espera você confirmar na nota */
  pending?: PendingCreations;
  /** Tarefas sugeridas que podem ser de mais de um projeto: você escolhe (options = ids dos candidatos) */
  task_projects?: { task_ids: string[]; options: string[] };
}

export interface PendingCreations {
  topics: { name: string; slug: string; description: string; emoji: string | null; relevance: number }[];
  people: { name: string; slug: string; task_ids: string[] }[];
  entities?: { kind: EntityKind; name: string; slug: string; description: string; links?: { type: "project" | "task" | "company"; id: string }[] }[];
}

export type EntityKind = "company" | "system";
export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  slug: string;
  description: string | null;
  url: string | null;
  created_at: string;
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
  /** Cor escolhida para a nota; null = a do tema principal */
  color?: string | null;
  cover_path?: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NoteListItem = Pick<Note, "id" | "title" | "kind" | "status" | "summary" | "updated_at" | "duration_seconds" | "pinned" | "color"> & {
  /** Quantos arquivos a nota tem, quando a consulta traz (nota de arquivo) */
  note_files?: { count: number }[];
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
  type: "note" | "recording" | "topic" | "project" | "task" | "person" | "sprint" | "company" | "system";
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
  kind: "topic" | "wikilink" | "ai" | "project" | "task" | "assignee" | "mention" | "sprint" | "entity";
}

export type ProjectStatus = "suggested" | "idea" | "active" | "paused" | "done" | "archived";
export type TaskStatus = "suggested" | "todo" | "doing" | "blocked" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Person {
  id: string;
  name: string;
  slug: string;
  role: string | null;
  email: string | null;
  about: string | null;
  /** A pessoa que é você (dono da conta) */
  is_me?: boolean;
  company_id?: string | null;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  emoji: string | null;
  color: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  owner_id: string | null;
  origin_note_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  number: number;
  project_id: string | null;
  parent_id: string | null;
  note_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  estimate_hours: number | null;
  spent_hours: number;
  started_at: string | null;
  completed_at: string | null;
  source: "ai" | "manual";
  sprint_id: string | null;
  recurrence: Recurrence | null;
  created_at: string;
}

export type Recurrence = "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";

export interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
}

export interface TemplateTask {
  title: string;
  description?: string;
  priority?: TaskPriority;
  estimate_hours?: number | null;
  /** Dias depois do início do projeto */
  offset_days?: number | null;
  recurrence?: Recurrence | null;
}

export interface Template {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  tasks: TemplateTask[];
}

/** Tarefa com projeto e responsáveis já juntados (o que as listas mostram). */
export type TaskRow = Task & {
  projects: Pick<Project, "id" | "name" | "slug" | "emoji" | "color"> | null;
  task_assignees: { people: Pick<Person, "id" | "name" | "slug"> | null }[];
};
