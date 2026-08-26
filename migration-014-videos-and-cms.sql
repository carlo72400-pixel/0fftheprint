-- ============================================================================
-- 0FF THE PRINT, MIGRATION 014: FEATURED VIDEOS + THE FRONT-PAGE CMS
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this file drops and
--    recreates policies, triggers and views). CONFIRM IT. Cancelling runs
--    nothing and reports nothing, which is exactly how 008-013 looked "run"
--    for a whole day.
--
-- TWO THINGS, ONE FILE.
--
-- 1. featured_videos, his ask: "featured videos type shit, people can upload
--    their featured videos, each person will have their own tab of videos."
--
--    ⛔ THE VIDEO IS A LINK, NEVER A FILE. Supabase free is 1 GB of storage
--    and 5 GB/month of egress, SHARED with auth and the timeline. Measured off
--    this repo's own encodes (20s of 1080x1920 CRF20 = 15 MB), a 60s clip is
--    ~45 MB, so uploads would buy ~22 videos total and ~111 views a MONTH
--    sitewide, and when egress runs dry the LOGIN goes with it. Members are
--    artists who already host on TikTok and YouTube. They paste a link.
--    Storage cost: zero. Egress cost: zero.
--
--    KEYS, NEVER URLS (007 doctrine, same as 009): a bare provider id is the
--    only stored identity and the view rebuilds the host on the way out.
--    The COVER is the one upload, and only because a still is ~100 KB, so
--    1 GB holds ~10,000 of them. YouTube does not even need one, its thumb is
--    derivable from the id.
--
-- 2. site_overrides, his ask: front-page UI for "all of our editble things",
--    scoped to "everything, including slate and roster lore".
--
--    work.json, slate.json and roster.json are COMMITTED FILES. A browser
--    cannot write to git, so live editing needs the pattern this site already
--    runs for timeline seeds (011) and story bodies (008): a DB overlay on top
--    of the git floor, and bake.py folds it back down. One table covers all
--    three surfaces. The git file stays the render floor, so an empty table
--    changes nothing.
--
-- ⛔ public.feed IS NOT TOUCHED. New tables, new views.
-- ============================================================================


-- ============================================================================
-- SECTION 1. FEATURED VIDEOS
-- ============================================================================

create table if not exists public.featured_videos (
  id           bigint generated always as identity primary key,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  provider     text not null check (provider in ('youtube','tiktok','instagram')),
  vid          text not null,
  title        text not null check (char_length(title) between 1 and 80),
  cover_url    text,
  published    boolean not null default false,
  featured     boolean not null default false,   -- the desk's pick for the front rail
  created_at   timestamptz not null default now(),
  -- one identity per platform. Re-posting the same video is unrepresentable,
  -- and Pull therefore keeps the row as a standing no (the 009 behaviour).
  unique (provider, vid)
);

-- Per-provider id shapes, so a member cannot smuggle a host or a path in.
-- youtube   11 chars of the url-safe alphabet
-- tiktok    17-21 digits
-- instagram 5-30 chars of the shortcode alphabet
alter table public.featured_videos
  drop constraint if exists featured_videos_vid_shape,
  add  constraint featured_videos_vid_shape check (
    (provider = 'youtube'   and vid ~ '^[A-Za-z0-9_-]{11}$') or
    (provider = 'tiktok'    and vid ~ '^[0-9]{17,21}$')      or
    (provider = 'instagram' and vid ~ '^[A-Za-z0-9_-]{5,30}$'));

-- The cover, if there is one, must live in the author's OWN folder of the
-- posts bucket, whose policies already pin writes to their uid. Same shape as
-- member_stories_cover_ours from 010.
alter table public.featured_videos
  drop constraint if exists featured_videos_cover_ours,
  add  constraint featured_videos_cover_ours check (
    cover_url is null or (
      cover_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/' || submitted_by::text || '/%'
      and cover_url ~* '\.(jpg|jpeg|png|webp)$'
      and cover_url not like '%..%'
      and char_length(cover_url) <= 400));

alter table public.featured_videos enable row level security;

-- The 002 lesson on INSERT: the caller picks the VIDEO, nothing else. Without
-- this a member inserts published=true and skips the desk, or back-dates
-- created_at and squats the top of the rail forever.
create or replace function public.guard_featured_video_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title := replace(new.title, chr(8212), ',');
  if not public.privileged_caller() then
    new.submitted_by := auth.uid();
    new.published    := false;
    new.featured     := false;
    new.created_at   := now();
  end if;
  return new;
end $$;
drop trigger if exists featured_videos_guard_insert on public.featured_videos;
create trigger featured_videos_guard_insert before insert on public.featured_videos
  for each row execute function public.guard_featured_video_insert();

create or replace function public.guard_featured_video_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title := replace(new.title, chr(8212), ',');
  if not public.privileged_caller() then
    new.id           := old.id;
    new.submitted_by := old.submitted_by;
    new.provider     := old.provider;
    new.vid          := old.vid;
    new.created_at   := old.created_at;
    new.published    := old.published;   -- publish is the desk's tap
    new.featured     := old.featured;    -- so is featuring
  end if;
  return new;
end $$;
drop trigger if exists featured_videos_guard_update on public.featured_videos;
create trigger featured_videos_guard_update before update on public.featured_videos
  for each row execute function public.guard_featured_video_update();

drop policy if exists "published videos are public" on public.featured_videos;
create policy "published videos are public" on public.featured_videos
  for select using (published and exists
    (select 1 from public.profiles p where p.id = submitted_by and p.approved));

drop policy if exists "own videos" on public.featured_videos;
create policy "own videos" on public.featured_videos
  for select using (submitted_by = auth.uid());

