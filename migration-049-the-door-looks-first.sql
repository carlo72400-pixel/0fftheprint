-- ============================================================
-- 049 · THE DOOR LOOKS FIRST (10/29, his ask: "find a way to vet for future people coming in that they do have an
--        Instagram that works and is real, like a real profile ... make sure they're not randos ... this is, like,
--        precious. I didn't build this just for anybody")
-- ============================================================
-- 035 let anybody in the moment they typed an Instagram no account had used yet ("trust the handle", his pick 10/4).
-- On 10/29 three of the eight people who had joined since 10/22 carried handles Instagram has no page for (two were
-- closed by the desk, one is a regular who typed the wrong @). From this file on a NEW handle waits at the door until
-- the desk has looked at it. Who is in today stays in.
--   S1. wall_people gets the door: door ('wait' = at the door, 'no' = turned away, null = never at the door or let in)
--       and door_at (when they reached the door, then when the desk answered).
--   S2. wall_door: one row, the door's mode. 'look' (the default): every new handle waits for the desk. 'open': 035's
--       door, a handle gets in on the spot (and whoever waits walks in the next time a page asks).
--       desk_door_mode(p_mode) reads it (null) or sets it ('look' / 'open'): the desk, or the SQL editor. No page shows it.
--   S3. wall_join answers one new word, 'wait': at the door. Somebody the desk turned away hears 'wait' too, the same word
--       every time (023's rule: a no is never announced). Asking again while waiting counts no try. Somebody at the door
--       cannot swap the handle they brought (the desk can, with Fix their @ on the board).
--       Every word it answered before is unchanged: in / need / taken / slow / closed / shut, and the ban error.
--   S4. desk_door(p_user, p_in): the desk's two keys. true lets them in (a member at once, the way 035 did it; on somebody
--       turned away it is "let in after all"). false turns them away: they stay out, quietly. Their @ stays on the login
--       so the board can say who it was (Fix their @ clears it if the real owner of that @ turns up).
--   S5. The rest of the house learns the door: desk_member_rows calls somebody waiting role 'door' and somebody turned
--       away state 'turned'; desk_door_waiting() is the door's count for the board's badge (desk_waiting keeps its shape,
--       so 045 still runs twice: desk.js adds the two up); my_account says kind 'door'; desk_set_instagram no longer
--       lets somebody at the door in by fixing their @ (only the two keys do); wall_set_show answers somebody at the
--       door (the Crypt form's "Show me" box).
--   S6. The verify row (every column should say true).
-- ⛔ Paste after 048, in one go. One transaction: an error applies nothing from this file. Nothing is dropped and no row
--    is deleted. Safe to run twice (a second run leaves the door's mode as it is).
-- ⛔ If the editor asks to confirm a "destructive" query, it is the revoke lines (they keep strangers and members off
--    the new pieces). Confirm it.
-- ⛔ Push the pages right after (the Crypt's door screen, the board's door). A page from before this file reads 'wait'
--    as "That did not go through".
-- ============================================================

begin;

-- S1 ---------------------------------------------------------
alter table public.wall_people add column if not exists door text check (door in ('wait', 'no'));
alter table public.wall_people add column if not exists door_at timestamptz;
create index if not exists wall_people_at_the_door on public.wall_people (door_at) where door = 'wait';

-- S2 ---------------------------------------------------------
create table if not exists public.wall_door (
  id         boolean primary key default true check (id),
  mode       text not null default 'look' check (mode in ('look', 'open')),
  changed_at timestamptz not null default now(),
  changed_by uuid
);
insert into public.wall_door (id) values (true) on conflict (id) do nothing;
alter table public.wall_door enable row level security;
revoke all on table public.wall_door from anon, authenticated;

-- true while the door looks first (and when the row is somehow gone: the careful answer)
create or replace function public.wall_door_looks()
returns boolean language sql stable security definer set search_path = public, pg_temp as $f$
  select coalesce((select d.mode <> 'open' from public.wall_door d where d.id), true);
$f$;

create or replace function public.desk_door_mode(p_mode text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $f$
declare v text;
begin
  if not (coalesce(public.is_admin(), false) or public.direct_sql_caller()) then
    raise exception 'Desk only.' using errcode = '42501';
  end if;
  if p_mode is not null then
    if p_mode not in ('look', 'open') then raise exception 'The door is look or open.' using errcode = '22023'; end if;
    insert into public.wall_door (id, mode, changed_at, changed_by) values (true, p_mode, now(), auth.uid())
      on conflict (id) do update set mode = excluded.mode, changed_at = now(), changed_by = auth.uid()
      where wall_door.mode is distinct from excluded.mode;
  end if;
  select d.mode into v from public.wall_door d where d.id;
  return coalesce(v, 'look');
end $f$;

-- In the Crypt, the way 035 let everybody in: a casual member. 034 (b)'s card-ask rule rides along unchanged.
create or replace function public.door_let_in(p uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  insert into public.wall_people (user_id, casual) values (p, true)
    on conflict (user_id) do update
      set casual    = true,
          joined_at = case when wall_people.door is not null then now() else wall_people.joined_at end,
          door      = null,
          door_at   = case when wall_people.door is not null then now() else wall_people.door_at end;
  -- 034 (b), unchanged: somebody who signed up on /join/ asked for a card and stays an open
  -- ask; The Wall's own form says via = wall, and those people asked for nothing
  if exists (select 1 from public.profiles x where x.id = p and not x.approved and not x.is_admin and not coalesce(x.denied, false))
     and coalesce((select u.raw_user_meta_data ->> 'via' from auth.users u where u.id = p), '') <> 'wall' then
    update public.wall_people set card_ask = 'asked', card_ask_at = now()
     where user_id = p and card_ask is null;
  end if;
end $f$;

-- S3 ---------------------------------------------------------
create or replace function public.wall_join(p_ig text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $f$
declare
  uid    uuid := auth.uid();
  have   text;
  want   text := public.wall_ig_norm(p_ig);
  isin   boolean;
  v_door text;
begin
  if uid is null then return 'need'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wall_redeem:' || uid::text, 0));
  if exists (select 1 from public.wall_people w where w.user_id = uid and w.banned) then
    raise exception 'This account can''t join the Crypt.' using errcode = '42501';   -- 044: the Crypt
  end if;
  if not public.acct_open(uid) then
    return case when exists (select 1 from public.account_closures c where c.user_id = uid and c.reopened_at is null and c.by_desk)
                then 'shut' else 'closed' end;
  end if;
  select p.instagram into have from public.profiles p where p.id = uid;
  if not found then return 'need'; end if;
  isin := public.is_wall_member();
  -- already in, and nothing to add: a card holder, or a member from before this rule
  if isin and (have is not null or want is null) then return 'in'; end if;

  -- 049: the door. Turned away hears 'wait', the same word every time, whatever they type (a no is never announced).
  -- At the door with the handle they brought: 'wait' while the door looks. Neither one counts a try.
  select w.door into v_door from public.wall_people w where w.user_id = uid;
  if not isin and v_door = 'no' then return 'wait'; end if;
  if not isin and v_door = 'wait' and have is not null and public.wall_door_looks() then return 'wait'; end if;

  -- no handle on the account and none typed: nothing was tried, so nothing is counted.
  -- (The pages ask this on every load for a login that is not on The Wall yet.)
  if have is null and want is null then return 'need'; end if;

  if (select count(*) from public.wall_code_tries t
       where t.user_id = uid and t.at > now() - interval '1 hour') >= 10 then
    return 'slow';
  end if;
  insert into public.wall_code_tries (user_id) values (uid);

  if have is null then
    begin
      update public.profiles set instagram = want where id = uid;
    exception when unique_violation then
      return 'taken';
    end;
    -- the name guard hands a card holder's or the house's handle back: same answer
    select p.instagram into have from public.profiles p where p.id = uid;
    if have is distinct from want then return 'taken'; end if;
  end if;
  if isin then return 'in'; end if;            -- they were in already and now carry a handle too

  -- 049: the door looks first. The handle waits for the desk (desk_door); the board counts it (desk_waiting).
  if public.wall_door_looks() then
    insert into public.wall_people (user_id, casual, door, door_at) values (uid, false, 'wait', now())
      on conflict (user_id) do update
        set door = 'wait', door_at = case when wall_people.door = 'wait' then wall_people.door_at else now() end;
    return 'wait';
  end if;
  perform public.door_let_in(uid);             -- the door is open: 035's way, in on the spot
  return 'in';
end $f$;

-- S4 ---------------------------------------------------------
create or replace function public.desk_door(p_user uuid, p_in boolean)
returns text language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_x public.profiles; v_w public.wall_people;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_in is null then raise exception 'In or not?' using errcode = '22023'; end if;
  select * into v_x from public.profiles x where x.id = p_user;
  if v_x.id is null then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wall_redeem:' || p_user::text, 0));
  select * into v_w from public.wall_people w where w.user_id = p_user;
  if v_x.is_admin or v_x.approved then raise exception 'They hold a card. They are in already.' using errcode = '22023'; end if;
  if coalesce(v_w.banned, false) then raise exception 'They are banned. Unban them first.' using errcode = '22023'; end if;
  if not public.acct_open(p_user) then raise exception 'That account is closed. Open it back up first.' using errcode = '22023'; end if;
  if coalesce(v_w.casual, false) then return 'in'; end if;     -- let in already (the board is often open in two tabs)
  if v_w.door is null then raise exception 'They are not at the door.' using errcode = '22023'; end if;
  if p_in then
    perform public.door_let_in(p_user);
    perform public.acct_log(p_user, 'door_in', jsonb_build_object('ig', v_x.instagram, 'was', v_w.door));
    return 'in';
  end if;
  if v_w.door = 'no' then return 'no'; end if;
  update public.wall_people set door = 'no', door_at = now() where user_id = p_user;
  perform public.acct_log(p_user, 'door_no', jsonb_build_object('ig', v_x.instagram));
  return 'no';
end $f$;

-- S5 ---------------------------------------------------------
create or replace function public.desk_member_rows(p_only uuid default null)
returns table(id uuid, sid text, name text, ig text, card_slug text, requested_slug text, card_want text, role text,
              state text, asks boolean, said_no boolean, show_name boolean, pic text, joined timestamptz,
              crypt_joined timestamptz, last_in timestamptz, last_active timestamptz, banned_at timestamptz,
              ban_note text, closed_at timestamptz, closed_by_desk boolean, close_reason text, frame_grant text,
              card_frame text, n_posts integer, n_roll integer, n_comments integer, n_page integer, n_packs integer,
              n_rooms integer, n_stories integer, n_catalog integer, n_story_comments integer, n_picks integer,
              n_videos integer, n_dates integer, n_tags integer, n_sources integer, n_friends integer, n_reports integer)
language sql stable security definer set search_path = public, pg_temp as $f$
  with
  po as (select p.author_id as u, count(*)::int as n, (count(*) filter (where p.members_only))::int as roll, max(p.created_at) as at
           from public.posts p group by 1),
  tc as (select c.user_id as u, count(*)::int as n, max(c.created_at) as at from public.take_comments c group by 1),
  fc as (select c.user_id as u, count(*)::int as n, max(c.created_at) as at from public.wall_comments c group by 1),
  pg as (select c.author as u, count(*)::int as n, max(c.created_at) as at from public.wall_space_posts c group by 1),
  pk as (select p.author_id as u, count(*)::int as n, max(p.updated_at) as at from public.packs p group by 1),
  rm as (select r.author_id as u, count(*)::int as n, max(r.updated_at) as at from public.rooms r group by 1),
  st as (select s.author_id as u, count(*)::int as n, (count(*) filter (where s.baked))::int as baked,
                max(greatest(s.created_at, s.edited_at)) as at
           from public.member_stories s group by 1),
  we as (select e.author_id as u, count(*)::int as n, max(e.created_at) as at from public.word_entries e group by 1),
  rt as (select t.submitted_by as u, count(*)::int as n, max(t.created_at) as at from public.rotation_tracks t group by 1),
  fv as (select v.submitted_by as u, count(*)::int as n, max(v.created_at) as at from public.featured_videos v group by 1),
  cd as (select d.submitted_by as u, count(*)::int as n, max(d.created_at) as at from public.calendar_dates d group by 1),
  ft as (select t.user_id as u, count(*)::int as n, max(t.created_at) as at from public.frame_tags t group by 1),
  so as (select s.user_id as u, count(*)::int as n, max(s.created_at) as at from public.wall_sources s group by 1),
  fr as (select z.u, count(*)::int as n
           from (select f.a as u from public.wall_friends f where f.status = 'friends'
                 union all select f.b from public.wall_friends f where f.status = 'friends') z group by 1),
  rp as (select r.about as u, count(*)::int as n
           from (select distinct r0.about, r0.kind, r0.target from public.reports r0 where r0.closed_at is null and r0.about is not null) r
          group by 1)
  select x.id, public.wall_sid(x.id), coalesce(nullif(btrim(x.display_name), ''), 'Member'), x.instagram,
         x.card_slug, x.requested_slug, w.card_want,
         -- 049: 'door' = waiting for the desk to look at their @
         case when x.is_admin then 'desk' when x.approved then 'card' when coalesce(w.casual, false) then 'member'
              when w.door = 'wait' then 'door' else 'login' end,
         -- 049: 'turned' = the desk turned them away at the door
         case when c.user_id is not null then 'closed' when coalesce(w.banned, false) then 'banned'
              when w.door = 'no' and not x.approved and not x.is_admin and not coalesce(w.casual, false) then 'turned'
              else 'active' end,
         (coalesce(w.card_ask = 'asked', false) and not x.approved and not x.is_admin and not x.denied and public.acct_ok(x.id)) as asks,
         (x.denied or coalesce(w.card_ask = 'denied', false)),
         coalesce(w.show_name, true),
         coalesce(sp.pic, x.card_photo),
         x.created_at, w.joined_at,
         (to_jsonb(au) ->> 'last_sign_in_at')::timestamptz,
         greatest(po.at, tc.at, fc.at, pg.at, pk.at, rm.at, st.at, we.at, rt.at, fv.at, cd.at, ft.at, so.at),
         case when coalesce(w.banned, false) then w.banned_at end, case when coalesce(w.banned, false) then w.ban_note end,
         c.closed_at, coalesce(c.by_desk, false), c.reason,
         x.frame_grant::text, x.card_frame::text,
         coalesce(po.n, 0), coalesce(po.roll, 0), coalesce(tc.n, 0) + coalesce(fc.n, 0), coalesce(pg.n, 0),
         coalesce(pk.n, 0), coalesce(rm.n, 0), coalesce(st.n, 0), coalesce(st.baked, 0),
         coalesce(we.n, 0), coalesce(rt.n, 0), coalesce(fv.n, 0), coalesce(cd.n, 0), coalesce(ft.n, 0), coalesce(so.n, 0),
         coalesce(fr.n, 0), coalesce(rp.n, 0)
    from public.profiles x
    left join auth.users au on au.id = x.id
    left join public.wall_people w on w.user_id = x.id
    left join public.wall_spaces sp on sp.user_id = x.id
    left join public.account_closures c on c.user_id = x.id and c.reopened_at is null
    left join po on po.u = x.id left join tc on tc.u = x.id left join fc on fc.u = x.id left join pg on pg.u = x.id
    left join pk on pk.u = x.id left join rm on rm.u = x.id left join st on st.u = x.id left join we on we.u = x.id
    left join rt on rt.u = x.id left join fv on fv.u = x.id left join cd on cd.u = x.id left join ft on ft.u = x.id
    left join so on so.u = x.id left join fr on fr.u = x.id left join rp on rp.u = x.id
   where public.is_admin() and (p_only is null or x.id = p_only)
   order by asks desc, x.is_admin desc, x.created_at desc
   limit 2000;
$f$;

-- the door's count for the board's badge: the same people desk_member_rows calls 'door'. 0 for anybody but the desk.
-- (desk_waiting keeps its shape so 045 still runs twice; desk.js adds this one to it.)
create or replace function public.desk_door_waiting()
returns integer language sql stable security definer set search_path = public, pg_temp as $f$
  select case when coalesce(public.is_admin(), false) then
    (select count(*)::int from public.wall_people w join public.profiles x on x.id = w.user_id
      where w.door = 'wait' and not w.casual and not x.approved and not x.is_admin and public.acct_ok(x.id))
  else 0 end;
$f$;

create or replace function public.my_account()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $f$
  select jsonb_build_object(
    'name',       x.display_name,
    'ig',         x.instagram,
    -- 049: 'door' = at the door, waiting (and, said the same way, turned away)
    'kind',       case when x.is_admin then 'desk' when x.approved then 'card' when coalesce(w.casual, false) then 'member'
                       when w.door = 'no' or (w.door = 'wait' and x.instagram is not null) then 'door' else 'pending' end,
    'banned',     coalesce(w.banned, false),
    'closed',     c.user_id is not null,
    'can_reopen', c.user_id is not null and not c.by_desk,
    'closed_at',  c.closed_at,
    'card_slug',  case when x.approved then x.card_slug end,
    'card_ask',   w.card_ask,
    'card_want',  w.card_want,
    'names_left', case when x.approved or x.is_admin then null
                       else greatest(0, 3 - (select count(*)::int from public.account_log l
                                              where l.target = x.id and l.by = x.id and l.action = 'name'
                                                and l.at > now() - interval '24 hours')) end,
    'sid',        public.wall_sid(x.id))
    from public.profiles x
    left join public.wall_people w on w.user_id = x.id
    left join public.account_closures c on c.user_id = x.id and c.reopened_at is null
   where auth.uid() is not null and x.id = auth.uid();
$f$;

create or replace function public.desk_set_instagram(p_user uuid, p_ig text)
returns text language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_x public.profiles; v text := public.wall_ig_norm(p_ig);
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  select * into v_x from public.profiles x where x.id = p_user;
  if v_x.id is null then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_ig, '')), '') is not null and v is null then return 'bad'; end if;
  if v is not distinct from lower(v_x.instagram) then return 'same'; end if;
  if v is not null and ((not v_x.is_admin and exists (select 1 from public.reserved_slugs r where public.name_key(r.slug) = public.name_key(v)))
                        or exists (select 1 from public.profiles q where q.id <> p_user and lower(q.instagram) = v)) then
    return 'taken';
  end if;
  begin
    update public.profiles set instagram = v where id = p_user;
  exception when unique_violation then
    return 'taken';
  end;
  if v_x.instagram is not null then
    insert into public.wall_ig_settled (user_id, instagram, kept_by) values (p_user, v_x.instagram, null);
  end if;
  if not v_x.approved and not v_x.is_admin then
    if v is null then
      update public.wall_people set casual = false where user_id = p_user and casual;
    -- 049: somebody at the door (or turned away) keeps waiting for the two keys; a new @ alone lets nobody in
    elsif public.acct_ok(p_user)
          and not exists (select 1 from public.wall_people w where w.user_id = p_user and w.door is not null) then
      insert into public.wall_people (user_id, casual) values (p_user, true)
      on conflict (user_id) do update set casual = true;
    end if;
  end if;
  return case when v is null then 'cleared' else 'ok' end;
end $f$;

create or replace function public.wall_set_show(p_show boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  -- 049: the Crypt form's "Show me in the Crypt" box is picked by somebody at the door too, before the desk looks
  if not public.is_wall_member()
     and not exists (select 1 from public.wall_people w where w.user_id = auth.uid() and w.door = 'wait' and not w.banned) then
    return false;
  end if;
  insert into public.wall_people (user_id, show_name) values (auth.uid(), coalesce(p_show, true))
    on conflict (user_id) do update set show_name = excluded.show_name;
  return true;
end $f$;

-- who may call what
revoke all on function public.wall_door_looks() from public, anon, authenticated;
revoke all on function public.door_let_in(uuid) from public, anon, authenticated;
revoke all on function public.desk_door_mode(text) from public, anon;
revoke all on function public.desk_door(uuid, boolean) from public, anon;
revoke all on function public.desk_door_waiting() from public, anon;
grant execute on function public.desk_door_mode(text) to authenticated;
grant execute on function public.desk_door(uuid, boolean) to authenticated;
grant execute on function public.desk_door_waiting() to authenticated;

commit;

-- S6 · verify: every column should say true ------------------
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'wall_people'
     and column_name in ('door', 'door_at')) = 2                                                as the_door_is_on_wall_people,
  (select relrowsecurity from pg_class where oid = 'public.wall_door'::regclass)                as door_mode_locked,
  not has_table_privilege('anon', 'public.wall_door', 'select')
    and not has_table_privilege('authenticated', 'public.wall_door', 'select')                  as nobody_reads_the_mode_row,
  public.desk_door_mode() = 'look'                                                              as the_door_looks_first,
  not has_function_privilege('anon', 'public.desk_door(uuid, boolean)', 'execute')              as strangers_cannot_open_it,
  has_function_privilege('authenticated', 'public.desk_door(uuid, boolean)', 'execute')         as the_desk_can,
  not has_function_privilege('authenticated', 'public.door_let_in(uuid)', 'execute')            as nobody_lets_themselves_in,
  not has_function_privilege('authenticated', 'public.wall_door_looks()', 'execute')            as the_mode_check_stays_inside,
  has_function_privilege('authenticated', 'public.desk_door_waiting()', 'execute')
    and not has_function_privilege('anon', 'public.desk_door_waiting()', 'execute')             as the_badge_can_count_the_door,
  public.desk_door_waiting() = 0                                                                as only_the_desk_gets_a_count,
  has_function_privilege('authenticated', 'public.wall_join(text)', 'execute')                  as the_door_still_answers;
