-- ============================================================================
-- 0FF THE PRINT, MIGRATION 007: THE CARD BUILDER
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-25
--
-- Paste the whole file into the Supabase SQL editor and Run. Safe to re-run.
--
-- WHAT THIS OPENS: a card holder picks their frame, their card photo, the song
-- the card opens on, and three featured tracks.
-- WHAT IT DOES NOT OPEN: card_slug (still the auth identity), and the top of
-- the frame ladder, which the desk hands out one member at a time.
--
-- ⛔ READ THIS FIRST. This migration deliberately DOES NOT TOUCH public.feed.
-- Migration 005 took the public timeline down for two minutes by adding a
-- column to that security_invoker view without the matching anon column grant.
-- Cards are a different surface so they get a different view (public.cards).
-- The timeline cannot break from anything below.
-- ============================================================================


-- ============================================================================
-- SECTION 0. THE VOCABULARY.
-- An enum, not text, for the same reason accents are an enum: a frame with no
-- CSS behind it is then UNREPRESENTABLE, not merely discouraged. Writing a bad
-- value returns 22P02. The 15 values are exactly the 15 .poke.<class> rules
-- that exist in index.html today.
--
-- ⚠️ Adding a 16th later needs `alter type ... add value`, which must run
-- OUTSIDE a transaction block, and the matching CSS must ship in the SAME
-- commit or that member renders as an unstyled card on a live public page.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'card_frame') then
    create type public.card_frame as enum (
      -- open: anyone approved may pick these
      'common','uncommon','rare','rare-holo',
      -- granted: the desk hands these out per member
      'rainbow-rare','tera-ex','gold-rare','full-art',
      -- house: reserved, never offered in the picker
      'darklord','warlord','amazing','diamond-rare','vampy','stone','tag-team'
    );
  end if;
end $$;


