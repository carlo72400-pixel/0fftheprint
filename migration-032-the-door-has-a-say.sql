-- ============================================================================
-- 0FF THE PRINT, migration 032: THE DOOR HAS A SAY.
--
-- His asks (10/3): "if there's somebody I don't like, we can deny them" (he picked
-- a Ban button), "if somebody wants to be a card holder, I can deny them", "if
-- somebody wants to move up to a card holder, I can do that", and members "can
-- suggest a different source of flyers ... track that suggestion ... it just
-- depends if I approve it or not".
--
-- 1. BAN. wall_people.banned. A banned person is not a Wall member, even a card
--    holder (their card and the rest of the site are untouched), and the member
--    code stops working for them. The desk can never be banned. Unban puts them
--    back exactly as they were.
-- 2. CARD REQUESTS. A casual member taps "Ask for a card"; the desk says yes
--    (they become a card holder: approved, plus a card slug off their name) or
--    no (the site's own "no" from migration-023, so /desk/ and /board/ agree).
--    The desk can also promote anyone straight up without being asked.
-- 3. FLYER SOURCES. Members suggest an IG account or a link; it waits for the
--    desk. Approved ones go into the weekly sweep, which records how many flyers
--    each one turned up, and members see where their suggestion stands.
-- 4. THE /desk/ QUEUE. Everyone who joins The Wall makes a profile, and until now
--    they all sat in "Waiting on you" looking like card applicants (Approve there
--    made them card holders). desk_profiles() now says who is a Wall member and
--    who actually asked for a card; desk.js only queues real applicants.
--
-- Safe to run again.
-- ============================================================================


-- SECTION 1. Ban + card-request columns ----------------------------------------
alter table public.wall_people
  add column if not exists banned      boolean not null default false,
  add column if not exists banned_at   timestamptz,
  add column if not exists card_ask    text,
  add column if not exists card_ask_at timestamptz,
  add column if not exists card_note   text;
alter table public.wall_people
  drop constraint if exists wall_people_card_ask_ok,
  add  constraint wall_people_card_ask_ok check (card_ask is null or card_ask in ('asked', 'denied')),
  drop constraint if exists wall_people_card_note_ok,
  add  constraint wall_people_card_note_ok check (card_note is null or char_length(card_note) <= 280);

-- the member test, now with the ban (the desk is always in)
create or replace function public.is_wall_member()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(public.is_admin(), false)
      or ((coalesce(public.is_approved(), false)
           or exists (select 1 from public.wall_people w where w.user_id = auth.uid() and w.casual))
          and not exists (select 1 from public.wall_people w where w.user_id = auth.uid() and w.banned));
$fn$;
revoke execute on function public.is_wall_member() from public, anon;
grant  execute on function public.is_wall_member() to authenticated;

create or replace function public.wall_member(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.profiles x left join public.wall_people w on w.user_id = x.id
                  where x.id = p
                    and (x.is_admin or ((x.approved or coalesce(w.casual, false)) and not coalesce(w.banned, false))));
$fn$;
revoke execute on function public.wall_member(uuid) from public, anon, authenticated;

-- the code no longer opens the door for a banned account
create or replace function public.wall_redeem(p_code text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  if exists (select 1 from public.wall_people w where w.user_id = uid and w.banned) then
    raise exception 'This account can''t join The Wall.' using errcode = '42501';
  end if;
  if public.is_wall_member() then return true; end if;
  if (select count(*) from public.wall_code_tries t
       where t.user_id = uid and t.at > now() - interval '1 hour') >= 10 then
    return false;
  end if;
  insert into public.wall_code_tries (user_id) values (uid);
  if public.wall_norm(p_code) <> '' and exists (
       select 1 from public.wall_codes c
        where c.active and public.wall_norm(c.code) = public.wall_norm(p_code)) then
    insert into public.wall_people (user_id, casual) values (uid, true)
      on conflict (user_id) do update set casual = true;
    return true;
  end if;
  return false;
end $fn$;
revoke execute on function public.wall_redeem(text) from public, anon;
grant  execute on function public.wall_redeem(text) to authenticated;

-- wall_me gains the ban and the card request (new columns, so drop + create)
drop function if exists public.wall_me();
create function public.wall_me()
returns table (member boolean, casual boolean, admin boolean, show_name boolean, name text, ig text,
               holder boolean, card_ask text, card_denied boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.is_wall_member(), coalesce(w.casual, false), coalesce(p.is_admin, false),
         coalesce(w.show_name, true), p.display_name, p.instagram,
         coalesce(p.approved, false), w.card_ask, coalesce(p.denied, false)
    from public.profiles p left join public.wall_people w on w.user_id = p.id
   where p.id = auth.uid();
$fn$;
revoke execute on function public.wall_me() from public, anon;
grant  execute on function public.wall_me() to authenticated;


-- SECTION 2. Ban, card requests, promote (the desk) -------------------------------
create or replace function public.wall_ban(p_user uuid, p_ban boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles x where x.id = p_user and x.is_admin) then
    raise exception 'The desk can''t be banned.' using errcode = '22023';
  end if;
  insert into public.wall_people (user_id, casual, banned, banned_at)
  values (p_user, false, coalesce(p_ban, true), case when coalesce(p_ban, true) then now() end)
  on conflict (user_id) do update set banned = excluded.banned, banned_at = excluded.banned_at;
  return true;
end $fn$;
revoke execute on function public.wall_ban(uuid, boolean) from public, anon;
grant  execute on function public.wall_ban(uuid, boolean) to authenticated;

-- a casual member asks for a card (one open ask at a time; a "no" stands)
create or replace function public.wall_card_ask(p_note text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); w public.wall_people;
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if coalesce(public.is_approved(), false) or coalesce(public.is_admin(), false) then return 'holder'; end if;
  if exists (select 1 from public.profiles x where x.id = me and x.denied) then return 'denied'; end if;
  select * into w from public.wall_people where user_id = me;
  if w.card_ask = 'asked' then return 'asked'; end if;
  insert into public.wall_people (user_id, card_ask, card_ask_at, card_note)
  values (me, 'asked', now(), left(public.wall_text(p_note), 280))
  on conflict (user_id) do update set card_ask = 'asked', card_ask_at = now(), card_note = excluded.card_note;
  return 'asked';
end $fn$;
revoke execute on function public.wall_card_ask(text) from public, anon;
grant  execute on function public.wall_card_ask(text) to authenticated;

-- yes makes them a card holder (with a card off their name if they have none); no is the site's "no"
create or replace function public.wall_card_decide(p_user uuid, p_yes boolean)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare nm text; cur text; base text; cand text; i int := 1;
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles x where x.id = p_user) then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if coalesce(p_yes, false) then
    update public.profiles set denied = false where id = p_user and denied;     -- the door trigger clears denied_at
    update public.profiles set approved = true where id = p_user;
    update public.wall_people set card_ask = null, card_ask_at = now() where user_id = p_user;
    select x.display_name, x.card_slug into nm, cur from public.profiles x where x.id = p_user;
    if cur is not null then return cur; end if;
    base := coalesce(public.slugify(nm), 'member');
    loop
      cand := case when i = 1 then base else base || '-' || i end;
      begin
        return public.admin_set_card(p_user, cand);
      exception when sqlstate '55000' then
        i := i + 1;
        if i > 30 then return null; end if;
      end;
    end loop;
  else
    update public.profiles set denied = true where id = p_user and not approved;  -- trigger stamps denied_at
    insert into public.wall_people (user_id, card_ask, card_ask_at) values (p_user, 'denied', now())
    on conflict (user_id) do update set card_ask = 'denied', card_ask_at = now();
    return 'denied';
  end if;
end $fn$;
revoke execute on function public.wall_card_decide(uuid, boolean) from public, anon;
grant  execute on function public.wall_card_decide(uuid, boolean) to authenticated;

-- everyone the desk might act on: card holders, Wall members, the banned, the askers
create or replace function public.wall_desk_people()
returns table (user_id uuid, name text, ig text, kind text, banned boolean, card_ask text, card_note text,
               card_ask_at timestamptz, joined timestamptz, sid text, denied boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select x.id, coalesce(nullif(btrim(x.display_name), ''), 'Member'), x.instagram,
         case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
         coalesce(w.banned, false), w.card_ask, w.card_note, w.card_ask_at,
         coalesce(w.joined_at, x.created_at), public.wall_sid(x.id), coalesce(x.denied, false)
    from public.profiles x left join public.wall_people w on w.user_id = x.id
   where public.is_admin()
     and (x.approved or x.is_admin or coalesce(w.casual, false) or coalesce(w.banned, false) or w.card_ask is not null)
   order by (w.card_ask = 'asked') desc nulls last, coalesce(w.banned, false), x.is_admin desc,
            coalesce(w.joined_at, x.created_at) desc
   limit 500;
$fn$;
revoke execute on function public.wall_desk_people() from public, anon;
grant  execute on function public.wall_desk_people() to authenticated;


-- SECTION 3. Flyer sources ---------------------------------------------------------
create table if not exists public.wall_sources (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source      text not null check (char_length(source) between 2 and 200),
  kind        text not null check (kind in ('ig', 'link', 'other')),
  note        text check (note is null or char_length(note) <= 280),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  found       integer not null default 0 check (found >= 0),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  swept_at    timestamptz
);
create unique index if not exists wall_sources_one on public.wall_sources (lower(source));
alter table public.wall_sources enable row level security;
revoke all on public.wall_sources from anon, authenticated;

-- suggest one: an @account, an instagram.com link, any other link, or a name
create or replace function public.wall_source_suggest(p_source text, p_note text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); v text := btrim(coalesce(p_source, '')); m text; k text; src text; ex public.wall_sources;
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  m := substring(v from '(?i)instagram\.com/([A-Za-z0-9._]{1,30})');
  if m is not null and lower(m) not in ('p', 'reel', 'reels', 'stories', 'explore', 'tv') then k := 'ig'; src := lower(m);
  elsif v ~ '^@?[A-Za-z0-9._]{2,30}$' then k := 'ig'; src := lower(ltrim(v, '@'));
  elsif v ~* '^https?://[^\s]+$' then k := 'link'; src := left(v, 200);
  else k := 'other'; src := left(public.wall_line(v), 200);
  end if;
  if src is null or char_length(src) < 2 then raise exception 'Put an @account or a link.' using errcode = '22023'; end if;
  select * into ex from public.wall_sources s where lower(s.source) = lower(src);
  if ex.id is not null then return jsonb_build_object('status', ex.status, 'dup', true, 'source', ex.source, 'kind', ex.kind); end if;
  if (select count(*) from public.wall_sources s where s.user_id = me and s.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Slow down, try again tomorrow.' using errcode = '42501';
  end if;
  insert into public.wall_sources (user_id, source, kind, note)
  values (me, src, k, left(public.wall_text(p_note), 280));
  return jsonb_build_object('status', 'pending', 'dup', false, 'source', src, 'kind', k);
end $fn$;
revoke execute on function public.wall_source_suggest(text, text) from public, anon;
grant  execute on function public.wall_source_suggest(text, text) to authenticated;

-- what I suggested and where it stands
create or replace function public.wall_source_mine()
returns table (id bigint, source text, kind text, status text, found integer, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select s.id, s.source, s.kind, s.status, s.found, s.created_at
    from public.wall_sources s
   where s.user_id = auth.uid() and public.is_wall_member()
   order by s.created_at desc
   limit 30;
$fn$;
revoke execute on function public.wall_source_mine() from public, anon;
grant  execute on function public.wall_source_mine() to authenticated;

-- the desk's list (waiting first) and the weekly sweep's list (status = approved)
create or replace function public.wall_source_queue()
returns table (id bigint, source text, kind text, note text, status text, found integer, created_at timestamptz,
               decided_at timestamptz, swept_at timestamptz, by_name text, by_ig text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select s.id, s.source, s.kind, s.note, s.status, s.found, s.created_at, s.decided_at, s.swept_at,
         coalesce(nullif(btrim(x.display_name), ''), 'Member'), x.instagram
    from public.wall_sources s left join public.profiles x on x.id = s.user_id
   where public.is_admin()
   order by (s.status = 'pending') desc, (s.status = 'approved') desc, s.created_at desc
   limit 300;
$fn$;
revoke execute on function public.wall_source_queue() from public, anon;
grant  execute on function public.wall_source_queue() to authenticated;

create or replace function public.wall_source_decide(p_id bigint, p_status text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_status not in ('pending', 'approved', 'denied') then raise exception 'approved, denied or pending' using errcode = '22023'; end if;
  update public.wall_sources set status = p_status, decided_at = case when p_status = 'pending' then null else now() end where id = p_id;
  return found;
end $fn$;
revoke execute on function public.wall_source_decide(bigint, text) from public, anon;
grant  execute on function public.wall_source_decide(bigint, text) to authenticated;

-- the weekly sweep marks what each approved source turned up
create or replace function public.wall_source_swept(p_id bigint, p_found integer)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.wall_sources set found = found + greatest(coalesce(p_found, 0), 0), swept_at = now() where id = p_id;
  return found;
end $fn$;
revoke execute on function public.wall_source_swept(bigint, integer) from public, anon;
grant  execute on function public.wall_source_swept(bigint, integer) to authenticated;

-- one cheap call for the desk's badge
create or replace function public.wall_desk_counts()
returns table (asks integer, sources integer)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select (select count(*)::int from public.wall_people w join public.profiles x on x.id = w.user_id
           where w.card_ask = 'asked' and not w.banned and not x.approved and not x.denied),
         (select count(*)::int from public.wall_sources s where s.status = 'pending')
   where public.is_admin();
$fn$;
revoke execute on function public.wall_desk_counts() from public, anon;
grant  execute on function public.wall_desk_counts() to authenticated;


-- SECTION 4. The /desk/ queue only holds real card applicants ---------------------
-- Two columns appended at the end, so every reader by position keeps working.
drop function if exists public.desk_profiles();
create function public.desk_profiles()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, created_at timestamptz,
               instagram text,
               denied boolean, denied_at timestamptz,
               -- 032, appended
               wall_casual boolean, card_ask text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.created_at, p.instagram,
         p.denied, p.denied_at,
         coalesce(w.casual, false), w.card_ask
    from public.profiles p left join public.wall_people w on w.user_id = p.id
   where public.is_admin()
   order by p.created_at desc;
$fn$;
revoke execute on function public.desk_profiles() from public, anon;
grant  execute on function public.desk_profiles() to authenticated;


-- SECTION 5. Banned people's comments drop off the flyers ------------------------
create or replace function public.wall_thread(p_event text)
returns table (id bigint, body text, created_at timestamptz, name text, ig text, mine boolean, hidden boolean, sid text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select c.id, c.body, c.created_at, p.display_name, p.instagram, c.user_id = auth.uid(), c.hidden,
         case when public.wall_open(c.user_id) then public.wall_sid(c.user_id) end
    from public.wall_comments c join public.profiles p on p.id = c.user_id
   where public.is_wall_member() and c.event_id = p_event
     and (not c.hidden or public.is_admin())
     and (public.wall_member(c.user_id) or public.is_admin())
   order by c.created_at desc
   limit 60;
$fn$;
revoke execute on function public.wall_thread(text) from public, anon;
grant  execute on function public.wall_thread(text) to authenticated;


-- SECTION 6. Check it. One row, every column true.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'wall_people'
      and column_name in ('banned', 'banned_at', 'card_ask', 'card_ask_at', 'card_note')) = 5            as columns_ok,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'wall_sources') = 1 as sources_ok,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
     ('wall_ban', 'wall_card_ask', 'wall_card_decide', 'wall_desk_people', 'wall_source_suggest', 'wall_source_mine',
      'wall_source_queue', 'wall_source_decide', 'wall_source_swept', 'wall_desk_counts')) = 10                 as functions_ok,
  not has_function_privilege('anon', 'public.wall_ban(uuid, boolean)', 'execute')                              as anon_locked,
  not has_table_privilege('authenticated', 'public.wall_sources', 'select')                                    as table_locked,
  (select count(*) from information_schema.routines where routine_schema = 'public' and routine_name = 'desk_profiles') = 1 as desk_ok;
