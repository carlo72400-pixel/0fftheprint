-- ============================================================
-- 046 · HIS GOING (10/14, the finder plan step 8 and his call on owner question 2: "Site taps are the one list")
-- ============================================================
-- His going list is his Going taps on the site (the wall_going rows of the desk account). His private copy of the Crypt is
-- built on the Mac every Tuesday with no login, so the build needs its own way to read those taps. The members' wall key
-- cannot be that way: every member's phone keeps a copy of it, so a door opened by the wall key would show his schedule to
-- any member. This file opens one door with a PRIVATE build token that only the build Mac holds.
--   S1. wall_build_tokens: one row. The sha256 HASH of the build token and the desk account it reads for. The token itself
--       is never stored anywhere in the database. RLS on, no grants: only the functions below touch it.
--   S2. The desk's three calls.
--       wall_build_token_mint(p_desk): makes a new token (64 hex), keeps only its hash, and gives the token back ONCE.
--         Minting again replaces it, and the old token stops working that second. From the SQL editor (no login) it is
--         made for the desk account: the one admin, or the admin whose card slug or @ is p_desk. From the site, the desk
--         makes it for himself. Members, logins that are not the desk and strangers are refused.
--       wall_build_token_off(): the desk switches it off (the door answers nothing until a new one is made).
--       wall_build_token_info(): when it was made, when the build last used it, and whose taps it reads. Never the token.
--   S3. wall_going_by_token(p_token): the build's door. With the right token it answers {"ids": [...]}: the flyer ids of the
--       desk account's going taps from eight days back on, nothing else. Anything else (no token, a wrong one, one that was
--       replaced or switched off, or an account that is no longer the desk) answers null, the same null every time, so a
--       caller cannot tell a wrong token from no token. Anyone may call it; without the token it shows nothing. Other
--       members' going taps never come out of it.
--   S4. The verify row (every column should say true), then one info row.
-- ⛔ Paste after 045, in one go. One transaction: an error applies nothing from this file. Nothing is dropped and no row is
--    deleted. Safe to run twice: a second run keeps the token he already made.
-- ⛔ If the editor asks to confirm a "destructive" query, it is the revoke lines (they take rights away from anon and
--    members). Confirm it.
-- ⛔ This file holds no secret and makes no token. The token is made by ONE line he runs afterwards
--    (select public.wall_build_token_mint();) and goes ONLY into flyer-sweep/build_token.hex on the build Mac (chmod 600).
--    Never in this file, a commit, a page, a screenshot or a chat.
-- ============================================================


-- SECTION 0. Precondition ------------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.wall_event_fixes_by_key(text)') is null then
    raise exception 'Run migration 045 first.';
  end if;
  if to_regclass('public.wall_going') is null or to_regprocedure('public.direct_sql_caller()') is null then
    raise exception 'The going table (029) or direct_sql_caller (002) is missing.';
  end if;
end $$;


-- SECTION 1. The token's hash ---------------------------------------------------------------
create table if not exists public.wall_build_tokens (
  id          text primary key default 'build' check (id = 'build'),
  desk_id     uuid not null references public.profiles(id) on delete cascade,
  token_hash  text check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
alter table public.wall_build_tokens enable row level security;
revoke all on table public.wall_build_tokens from public, anon, authenticated;


-- SECTION 2. The desk's calls ---------------------------------------------------------------
-- Who may call: a logged-in desk account (the board, later), or the SQL editor (direct_sql_caller() from 002: no login and no
-- API claims, and not the anon or member role). A member, a login that is not the desk, a stranger, or an API call with no
-- login: refused.
create or replace function public.wall_build_token_mint(p_desk text default null)
returns text language plpgsql volatile security definer
set search_path = public, pg_temp as $fn$
declare
  v_desk uuid;
  v_ids  uuid[];
  v_who  text := lower(btrim(coalesce(p_desk, ''), ' @'));
  v_tok  text;
begin
  if auth.uid() is not null then
    if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
    v_desk := auth.uid();
  elsif not public.direct_sql_caller() or coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    raise exception 'Desk only.' using errcode = '42501';
  else
    -- the SQL editor: no login, so the token is made for the desk account
    select array_agg(p.id order by p.created_at) into v_ids
      from public.profiles p
     where p.is_admin
       and (v_who = '' or lower(coalesce(p.card_slug, '')) = v_who or lower(btrim(coalesce(p.instagram, ''), ' @')) = v_who);
    if coalesce(array_length(v_ids, 1), 0) <> 1 then
      raise exception 'That names % desk accounts. Name yours: select public.wall_build_token_mint(''<your card slug>'');',
        coalesce(array_length(v_ids, 1), 0) using errcode = '22023';
    end if;
    v_desk := v_ids[1];
  end if;
  -- 64 hex: sha256 over two random uuids (gen_random_uuid is core Postgres and uses the strong random source)
  v_tok := encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex');
  insert into public.wall_build_tokens (id, desk_id, token_hash, created_at, used_at)
  values ('build', v_desk, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), now(), null)
  on conflict (id) do update
    set desk_id = excluded.desk_id, token_hash = excluded.token_hash, created_at = now(), used_at = null;
  return v_tok;
end $fn$;
revoke execute on function public.wall_build_token_mint(text) from public, anon;
grant  execute on function public.wall_build_token_mint(text) to authenticated;