-- ============================================================================
-- SECTION 1. THE COLUMNS.
-- All nullable with NO default. NULL means "never touched", which is what makes
-- the committed content/*.json the render floor: a member who has not opened the
-- builder keeps exactly the card Gianni authored. A default would silently
-- demote KAV-MAN from warlord to common the moment this ran.
-- ============================================================================
alter table public.profiles
  add column if not exists card_frame   public.card_frame,
  add column if not exists frame_grant  public.card_frame,   -- desk-granted tier, owner-only
  add column if not exists card_photo   text,
  add column if not exists theme_track  text,
  add column if not exists theme_start  integer,
  add column if not exists link_platform text,
  add column if not exists link_handle  text;

comment on column public.profiles.frame_grant is
  'One extra frame this member is allowed to wear, set by the desk only. Pinned in guard_profile_privileges(). Revoking it while the member wears it throws 23514, so the desk must clear card_frame in the SAME statement.';

-- Songs are stored as a BARE 22-CHAR SPOTIFY ID, never a member-supplied URL.
-- parseSpotifyId() in index.html already eats every input form (open.spotify.com
-- links, spotify:track: URIs, a raw id), so the client extracts and the database
-- stores the key. A scheme is then not a value this column can hold, which means
-- safeUrl() is not load-bearing here at all. Same doctrine as the accent enum:
-- the DB stores a KEY, the presentation lives in the page.
alter table public.profiles
  drop constraint if exists profiles_theme_track_id,
  add  constraint profiles_theme_track_id
       check (theme_track is null or theme_track ~ '^[A-Za-z0-9]{22}$');

alter table public.profiles
  drop constraint if exists profiles_theme_start_sane,
  add  constraint profiles_theme_start_sane
       check (theme_start is null or (theme_start >= 0 and theme_start <= 3600));

-- ⛔ The card photo must live in THIS member's own folder. A CHECK cannot express
-- that (it has no caller), so the shape is checked here and the ownership is
-- checked in the trigger below. Without both, a member points card_photo at
-- another member's object and wears their face.
alter table public.profiles
  drop constraint if exists profiles_card_photo_ours,
  add  constraint profiles_card_photo_ours
       check (card_photo is null or card_photo ~
              '^https://frqpvcpyglhmerwpvosl\.supabase\.co/storage/v1/object/public/cards/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$');

-- ⛔ NEVER a free-form URL. safeUrl() accepts protocol-relative '//evil.example',
-- which then fails the isExt test at the render and paints as a SAME-TAB link
-- with no rel=noopener labelled "Jump to roster". (Fixed in index.html the same
-- day, but the database should not be able to hold the value either.) A member
-- supplies a platform and a handle; the page rebuilds the URL from a hardcoded
-- base, so a member cannot supply a host at all.
alter table public.profiles
  drop constraint if exists profiles_link_platform_known,
  add  constraint profiles_link_platform_known
       check (link_platform is null or link_platform in
              ('instagram','tiktok','youtube','spotify','soundcloud','bandcamp'));

alter table public.profiles
  drop constraint if exists profiles_link_handle_shape,
  add  constraint profiles_link_handle_shape
       check (link_handle is null or link_handle ~ '^[A-Za-z0-9._-]{1,30}$');

-- ============================================================================
-- SECTION 2. THE LADDER, IN ONE COLUMN.
-- The four open frames are free. Anything else has to be the member's own
-- frame_grant, which only the desk can write. That is the entire policy: no
-- catalog table, no grants ledger, no RPC. Two members will ever hold a grant.
--
-- House frames are absent from the open list on purpose, so a member can only
-- wear one if the desk grants it to them specifically.
-- ============================================================================
alter table public.profiles
  drop constraint if exists profiles_card_frame_allowed,
  add  constraint profiles_card_frame_allowed
       check (
         card_frame is null
         or card_frame in ('common','uncommon','rare','rare-holo')
         or card_frame = frame_grant
       );

-- Seed the grants for the frames people already wear, so the first save from an
-- existing member does not bounce off the CHECK. Matched on card_slug because
-- that is the join key between a login and a card.
update public.profiles set frame_grant = 'warlord'::public.card_frame      where card_slug = 'kav-man'       and frame_grant is null;
update public.profiles set frame_grant = 'diamond-rare'::public.card_frame where card_slug = 'virgosgateway' and frame_grant is null;
update public.profiles set frame_grant = 'amazing'::public.card_frame      where card_slug = 'wrathfol'      and frame_grant is null;
update public.profiles set frame_grant = 'darklord'::public.card_frame     where card_slug = 'vamppsych'     and frame_grant is null;
update public.profiles set frame_grant = 'vampy'::public.card_frame        where card_slug = 'kurlytop'      and frame_grant is null;
update public.profiles set frame_grant = 'rainbow-rare'::public.card_frame where card_slug = 'haze-dt'       and frame_grant is null;


-- ============================================================================
-- SECTION 3. THE THREE FEATURED TRACKS.
-- A child table, not three columns and not jsonb.
--   * three columns means every constraint written three times, and "do not
--     feature the same song twice" is unwritable
--   * jsonb means the shape is unvalidated, and PostgREST cannot write one
--     element, so every edit is read-modify-write and two open tabs lose an update
--   * a 4th slot later would mean three more anon COLUMN grants on profiles,
--     which is the 42501 shape that took the timeline down
-- Here, "at most three, no duplicates" is a schema fact.
-- ============================================================================
create table if not exists public.featured_tracks (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  slot       smallint not null check (slot between 1 and 3),
  track      text not null check (track ~ '^[A-Za-z0-9]{22}$'),
  created_at timestamptz not null default now(),
  primary key (profile_id, slot),
  unique (profile_id, track)
);

alter table public.featured_tracks enable row level security;

drop policy if exists "featured tracks are public" on public.featured_tracks;
create policy "featured tracks are public" on public.featured_tracks
  for select using (
    exists (select 1 from public.profiles p
            where p.id = profile_id and p.approved)
  );

drop policy if exists "own featured tracks" on public.featured_tracks;
create policy "own featured tracks" on public.featured_tracks
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "admin manages featured tracks" on public.featured_tracks;
create policy "admin manages featured tracks" on public.featured_tracks
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.featured_tracks to anon, authenticated;
grant insert, update, delete on public.featured_tracks to authenticated;


-- ============================================================================
-- SECTION 4. THE GUARD.
-- This is migration 002's guard_profile_privileges() CARRIED FORWARD VERBATIM
-- with two additions: frame_grant is pinned, and card_photo ownership is checked.
--
-- ⛔ Do NOT "simplify" this by dropping the id / requested_slug pins or the
-- display_name revert block. That block is what stops a member renaming onto a
-- reserved slug or onto another member's card, and it was written to close a
-- real hole. Do not swap privileged_caller() for an auth.uid() test either:
-- 002 says in a comment that removing the direct_sql_caller() branch re-breaks
-- admin seeding from the SQL editor.
-- ============================================================================
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.privileged_caller() then
    new.id             := old.id;
    new.approved       := old.approved;
    new.is_admin       := old.is_admin;
    new.card_slug      := old.card_slug;
    new.requested_slug := old.requested_slug;
    new.created_at     := old.created_at;
    new.frame_grant    := old.frame_grant;   -- 007: a member cannot grant themselves a tier

    if new.display_name is distinct from old.display_name then
      if exists (select 1 from public.reserved_slugs r
                 where r.slug = public.slugify(new.display_name))
         or exists (select 1 from public.profiles p
                    where p.id <> new.id
                      and p.card_slug = public.slugify(new.display_name)) then
        new.display_name := old.display_name;
      end if;
    end if;

    -- 007: the card photo has to sit in this member's own storage folder.
    -- The CHECK constraint pins the URL SHAPE; only a trigger can compare the
    -- uid segment to the caller, because a CHECK has no caller.
    if new.card_photo is distinct from old.card_photo and new.card_photo is not null then
      if split_part(split_part(new.card_photo, '/public/cards/', 2), '/', 1) <> old.id::text then
        raise exception 'That photo is not in your folder.' using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end $$;


-- ============================================================================
-- SECTION 5. THE READ SURFACE.
-- A NEW view, so public.feed is untouched and the timeline cannot break.
-- security_invoker, so a revoked member's card drops off the same second their
-- posts do. The three featured tracks are folded in with jsonb_agg, so the
-- client still makes ONE request: normalized storage, denormalized read.
--
-- theme_track is rebuilt into the full URL here, so renderPokeCard() reads the
-- same `theme_song` string shape it already reads and needs no change.
-- ============================================================================
drop view if exists public.cards;
create view public.cards
with (security_invoker = on)
as
select
  p.card_slug,
  p.card_frame,
  p.card_photo,
  case when p.theme_track is null then null
       else 'https://open.spotify.com/track/' || p.theme_track end as theme_song,
  p.theme_start,
  p.link_platform,
  p.link_handle,
  coalesce(
    (select jsonb_agg(jsonb_build_object('slot', f.slot, 'track', f.track) order by f.slot)
     from public.featured_tracks f where f.profile_id = p.id),
    '[]'::jsonb
  ) as featured
from public.profiles p
where p.card_slug is not null;
-- No `approved` filter here ON PURPOSE, matching public.feed: the view is
-- security_invoker, so the existing "approved profiles are public" RLS policy on
-- profiles is what decides which rows an anonymous reader can see. Restating it
-- here would be a second copy of the rule that can drift. (There is no `retired`
-- column; retirement runs through admin_retire_member().)

-- ⛔ THE GRANT THAT MATTERS. anon holds COLUMN-LEVEL grants on profiles, not a
-- table-wide one. A security_invoker view reading a column anon cannot select
-- fails 42501 for every anonymous visitor. theme_track is included even though
-- the view never returns it, because the view READS it inside an expression.
grant select (card_frame, card_photo, theme_track, theme_start,
              link_platform, link_handle) on public.profiles to anon, authenticated;
grant select on public.cards to anon, authenticated;


-- ============================================================================
-- SECTION 5b. my_profile(), EXTENDED.
-- The builder reads its current state from here, so the new columns have to come
-- back through it.
--
-- ⛔ TWO TRAPS, both already paid for once:
--  1. `create or replace` CANNOT change a RETURNS TABLE signature. It needs a
--     `drop function` first, which is why this is written that way.
--  2. A drop-and-recreate is exactly how migration 005 lost `edited_at` and
--     `security_invoker` off the feed view. EVERY existing column is carried
--     forward below (id, display_name, card_slug, requested_slug, approved,
--     is_admin, accent, created_at). Drop one and the accent picker silently
--     loses its selected state with no error anywhere.
-- ============================================================================
drop function if exists public.my_profile();
create function public.my_profile()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, accent public.accent,
               created_at timestamptz,
               -- 007 additions, appended so the existing eight keep their order
               card_frame public.card_frame, frame_grant public.card_frame,
               card_photo text, theme_track text, theme_start integer,
               link_platform text, link_handle text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.accent, p.created_at,
         p.card_frame, p.frame_grant, p.card_photo, p.theme_track,
         p.theme_start, p.link_platform, p.link_handle
    from public.profiles p
   where p.id = auth.uid();
$fn$;

revoke execute on function public.my_profile() from public, anon;
grant  execute on function public.my_profile() to authenticated;


-- ============================================================================
-- SECTION 6. THE CARD ART BUCKET.
-- Separate from `posts`: posts allows video and a 50MB ceiling (migration 004),
-- and card art must not. 3MB and images only, which also FORCES the client to
-- canvas-downscale before upload rather than making it optional.
--
-- ⚠️ HEIC is deliberately excluded. An iPhone photo picked straight off the roll
-- is HEIC and would upload without ever passing through the resize step.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', true, 3145728,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "card art is public" on storage.objects;
create policy "card art is public" on storage.objects
  for select using (bucket_id = 'cards');

-- Same gate as posts: approved members only, and only inside their own uid folder.
drop policy if exists "approved members upload card art" on storage.objects;
create policy "approved members upload card art" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cards'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    -- exactly one folder deep, matching the posts policy: without this a member
    -- can nest '<uid>/../someoneelse/x.jpg' shaped paths past the folder check
    and array_length(storage.foldername(name), 1) = 1
    and name ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists "members replace own card art" on storage.objects;
create policy "members replace own card art" on storage.objects
  for update to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members delete own card art" on storage.objects;
create policy "members delete own card art" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================================
-- SECTION 7. VERIFY. The result grid is the proof, so this file ends in selects.
-- ============================================================================
select 'columns' as check,
       count(*) filter (where column_name in
         ('card_frame','frame_grant','card_photo','theme_track','theme_start',
          'link_platform','link_handle')) as found_of_7
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles';

select 'frame_grants seeded' as check, card_slug, frame_grant
from public.profiles where frame_grant is not null order by card_slug;

select 'cards view' as check, count(*) as rows from public.cards;

select 'anon column grants' as check, string_agg(column_name, ', ' order by column_name)
from information_schema.column_privileges
where grantee = 'anon' and table_name = 'profiles'
  and column_name in ('card_frame','card_photo','theme_track','theme_start',
                      'link_platform','link_handle');

-- Expected: found_of_7 = 7, six frame_grants, cards view returns a row per
-- approved member, and all six column grants present.
--
-- ⛔ AFTER RUNNING, probe the REST endpoint with the publishable key before
-- walking away. Migration 005's outage was caught this way and not by reading:
--   curl 'https://frqpvcpyglhmerwpvosl.supabase.co/rest/v1/feed?limit=1' \
--        -H 'apikey: <publishable>'      -- must still return 200, NOT 42501
--   curl 'https://frqpvcpyglhmerwpvosl.supabase.co/rest/v1/cards?limit=1' \
--        -H 'apikey: <publishable>'
