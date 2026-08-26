-- ============================================================================
-- 0FF THE PRINT, MIGRATIONS 008 THROUGH 013, ONE RUN
-- Project ref: frqpvcpyglhmerwpvosl
--
-- This is 008+009+010+011+012+013 concatenated, with every per-file VERIFY
-- select stripped out and replaced by ONE final check at the bottom.
--
-- WHY THE STRIP MATTERS: the Supabase editor shows only the LAST statement's
-- result. With the original per-file selects in place, a paste that got cut
-- short still ends on a green result grid (e.g. "word_wall view | 0"), which
-- reads as success. Stripped, there is exactly one grid and it is the truth.
--
-- HOW TO RUN, exactly:
--   1. Supabase dashboard -> confirm the project ref in the URL is
--      frqpvcpyglhmerwpvosl before anything else.
--   2. SQL Editor -> New query.
--   3. Click once inside the editor, Cmd+A, paste. Do NOT leave a selection.
--   4. Click Run. If a "potentially destructive query" confirmation appears,
--      it must be CONFIRMED. This batch is 38 DROPs + 8 ALTERs; the dashboard
--      will ask. Cancelling it runs nothing and reports nothing.
--   5. The result grid must be 11 rows, every ok column true.
--
-- Safe to re-run. Every statement is guarded (if not exists / drop if exists).
-- ============================================================================


-- >>>>>>>>>>>>>>>>>>>>  migration-008-the-word.sql  <<<<<<<<<<<<<<<<<<<<
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




-- ⛔ AFTER RUNNING, probe from outside before walking away:
--   curl '.../rest/v1/feed?limit=1'      -H 'apikey: <publishable>'  -- 200, not 42501
--   curl '.../rest/v1/word_wall?limit=1' -H 'apikey: <publishable>'  -- 200
--   curl '.../rest/v1/story_pages?limit=1' -H 'apikey: <publishable>' -- 200

-- >>>>>>>>>>>>>>>>>>>>  migration-009-rotation.sql  <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
-- 0FF THE PRINT, MIGRATION 009: MUSIC ON ROTATION
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-25
--
-- Paste the whole file into the Supabase SQL editor and Run. Safe to re-run.
--
-- The 8/20 CMS decision, finally built: a member submits a track, the desk
-- taps Approve, it appears on MUSIC ON ROTATION above the committed seeds.
-- content/rotation.json stays the render floor and the ONLY place a hover
-- preview mp3 or a non-Spotify platform can exist; this table is the churn.
--
-- KEYS, NEVER URLS (007 doctrine): a bare 22-char Spotify track id and a
-- 40-hex cover key are the only stored identities. The view rebuilds both
-- hosts on the way out, so a member cannot supply a host anywhere.
--
-- ⛔ public.feed IS NOT TOUCHED. New table, new view.
-- ============================================================================

create table if not exists public.rotation_tracks (
  id           bigint generated always as identity primary key,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  track        text not null unique check (track ~ '^[A-Za-z0-9]{22}$'),
  title        text not null check (char_length(title) between 1 and 60),
  artist       text not null check (char_length(artist) between 1 and 40),
  art_key      text check (art_key is null or art_key ~ '^[a-f0-9]{40}$'),
  published    boolean not null default false,
  created_at   timestamptz not null default now()
);
-- unique(track) makes "same song twice on the grid" unrepresentable, and it
-- also means Pull keeps the row as a standing NO. The desk uses Delete when
-- the intent is "not right now, try again later."

alter table public.rotation_tracks enable row level security;

-- The 002 lesson, applied to INSERT: without this a member supplies
-- created_at 2099 and their track squats the top slot forever, or inserts
-- published=true and skips the desk. The caller picks the SONG, nothing else.
create or replace function public.guard_rotation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title  := replace(new.title,  chr(8212), ',');
  new.artist := replace(new.artist, chr(8212), ',');
  if not public.privileged_caller() then
    new.submitted_by := auth.uid();
    new.published    := false;
    new.created_at   := now();
  end if;
  return new;
end $$;
drop trigger if exists rotation_tracks_guard_insert on public.rotation_tracks;
create trigger rotation_tracks_guard_insert before insert on public.rotation_tracks
  for each row execute function public.guard_rotation_insert();

create or replace function public.guard_rotation_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.privileged_caller() then
    new.id           := old.id;
    new.submitted_by := old.submitted_by;
    new.track        := old.track;
    new.created_at   := old.created_at;
    new.published    := old.published;   -- publish is the desk's tap, nobody else's
  end if;
  return new;
end $$;
drop trigger if exists rotation_tracks_guard_update on public.rotation_tracks;
create trigger rotation_tracks_guard_update before update on public.rotation_tracks
  for each row execute function public.guard_rotation_update();

drop policy if exists "published rotation is public" on public.rotation_tracks;
create policy "published rotation is public" on public.rotation_tracks
  for select using (published and exists
    (select 1 from public.profiles p where p.id = submitted_by and p.approved));

drop policy if exists "own submissions" on public.rotation_tracks;
create policy "own submissions" on public.rotation_tracks
  for select using (submitted_by = auth.uid());

