-- ============================================================
-- 0FF THE PRINT — SEAT ACCENTS. Idempotent. Safe to re-run.
-- Paste into the Supabase SQL Editor, then paste the same blocks
-- into schema.sql so a fresh project comes up identical.
-- ============================================================

-- 1. THE KEY.
--    This column stores a KEY, never a color. The six hexes live in CSS only,
--    in index.html and assets/css/auth.css. An enum makes a bad value
--    unrepresentable rather than merely rejected: PostgREST, supabase-js, curl
--    and psql all fail the cast identically with SQLSTATE 22P02, and the
--    "admin updates profiles" policy widens WHICH rows an admin may write, not
--    WHAT values the column accepts. Admins do not bypass this.
do $$ begin
  create type public.accent as enum ('acid','gold','ember','pink','violet','ice');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists accent public.accent;   -- NULL means "never picked"

-- Deliberately NULLABLE with NO DEFAULT. A default of 'pink' would make
-- "I picked pink" indistinguishable from "I never touched it", which breaks the
-- per-seat card defaults. NULL is a real third state that falls through to the card.

comment on column public.profiles.accent is
  'Accent KEY, not a color. Six enum slugs mapped to hardcoded CSS classes in index.html and assets/css/auth.css. Never store a hex here. Never widen this column to text: four separate consumers rely on the enum as their second lock.';

-- Adding a seventh accent later, for the record:
--   alter type public.accent add value if not exists 'slug';
-- Must run OUTSIDE a transaction block, and the CSS rule ships in the same commit
-- or that member renders pink.


-- 2. Make the image_url constraint actually exist.
--    It was added inline inside "create table if not exists public.posts" on
--    2026-08-20. The table already existed, so the whole CREATE short-circuits
--    and the constraint was never created on the live table. This is the ALTER
--    that lands it. Leave the inline copy in schema.sql for fresh projects.
alter table public.posts drop constraint if exists posts_image_url_ours;
alter table public.posts add constraint posts_image_url_ours check (
  image_url is null
  or image_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/%'
) not valid;
-- NOT VALID first so the ALTER cannot fail on legacy rows, then prove it clean.
-- If this next line errors, it names the offending row. Fix or null that row, re-run.
alter table public.posts validate constraint posts_image_url_ours;


-- 3. Expose the key to the public feed.
--    "create or replace view" can only APPEND columns, never reorder or remove,
--    so accent goes last. This is not optional styling: it is what makes a live
--    post carry its author's color to a logged-out phone.
--
--    !! ANYTHING IN THIS SELECT LIST IS WORLD READABLE. !!
--    This view runs as its owner and does NOT apply the RLS policies on posts or
--    profiles. The only gate is the WHERE below. Do not add a column here you
--    would not print on a poster.
-- CREATE OR REPLACE cannot reorder or rename a view's columns (42P16), and
-- adding accent shifts every position after created_at. Drop and recreate.
--
-- Two corrections to what was originally written here, both caught by running it:
--   1. edited_at was MISSING from the select list. Migration 002's view has it,
--      and the timeline's EDITED pill reads it. Replacing the view without it
--      would have silently killed that pill.
--   2. security_invoker = on must be carried forward. 002 sets it deliberately
--      so the view honours RLS instead of running as its owner.
drop view if exists public.feed;
create view public.feed
with (security_invoker = on) as
  select p.id, p.text, p.image_url, p.image_alt, p.pinned,
         p.created_at, p.edited_at,
         pr.display_name, pr.card_slug, pr.accent
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
   where p.published = true
   order by p.pinned desc, p.created_at desc;

grant select on public.feed to anon, authenticated;


-- 4. NO RLS CHANGE. Verified against the file, not assumed.
--    "own display name" is a bare row-level policy:
--        for update using (auth.uid() = id) with check (auth.uid() = id)
--    RLS is row-level, not column-level, so it already covers accent. The
--    guard_profile_privileges trigger pins approved, is_admin, card_slug and
--    created_at back to their old values for non-admins, and does not touch
--    accent. Result: a member can set their own color and nothing else.
--    That is exactly right. Nothing to add here.
--
--    Sanity check after running, as a logged-in non-admin member:
--      update profiles set accent='gold' where id = auth.uid();      -- succeeds
--      update profiles set card_slug='vamppsych' where id = auth.uid(); -- silently pinned back
--      update profiles set accent='chartreuse' where id = auth.uid();   -- 22P02, rejected

-- ============================================================
-- 6. THE GRANT THIS MIGRATION ORIGINALLY FORGOT, AND IT CAUSED A LIVE OUTAGE.
--
-- The feed view is security_invoker, so it runs as the CALLER. Migration 002
-- revoked anon's table-wide SELECT on profiles and replaced it with COLUMN
-- level grants. Adding pr.accent to the view without adding it to that grant
-- list meant every anonymous read of the feed failed with
--     42501  permission denied for table profiles
-- and the public timeline went blank for everyone who was not signed in.
--
-- RULE: with column-level grants, adding a column to a security_invoker view
-- also needs a grant for that column. The view does not inherit anything.
-- ============================================================
grant select (accent) on public.profiles to anon, authenticated;


-- ============================================================
-- 7. my_profile() predates the accent column and does not return it, so the
--    picker had no way to show which color is already chosen. A RETURNS TABLE
--    signature change needs a drop first, CREATE OR REPLACE cannot alter it.
-- ============================================================
drop function if exists public.my_profile();
create function public.my_profile()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, accent public.accent,
               created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.accent, p.created_at
    from public.profiles p
   where p.id = auth.uid();
$fn$;

revoke execute on function public.my_profile() from public, anon;
grant  execute on function public.my_profile() to authenticated;

select 'my_profile returns accent' as check,
       (select count(*) from information_schema.columns
         where table_name = 'my_profile' and column_name = 'accent')::text as ok;
