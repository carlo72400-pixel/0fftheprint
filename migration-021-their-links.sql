-- ============================================================================
-- 0FF THE PRINT, MIGRATION 021: THEIR LINKS
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-27
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this drops and
--    recreates the cards view and a constraint). CONFIRM IT by clicking
--    "Run query". Cancelling runs nothing AND reports nothing.
--
-- ⛔ VERIFY IS ONE ROW AT THE BOTTOM AND EVERY COLUMN MUST SAY true.
--
-- WHAT THIS IS FOR.
--
-- /c/<slug>/ is becoming the URL a card holder puts in their Instagram bio, and
-- profiles holds exactly ONE link (link_platform + link_handle). A link-in-bio
-- page with one link on it is not a link-in-bio page.
--
-- ⛔ STILL NO FREE-FORM URLS. 007 banned them because safeUrl() accepted a
--    protocol-relative '//evil.example' and painted it as a same-tab link, and
--    that rule is not being relaxed just because there are five of them now.
--    A member supplies a PLATFORM from a fixed list and a HANDLE; the page
--    rebuilds the host from a hardcoded base. A member cannot supply a host at
--    all, so a member cannot point their page at anything but their own profile
--    on a site the house already trusts.
--
-- ⛔ 019 IS WHY THE VERIFY READS AS ANON. Adding a column to a security_invoker
--    view without granting it cost the site its whole cards view: anon did not
--    lose one field, it lost everything. Grant the column, then READ the view
--    as the role that reads it.
-- ============================================================================


-- ============================================================================
-- SECTION 1. The shape check, as a function, because a CHECK cannot loop.
-- ============================================================================
create or replace function public.links_ok(v jsonb)
returns boolean language sql immutable as $$
  select v is null
      or (jsonb_typeof(v) = 'array'
          and jsonb_array_length(v) <= 5
          and not exists (
            select 1 from jsonb_array_elements(v) e
             where jsonb_typeof(e) <> 'object'
                or not (e ? 'p') or not (e ? 'h')
                or e->>'p' not in ('instagram','tiktok','youtube','x','twitch',
                                   'threads','spotify','soundcloud','bandcamp')
                or e->>'h' !~ '^[A-Za-z0-9._-]{1,30}$'
          ));
$$;

comment on function public.links_ok is
  'Shape gate for profiles.links. Platform comes from a fixed list and the handle
   is a bare word: the page rebuilds the host from a hardcoded base, so a member
   can never supply a host. Same doctrine as 007''s link_platform.';


-- ============================================================================
-- SECTION 2. The column.
-- ============================================================================
alter table public.profiles
  add column if not exists links jsonb not null default '[]'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_links_ok,
  add  constraint profiles_links_ok check (public.links_ok(links));

comment on column public.profiles.links is
  'Up to five {p,h} pairs for the link-in-bio row on /c/<card_slug>/.
   Member-writable through the ordinary own-row UPDATE policy; the shape is
   enforced by links_ok(). Order in the array is the order on the page.';


-- ============================================================================
-- SECTION 3. The read surface, and the grant 019 taught us not to forget.
-- ============================================================================
grant select (links) on public.profiles to anon, authenticated;

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
  p.links,
  coalesce(
    (select jsonb_agg(jsonb_build_object('slot', f.slot, 'track', f.track) order by f.slot)
     from public.featured_tracks f where f.profile_id = p.id),
    '[]'::jsonb
  ) as featured
from public.profiles p
where p.card_slug is not null;

grant select on public.cards to anon, authenticated;


-- ============================================================================
-- SECTION 4. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
-- ============================================================================
select
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='links')                                as column_added,
  exists (select 1 from pg_constraint where conname='profiles_links_ok') as check_on,
  public.links_ok('[{"p":"instagram","h":"vamppsych"}]'::jsonb)      as accepts_a_good_row,
  not public.links_ok('[{"p":"evil","h":"x"}]'::jsonb)               as refuses_unknown_platform,
  not public.links_ok('[{"p":"instagram","h":"a/b"}]'::jsonb)        as refuses_a_path,
  not public.links_ok('[{"p":"instagram","h":"//evil.example"}]'::jsonb) as refuses_a_host,
  not public.links_ok('[{"p":"x","h":"a"},{"p":"x","h":"b"},{"p":"x","h":"c"},
                        {"p":"x","h":"d"},{"p":"x","h":"e"},{"p":"x","h":"f"}]'::jsonb) as refuses_six,
  has_column_privilege('anon','public.profiles','links','select')    as anon_reads_links,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='cards') >= 13        as view_kept_its_columns,
  (select count(*) from public.cards) >= 0                          as view_actually_reads;