create or replace function public.wall_build_token_off()
returns boolean language plpgsql volatile security definer
set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is not null then
    if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  elsif not public.direct_sql_caller() or coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    raise exception 'Desk only.' using errcode = '42501';
  end if;
  update public.wall_build_tokens set token_hash = null, used_at = null where id = 'build' and token_hash is not null;
  return found;
end $fn$;
revoke execute on function public.wall_build_token_off() from public, anon;
grant  execute on function public.wall_build_token_off() to authenticated;

create or replace function public.wall_build_token_info()
returns table (live boolean, made timestamptz, last_used timestamptz, reads_for text)
language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
#variable_conflict use_column
begin
  if auth.uid() is not null then
    if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  elsif not public.direct_sql_caller() or coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    raise exception 'Desk only.' using errcode = '42501';
  end if;
  return query
    select t.token_hash is not null, t.created_at, t.used_at, coalesce(nullif(p.card_slug, ''), p.display_name)
      from public.wall_build_tokens t left join public.profiles p on p.id = t.desk_id
     where t.id = 'build';
end $fn$;
revoke execute on function public.wall_build_token_info() from public, anon;
grant  execute on function public.wall_build_token_info() to authenticated;


-- SECTION 3. The build's door ---------------------------------------------------------------
-- null for everything but the right token. The right token: {"ids": [...]}, the desk account's going taps from eight days
-- back on (oldest night first), possibly an empty list. It stamps used_at, so the desk can see when the build last read it.
create or replace function public.wall_going_by_token(p_token text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $fn$
declare
  v_desk uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select t.desk_id into v_desk
    from public.wall_build_tokens t
   where t.id = 'build' and t.token_hash is not null
     and t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_desk is null or not exists (select 1 from public.profiles p where p.id = v_desk and p.is_admin) then
    return null;
  end if;
  update public.wall_build_tokens set used_at = now() where id = 'build';
  return jsonb_build_object('ids', coalesce((
    select jsonb_agg(g.event_id order by g.day, g.event_id)
      from public.wall_going g
     where g.user_id = v_desk
       and g.day >= (now() at time zone 'America/Chicago')::date - 8), '[]'::jsonb));
end $fn$;
revoke execute on function public.wall_going_by_token(text) from public;
grant  execute on function public.wall_going_by_token(text) to anon, authenticated;


-- SECTION 4. Verify (every column should say true), then the info row ----------------------
with v as (
  select
    (select relrowsecurity from pg_class where oid = 'public.wall_build_tokens'::regclass)
      and not has_table_privilege('anon', 'public.wall_build_tokens', 'select, insert, update, delete')
      and not has_table_privilege('authenticated', 'public.wall_build_tokens', 'select, insert, update, delete') as token_table_locked,
    (select array_agg(column_name::text order by column_name::text) from information_schema.columns
      where table_schema = 'public' and table_name = 'wall_build_tokens')
      = array['created_at', 'desk_id', 'id', 'token_hash', 'used_at'] as only_the_hash_is_kept,
    has_function_privilege('anon', 'public.wall_going_by_token(text)', 'execute')
      and has_function_privilege('authenticated', 'public.wall_going_by_token(text)', 'execute') as the_door_is_callable,
    (select bool_and(not has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute'))
       from unnest(array['public.wall_build_token_mint(text)', 'public.wall_build_token_off()', 'public.wall_build_token_info()']) as f)
      as strangers_cannot_mint,
    (select bool_and(p.prosecdef and 'search_path=public, pg_temp' = any(p.proconfig))
       from pg_proc p
      where p.oid in ('public.wall_going_by_token(text)'::regprocedure, 'public.wall_build_token_mint(text)'::regprocedure,
                      'public.wall_build_token_off()'::regprocedure, 'public.wall_build_token_info()'::regprocedure)) as doors_pinned,
    public.wall_going_by_token(null) is null
      and public.wall_going_by_token('') is null
      and public.wall_going_by_token(repeat('0', 64)) is null
      and public.wall_going_by_token((select k from public.wall_keys where id = 'wall')) is null as no_token_answers_nothing,
    pg_get_functiondef('public.wall_going_by_token(text)'::regprocedure) like '%g.user_id = v_desk%'
      and pg_get_functiondef('public.wall_going_by_token(text)'::regprocedure) like '%p.is_admin%' as only_the_desk_taps
),
info (n, what) as (
  select 1, coalesce((
    select case when t.token_hash is null then 'Build token: switched off. Make one: select public.wall_build_token_mint();'
                else 'Build token: made ' || to_char(t.created_at at time zone 'America/Chicago', 'Mon DD HH12:MI AM')
                     || coalesce(', last read by the build ' || to_char(t.used_at at time zone 'America/Chicago', 'Mon DD HH12:MI AM'),
                                 ', not read by the build yet')
                     || ', reads the taps of ' || coalesce(nullif(p.card_slug, ''), p.display_name, 'the desk') end
      from public.wall_build_tokens t left join public.profiles p on p.id = t.desk_id where t.id = 'build'),
    'Build token: not made yet. Run this one line next: select public.wall_build_token_mint();')
)
(select 'verify: every column should say true' as what, v.* from v)
union all
(select i.what, v.* from info i left join v on false order by i.n);