drop policy if exists "admin reads all rotation" on public.rotation_tracks;
create policy "admin reads all rotation" on public.rotation_tracks
  for select using (public.is_admin());

drop policy if exists "approved members submit tracks" on public.rotation_tracks;
create policy "approved members submit tracks" on public.rotation_tracks
  for insert with check (submitted_by = auth.uid() and public.is_approved());

drop policy if exists "author withdraws unpublished track" on public.rotation_tracks;
create policy "author withdraws unpublished track" on public.rotation_tracks
  for delete using (submitted_by = auth.uid() and not published);

drop policy if exists "admin manages rotation" on public.rotation_tracks;
create policy "admin manages rotation" on public.rotation_tracks
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.rotation_tracks to anon, authenticated;
grant insert, update, delete on public.rotation_tracks to authenticated;

-- ============================================================================
-- THE READ SURFACE. Rebuilds both hosts from keys. security_invoker, and the
-- profiles join reads only columns anon already holds from 002.
-- ============================================================================
drop view if exists public.rotation;
create view public.rotation
with (security_invoker = on) as
  select t.track, t.title, t.artist,
         'https://open.spotify.com/track/' || t.track as link,
         case when t.art_key is null then null
              else 'https://i.scdn.co/image/' || t.art_key end as art,
         p.card_slug as by,
         t.created_at
    from public.rotation_tracks t
    join public.profiles p on p.id = t.submitted_by
   where t.published;

grant select on public.rotation to anon, authenticated;

-- ============================================================================
-- VERIFY.
-- ============================================================================



-- ⛔ AFTER RUNNING:
--   curl '.../rest/v1/feed?limit=1'     -H 'apikey: <publishable>'  -- 200, not 42501
--   curl '.../rest/v1/rotation?limit=1' -H 'apikey: <publishable>'  -- 200

-- >>>>>>>>>>>>>>>>>>>>  migration-010-member-stories.sql  <<<<<<<<<<<<<<<<<<<<
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



-- ⛔ AFTER RUNNING:
--   curl '.../rest/v1/feed?limit=1'         -H 'apikey: <publishable>'  -- 200
--   curl '.../rest/v1/word_stories?limit=1' -H 'apikey: <publishable>'  -- 200

-- >>>>>>>>>>>>>>>>>>>>  migration-011-seed-overrides.sql  <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
-- 0FF THE PRINT, MIGRATION 011: SEED OVERRIDES
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
--
-- The timeline is TWO kinds of post: live DB rows (the desk already edits,
-- pulls and deletes those) and SEEDS committed in content/take.json, which no
-- UI could touch. This table is the desk's hand on the seeds: hide one, or
-- replace its text, from the phone.
--
-- KEYED BY CONTENT HASH (first 16 hex of sha256(author + '|' + text)), because
-- seeds carry no id. That makes overrides SELF-HEALING: when bake.py writes
-- the edit into take.json and the text changes, the old key matches nothing
-- and the override goes inert. The desk lists inert ones for a one-tap clear.
--
-- ⛔ public.feed IS NOT TOUCHED.
-- ============================================================================

create table if not exists public.seed_overrides (
  key        text primary key check (key ~ '^[a-f0-9]{16}$'),
  hidden     boolean not null default false,
  new_text   text check (new_text is null or char_length(new_text) between 1 and 800),
  updated_at timestamptz not null default now()
);

alter table public.seed_overrides enable row level security;

create or replace function public.guard_seed_override()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.new_text is not null then
    new.new_text := replace(new.new_text, chr(8212), ',');
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists seed_overrides_guard on public.seed_overrides;
create trigger seed_overrides_guard before insert or update on public.seed_overrides
  for each row execute function public.guard_seed_override();

drop policy if exists "seed overrides are public" on public.seed_overrides;
create policy "seed overrides are public" on public.seed_overrides
  for select using (true);

drop policy if exists "desk writes seed overrides" on public.seed_overrides;
create policy "desk writes seed overrides" on public.seed_overrides
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.seed_overrides to anon, authenticated;
grant insert, update, delete on public.seed_overrides to authenticated;  -- RLS gates to admin

-- ============================================================================
-- VERIFY.
-- ============================================================================


-- ⛔ AFTER RUNNING:
--   curl '.../rest/v1/feed?limit=1'           -H 'apikey: <publishable>'  -- 200
--   curl '.../rest/v1/seed_overrides?limit=1' -H 'apikey: <publishable>'  -- 200

-- >>>>>>>>>>>>>>>>>>>>  migration-012-video-upload-fix.sql  <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
-- 0FF THE PRINT, MIGRATION 012: VIDEO UPLOADS ACTUALLY UPLOAD
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
--
-- THE BUG, reproduced live before this was written (a real .mp4 upload from an
-- approved logged-in session): `new row violates row-level security policy`,
-- 403. Migration 004 widened the BUCKET's allowed_mime_types to video and its
-- ceiling to 50MB, but never touched the "approved members upload" policy,
-- whose filename rule still ends in image extensions only. The bucket said
-- yes, the policy said no, and every member video upload has been dead since
-- video "shipped". This is KAV's failed video post.
--
-- THE FIX is the same policy from migration 002, verbatim, with the extension
-- list finally matching what the bucket, the client (desk.js EXTS), and the
-- compose page have all believed for weeks: images + mp4/mov/webm/m4v.
-- ============================================================================

