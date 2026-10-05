-- ============================================================================
-- migration-035: the door is an Instagram.
--
-- His call, 10/4: "instead of a code lets do they can only make an account if they
-- have an instagram. and 1 account per instagram". Asked how a handle gets proven,
-- he picked "trust the handle": nobody checks it is theirs, they are in at once,
-- and they can do everything a member can.
--
-- What changes
--   profiles.instagram   ONE ACCOUNT PER HANDLE, for everybody: a unique index on
--                        lower(instagram). Accounts that already share a handle are
--                        settled first (the desk, then a card holder, then a member,
--                        then the oldest account keeps it) and every handle taken off
--                        an account is written down in wall_ig_settled.
--   handle_new_user()    a signup naming a handle somebody has still makes the login,
--                        with no handle on it. ⛔ Signup itself never fails in here:
--                        the door (wall_join) is what says no, in words.
--   wall_join(p_ig)      NEW, the way in. Signed in + a handle nobody else has = on
--                        The Wall, at once. A login with no handle opens nothing.
--                        Answers in / need / taken / slow.
--   wall_redeem(p_code)  the member code is retired. The name stays, so a phone still
--                        holding last week's page gets an answer: it is wall_join with
--                        no handle typed (in if the account already carries one).
--   wall_set_code()      refuses. wall_codes stays where it is, unused.
--   wall_ig_release()    NEW, the desk's. Takes a handle off a member who typed one that
--                        is not theirs, so the real owner can use it. Written down, and
--                        that account is off The Wall until it brings its own.
--   a handle is LOCKED   once it is on an account, its owner cannot change or clear
--                        it. The desk still can.
--
-- NOT changed: is_wall_member(), the wall key, bans, card asks, the name guard.
-- Members who came in with the code and never gave a handle stay members; the check
-- row at the bottom counts them.
--
-- ⛔ WHAT THIS DOES NOT DO. Nothing proves the handle is theirs (his call). Somebody
--    can type anybody's handle that is not on an account yet, and a banned person can
--    come back under a different one. It does stop two accounts on one handle, and it
--    keeps a banned account's handle off the table for good.
--
-- Run it in the Supabase SQL editor as ONE paste, after 034. It takes nothing away: no
-- table, function or row is removed. The editor may still ask you to confirm (it has
-- done that for revoke lines before); confirm it.
-- Safe to run twice. The last statement prints the check row.
-- ============================================================================


-- SECTION 1. One account per handle ------------------------------------------------
-- What somebody types, as the handle it means: "@Ana.Reyes", "ana.reyes" and
-- "https://www.instagram.com/ana.reyes/?hl=en" are one handle. Null when it is not one.
create or replace function public.wall_ig_norm(p text)
returns text language sql immutable
set search_path = pg_temp as $fn$
  select case when x ~ '^[a-z0-9._]{1,30}$' then x end
    from (select regexp_replace(
                   regexp_replace(
                     regexp_replace(lower(btrim(coalesce(p, ''))), '^(https?://)?(www\.)?instagram\.com/', ''),
                     '[/?#].*$', ''),
                   '^@+', '') as x) s;
$fn$;
revoke execute on function public.wall_ig_norm(text) from public, anon, authenticated;

-- every handle this migration takes off an account, so nothing is lost quietly
create table if not exists public.wall_ig_settled (
  user_id    uuid not null,
  instagram  text not null,
  kept_by    uuid,
  at         timestamptz not null default now()
);
alter table public.wall_ig_settled enable row level security;
revoke all on public.wall_ig_settled from anon, authenticated;

-- two accounts on one handle: one keeps it, the rest are written down and cleared.
-- ⛔ BEFORE the lowercase pass below, not after. Touching a card holder's handle wakes
--    034's claim trigger, which takes that handle off everybody else on the spot, and
--    then this step finds nothing left to write down. The replica caught that.
with ranked as (
  select p.id, p.instagram,
         first_value(p.id) over w as keeper,
         row_number()      over w as rn
    from public.profiles p
   where p.instagram is not null
  window w as (partition by lower(p.instagram)
               order by p.is_admin desc, p.approved desc,
                        (exists (select 1 from public.wall_people m where m.user_id = p.id and not m.banned)) desc,
                        p.created_at asc, p.id asc)),
