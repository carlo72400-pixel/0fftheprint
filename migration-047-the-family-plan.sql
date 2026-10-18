-- ============================================================
-- 047 · THE FAMILY PLAN (10/18, his call: "make it one shared plan for everyone")
-- ============================================================
-- The day planner (assets/js/dayplan.js, first used on the Sick New World family page) can share ONE plan between
-- phones: the stops people add, the day's times, set time fixes, added sets, everyone's Want/Must votes and the
-- "full sets only" switch. A plan is a random secret code that lives only in the invite link (after the #, which never
-- reaches a server or a log) and on the phones that opened it. The database keeps only the code's sha256.
--   S1. dayplan_groups: one row per plan. Its event key, the sha256 of its code, when it was made and last used.
--       RLS on, no grants: only the functions below touch it.
--   S2. dayplan_items: one row per piece of a plan (plan, kind, item): its data (jsonb), the first name of whoever
--       changed it last (typed on their phone), a rev number from one sequence, and a deleted mark. Rows are never
--       removed, a removed stop is a row marked deleted, so every phone learns about it. RLS on, no grants.
--   S3. Three doors anyone may call. Without the code they do nothing.
--       dayplan_start(p_event)        makes a plan and gives its code back ONCE (64 hex).
--       dayplan_pull(p_code, p_since) every row of that plan changed after rev p_since, deleted ones included, and the
--                                     newest rev. A wrong or malformed code answers null, the same null every time.
--       dayplan_push(p_code, p_items) writes up to 60 rows (insert, or replace the same plan + kind + item) and answers
--                                     the newest rev. A wrong code answers null. Caps: kinds from a fixed list, item ids
--                                     1 to 80 characters, data an object of at most 2,000 characters, names up to 40,
--                                     1,000 rows a plan, 2,000 plans an event, 5,000 plans in all. Near 250,000 rows in
--                                     all, plans stop taking NEW rows (changes still go through), so nobody can fill
--                                     the site's database through this door.
--   S4. The verify row (every column should say true).
-- ⛔ Paste after 046a, in one go. One transaction: an error applies nothing from this file. Nothing is dropped and
--    no row is deleted. Safe to run twice.
-- ⛔ If the editor asks to confirm a "destructive" query, it is the revoke lines (they keep anon and members out of
--    the two tables). Confirm it.
-- ⛔ No secret in this file. Codes are made by the page when someone taps "Make it a shared plan".
-- ============================================================

begin;

-- S1 + S2 ---------------------------------------------------
create sequence if not exists public.dayplan_rev;

