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
