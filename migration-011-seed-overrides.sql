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
select 'seed_overrides' as check, count(*) as rows from public.seed_overrides;

-- ⛔ AFTER RUNNING:
--   curl '.../rest/v1/feed?limit=1'           -H 'apikey: <publishable>'  -- 200
--   curl '.../rest/v1/seed_overrides?limit=1' -H 'apikey: <publishable>'  -- 200