create table if not exists public.dayplan_groups (
  id         uuid primary key default gen_random_uuid(),
  event      text not null check (event ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  code_hash  text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create table if not exists public.dayplan_items (
  group_id   uuid not null references public.dayplan_groups(id),
  kind       text not null check (kind in ('vote', 'stop', 'logi', 'act', 'extra', 'member', 'setting')),
  item       text not null check (char_length(item) between 1 and 80),
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  by_name    text not null default '' check (char_length(by_name) <= 40),
  deleted    boolean not null default false,
  rev        bigint not null default nextval('public.dayplan_rev'),
  updated_at timestamptz not null default now(),
  primary key (group_id, kind, item)
);
create index if not exists dayplan_items_group_rev on public.dayplan_items (group_id, rev);
create index if not exists dayplan_groups_event on public.dayplan_groups (event);

alter table public.dayplan_groups enable row level security;
alter table public.dayplan_items  enable row level security;
revoke all on table public.dayplan_groups from anon, authenticated;
revoke all on table public.dayplan_items  from anon, authenticated;
revoke all on sequence public.dayplan_rev from anon, authenticated;

-- S3 ---------------------------------------------------------
create or replace function public.dayplan_code_hash(p_code text)
returns text language sql immutable set search_path = '' as $f$
  select encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex')
$f$;

create or replace function public.dayplan_group_for(p_code text)
returns uuid language sql stable security definer set search_path = '' as $f$
  select g.id from public.dayplan_groups g
   where p_code ~ '^[0-9a-f]{64}$' and g.code_hash = public.dayplan_code_hash(p_code)
$f$;

create or replace function public.dayplan_start(p_event text)
returns text language plpgsql volatile security definer set search_path = '' as $f$
declare
  v_event text := lower(btrim(coalesce(p_event, '')));
  v_code  text;
begin
  if v_event !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
    raise exception 'dayplan: bad event name';
  end if;
  if (select count(*) from public.dayplan_groups) >= 5000 then
    raise exception 'dayplan: too many plans';
  end if;
  if (select count(*) from public.dayplan_groups g where g.event = v_event) >= 2000 then
    raise exception 'dayplan: too many plans for this event';
  end if;
  v_code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.dayplan_groups (event, code_hash) values (v_event, public.dayplan_code_hash(v_code));
  return v_code;
end
$f$;

create or replace function public.dayplan_pull(p_code text, p_since bigint default 0)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare
  v_gid   uuid := public.dayplan_group_for(p_code);
  v_since bigint := greatest(coalesce(p_since, 0), 0);
  v_rows  jsonb;
  v_rev   bigint;
begin
  if v_gid is null then
    return null;
  end if;
  update public.dayplan_groups set last_seen = now() where id = v_gid and last_seen < now() - interval '10 minutes';
  select coalesce(jsonb_agg(jsonb_build_object('k', i.kind, 'i', i.item, 'd', i.data, 'b', i.by_name, 'x', i.deleted, 'r', i.rev)
                            order by i.rev), '[]'::jsonb),
         coalesce(max(i.rev), v_since)
    into v_rows, v_rev
    from public.dayplan_items i
   where i.group_id = v_gid and i.rev > v_since;
  return jsonb_build_object('rows', v_rows, 'rev', v_rev, 'event', (select g.event from public.dayplan_groups g where g.id = v_gid));
end
$f$;

create or replace function public.dayplan_push(p_code text, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $f$
declare
  v_gid  uuid := public.dayplan_group_for(p_code);
  v_it   jsonb;
  v_kind text;
  v_item text;
  v_data jsonb;
  v_n    int := 0;
  v_rev  bigint := 0;
  v_r    bigint;
begin
  if v_gid is null then
    return null;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'dayplan: items must be a list';
  end if;
  if jsonb_array_length(p_items) > 60 then
    raise exception 'dayplan: at most 60 items at once';
  end if;
  for v_it in select e from jsonb_array_elements(p_items) as t(e) loop
    v_kind := v_it ->> 'k';
    v_item := v_it ->> 'i';
    v_data := coalesce(v_it -> 'd', '{}'::jsonb);
    if v_kind is null or v_kind not in ('vote', 'stop', 'logi', 'act', 'extra', 'member', 'setting') then
      raise exception 'dayplan: bad kind';
    end if;
    if v_item is null or char_length(v_item) < 1 or char_length(v_item) > 80 then
      raise exception 'dayplan: bad item id';
    end if;
    if jsonb_typeof(v_data) <> 'object' or char_length(v_data::text) > 2000 then
      raise exception 'dayplan: item data too big';
    end if;
    if not exists (select 1 from public.dayplan_items i where i.group_id = v_gid and i.kind = v_kind and i.item = v_item) then
      if (select count(*) from public.dayplan_items i where i.group_id = v_gid) >= 1000 then
        raise exception 'dayplan: this plan is full';
      end if;
      if (select greatest(c.reltuples, 0) from pg_catalog.pg_class c where c.oid = 'public.dayplan_items'::regclass) >= 250000 then
        raise exception 'dayplan: no room for new rows';
      end if;
    end if;
    insert into public.dayplan_items as t (group_id, kind, item, data, by_name, deleted, rev, updated_at)
    values (v_gid, v_kind, v_item, v_data, left(coalesce(v_it ->> 'b', ''), 40),
            coalesce((v_it ->> 'x')::boolean, false), nextval('public.dayplan_rev'), now())
    on conflict (group_id, kind, item) do update
       set data = excluded.data, by_name = excluded.by_name, deleted = excluded.deleted,
           rev = excluded.rev, updated_at = excluded.updated_at
    returning t.rev into v_r;
    v_rev := greatest(v_rev, v_r);
    v_n := v_n + 1;
  end loop;
  update public.dayplan_groups set last_seen = now() where id = v_gid;
  return jsonb_build_object('n', v_n, 'rev', v_rev);
end
$f$;

revoke all on function public.dayplan_code_hash(text) from public, anon, authenticated;
revoke all on function public.dayplan_group_for(text) from public, anon, authenticated;
revoke all on function public.dayplan_start(text) from public;
revoke all on function public.dayplan_pull(text, bigint) from public;
revoke all on function public.dayplan_push(text, jsonb) from public;
grant execute on function public.dayplan_start(text) to anon, authenticated;
grant execute on function public.dayplan_pull(text, bigint) to anon, authenticated;
grant execute on function public.dayplan_push(text, jsonb) to anon, authenticated;

commit;

-- S4 · verify: every column should say true ------------------
select
  (select relrowsecurity from pg_class where oid = 'public.dayplan_groups'::regclass) as groups_locked,
  (select relrowsecurity from pg_class where oid = 'public.dayplan_items'::regclass)  as items_locked,
  not has_table_privilege('anon', 'public.dayplan_groups', 'select')                   as strangers_cannot_list_plans,
  not has_table_privilege('anon', 'public.dayplan_items', 'select')                    as strangers_cannot_read_plans,
  not has_table_privilege('authenticated', 'public.dayplan_items', 'select')           as members_cannot_read_plans,
  has_function_privilege('anon', 'public.dayplan_start(text)', 'execute')              as anyone_can_start,
  has_function_privilege('anon', 'public.dayplan_pull(text, bigint)', 'execute')       as anyone_can_pull_with_code,
  has_function_privilege('anon', 'public.dayplan_push(text, jsonb)', 'execute')        as anyone_can_push_with_code,
  not has_function_privilege('anon', 'public.dayplan_group_for(text)', 'execute')      as lookup_stays_inside,
  public.dayplan_pull(repeat('0', 64), 0) is null                                      as wrong_code_says_nothing;
