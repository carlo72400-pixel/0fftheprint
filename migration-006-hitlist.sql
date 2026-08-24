-- 0FF THE PRINT — migration 006: THE HIT LIST, a desk-only client tracker.
-- Paste into Supabase SQL Editor and Run. Safe to re-run.
--
-- The page is /desk/targets/. The rule: there is deliberately NO public read
-- policy on these tables, so the anon key returns zero rows to anyone who is
-- not signed in as the desk. The seed data (names, numbers) is NOT in this
-- repo on purpose; it gets pasted separately and lives only in the database.

create table if not exists public.hitlist (
  id            bigint generated always as identity primary key,
  rank          int,
  name          text not null unique,
  area          text not null default '',
  ig            text not null default '',
  content_read  text not null default '',   -- one line on how weak their current content is
  hook          text not null default '',
  pitch         text not null default '',
  tier          text not null default '',
  evidence      text not null default '',   -- one URL per line
  status        text not null default 'to hit'
                check (status in ('to hit','pitched','booked','dead')),
  notes         text not null default '',
  updated_at    timestamptz not null default now()
);

alter table public.hitlist enable row level security;

drop policy if exists "desk only" on public.hitlist;
create policy "desk only" on public.hitlist
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_hitlist()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists touch_hitlist on public.hitlist;
create trigger touch_hitlist before update on public.hitlist
  for each row execute function public.touch_hitlist();

-- desk-only text blobs (the intro line, the lane notes)
create table if not exists public.hitlist_meta (
  k text primary key,
  v text not null default ''
);

alter table public.hitlist_meta enable row level security;

drop policy if exists "desk only meta" on public.hitlist_meta;
create policy "desk only meta" on public.hitlist_meta
  for all using (public.is_admin()) with check (public.is_admin());
