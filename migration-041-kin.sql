-- ============================================================
-- 041 · KIN (10/11, his ask: "lets also implement a friends list / page and rename it from people to something else")
-- ============================================================
-- Friends in the Crypt, the MySpace way: you ask, they accept, now you are friends; either side can end it. One row per
-- pair. The Top 8 (030) stays what it was, a pick. Everything here is members only and goes through the functions.
--   friend_ask(sid)           ask somebody. Answers asked / friends (they had already asked you: that is a yes). 30 asks a day.
--   friend_answer(sid, yes)   accept (friends) or ignore (none) an ask that came to you
--   friend_remove(sid)        end it, or take back your own ask
--   friends_list(sid)         somebody's friends (yours with no sid). Another member's list shows when their page is open.
--   friend_asks()             the asks waiting on you; friend_asks_n() for the badge
--   wall_space()              now also answers `friend` (none / asked / pending / friends / self), `friends_n`, and the first
--                             twelve `friends` faces, so a page can draw its Friends box without another call
-- A dm_block (040) also refuses a friend ask, both ways, with the same words. A ban (032) ends membership: the banned drop
-- out of every list and cannot ask. Every table has RLS on with no grants. Nothing is dropped. Safe to run twice.
-- ============================================================


-- SECTION 1. The table -----------------------------------------------------------
create table if not exists public.wall_friends (
  a           uuid not null references auth.users(id) on delete cascade,     -- who asked
  b           uuid not null references auth.users(id) on delete cascade,     -- who was asked
  status      text not null default 'asked' check (status in ('asked', 'friends')),
  created_at  timestamptz not null default now(),
  since       timestamptz,
  primary key (a, b),
  constraint wall_friends_two_people check (a <> b)
);
create unique index if not exists wall_friends_pair on public.wall_friends (least(a, b), greatest(a, b));
create index if not exists wall_friends_b on public.wall_friends (b, status);
alter table public.wall_friends enable row level security;
revoke all on table public.wall_friends from public, anon, authenticated;


-- SECTION 2. Helpers (not callable from the API) ----------------------------------------
create or replace function public.friend_state_of(me uuid, who uuid)
returns text language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case
    when me is null or who is null then 'none'
    when me = who then 'self'
    when exists (select 1 from public.wall_friends f where ((f.a = me and f.b = who) or (f.a = who and f.b = me)) and f.status = 'friends') then 'friends'
    when exists (select 1 from public.wall_friends f where f.a = me and f.b = who and f.status = 'asked') then 'asked'
    when exists (select 1 from public.wall_friends f where f.a = who and f.b = me and f.status = 'asked') then 'pending'
    else 'none' end;
$fn$;
revoke execute on function public.friend_state_of(uuid, uuid) from public, anon, authenticated;

-- somebody's friends, as the page draws people: members only, in the order they became friends
create or replace function public.friend_rows(who uuid)
returns table (id uuid, since timestamptz) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case when f.a = who then f.b else f.a end, f.since
    from public.wall_friends f
   where (f.a = who or f.b = who) and f.status = 'friends'
     and public.wall_member(case when f.a = who then f.b else f.a end)
   order by f.since desc nulls last;
$fn$;
revoke execute on function public.friend_rows(uuid) from public, anon, authenticated;