drop policy if exists "admin reads all videos" on public.featured_videos;
create policy "admin reads all videos" on public.featured_videos
  for select using (public.is_admin());

drop policy if exists "approved members submit videos" on public.featured_videos;
create policy "approved members submit videos" on public.featured_videos
  for insert with check (submitted_by = auth.uid() and public.is_approved());

drop policy if exists "author edits own unpublished video" on public.featured_videos;
create policy "author edits own unpublished video" on public.featured_videos
  for update using (submitted_by = auth.uid()) with check (submitted_by = auth.uid());

drop policy if exists "author withdraws own video" on public.featured_videos;
create policy "author withdraws own video" on public.featured_videos
  for delete using (submitted_by = auth.uid() and not published);

drop policy if exists "admin manages videos" on public.featured_videos;
create policy "admin manages videos" on public.featured_videos
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.featured_videos to anon, authenticated;
grant insert, update, delete on public.featured_videos to authenticated;

-- THE READ SURFACE. Rebuilds every host from the key, so no member-supplied
-- host reaches the page. YouTube's thumb is derived; the others use the
-- uploaded cover when there is one.
drop view if exists public.videos;
create view public.videos
with (security_invoker = on) as
  select v.id,
         v.provider,
         v.vid,
         v.title,
         case v.provider
           when 'youtube'   then 'https://www.youtube.com/watch?v=' || v.vid
           when 'tiktok'    then 'https://www.tiktok.com/@' || p.card_slug || '/video/' || v.vid
           when 'instagram' then 'https://www.instagram.com/reel/' || v.vid || '/'
         end as link,
         coalesce(
           v.cover_url,
           case when v.provider = 'youtube'
                then 'https://i.ytimg.com/vi/' || v.vid || '/hqdefault.jpg' end
         ) as cover,
         v.featured,
         p.card_slug as by,
         p.display_name as by_name,
         v.created_at
    from public.featured_videos v
    join public.profiles p on p.id = v.submitted_by
   where v.published;

grant select on public.videos to anon, authenticated;


-- ============================================================================
-- SECTION 2. SITE OVERRIDES, the front-page CMS
--
-- One table for every committed-JSON surface. (section, item_key) is the
-- identity: item_key '' means the whole section, anything else addresses one
-- item inside it, so editing one work tile or one roster member does not
-- rewrite the file. `patch` is merged over the git item by the page; `hidden`
-- drops it. bake.py folds the whole thing back into the JSON and the row goes
-- inert, exactly how seed_overrides works in 011.
--
-- DESK ONLY. Members never write here; their own surfaces are their own
-- tables. Public read, because the homepage applies the overlay for everyone.
-- ============================================================================

create table if not exists public.site_overrides (
  section    text not null check (section in ('work','slate','roster','site')),
  item_key   text not null default '',
  patch      jsonb not null default '{}'::jsonb,
  hidden     boolean not null default false,
  sort       integer,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (section, item_key)
);

-- A patch has to be a JSON OBJECT. An array or a bare scalar would merge into
-- nonsense on the page, and the page cannot defend itself against that.
alter table public.site_overrides
  drop constraint if exists site_overrides_patch_is_object,
  add  constraint site_overrides_patch_is_object
    check (jsonb_typeof(patch) = 'object');

alter table public.site_overrides
  drop constraint if exists site_overrides_key_sane,
  add  constraint site_overrides_key_sane
    check (char_length(item_key) <= 120 and item_key !~ '[\n\r]');

alter table public.site_overrides enable row level security;

create or replace function public.guard_site_override()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists site_overrides_guard on public.site_overrides;
create trigger site_overrides_guard before insert or update on public.site_overrides
  for each row execute function public.guard_site_override();

drop policy if exists "overrides are public" on public.site_overrides;
create policy "overrides are public" on public.site_overrides
  for select using (true);

drop policy if exists "admin writes overrides" on public.site_overrides;
create policy "admin writes overrides" on public.site_overrides
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.site_overrides to anon, authenticated;
grant insert, update, delete on public.site_overrides to authenticated;


-- ============================================================================
-- SECTION 3. RELOAD THE API SCHEMA CACHE.
-- 002 ends with this and 008-013 all forgot it, which is why brand new tables
-- answered PGRST205 and the whole batch looked like it had never run.
-- ============================================================================
notify pgrst, 'reload schema';


-- ============================================================================
-- VERIFY. One grid, every ok true. Nothing above this line prints a result,
-- so a paste that got cut short cannot end on something that looks like
-- success (the 008-013 lesson).
-- ============================================================================
select 'featured_videos table'      as object, (to_regclass('public.featured_videos') is not null)::text as ok
union all select 'videos view',                (to_regclass('public.videos')          is not null)::text
union all select 'site_overrides table',       (to_regclass('public.site_overrides')  is not null)::text
union all select 'video insert guard',
       (exists (select 1 from pg_trigger where tgname = 'featured_videos_guard_insert'))::text
union all select 'video update guard',
       (exists (select 1 from pg_trigger where tgname = 'featured_videos_guard_update'))::text
union all select 'override guard',
       (exists (select 1 from pg_trigger where tgname = 'site_overrides_guard'))::text
union all select 'vid shape constraint',
       (exists (select 1 from pg_constraint where conname = 'featured_videos_vid_shape'))::text
union all select 'cover pinned to author folder',
       (exists (select 1 from pg_constraint where conname = 'featured_videos_cover_ours'))::text
union all select 'patch must be object',
       (exists (select 1 from pg_constraint where conname = 'site_overrides_patch_is_object'))::text;
