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
select 'rotation_tracks' as check, count(*) as rows from public.rotation_tracks;
select 'rotation view' as check, count(*) as rows from public.rotation;

-- ⛔ AFTER RUNNING:
--   curl '.../rest/v1/feed?limit=1'     -H 'apikey: <publishable>'  -- 200, not 42501
--   curl '.../rest/v1/rotation?limit=1' -H 'apikey: <publishable>'  -- 200