-- SECTION 3. The doors (members only) ------------------------------------------------------
create or replace function public.friend_ask(p_sid text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me  uuid := auth.uid();
  who uuid := public.dm_who(p_sid);
  st  text;
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if who is null or who = me or not public.wall_member(who) then raise exception 'Nobody there.' using errcode = '22023'; end if;
  if public.dm_blocked(me, who) then raise exception 'They are not taking requests.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kin:' || least(me, who)::text || greatest(me, who)::text, 0));
  st := public.friend_state_of(me, who);
  if st = 'friends' or st = 'asked' then return st; end if;
  if st = 'pending' then
    update public.wall_friends f set status = 'friends', since = now() where f.a = who and f.b = me;
    return 'friends';
  end if;
  if (select count(*) from public.wall_friends f where f.a = me and f.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Slow down: that is thirty asks today.' using errcode = '42501';
  end if;
  insert into public.wall_friends (a, b) values (me, who);
  return 'asked';
end $fn$;
revoke execute on function public.friend_ask(text) from public, anon;
grant  execute on function public.friend_ask(text) to authenticated;

create or replace function public.friend_answer(p_sid text, p_yes boolean)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me  uuid := auth.uid();
  who uuid := public.dm_who(p_sid);
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if who is null or who = me then raise exception 'Nobody there.' using errcode = '22023'; end if;
  if not exists (select 1 from public.wall_friends f where f.a = who and f.b = me and f.status = 'asked') then
    return public.friend_state_of(me, who);        -- nothing to answer (already friends, or they took it back)
  end if;
  if p_yes then
    update public.wall_friends f set status = 'friends', since = now() where f.a = who and f.b = me;
    return 'friends';
  end if;
  delete from public.wall_friends f where f.a = who and f.b = me;
  return 'none';
end $fn$;
revoke execute on function public.friend_answer(text, boolean) from public, anon;
grant  execute on function public.friend_answer(text, boolean) to authenticated;

create or replace function public.friend_remove(p_sid text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me  uuid := auth.uid();
  who uuid := public.dm_who(p_sid);
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if who is null then return 'none'; end if;
  delete from public.wall_friends f where (f.a = me and f.b = who) or (f.a = who and f.b = me);
  return 'none';
end $fn$;
revoke execute on function public.friend_remove(text) from public, anon;
grant  execute on function public.friend_remove(text) to authenticated;

-- Somebody's friends. Yours with no sid (every one of them); another member's when their page is open (or you are the desk),
-- and then only the friends whose own pages are open.
create or replace function public.friends_list(p_sid text default null)
returns table (sid text, name text, pic text, kind text, since timestamptz, open boolean)
language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare
  me  uuid := auth.uid();
  who uuid;
begin
  if me is null or not public.is_wall_member() then return; end if;
  who := case when coalesce(p_sid, '') = '' then me else public.dm_who(p_sid) end;
  if who is null then return; end if;
  if who <> me and not public.is_admin() and not (public.wall_member(who) and public.wall_open(who)) then return; end if;
  return query
    select public.wall_sid(x.id), coalesce(nullif(btrim(x.display_name), ''), 'Member'),
           case when s.user_id is null then x.card_photo else s.pic end,
           case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
           r.since, public.wall_open(x.id)
      from public.friend_rows(who) r
      join public.profiles x on x.id = r.id
      left join public.wall_spaces s on s.user_id = x.id
     where who = me or public.is_admin() or public.wall_open(x.id)
     order by r.since desc nulls last
     limit 500;
end $fn$;
revoke execute on function public.friends_list(text) from public, anon;
grant  execute on function public.friends_list(text) to authenticated;

create or replace function public.friend_asks()
returns table (sid text, name text, pic text, kind text, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.wall_sid(x.id), coalesce(nullif(btrim(x.display_name), ''), 'Member'),
         case when s.user_id is null then x.card_photo else s.pic end,
         case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
         f.created_at
    from public.wall_friends f
    join public.profiles x on x.id = f.a
    left join public.wall_spaces s on s.user_id = x.id
   where public.is_wall_member() and f.b = auth.uid() and f.status = 'asked' and public.wall_member(f.a)
   order by f.created_at desc
   limit 200;
$fn$;
revoke execute on function public.friend_asks() from public, anon;
grant  execute on function public.friend_asks() to authenticated;

create or replace function public.friend_asks_n()
returns integer language sql stable security definer
set search_path = public, pg_temp as $fn$
  select count(*)::int from public.friend_asks();
$fn$;
revoke execute on function public.friend_asks_n() from public, anon;
grant  execute on function public.friend_asks_n() to authenticated;


-- SECTION 4. A page carries its friends ---------------------------------------------------
-- Same as 039, plus `friend` (the state between the reader and the page), `friends_n` and the first twelve `friends`.
create or replace function public.wall_space(p_sid text default null)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare
  me   uuid := auth.uid();
  who  uuid;
  pr   public.profiles;
  sp   public.wall_spaces;
  t8   uuid[];
begin
  if me is null or not public.is_wall_member() then return null; end if;
  if coalesce(p_sid, '') = '' then
    who := me;
  else
    select x.id into who from public.profiles x where public.wall_sid(x.id) = p_sid limit 1;
    if who is null then return null; end if;
    if who <> me and not public.wall_open(who) and not public.is_admin() then return null; end if;
    if who <> me and not public.wall_member(who) then return null; end if;
  end if;
  select * into pr from public.profiles where id = who;
  select * into sp from public.wall_spaces where user_id = who;
  t8 := coalesce(sp.top8, '{}');
  if sp.user_id is null then
    select coalesce(array_agg(d.id), '{}') into t8
      from (select x.id from public.profiles x where x.is_admin and x.id <> who order by x.created_at limit 1) d;
  end if;
  return jsonb_build_object(
    'sid',      public.wall_sid(who),
    'mine',     who = me,
    'open',     public.wall_open(who),
    'fresh',    sp.user_id is null,
    'name',     coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
    'ig',       pr.instagram,
    'kind',     case when pr.is_admin then 'desk' when pr.approved then 'card' else 'member' end,
    'card',     case when pr.approved then pr.card_slug end,
    'since',    pr.created_at,
    'look',     case when sp.user_id is null then null else jsonb_build_object(
                  'skin', sp.skin, 'bg', sp.bg, 'box', sp.box, 'ink', sp.ink, 'hot', sp.hot,
                  'pattern', sp.pattern, 'font', sp.font, 'fall', sp.fall, 'sparkle', sp.sparkle,
                  'marquee', sp.marquee, 'wallpaper', sp.wallpaper, 'tile', sp.tile) end,
    'pic',      case when sp.user_id is null then pr.card_photo  else sp.pic end,
    'headline', case when sp.user_id is null then pr.tagline     else sp.headline end,
    'about',    case when sp.user_id is null then pr.bio         else sp.about end,
    'song',     case when sp.user_id is null then pr.theme_track else sp.song end,
    'mood_e',   sp.mood_e,
    'mood',     sp.mood,
    'meet',     sp.meet,
    'wear',     coalesce(sp.wear, false),
    'details',  jsonb_build_object(
                  'pronouns', sp.pronouns, 'city', sp.city,
                  'here_for', coalesce(to_jsonb(sp.here_for), '[]'::jsonb),
                  'scene',    coalesce(to_jsonb(sp.scene), '[]'::jsonb),
                  'sign', sp.sign, 'gear', sp.gear, 'music', sp.music, 'movies', sp.movies, 'haunts', sp.haunts),
    'pics',     coalesce(to_jsonb(sp.pics), '[]'::jsonb),
    'nights_n', (select count(*) from public.wall_going g where g.user_id = who),
    'frames_n', (select count(*) from public.frame_tags t where t.user_id = who),
    'comments_n', (select count(*) from public.wall_comments c where c.user_id = who and not c.hidden),
    'links',    case when pr.approved and jsonb_typeof(pr.links) = 'array' then pr.links else '[]'::jsonb end,
    'friend',   public.friend_state_of(me, who),
    'friends_n', (select count(*) from public.friend_rows(who)),
    'friends',  (select coalesce(jsonb_agg(jsonb_build_object(
                          's', public.wall_sid(x.id),
                          'n', coalesce(nullif(btrim(x.display_name), ''), 'Member'),
                          'p', case when s2.user_id is null then x.card_photo else s2.pic end) order by r.since desc nulls last), '[]'::jsonb)
                   from (select * from public.friend_rows(who) limit 12) r
                   join public.profiles x on x.id = r.id
                   left join public.wall_spaces s2 on s2.user_id = x.id
                  where who = me or public.is_admin() or public.wall_open(x.id)),
    'asks_n',   case when who = me then (select count(*) from public.friend_asks()) else 0 end,
    'top8',     (select coalesce(jsonb_agg(jsonb_build_object(
                          's', public.wall_sid(x.id),
                          'n', coalesce(nullif(btrim(x.display_name), ''), 'Member'),
                          'p', case when s2.user_id is null then x.card_photo else s2.pic end) order by u.ord), '[]'::jsonb)
                   from unnest(t8) with ordinality as u(id, ord)
                   join public.profiles x on x.id = u.id
                   left join public.wall_spaces s2 on s2.user_id = x.id
                  where public.wall_open(x.id)),
    'fans',     (select count(*) from public.wall_spaces s3
                  where who = any(s3.top8) and s3.user_id <> who and public.wall_open(s3.user_id)),
    'going',    (select coalesce(jsonb_agg(g.event_id order by g.day, g.created_at), '[]'::jsonb)
                   from (select g.event_id, g.day, g.created_at from public.wall_going g
                          where g.user_id = who and g.day >= (now() at time zone 'America/Chicago')::date - 1
                          order by g.day, g.created_at limit 40) g),
    'posts',    (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', q.id, 'b', q.body, 't', q.created_at, 'n', q.name, 's', q.sid, 'p', q.pic, 'del', q.del)
                          order by q.created_at desc), '[]'::jsonb)
                   from (select c.id, c.body, c.created_at,
                                coalesce(nullif(btrim(a.display_name), ''), 'Member') as name,
                                case when public.wall_open(a.id) then public.wall_sid(a.id) end as sid,
                                case when sa.user_id is null then a.card_photo else sa.pic end as pic,
                                (c.author = me or c.owner = me or public.is_admin()) as del
                           from public.wall_space_posts c
                           join public.profiles a on a.id = c.author
                           left join public.wall_spaces sa on sa.user_id = a.id
                          where c.owner = who and public.wall_member(a.id)
                          order by c.created_at desc limit 40) q),
    'posts_n',  (select count(*) from public.wall_space_posts c
                  where c.owner = who and public.wall_member(c.author))
  );
end $fn$;
revoke execute on function public.wall_space(text) from public, anon;
grant  execute on function public.wall_space(text) to authenticated;


-- ---------- verify: every line should say true ----------
select 'friends table, RLS on, locked'     as test, ((select relrowsecurity from pg_class where oid = 'public.wall_friends'::regclass) and not has_table_privilege('authenticated', 'public.wall_friends', 'select'))::text as ok
union all select 'one row per pair',               (exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'wall_friends_pair'))::text
union all select 'members may ask',                has_function_privilege('authenticated', 'public.friend_ask(text)', 'execute')::text
union all select 'strangers may not',              (not has_function_privilege('anon', 'public.friend_ask(text)', 'execute') and not has_function_privilege('anon', 'public.friends_list(text)', 'execute'))::text
union all select 'the helpers are not doors',      (not has_function_privilege('authenticated', 'public.friend_state_of(uuid, uuid)', 'execute') and not has_function_privilege('authenticated', 'public.friend_rows(uuid)', 'execute'))::text
union all select 'wall_space answers with friends', (pg_get_functiondef('public.wall_space(text)'::regprocedure) like '%''friends_n''%')::text
union all select 'six doors',                      ((select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('friend_ask','friend_answer','friend_remove','friends_list','friend_asks','friend_asks_n')) = 6)::text;
