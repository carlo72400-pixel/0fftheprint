-- ============================================================
-- 050 · LOOK AFTER (10/29, his call minutes after 049 went in: "How about we let them in first and then I'll decide
--        later afterwards? Like, we'll do a vet afterwards.")
-- ============================================================
-- 049's door is OPEN since 10/29 (desk_door_mode('open'), run from the SQL editor): a new @ walks in on the spot, as
-- 035 did. This file adds the look AFTER: whoever walks in through the open door is marked fresh until the desk has
-- looked at their Instagram on the board. KEEP takes the mark off. REMOVE is the board's own Close (desk_close), so
-- nothing new there. 049's look-first mode still works if the door is ever set back to 'look': then the desk's LET IN
-- is the look, and nobody it lets in is fresh.
--   S1. wall_people.fresh_at: when they walked in unchecked (null = nothing to check).
--   S2. wall_join (049's, one line added): walking in through the open door marks them fresh.
--   S3. desk_door (049's, two changes): true on somebody fresh = KEEP (the mark comes off, logged 'door_keep'); true on
--       somebody at the door still lets them in, and they are not fresh (the desk just looked). false on somebody
--       already in still kicks nobody (REMOVE is Close).
--   S4. desk_fresh(): the fresh members, oldest first (id, at), the desk only (anybody else: no rows).
--       desk_door_waiting() now counts them too: the badge is "at the door" plus "to check".
--   S5. The verify row (every column should say true).
-- ⛔ Paste after 049, in one go. One transaction. Nothing is dropped, no row is deleted. Safe to run twice.
-- ⛔ If the editor asks to confirm a "destructive" query, it is the revoke line (it keeps strangers off desk_fresh).
-- ============================================================

begin;

-- S1 ---------------------------------------------------------
alter table public.wall_people add column if not exists fresh_at timestamptz;
create index if not exists wall_people_fresh on public.wall_people (fresh_at) where fresh_at is not null;

-- S2 ---------------------------------------------------------
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
  -- 050: and the desk looks after. Fresh until KEEP (or the board's Close).
  update public.wall_people set fresh_at = now() where user_id = uid and fresh_at is null;
  return 'in';
end $f$;

-- S3 ---------------------------------------------------------
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
  if coalesce(v_w.casual, false) then
    -- 050: KEEP. Somebody who walked in through the open door, looked at: the mark comes off.
    if p_in and v_w.fresh_at is not null then
      update public.wall_people set fresh_at = null where user_id = p_user;
      perform public.acct_log(p_user, 'door_keep', jsonb_build_object('ig', v_x.instagram));
    end if;
    return 'in';                               -- in already (the board is often open in two tabs); false kicks nobody
  end if;
  if v_w.door is null then raise exception 'They are not at the door.' using errcode = '22023'; end if;
  if p_in then
    perform public.door_let_in(p_user);
    update public.wall_people set fresh_at = null where user_id = p_user;   -- 050: the desk just looked
    perform public.acct_log(p_user, 'door_in', jsonb_build_object('ig', v_x.instagram, 'was', v_w.door));
    return 'in';
  end if;
  if v_w.door = 'no' then return 'no'; end if;
  update public.wall_people set door = 'no', door_at = now() where user_id = p_user;
  perform public.acct_log(p_user, 'door_no', jsonb_build_object('ig', v_x.instagram));
  return 'no';
end $f$;

-- S4 ---------------------------------------------------------
-- the fresh members, oldest first: the same people desk_door_waiting counts as "to check"
create or replace function public.desk_fresh()
returns table(id uuid, at timestamptz) language sql stable security definer set search_path = public, pg_temp as $f$
  select w.user_id, w.fresh_at
    from public.wall_people w join public.profiles x on x.id = w.user_id
   where public.is_admin() and w.fresh_at is not null and w.casual
     and not x.approved and not x.is_admin and public.acct_ok(x.id)
   order by w.fresh_at, w.user_id;
$f$;

-- the badge's door count: at the door (049) plus walked in and not looked at yet (050). 0 for anybody but the desk.
create or replace function public.desk_door_waiting()
returns integer language sql stable security definer set search_path = public, pg_temp as $f$
  select case when coalesce(public.is_admin(), false) then
    (select count(*)::int from public.wall_people w join public.profiles x on x.id = w.user_id
      where not x.approved and not x.is_admin and public.acct_ok(x.id)
        and ((w.door = 'wait' and not w.casual) or (w.casual and w.fresh_at is not null)))
  else 0 end;
$f$;

revoke all on function public.desk_fresh() from public, anon;
grant execute on function public.desk_fresh() to authenticated;

commit;

-- S5 · verify: every column should say true ------------------
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'wall_people'
     and column_name = 'fresh_at') = 1                                                          as fresh_is_on_wall_people,
  has_function_privilege('authenticated', 'public.desk_fresh()', 'execute')
    and not has_function_privilege('anon', 'public.desk_fresh()', 'execute')                    as only_logins_ask_desk_fresh,
  (select count(*) from public.desk_fresh()) = 0                                                as nobody_but_the_desk_gets_rows,
  pg_get_functiondef('public.wall_join(text)'::regprocedure) like '%fresh_at = now()%'          as walking_in_marks_fresh,
  has_function_privilege('authenticated', 'public.desk_door_waiting()', 'execute')
    and not has_function_privilege('anon', 'public.desk_door_waiting()', 'execute')             as the_badge_kept_its_grants;
