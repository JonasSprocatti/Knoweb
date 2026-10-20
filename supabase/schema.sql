-- =====================================================================
-- Knoweb — schema do banco (rode inteiro no SQL Editor do Supabase)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Notas: tudo é nota. Uma gravação vira uma nota com kind = 'recording'.
-- ---------------------------------------------------------------------
create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null default 'Sem título',
  content       text not null default '',         -- markdown editável (o que você escreve)
  transcript    text not null default '',         -- transcrição (mantida pelo servidor, não editável)
  kind          text not null default 'note' check (kind in ('note', 'recording')),
  status        text not null default 'ready'
                check (status in ('ready', 'recording', 'transcribing', 'analyzing', 'error')),
  summary       text,                              -- resumo gerado pelo Claude
  insights      jsonb not null default '{}'::jsonb, -- pontos-chave, ações, decisões, pessoas
  duration_seconds integer not null default 0,
  pinned        boolean not null default false,
  analyzed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search        tsvector generated always as (
                  setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
                  setweight(to_tsvector('portuguese', coalesce(summary, '')), 'B') ||
                  setweight(to_tsvector('portuguese', coalesce(content, '')), 'C') ||
                  setweight(to_tsvector('portuguese', coalesce(transcript, '')), 'D')
                ) stored
);

create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index if not exists notes_search_idx on public.notes using gin (search);
create index if not exists notes_user_title_idx on public.notes (user_id, lower(title));

