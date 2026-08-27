-- ============================================================================
-- 0FF THE PRINT, MIGRATION 018: THE BACK OF THE CARD
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt MAY appear (this drops and
--    recreates the `cards` view). CONFIRM IT.
--
-- ⛔ VERIFY IS ONE ROW AT THE BOTTOM AND EVERY COLUMN MUST SAY true.
--    017 ended with two verify SELECTs and Supabase's results pane only shows
--    the LAST statement, so the check that mattered was invisible and the one
--    on screen said success while the migration had not applied. One row.
--
-- WHAT THIS IS FOR.
--
-- A card holder has no PLACE. Their posts sit in The Take, their song sits on
-- the grid, their story sits in The Word, and there is no URL that is THEM.
-- /c/<card_slug>/ is the back of the card, and it assembles itself out of the
-- things they already made: every public view already carries card_slug, so
-- the page is filters, not new tables.
--
-- The only things they TYPE are a tagline and a bio. That is the whole new
-- write surface. No markdown, no HTML, no layout choices: the house picks the
-- look, they pick the words.
--
-- ⛔ NO NEW POLICY. "own display name" is already a general own-row UPDATE on
--    profiles, and guard_profile_privileges() pins everything a member must not
--    set. Two free text columns land inside that shape with nothing to change.
-- ⛔ guard_profile_privileges() IS NOT TOUCHED. 007 says in a comment not to
--    rewrite it, so the em-dash hygiene goes in its own BEFORE trigger instead.
-- ============================================================================


-- ============================================================================
-- SECTION 1. The two columns they own.
-- ============================================================================
alter table public.profiles
  add column if not exists tagline text,
  add column if not exists bio     text;

comment on column public.profiles.tagline is
  'One line under their name on /c/<card_slug>/. Member-writable. Capped at 80
   and single-line so it cannot become a second bio or break the header.';
comment on column public.profiles.bio is
  'Short paragraph on the back of the card. Member-writable, PLAIN TEXT only:
   the page escapes it and renders no markup, so a cap is the whole defence.';

alter table public.profiles
  drop constraint if exists profiles_tagline_sane,
  add  constraint profiles_tagline_sane
       check (tagline is null or
              (char_length(tagline) <= 80 and tagline !~ '[\n\r]'));

alter table public.profiles
  drop constraint if exists profiles_bio_sane,
  add  constraint profiles_bio_sane
       check (bio is null or char_length(bio) <= 600);


-- ============================================================================
-- SECTION 2. House text hygiene, in its own trigger.
--
-- The house does not print em-dashes. rotation_tracks and the story renderer
-- both strip them already; these two columns join that rule. Separate function
-- and separate trigger ON PURPOSE: 007's guard is carried forward verbatim from
-- 002 and re-declaring its body to add two lines is how that kind of function
-- drifts. Postgres fires BEFORE triggers in name order and these two touch
-- different columns, so the order between them does not matter.
-- ============================================================================
create or replace function public.guard_profile_text()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tagline is not null then
    new.tagline := btrim(replace(replace(new.tagline, chr(8212), ','), chr(8211), ','));
    if new.tagline = '' then new.tagline := null; end if;
  end if;
  if new.bio is not null then
    new.bio := btrim(replace(replace(new.bio, chr(8212), ','), chr(8211), ','));
    if new.bio = '' then new.bio := null; end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_text_guard on public.profiles;
create trigger profiles_text_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_text();


-- ============================================================================
-- SECTION 3. The read surface.
--
-- The `cards` view is what the homepage already reads for every member card, so
-- it gains the columns rather than a second view being invented beside it.
-- display_name and accent come along because the back of the card needs a name
-- to print and a color to wear, and both were already public through profiles.
--
-- ⛔ security_invoker stays ON. That is what makes a retired member's page go
--    dark the same second their posts do, through the existing profiles RLS,
--    with no `approved` filter restated here to drift out of sync.
-- ============================================================================
drop view if exists public.cards;
create view public.cards
with (security_invoker = on)
as
select
  p.card_slug,
  p.display_name,
  p.tagline,
  p.bio,
  p.accent,
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

grant select on public.cards to anon, authenticated;

comment on view public.cards is
  'Every card holder''s card in one request, plus the words on the back of it.
   security_invoker, so the profiles RLS decides which rows an anonymous reader
   sees. Do NOT add an approved filter here: that rule already lives in the
   policy and a second copy of it can drift.';


-- ============================================================================
-- SECTION 4. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
-- ============================================================================
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name in ('tagline','bio')) = 2                     as columns_added,
  (select count(*) from pg_constraint con
     join pg_class cls on cls.oid=con.conrelid
     join pg_namespace ns on ns.oid=cls.relnamespace
    where ns.nspname='public' and cls.relname='profiles' and con.contype='c'
      and con.conname in ('profiles_tagline_sane','profiles_bio_sane')) = 2 as caps_on,
  exists (select 1 from pg_trigger
           where tgrelid='public.profiles'::regclass
             and tgname='profiles_text_guard')                      as dash_guard_on,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='cards'
      and column_name in ('tagline','bio','display_name','accent')) = 4 as view_rebuilt,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='cards'
      and column_name in ('card_slug','card_frame','card_photo','theme_song',
                          'theme_start','link_platform','link_handle','featured')) = 8
                                                                    as view_kept_everything,
  has_table_privilege('anon','public.cards','select')               as anon_can_read;