losers as (
  insert into public.wall_ig_settled (user_id, instagram, kept_by)
  select r.id, r.instagram, r.keeper from ranked r where r.rn > 1
  returning user_id)
update public.profiles p set instagram = null
  from losers l where l.user_id = p.id;

-- Instagram does not care about case, so neither does the column
update public.profiles set instagram = lower(instagram)
 where instagram is not null and instagram <> lower(instagram);

create unique index if not exists profiles_instagram_one
  on public.profiles (lower(instagram)) where instagram is not null;


-- SECTION 2. Signup -------------------------------------------------------------
-- 013's function, carried forward, with one new rule: a handle somebody already has
-- does not come along. The login is still made. ⛔ Nothing in here may be the reason
-- a signup fails: a taken handle, a race for the same one, anything, all land as
-- "no handle on this account", and wall_join says the rest.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  want_name text;
  want_ig   text;
begin
  want_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  want_name := coalesce(want_name, split_part(new.email, '@', 1), 'NEW MEMBER');
  want_name := left(regexp_replace(want_name, '[[:cntrl:]]', '', 'g'), 40);
  if btrim(want_name) = '' then want_name := 'NEW MEMBER'; end if;

  want_ig := lower(btrim(new.raw_user_meta_data ->> 'instagram'));
  want_ig := regexp_replace(coalesce(want_ig, ''), '^@', '');
  want_ig := left(regexp_replace(want_ig, '[^a-z0-9._]', '', 'g'), 30);
  if want_ig = '' then want_ig := null; end if;
  if want_ig is not null and exists (select 1 from public.profiles q where lower(q.instagram) = want_ig) then
    want_ig := null;
  end if;

  begin
    insert into public.profiles (id, display_name, card_slug, requested_slug, approved, is_admin, instagram)
    values (
      new.id,
      btrim(want_name),
      null,
      public.slugify(nullif(btrim(new.raw_user_meta_data ->> 'card_slug'), '')),
      false,
      false,
      want_ig
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    -- two signups reached for one handle in the same moment: this one goes without
    insert into public.profiles (id, display_name, card_slug, requested_slug, approved, is_admin, instagram)
    values (new.id, btrim(want_name), null,
            public.slugify(nullif(btrim(new.raw_user_meta_data ->> 'card_slug'), '')),
            false, false, null)
    on conflict (id) do nothing;
  end;
  return new;
end;
$fn$;


-- SECTION 3. A handle stays put ---------------------------------------------------
-- Once an account carries a handle, its owner cannot swap it or clear it (reverts,
-- does not error, like every other guard on this table). An account with none may
-- take one. The desk and the SQL editor pass.
create or replace function public.guard_profile_handle()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if public.privileged_caller() then return new; end if;
  if old.instagram is not null and new.instagram is distinct from old.instagram then
    new.instagram := old.instagram;
  elsif new.instagram is not null then
    new.instagram := lower(new.instagram);
  end if;
  return new;
end $fn$;
revoke execute on function public.guard_profile_handle() from public, anon, authenticated;
-- named to run before profiles_guard_name, which then checks the handle it is left with
create or replace trigger profiles_guard_handle
  before update of instagram on public.profiles
  for each row execute function public.guard_profile_handle();


-- SECTION 4. The door -------------------------------------------------------------
-- Signed in, and a handle nobody else has: on The Wall. It answers with one word and
-- the page says the sentence:
--   in     on The Wall (or already was)
--   need   this account has no handle and none (or not a real one) was typed
--   taken  another account, a card holder or the house has that handle
--   slow   ten tries this hour
-- ⛔ A WORD, NOT AN ERROR. A raised error rolls the whole call back, the try it just
--    counted included, and then nothing stops somebody fishing handles all night.
-- A banned account still gets the 42501 it always did.
create or replace function public.wall_join(p_ig text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  uid  uuid := auth.uid();
  have text;
  want text := public.wall_ig_norm(p_ig);
  isin boolean;
begin
  if uid is null then return 'need'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wall_redeem:' || uid::text, 0));
  if exists (select 1 from public.wall_people w where w.user_id = uid and w.banned) then
    raise exception 'This account can''t join The Wall.' using errcode = '42501';
  end if;
  select p.instagram into have from public.profiles p where p.id = uid;
  if not found then return 'need'; end if;
  isin := public.is_wall_member();
  -- already in, and nothing to add: a card holder, or a member from before this rule
  if isin and (have is not null or want is null) then return 'in'; end if;
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

  insert into public.wall_people (user_id, casual) values (uid, true)
    on conflict (user_id) do update set casual = true;
  -- 034 (b), unchanged: somebody who signed up on /join/ asked for a card and stays an open
  -- ask; The Wall's own form says via = wall, and those people asked for nothing
  if exists (select 1 from public.profiles x where x.id = uid and not x.approved and not x.is_admin and not coalesce(x.denied, false))
     and coalesce((select u.raw_user_meta_data ->> 'via' from auth.users u where u.id = uid), '') <> 'wall' then
    update public.wall_people set card_ask = 'asked', card_ask_at = now()
     where user_id = uid and card_ask is null;
  end if;
  return 'in';
end $fn$;
revoke execute on function public.wall_join(text) from public, anon;
grant  execute on function public.wall_join(text) to authenticated;

-- The desk takes a handle off a member's account: somebody typed an @ that is not theirs
-- and the real one showed up. The handle is free again, it is written down, and the
-- account is off The Wall until it brings its own (not a ban: wall_join lets it back in).
create or replace function public.wall_ig_release(p_user uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare was text;
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = p_user and (p.approved or p.is_admin)) then
    raise exception 'That is a card holder''s handle. Change it on their profile instead.' using errcode = 'P0001';
  end if;
  select p.instagram into was from public.profiles p where p.id = p_user;
  if was is null then return null; end if;
  insert into public.wall_ig_settled (user_id, instagram, kept_by) values (p_user, was, null);
  update public.profiles set instagram = null where id = p_user;
  update public.wall_people set casual = false where user_id = p_user and casual;
  return was;
end $fn$;
revoke execute on function public.wall_ig_release(uuid) from public, anon;
grant  execute on function public.wall_ig_release(uuid) to authenticated;

-- The code is retired. A page from before today still calls this: it gets a yes if
-- the account already carries a handle and a plain no if it does not.
create or replace function public.wall_redeem(p_code text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  return public.wall_join(null) = 'in';
end $fn$;
revoke execute on function public.wall_redeem(text) from public, anon;
grant  execute on function public.wall_redeem(text) to authenticated;

-- The desk's Change the code button on a page from before today lands here.
create or replace function public.wall_set_code(p_code text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  raise exception 'The member code is retired. The door is an Instagram now.' using errcode = 'P0001';
end $fn$;


-- SECTION 5. The check row ----------------------------------------------------------
select
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'profiles_instagram_one') = 1          as one_account_per_handle,
  (select count(*) from (select 1 from public.profiles where instagram is not null
                          group by lower(instagram) having count(*) > 1) d) = 0                                        as no_handle_shared,
  has_function_privilege('authenticated', 'public.wall_join(text)', 'execute')
    and not has_function_privilege('anon', 'public.wall_join(text)', 'execute')                                        as door_needs_a_login,
  not has_function_privilege('anon', 'public.wall_redeem(text)', 'execute')                                           as old_door_still_shut_to_strangers,
  (select count(*) from pg_trigger where tgname = 'profiles_guard_handle' and not tgisinternal) = 1                    as handle_is_locked,
  has_function_privilege('authenticated', 'public.wall_ig_release(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.wall_ig_release(uuid)', 'execute')                                 as desk_can_free_a_handle,
  public.wall_ig_norm('https://www.instagram.com/Ana.Reyes/?hl=en') = 'ana.reyes'
    and public.wall_ig_norm('@@x') = 'x' and public.wall_ig_norm('two words') is null                                  as handle_reads_right,
  (select count(*) from public.wall_ig_settled)                                                                        as handles_taken_off_a_second_account,
  (select count(*) from public.wall_people w join public.profiles p on p.id = w.user_id
    where w.casual and not w.banned and p.instagram is null and not p.approved and not p.is_admin)                     as members_with_no_handle;