drop policy if exists "approved members upload" on storage.objects;
create policy "approved members upload" on storage.objects
  for insert with check (
    bucket_id = 'posts'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp|gif|heic|heif|avif|mp4|mov|webm|m4v)$'
  );

-- ============================================================================
-- VERIFY. The policy's own definition is the receipt.
-- ============================================================================


-- ⛔ AFTER RUNNING: the reproduction that failed must now pass. From the desk
-- console on 0fftheprint.com (any approved session):
--   OTP.uploadImage(new File([new Uint8Array(32)], 'probe.mp4', {type:'video/mp4'}))
-- must resolve to a public URL instead of a 403.

-- >>>>>>>>>>>>>>>>>>>>  migration-013-open-door.sql  <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
-- 0FF THE PRINT, MIGRATION 013: THE OPEN DOOR
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
--
-- New artists can knock: someone with NO card signs up at /join/ with their
-- Instagram, and the desk sees who is knocking before approving. The handle
-- is the vetting signal; approval and card-handing stay exactly as they are.
--
-- ⛔ public.feed IS NOT TOUCHED.
-- ============================================================================

-- 1. The column. A HANDLE, never a URL: the pages build the instagram.com
--    link themselves, so a member cannot supply a host anywhere (007 doctrine).
alter table public.profiles
  add column if not exists instagram text;

alter table public.profiles
  drop constraint if exists profiles_instagram_shape,
  add  constraint profiles_instagram_shape
       check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');

-- 2. Signup copies it out of the auth metadata, sanitized: strip a leading @,
--    keep only handle characters, cap at 30. Everything else about the
--    function is 002's, carried forward verbatim.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  want_name text;
  want_ig   text;
begin
  want_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  want_name := coalesce(want_name, split_part(new.email, '@', 1), 'NEW MEMBER');
  want_name := left(regexp_replace(want_name, '[[:cntrl:]]', '', 'g'), 40);
  if btrim(want_name) = '' then want_name := 'NEW MEMBER'; end if;

  want_ig := lower(btrim(new.raw_user_meta_data ->> 'instagram'));
  want_ig := regexp_replace(coalesce(want_ig, ''), '^@', '');
  want_ig := left(regexp_replace(want_ig, '[^a-z0-9._]', '', 'g'), 30);
  if want_ig = '' then want_ig := null; end if;

  insert into public.profiles (id, display_name, card_slug, requested_slug, approved, is_admin, instagram)
  values (
    new.id,
    btrim(want_name),
    null,
    public.slugify(nullif(btrim(new.raw_user_meta_data ->> 'card_slug'), '')),
    false,
    false,
    want_ig
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

-- 3. The desk sees it. desk_profiles() is security definer so no grant dance,
--    but a RETURNS TABLE signature cannot be replaced in place (the 005
--    lesson): drop first, carry EVERY existing column forward, append.
drop function if exists public.desk_profiles();
create function public.desk_profiles()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, created_at timestamptz,
               instagram text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.created_at, p.instagram
    from public.profiles p
   where public.is_admin()
   order by p.created_at desc;
$fn$;

revoke execute on function public.desk_profiles() from public, anon;
grant  execute on function public.desk_profiles() to authenticated;

-- Force PostgREST to reload its schema cache. Without this the new tables can
-- still 404 with PGRST205 even though the DDL committed.
notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY.
-- ============================================================================


-- ============================================================================
-- THE ONLY VERIFY. One grid, 11 rows, every ok must read true.
-- ============================================================================
select 'story_pages table'        as object, (to_regclass('public.story_pages')    is not null)::text as ok
union all select 'word_entries table',       (to_regclass('public.word_entries')   is not null)::text
union all select 'word_wall view',           (to_regclass('public.word_wall')      is not null)::text
union all select 'rotation_tracks table',    (to_regclass('public.rotation_tracks')is not null)::text
union all select 'rotation view',            (to_regclass('public.rotation')       is not null)::text
union all select 'member_stories table',     (to_regclass('public.member_stories') is not null)::text
union all select 'word_stories view',        (to_regclass('public.word_stories')   is not null)::text
union all select 'seed_overrides table',     (to_regclass('public.seed_overrides') is not null)::text
union all select 'profiles.instagram column',
       (exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='profiles'
                   and column_name='instagram'))::text
union all select 'desk_profiles returns instagram',
       (position('instagram' in pg_get_function_result('public.desk_profiles()'::regprocedure)) > 0)::text
union all select 'upload policy admits mp4',
       (exists (select 1 from pg_policy
                 where polname='approved members upload'
                   and pg_get_expr(polwithcheck, polrelid) like '%mp4%'))::text;
