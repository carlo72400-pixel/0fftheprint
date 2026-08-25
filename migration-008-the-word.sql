-- ============================================================================
-- 0FF THE PRINT, MIGRATION 008: THE WORD
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-25
--
-- Paste the whole file into the Supabase SQL editor and Run. Safe to re-run.
--
-- WHAT THIS OPENS:
--   1. story_pages — the desk edits a story's BODY from a phone. The committed
--      page stays the render floor; this is an overlay, cleared after baking
--      back to git.
--   2. word_entries — card holders add short TEXT entries to a story. PRE-
--      moderated: published=false until the desk flips it, the OPPOSITE of the
--      timeline (posts go live and get pulled; stories are the serious surface).
--
-- TEXT ONLY on purpose. Entry images were designed and cut: they drag in the
-- storage belt-checks, the orphan queue and a change to a LIVE storage policy.
-- They can land as their own migration the day an entry actually needs one.
--
-- ⛔ public.feed IS NOT TOUCHED. New tables, new view (the 005 outage rule).
-- ============================================================================


-- ============================================================================
-- SECTION 1. STORY BODY OVERRIDES — desk only, one field.
-- `stamp` is the anti-shadowing lock: the editor records a hash of the article
-- body it edited. After a bake+push changes the page, the stored stamp no
-- longer matches the page's data-stamp and word.js IGNORES the override rather
-- than painting the OLD body over the NEW committed one forever.
-- ============================================================================
create table if not exists public.story_pages (
  slug       text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  body_md    text not null check (char_length(body_md) between 1 and 20000),
  stamp      text check (stamp ~ '^[a-f0-9]{8}$'),
  updated_at timestamptz not null default now()
);

alter table public.story_pages enable row level security;

drop policy if exists "story overrides are public" on public.story_pages;
create policy "story overrides are public" on public.story_pages
  for select using (true);

drop policy if exists "desk writes story overrides" on public.story_pages;
create policy "desk writes story overrides" on public.story_pages
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.story_pages to anon, authenticated;
grant insert, update, delete on public.story_pages to authenticated;  -- RLS gates to admin

create or replace function public.guard_story_page()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.body_md := replace(new.body_md, chr(8212), ',');   -- em-dash reads as AI
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists story_pages_guard on public.story_pages;
create trigger story_pages_guard before insert or update on public.story_pages
  for each row execute function public.guard_story_page();


-- ============================================================================
-- SECTION 2. MEMBER ENTRIES — text, pre-moderated.
-- ============================================================================
create table if not exists public.word_entries (
  id         bigint generated always as identity primary key,
  story_slug text not null check (story_slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  author_id  uuid not null references public.profiles(id) on delete restrict,
  text       text not null check (char_length(text) between 1 and 500),
  published  boolean not null default false,
  created_at timestamptz not null default now()
);

-- Moderation load as SCHEMA FACTS, not counters: one pending entry per member
-- per story. A second one bounces 23505 until the desk clears the first.
drop index if exists word_entries_one_pending;
create unique index word_entries_one_pending
  on public.word_entries (story_slug, author_id) where not published;
create index if not exists word_entries_wall_idx
  on public.word_entries (story_slug, created_at) where published;

alter table public.word_entries enable row level security;

-- Mirrors guard_post_insert: the caller does not get to pick their identity,
-- their timestamp, or their moderation state.
create or replace function public.guard_word_entry_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.text := replace(new.text, chr(8212), ',');
  if not public.privileged_caller() then
    new.author_id  := auth.uid();
    new.published  := false;
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists word_entries_guard_insert on public.word_entries;
create trigger word_entries_guard_insert before insert on public.word_entries
  for each row execute function public.guard_word_entry_insert();

-- Members hold NO update policy (withdraw and resubmit), so this trigger is
-- defense in depth for the day one appears.
create or replace function public.guard_word_entry_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.privileged_caller() then
    new.id         := old.id;
    new.author_id  := old.author_id;
    new.story_slug := old.story_slug;
    new.created_at := old.created_at;
  end if;
  if new.text is distinct from old.text then
    new.text := replace(new.text, chr(8212), ',');
  end if;
  return new;
end $$;
drop trigger if exists word_entries_guard_update on public.word_entries;
create trigger word_entries_guard_update before update on public.word_entries
  for each row execute function public.guard_word_entry_update();

drop policy if exists "anyone reads published entries" on public.word_entries;
create policy "anyone reads published entries" on public.word_entries
  for select using (published);

drop policy if exists "author reads own entries" on public.word_entries;
create policy "author reads own entries" on public.word_entries
  for select using (auth.uid() = author_id);

drop policy if exists "admin reads all entries" on public.word_entries;
create policy "admin reads all entries" on public.word_entries
  for select using (public.is_admin());

drop policy if exists "approved members submit entries" on public.word_entries;
create policy "approved members submit entries" on public.word_entries
  for insert with check (auth.uid() = author_id and public.is_approved());

-- Withdraw works only while the desk has not approved it. Once it is on the
-- wall, only the desk takes it down.
drop policy if exists "author withdraws pending entry" on public.word_entries;
create policy "author withdraws pending entry" on public.word_entries
  for delete using (auth.uid() = author_id and not published);

drop policy if exists "admin manages entries" on public.word_entries;
create policy "admin manages entries" on public.word_entries
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.word_entries to anon, authenticated;
grant insert, update, delete on public.word_entries to authenticated;


-- ============================================================================
-- SECTION 3. THE WALL — the public read surface.
-- security_invoker, so a revoked member's entries vanish with their approval.
-- Reads only profiles columns anon ALREADY holds (id, display_name, card_slug,
-- approved — migration 002), so no new column grants and no 42501 exposure.
-- ============================================================================
drop view if exists public.word_wall;
create view public.word_wall
with (security_invoker = on) as
  select e.id, e.story_slug, e.text, e.created_at,
         pr.display_name, pr.card_slug
    from public.word_entries e
    join public.profiles pr on pr.id = e.author_id
   where e.published
     and pr.approved
   order by e.created_at;

grant select on public.word_wall to anon, authenticated;


-- ============================================================================
-- SECTION 4. VERIFY. The result grid is the proof.
-- ============================================================================
select 'story_pages' as check, count(*) as rows from public.story_pages;
select 'word_entries' as check, count(*) as rows from public.word_entries;
select 'word_wall view' as check, count(*) as rows from public.word_wall;

-- ⛔ AFTER RUNNING, probe from outside before walking away:
--   curl '.../rest/v1/feed?limit=1'      -H 'apikey: <publishable>'  -- 200, not 42501
--   curl '.../rest/v1/word_wall?limit=1' -H 'apikey: <publishable>'  -- 200
--   curl '.../rest/v1/story_pages?limit=1' -H 'apikey: <publishable>' -- 200
