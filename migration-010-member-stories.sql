-- ============================================================================
-- 0FF THE PRINT, MIGRATION 010: MEMBER STORIES
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste into the Supabase SQL editor and Run. Safe to re-run. Needs 008 first
-- (008 defines nothing this depends on, but the deploy goes together).
--
-- "make sure everyone can post stories": a card holder writes a full story
-- (title, dek, body markdown, optional cover) at /word/new/. It lands on the
-- desk unpublished. Approve and it is LIVE at /word/live/?s=<slug> and listed
-- in THE WORD on the homepage. bake.py later promotes it to a real static
-- page with a catalog number, and the DB row is marked baked (the overlay
-- skips baked rows because the git floor carries them from then on).
--
-- PRE-moderated like word_entries: stories are the serious surface.
-- ⛔ public.feed IS NOT TOUCHED.
-- ============================================================================

create table if not exists public.member_stories (
  id         bigint generated always as identity primary key,
  author_id  uuid not null references public.profiles(id) on delete restrict,
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  title      text not null check (char_length(title) between 3 and 80),
  dek        text not null check (char_length(dek) between 3 and 200),
  body_md    text not null check (char_length(body_md) between 30 and 20000),
  cover_url  text,
  published  boolean not null default false,
  baked      boolean not null default false,
  created_at timestamptz not null default now()
);

-- The cover must be an image in the author's OWN folder of the posts bucket
-- (the bucket the member already uploads to; its policies already pin writes
-- to their uid folder).
alter table public.member_stories
  drop constraint if exists member_stories_cover_ours,
  add  constraint member_stories_cover_ours check (
    cover_url is null or (
      cover_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/' || author_id::text || '/%'
      and cover_url ~* '\.(jpg|jpeg|png|webp)$'
      and cover_url not like '%..%'
      and char_length(cover_url) <= 400));

-- One PENDING story per author. The desk clears the plate before the next one.
drop index if exists member_stories_one_pending;
create unique index member_stories_one_pending
  on public.member_stories (author_id) where not published;

alter table public.member_stories enable row level security;

create or replace function public.guard_member_story_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title   := replace(new.title,   chr(8212), ',');
  new.dek     := replace(new.dek,     chr(8212), ',');
  new.body_md := replace(new.body_md, chr(8212), ',');
  if not public.privileged_caller() then
    new.author_id  := auth.uid();
    new.published  := false;
    new.baked      := false;
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists member_stories_guard_insert on public.member_stories;
create trigger member_stories_guard_insert before insert on public.member_stories
  for each row execute function public.guard_member_story_insert();

create or replace function public.guard_member_story_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.privileged_caller() then
    new.id         := old.id;
    new.author_id  := old.author_id;
    new.slug       := old.slug;
    new.published  := old.published;   -- the desk's tap
    new.baked      := old.baked;       -- the laptop's mark
    new.created_at := old.created_at;
  end if;
  if new.title   is distinct from old.title   then new.title   := replace(new.title,   chr(8212), ','); end if;
  if new.dek     is distinct from old.dek     then new.dek     := replace(new.dek,     chr(8212), ','); end if;
  if new.body_md is distinct from old.body_md then new.body_md := replace(new.body_md, chr(8212), ','); end if;
  return new;
end $$;
drop trigger if exists member_stories_guard_update on public.member_stories;
create trigger member_stories_guard_update before update on public.member_stories
  for each row execute function public.guard_member_story_update();

drop policy if exists "anyone reads published stories" on public.member_stories;
create policy "anyone reads published stories" on public.member_stories
  for select using (published);

drop policy if exists "author reads own stories" on public.member_stories;
create policy "author reads own stories" on public.member_stories
  for select using (auth.uid() = author_id);

drop policy if exists "admin reads all stories" on public.member_stories;
create policy "admin reads all stories" on public.member_stories
  for select using (public.is_admin());

drop policy if exists "approved members write stories" on public.member_stories;
create policy "approved members write stories" on public.member_stories
  for insert with check (auth.uid() = author_id and public.is_approved());

-- A member can rewrite or withdraw their story while it is PENDING. Once the
-- desk publishes it, edits go through the desk.
drop policy if exists "author edits pending story" on public.member_stories;
create policy "author edits pending story" on public.member_stories
  for update using (auth.uid() = author_id and not published)
  with check (auth.uid() = author_id);

drop policy if exists "author withdraws pending story" on public.member_stories;
create policy "author withdraws pending story" on public.member_stories
  for delete using (auth.uid() = author_id and not published);

drop policy if exists "admin manages stories" on public.member_stories;
create policy "admin manages stories" on public.member_stories
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.member_stories to anon, authenticated;
grant insert, update, delete on public.member_stories to authenticated;

-- ============================================================================
-- Public read surface. security_invoker; joins only anon-granted profile
-- columns. `baked` rides along so the homepage overlay can skip promoted
-- stories (the git floor lists those already).
-- ============================================================================
drop view if exists public.word_stories;
create view public.word_stories
with (security_invoker = on) as
  select s.id, s.slug, s.title, s.dek, s.body_md, s.cover_url, s.baked,
         s.created_at, pr.display_name, pr.card_slug
    from public.member_stories s
    join public.profiles pr on pr.id = s.author_id
   where s.published
     and pr.approved;

grant select on public.word_stories to anon, authenticated;

-- ============================================================================
-- VERIFY.
-- ============================================================================
select 'member_stories' as check, count(*) as rows from public.member_stories;
select 'word_stories view' as check, count(*) as rows from public.word_stories;

-- ⛔ AFTER RUNNING:
--   curl '.../rest/v1/feed?limit=1'         -H 'apikey: <publishable>'  -- 200
--   curl '.../rest/v1/word_stories?limit=1' -H 'apikey: <publishable>'  -- 200
