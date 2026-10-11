-- ============================================================
-- 036 · THE ROTATION BATTLE (10/11, his pick off the music brainstorm:
-- "two tracks, members vote for a week, and the winner stays")
-- ============================================================
-- Which two tracks fight, and in which week, is committed in content/music.json
-- (`battle.id`, `battle.a`, `battle.b`). The database only holds the votes.
--
-- The battle id IS the week: 'YYYY-wWW', the ISO week, Monday to Sunday on the
-- San Antonio clock. So the database knows when voting opens and closes without
-- a second table to keep in step with the JSON: 2026-w42 runs Mon Oct 12 to
-- Sun Oct 18. A vote outside its week is refused.
--
-- Members vote (is_wall_member(), the same test as the Crypt, bans included).
-- One vote per member per battle; voting again in the same week changes it.
-- Anyone can read the tally, counts only. Nobody can read who voted for what:
-- the table has no policies and no grants, the two functions are the only door.
--
-- Safe to run twice. Nothing here drops or deletes anything.
-- ============================================================

create table if not exists public.battle_votes (
  battle     text not null check (battle ~ '^[0-9]{4}-w(0[1-9]|[1-4][0-9]|5[0-3])$'),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pick       text not null check (pick in ('a', 'b')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (battle, user_id)
);
alter table public.battle_votes enable row level security;
revoke all on table public.battle_votes from public, anon, authenticated;

-- the Monday of the battle's ISO week
create or replace function public.battle_monday(p_battle text)
returns date language sql immutable
set search_path = public, pg_temp as $fn$
  select case when p_battle ~ '^[0-9]{4}-w(0[1-9]|[1-4][0-9]|5[0-3])$'
              then to_date(substr(p_battle, 1, 4) || '-' || substr(p_battle, 7, 2) || '-1', 'IYYY-IW-ID')
         end;
$fn$;

create or replace function public.battle_vote(p_battle text, p_pick text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  uid   uuid := auth.uid();
  wk    date := public.battle_monday(p_battle);
  today date := (now() at time zone 'America/Chicago')::date;
begin
  if uid is null then raise exception 'Log in to vote.' using errcode = '42501'; end if;
  if not coalesce(public.is_wall_member(), false) then raise exception 'Members vote.' using errcode = '42501'; end if;
  if wk is null then raise exception 'No such battle.' using errcode = '22023'; end if;
  if p_pick is null or p_pick not in ('a', 'b') then raise exception 'Pick a or b.' using errcode = '22023'; end if;
  if today < wk then raise exception 'Voting opens %.', to_char(wk, 'FMDy Mon FMDD') using errcode = '22023'; end if;
  if today > wk + 6 then raise exception 'This battle is closed.' using errcode = '22023'; end if;
  insert into public.battle_votes as v (battle, user_id, pick) values (p_battle, uid, p_pick)
  on conflict (battle, user_id) do update set pick = excluded.pick, updated_at = now();
  return p_pick;
end
$fn$;
revoke execute on function public.battle_vote(text, text) from public, anon;
grant  execute on function public.battle_vote(text, text) to authenticated;

-- counts for anyone, plus the caller's own pick (null when signed out or not voted)
create or replace function public.battle_tally(p_battle text)
returns table (a integer, b integer, mine text) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select (count(*) filter (where v.pick = 'a'))::int,
         (count(*) filter (where v.pick = 'b'))::int,
         (select x.pick from public.battle_votes x where x.battle = p_battle and x.user_id = auth.uid())
    from public.battle_votes v
   where v.battle = p_battle;
$fn$;
revoke execute on function public.battle_tally(text) from public;
grant  execute on function public.battle_tally(text) to anon, authenticated;

-- ---------- verify: every line should say true ----------
select 'table has RLS on'          as test, (select relrowsecurity from pg_class where oid = 'public.battle_votes'::regclass)::text as ok
union all
select 'anon cannot read the table', (not has_table_privilege('anon', 'public.battle_votes', 'select'))::text
union all
select 'anon cannot vote',           (not has_function_privilege('anon', 'public.battle_vote(text, text)', 'execute'))::text
union all
select 'members can try to vote',    has_function_privilege('authenticated', 'public.battle_vote(text, text)', 'execute')::text
union all
select 'anyone reads the tally',     has_function_privilege('anon', 'public.battle_tally(text)', 'execute')::text
union all
select '2026-w42 opens Mon Oct 12',  (public.battle_monday('2026-w42') = date '2026-10-12')::text;
