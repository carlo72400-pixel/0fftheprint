-- ============================================================================
-- migration-028-the-wall-behind-the-door.sql
-- THE WALL (/wall/, the weekly flyer page) is for card holders only. His call
-- 2026-10-02: "link it in the nav only if they logged in", then "lock the page
-- behind login too".
--
-- HOW THE LOCK WORKS. The page is static on GitHub Pages, so nothing there can
-- check a login. Instead the week's data ships ENCRYPTED in the page (AES-GCM),
-- and the key lives in this one-row table. RLS lets an approved card holder or
-- the desk read it, and nobody else: signed out, pending and refused accounts
-- get zero rows, so the page stays a locked door even if someone reads the
-- source. The flyer pipeline (flyer-sweep/wall_build.py) encrypts with a local
-- copy of the same key.
--
-- ⛔ THE KEY IS MADE HERE, BY THE DATABASE. It is never typed into this file,
--    the SQL editor or the repo. This file is public on GitHub and holds no
--    secret. Read the key once with SECTION 3 and save it as
--    flyer-sweep/wall_key.hex (that folder is not a git repo).
-- ⛔ NO insert/update/delete policies, on purpose. Nothing writes this table
--    through the API. To rotate the key, run SECTION 4 here, then rebuild.
--
-- Run it in the Supabase SQL editor as ONE paste. Safe to run twice.
-- ============================================================================


-- SECTION 1. The table and its door.
create table if not exists public.wall_keys (
  id         text primary key,
  k          text not null,
  created_at timestamptz not null default now()
);

alter table public.wall_keys enable row level security;

drop policy if exists "card holders and the desk read the wall key" on public.wall_keys;
create policy "card holders and the desk read the wall key" on public.wall_keys
  for select using (public.is_approved() or public.is_admin());

revoke all on public.wall_keys from anon;
grant select on public.wall_keys to authenticated;


-- SECTION 2. The key: 256 random bits as 64 hex characters, made in here.
-- gen_random_uuid() is core Postgres (no extension needed); two of them with
-- the dashes stripped give 64 hex digits.
insert into public.wall_keys (id, k)
values ('wall', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;


-- SECTION 3. Read it back (the result grid shows one row). Copy it into
-- flyer-sweep/wall_key.hex, nowhere else.
select length(k) as hex_chars, created_at from public.wall_keys where id = 'wall';
-- select k from public.wall_keys where id = 'wall';


-- SECTION 4 (only to ROTATE, leave commented out otherwise). Every member's
-- cached key stops working at once; the next weekly build must use the new one.
-- update public.wall_keys
--    set k = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
--        created_at = now()
--  where id = 'wall';