-- ---------------------------------------------------------------------
-- Segmentos de áudio: a gravação é quebrada em pedaços (limite de 25 MB
-- do Whisper e para transcrever enquanto você ainda está gravando).
-- ---------------------------------------------------------------------
create table if not exists public.audio_segments (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references public.notes(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seq           integer not null,
  storage_path  text not null,
  mime_type     text not null default 'audio/webm',
  duration_seconds numeric not null default 0,
  status        text not null default 'uploaded'
                check (status in ('uploaded', 'transcribing', 'done', 'error')),
  transcript    text,
  segments      jsonb,           -- trechos com timestamps vindos do Whisper
  error         text,
  created_at    timestamptz not null default now(),
  unique (note_id, seq)
);

create index if not exists audio_segments_note_idx on public.audio_segments (note_id, seq);

-- ---------------------------------------------------------------------
-- Temas (extraídos pelo Claude ou criados por você)
-- ---------------------------------------------------------------------
create table if not exists public.topics (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  slug          text not null,
  description   text,
  color         text,
  created_at    timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.note_topics (
  note_id       uuid not null references public.notes(id) on delete cascade,
  topic_id      uuid not null references public.topics(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  relevance     real not null default 0.5,
  source        text not null default 'ai' check (source in ('ai', 'manual')),
  primary key (note_id, topic_id)
);

create index if not exists note_topics_topic_idx on public.note_topics (topic_id);

-- ---------------------------------------------------------------------
-- Ligações entre notas: [[wikilinks]] escritos por você e conexões
-- sugeridas pelo Claude.
-- ---------------------------------------------------------------------
create table if not exists public.note_links (
  source_id     uuid not null references public.notes(id) on delete cascade,
  target_id     uuid not null references public.notes(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('wikilink', 'ai')),
  reason        text,
  created_at    timestamptz not null default now(),
  primary key (source_id, target_id, kind),
  check (source_id <> target_id)
);

create index if not exists note_links_target_idx on public.note_links (target_id);

-- ---------------------------------------------------------------------
-- updated_at automático (só quando título/conteúdo mudam)
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  if new.title is distinct from old.title or new.content is distinct from old.content then
    new.updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Busca de texto completo (usada na busca e no "Perguntar à teia")
-- ---------------------------------------------------------------------
-- any_word = true troca o "E" por "OU" entre as palavras (bom para perguntas em linguagem natural)
create or replace function public.search_notes(q text, max_results int default 20, any_word boolean default false)
returns table (id uuid, title text, summary text, kind text, updated_at timestamptz, rank real, snippet text)
language plpgsql stable security invoker as $$
declare
  query tsquery;
begin
  if any_word then
    query := nullif(replace(plainto_tsquery('portuguese', q)::text, ' & ', ' | '), '')::tsquery;
  else
    query := websearch_to_tsquery('portuguese', q);
  end if;
  if query is null then
    return;
  end if;
  return query
    select n.id, n.title, n.summary, n.kind, n.updated_at,
           ts_rank(n.search, query) as rank,
           ts_headline('portuguese', n.content || ' ' || n.transcript, query,
                       'MaxWords=35, MinWords=12, StartSel=<<, StopSel=>>') as snippet
    from public.notes n
    where n.user_id = auth.uid()
      and n.search @@ query
    order by rank desc
    limit max_results;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security: cada usuário só enxerga o que é seu
-- ---------------------------------------------------------------------
alter table public.notes          enable row level security;
alter table public.audio_segments enable row level security;
alter table public.topics         enable row level security;
alter table public.note_topics    enable row level security;
alter table public.note_links     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notes', 'audio_segments', 'topics', 'note_topics', 'note_links'] loop
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Storage: bucket privado para os áudios, uma pasta por usuário
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('audio', 'audio', false, 26214400)  -- 25 MB, o limite do Whisper
on conflict (id) do nothing;

drop policy if exists "audio_own_select" on storage.objects;
drop policy if exists "audio_own_insert" on storage.objects;
drop policy if exists "audio_own_delete" on storage.objects;

create policy "audio_own_select" on storage.objects for select
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audio_own_insert" on storage.objects for insert
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audio_own_delete" on storage.objects for delete
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Visual da teia: imagens nos pontos e emoji dos temas
-- ---------------------------------------------------------------------
alter table public.notes  add column if not exists cover_path text;
alter table public.topics add column if not exists cover_path text;
alter table public.topics add column if not exists emoji text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])  -- 5 MB
on conflict (id) do nothing;

drop policy if exists "images_own_select" on storage.objects;
drop policy if exists "images_own_insert" on storage.objects;
drop policy if exists "images_own_delete" on storage.objects;

create policy "images_own_select" on storage.objects for select
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "images_own_insert" on storage.objects for insert
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "images_own_delete" on storage.objects for delete
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Realtime: a nota atualiza sozinha no outro dispositivo
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.notes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.audio_segments;
  exception when duplicate_object then null;
  end;
end $$;

-- =====================================================================
-- Trabalho: projetos, tarefas e pessoas — tudo ligado às notas na teia
-- (rode este bloco no SQL Editor; é idempotente)
-- =====================================================================
create table if not exists public.people (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  slug          text not null,
  role          text,                              -- cargo / papel
  email         text,
  about         text,
  created_at    timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  slug          text not null,
  description   text,
  emoji         text,
  color         text,
  -- suggested = o Claude sugeriu a partir de uma nota e você ainda não aceitou
  status        text not null default 'active'
                check (status in ('suggested', 'idea', 'active', 'paused', 'done', 'archived')),
  start_date    date,
  due_date      date,
  owner_id      uuid references public.people(id) on delete set null,
  origin_note_id uuid references public.notes(id) on delete set null,
  reason        text,                              -- por que o Claude sugeriu
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated always as identity,             -- ID curto, como no Notion: T-42
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete set null,
  parent_id     uuid references public.tasks(id) on delete cascade,    -- subtarefa
  note_id       uuid references public.notes(id) on delete set null,   -- nota de onde saiu
  title         text not null,
  description   text not null default '',
  -- suggested = extraída pelo Claude; vira "todo" quando você aceita
  status        text not null default 'todo'
                check (status in ('suggested', 'todo', 'doing', 'blocked', 'done', 'canceled')),
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date      date,
  estimate_hours numeric,
  spent_hours   numeric not null default 0,
  started_at    timestamptz,
  completed_at  timestamptz,
  source        text not null default 'manual' check (source in ('ai', 'manual')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists tasks_note_idx on public.tasks (note_id);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status, due_date);

create table if not exists public.task_assignees (
  task_id       uuid not null references public.tasks(id) on delete cascade,
  person_id     uuid not null references public.people(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (task_id, person_id)
);
create index if not exists task_assignees_person_idx on public.task_assignees (person_id);

-- Dependências: task_id fica bloqueada até blocked_by terminar
create table if not exists public.task_dependencies (
  task_id       uuid not null references public.tasks(id) on delete cascade,
  blocked_by    uuid not null references public.tasks(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (task_id, blocked_by),
  check (task_id <> blocked_by)
);
create index if not exists task_dependencies_blocker_idx on public.task_dependencies (blocked_by);

create table if not exists public.project_notes (
  project_id    uuid not null references public.projects(id) on delete cascade,
  note_id       uuid not null references public.notes(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  relevance     real not null default 0.5,
  source        text not null default 'ai' check (source in ('ai', 'manual')),
  primary key (project_id, note_id)
);
create index if not exists project_notes_note_idx on public.project_notes (note_id);

create table if not exists public.note_people (
  note_id       uuid not null references public.notes(id) on delete cascade,
  person_id     uuid not null references public.people(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (note_id, person_id)
);
create index if not exists note_people_person_idx on public.note_people (person_id);

-- Histórico da tarefa: mudanças registradas pelo banco + comentários
create table if not exists public.task_events (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null,      -- created | status | due_date | project | estimate | spent | priority | title | assigned | unassigned | comment
  old_value     text,
  new_value     text,
  created_at    timestamptz not null default now()
);
create index if not exists task_events_task_idx on public.task_events (task_id, created_at);

create or replace function public.task_history() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'doing' then new.started_at := coalesce(new.started_at, now()); end if;
    if new.status = 'done' then new.completed_at := coalesce(new.completed_at, now()); end if;
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status then
    if new.status = 'doing' and new.started_at is null then new.started_at := now(); end if;
    new.completed_at := case when new.status = 'done' then now() end;
    insert into public.task_events (task_id, user_id, kind, old_value, new_value) values (new.id, new.user_id, 'status', old.status, new.status);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.task_events (task_id, user_id, kind, old_value, new_value) values (new.id, new.user_id, 'due_date', old.due_date::text, new.due_date::text);
  end if;
  if new.project_id is distinct from old.project_id then
    insert into public.task_events (task_id, user_id, kind, old_value, new_value)
    values (new.id, new.user_id, 'project',
            (select name from public.projects where id = old.project_id), (select name from public.projects where id = new.project_id));
  end if;
  if new.sprint_id is distinct from old.sprint_id then
    insert into public.task_events (task_id, user_id, kind, old_value, new_value)
    values (new.id, new.user_id, 'sprint',
            (select name from public.sprints where id = old.sprint_id), (select name from public.sprints where id = new.sprint_id));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.task_events (task_id, user_id, kind, old_value, new_value) values (new.id, new.user_id, 'priority', old.priority, new.priority);
  end if;
  if new.estimate_hours is distinct from old.estimate_hours then
    insert into public.task_events (task_id, user_id, kind, old_value, new_value) values (new.id, new.user_id, 'estimate', old.estimate_hours::text, new.estimate_hours::text);
  end if;
  if new.spent_hours is distinct from old.spent_hours then
    insert into public.task_events (task_id, user_id, kind, old_value, new_value) values (new.id, new.user_id, 'spent', old.spent_hours::text, new.spent_hours::text);
  end if;
  if new.title is distinct from old.title then
    insert into public.task_events (task_id, user_id, kind, old_value, new_value) values (new.id, new.user_id, 'title', old.title, new.title);
  end if;
  return new;
end $$;

create or replace function public.task_created() returns trigger
language plpgsql security invoker as $$
begin
  insert into public.task_events (task_id, user_id, kind, new_value) values (new.id, new.user_id, 'created', new.source);
  return null;
end $$;

drop trigger if exists tasks_history on public.tasks;
create trigger tasks_history before insert or update on public.tasks
for each row execute function public.task_history();

drop trigger if exists tasks_created on public.tasks;
create trigger tasks_created after insert on public.tasks
for each row execute function public.task_created();

create or replace function public.assignee_history() returns trigger
language plpgsql security invoker as $$
declare r record;
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  insert into public.task_events (task_id, user_id, kind, new_value)
  select r.task_id, r.user_id, case when tg_op = 'INSERT' then 'assigned' else 'unassigned' end, p.name
  from public.people p where p.id = r.person_id
    and exists (select 1 from public.tasks t where t.id = r.task_id);  -- nada a registrar se a tarefa está sendo apagada
  return null;
end $$;

drop trigger if exists task_assignees_history on public.task_assignees;
create trigger task_assignees_history after insert or delete on public.task_assignees
for each row execute function public.assignee_history();

create or replace function public.touch_project() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
for each row execute function public.touch_project();

do $$
declare t text;
begin
  foreach t in array array['people', 'projects', 'tasks', 'task_assignees', 'task_dependencies', 'project_notes', 'note_people', 'task_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- =====================================================================
-- Sprints, modelos de projeto, tarefas recorrentes
-- (rode este bloco no SQL Editor; é idempotente)
-- =====================================================================
create table if not exists public.sprints (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  goal          text,
  start_date    date not null,
  end_date      date not null,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table public.tasks add column if not exists sprint_id uuid references public.sprints(id) on delete set null;
-- Repetição: quando a tarefa é concluída, a próxima nasce sozinha
alter table public.tasks add column if not exists recurrence text
  check (recurrence in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly'));
create index if not exists tasks_sprint_idx on public.tasks (sprint_id);

-- Modelo de projeto: descrição + lista de tarefas (prazo relativo ao início)
create table if not exists public.templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  emoji         text,
  description   text,
  tasks         jsonb not null default '[]'::jsonb,  -- [{title, description, priority, estimate_hours, offset_days, recurrence}]
  created_at    timestamptz not null default now()
);

create or replace function public.next_due(d date, rec text) returns date
language plpgsql immutable as $$
begin
  return case rec
    when 'daily' then d + 1
    when 'weekdays' then d + case extract(isodow from d)::int when 5 then 3 when 6 then 2 else 1 end
    when 'weekly' then d + 7
    when 'biweekly' then d + 14
    when 'monthly' then (d + interval '1 month')::date
  end;
end $$;

create or replace function public.task_recur() returns trigger
language plpgsql security invoker as $$
declare
  due date;
  nid uuid;
  nnum bigint;
begin
  if new.recurrence is null or new.status <> 'done' or old.status = 'done' then
    return new;
  end if;
  -- Próximo prazo a partir do prazo atual; se a tarefa atrasou, pula para o próximo ainda no futuro
  due := public.next_due(coalesce(new.due_date, current_date), new.recurrence);
  while due < current_date loop
    due := public.next_due(due, new.recurrence);
  end loop;
  insert into public.tasks (user_id, project_id, parent_id, note_id, title, description, priority, estimate_hours, recurrence, status, source, due_date)
  values (new.user_id, new.project_id, new.parent_id, new.note_id, new.title, new.description, new.priority, new.estimate_hours, new.recurrence, 'todo', 'manual', due)
  returning id, number into nid, nnum;
  insert into public.task_assignees (task_id, person_id, user_id)
  select nid, person_id, user_id from public.task_assignees where task_id = new.id;
  insert into public.task_events (task_id, user_id, kind, new_value) values (new.id, new.user_id, 'recurred', 'T-' || nnum);
  new.recurrence := null;  -- a repetição segue na tarefa nova
  return new;
end $$;

drop trigger if exists tasks_recur on public.tasks;
create trigger tasks_recur before update on public.tasks
for each row execute function public.task_recur();

do $$
declare t text;
begin
  foreach t in array array['sprints', 'templates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Arquivos (Word, PowerPoint, PDF, prints, textos): o original fica no
-- bucket privado "files" e o conteúdo lido entra no texto da nota.
-- Uma nota pode ter vários (nota criada de um arquivo ou "Anexar arquivo").
-- ---------------------------------------------------------------------
create table if not exists public.note_files (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references public.notes(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path          text not null unique,   -- {user_id}/... no bucket "files"
  name          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists note_files_note_idx on public.note_files (note_id, created_at);
alter table public.note_files enable row level security;
drop policy if exists "own_rows" on public.note_files;
create policy "own_rows" on public.note_files for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Versão anterior guardava um arquivo só, em notes.file_path: passa para note_files
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notes' and column_name = 'file_path') then
    insert into public.note_files (note_id, user_id, path, name)
      select id, user_id, file_path, coalesce(file_name, 'arquivo') from public.notes where file_path is not null
      on conflict (path) do nothing;
    alter table public.notes drop column file_path, drop column file_name;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 26214400)  -- 25 MB
on conflict (id) do nothing;

drop policy if exists "files_own_select" on storage.objects;
drop policy if exists "files_own_insert" on storage.objects;
drop policy if exists "files_own_delete" on storage.objects;

create policy "files_own_select" on storage.objects for select
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files_own_insert" on storage.objects for insert
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "files_own_delete" on storage.objects for delete
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- "Eu": a pessoa que representa o dono da conta. Vem marcada por padrão
-- ao criar tarefas e projetos, e a análise sabe quem é você.
-- ---------------------------------------------------------------------
alter table public.people add column if not exists is_me boolean not null default false;
create unique index if not exists people_one_me on public.people (user_id) where is_me;

-- ---------------------------------------------------------------------
-- Empresas e sistemas (clientes, fornecedores, SAP, Senior…): citados nas
-- notas, ligados às pessoas (empresa de cada uma) e pontos na teia.
-- ---------------------------------------------------------------------
create table if not exists public.entities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('company', 'system')),
  name          text not null,
  slug          text not null,
  description   text,
  url           text,
  created_at    timestamptz not null default now(),
  unique (user_id, kind, slug)
);

create table if not exists public.note_entities (
  note_id       uuid not null references public.notes(id) on delete cascade,
  entity_id     uuid not null references public.entities(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source        text not null default 'ai' check (source in ('ai', 'manual')),
  primary key (note_id, entity_id)
);
create index if not exists note_entities_entity_idx on public.note_entities (entity_id);

alter table public.people add column if not exists company_id uuid references public.entities(id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['entities', 'note_entities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Versões: um documento enviado que é nova versão de outro atualiza a nota
-- original; o texto anterior fica guardado aqui, com o que mudou.
-- ---------------------------------------------------------------------
alter table public.notes add column if not exists merged_into uuid references public.notes(id) on delete set null;

create table if not exists public.note_versions (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references public.notes(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content       text not null,          -- o texto como era antes desta atualização
  changes       text,                   -- o que mudou (resumo do Claude)
  file_name     text,                   -- arquivo que trouxe a versão nova
  created_at    timestamptz not null default now()
);
create index if not exists note_versions_note_idx on public.note_versions (note_id, created_at desc);
alter table public.note_versions enable row level security;
drop policy if exists "own_rows" on public.note_versions;
create policy "own_rows" on public.note_versions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Sistemas ligados a projetos, empresas e tarefas (que sistema o projeto
-- envolve, que sistemas a empresa usa, em que sistema a tarefa é feita).
-- ---------------------------------------------------------------------
create table if not exists public.entity_links (
  entity_id     uuid not null references public.entities(id) on delete cascade,
  target_type   text not null check (target_type in ('project', 'task', 'company')),
  target_id     uuid not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source        text not null default 'manual' check (source in ('ai', 'manual')),
  primary key (entity_id, target_type, target_id)
);
create index if not exists entity_links_target_idx on public.entity_links (target_type, target_id);
alter table public.entity_links enable row level security;
drop policy if exists "own_rows" on public.entity_links;
create policy "own_rows" on public.entity_links for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Notificações: aparelhos (navegador/PWA) que recebem o resumo diário
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint      text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh        text not null,
  auth          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own_rows" on public.push_subscriptions;
create policy "own_rows" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Uso das IAs: cada chamada (análise, Perguntar, transcrição, leitura de
-- arquivos, vetores) com os tokens e o custo estimado. Configurações mostra
-- o total do mês. Pode rodar de novo sem problema.
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  kind                text not null,          -- analyze | ask | transcribe | ingest | versions | embed
  provider            text not null,          -- claude | gemini | openai
  model               text not null,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  audio_seconds       numeric not null default 0,
  cost_usd            numeric(12, 6) not null default 0
);
create index if not exists ai_usage_user_month_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "own_rows" on public.ai_usage;
create policy "own_rows" on public.ai_usage for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Busca por significado (pgvector): cada nota guarda um vetor de 1536
-- números (OpenAI text-embedding-3-small). O Perguntar soma as notas
-- parecidas às achadas por palavras, e a análise manda ao Claude só os
-- detalhes do que é parecido. Sem isto rodado, o app segue só com palavras.
-- ---------------------------------------------------------------------
create extension if not exists vector with schema extensions;
alter table public.notes add column if not exists embedding extensions.vector(1536);
create index if not exists notes_embedding_idx on public.notes using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_notes(query_embedding extensions.vector(1536), match_count int default 20, exclude_id uuid default null)
returns table (id uuid, title text, summary text, similarity float)
language sql stable security invoker
set search_path = public, extensions
as $$
  select n.id, n.title, n.summary, 1 - (n.embedding <=> query_embedding) as similarity
  from public.notes n
  where n.user_id = auth.uid()
    and n.embedding is not null
    and n.merged_into is null
    and (exclude_id is null or n.id <> exclude_id)
  order by n.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------
-- Conversas do Perguntar: cada conversa e as mensagens, para reabrir
-- uma resposta em vez de perguntar de novo. Pode rodar de novo sem problema.
-- ---------------------------------------------------------------------
create table if not exists public.ask_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists ask_sessions_user_idx on public.ask_sessions (user_id, updated_at desc);
alter table public.ask_sessions enable row level security;
drop policy if exists "own_rows" on public.ask_sessions;
create policy "own_rows" on public.ask_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.ask_messages (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.ask_sessions(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  sources       jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  search        tsvector generated always as (to_tsvector('portuguese', coalesce(content, ''))) stored
);
create index if not exists ask_messages_session_idx on public.ask_messages (session_id, id);
create index if not exists ask_messages_search_idx on public.ask_messages using gin (search);
alter table public.ask_messages enable row level security;
drop policy if exists "own_rows" on public.ask_messages;
create policy "own_rows" on public.ask_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Base de conhecimento: o que já é definitivo (artigo escrito, resposta
-- salva, nota marcada) e o documento de cada projeto concluído, escrito
-- pela IA. O Perguntar consulta a base antes das notas.
-- ---------------------------------------------------------------------
create table if not exists public.knowledge (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null,
  content       text not null default '',
  kind          text not null default 'manual' check (kind in ('manual', 'answer', 'note', 'project')),
  -- documento de projeto: queued (esperando) → writing (a IA está escrevendo) → ready | error
  status        text not null default 'ready' check (status in ('queued', 'writing', 'ready', 'error')),
  project_id    uuid references public.projects(id) on delete set null,
  note_id       uuid references public.notes(id) on delete set null,
  session_id    uuid references public.ask_sessions(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search        tsvector generated always as (
                  setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
                  setweight(to_tsvector('portuguese', coalesce(content, '')), 'B')
                ) stored
);
create unique index if not exists knowledge_project_doc_idx on public.knowledge (project_id) where kind = 'project';
create index if not exists knowledge_user_idx on public.knowledge (user_id, updated_at desc);
create index if not exists knowledge_search_idx on public.knowledge using gin (search);
alter table public.knowledge enable row level security;
drop policy if exists "own_rows" on public.knowledge;
create policy "own_rows" on public.knowledge for all using (user_id = auth.uid()) with check (user_id = auth.uid());
