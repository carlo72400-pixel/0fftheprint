-- ============================================================================
-- migration-029-the-wall-goes-social.sql
-- THE WALL opens to CASUAL MEMBERS and becomes something people do things on.
-- His calls 2026-10-02: casual members get in with a CODE + an email account
-- ("Code + email"), and members can see GOING COUNTS, vote the VIBE, see WHO'S
-- GOING and leave COMMENTS.
--
-- SHAPE
--   wall_people     casual members + everyone's "show my name" choice. Written
--                   ONLY by the security definer functions below (no policies),
--                   so nobody can make themselves a member by hand. Card holder
--                   rules in profiles are not touched at all.
--   wall_codes      the invite code(s). Desk-only. The first one is made HERE by
--                   the database, so it never sits in this public file.
--   wall_going      who marked which flyer going (rows readable only by their
--                   owner; everyone else sees counts and opted-in names via
--                   wall_tally()).
--   wall_votes      vibe votes, one per vibe per member per flyer.
--   wall_comments   short notes on a flyer, 280 chars, 20 an hour per member,
--                   the desk can hide or delete any.
--   is_wall_member() card holder OR desk OR casual member. The 028 key now opens
--                   for all three.
--
-- Run it in the Supabase SQL editor as ONE paste, AFTER migration-028.
-- ⛔ The editor's "destructive operations" modal fires on the drop/revoke lines:
--    CONFIRM it, or nothing runs. Nothing existing is dropped except the 028
--    wall_keys policy, which is replaced in the same statement block.
-- Safe to run twice.
-- ============================================================================


-- SECTION 1. Casual members and the member test --------------------------------
create table if not exists public.wall_people (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  casual     boolean not null default false,
  show_name  boolean not null default true,
  joined_at  timestamptz not null default now()
);
alter table public.wall_people enable row level security;
revoke all on public.wall_people from anon, authenticated;

create or replace function public.is_wall_member()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(public.is_approved(), false) or coalesce(public.is_admin(), false)
      or exists (select 1 from public.wall_people w where w.user_id = auth.uid() and w.casual);
$fn$;
revoke execute on function public.is_wall_member() from public, anon;
grant  execute on function public.is_wall_member() to authenticated;

drop policy if exists "card holders and the desk read the wall key" on public.wall_keys;
drop policy if exists "wall members read the wall key" on public.wall_keys;
create policy "wall members read the wall key" on public.wall_keys
  for select using (public.is_wall_member());


-- SECTION 2. The invite code ---------------------------------------------------
create table if not exists public.wall_codes (
  id          bigint generated always as identity primary key,
  code        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.wall_codes enable row level security;
revoke all on public.wall_codes from anon, authenticated;

create table if not exists public.wall_code_tries (
  user_id  uuid not null references auth.users(id) on delete cascade,
  at       timestamptz not null default now()
);
alter table public.wall_code_tries enable row level security;
revoke all on public.wall_code_tries from anon, authenticated;
create index if not exists wall_code_tries_user_at on public.wall_code_tries (user_id, at);

-- "wall-7k2q9x", "WALL 7K2Q9X" and "WALL-7K2Q9X" are the same code
create or replace function public.wall_norm(p text)
returns text language sql immutable as $fn$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$fn$;

-- a signed-in person trades the code for casual membership; 10 tries an hour
create or replace function public.wall_redeem(p_code text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
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

-- the desk: today's code and the member counts
create or replace function public.wall_admin()
returns table (code text, card_holders bigint, casual bigint)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select (select c.code from public.wall_codes c where c.active order by c.created_at desc limit 1),
         (select count(*) from public.profiles p where p.approved),
         (select count(*) from public.wall_people w where w.casual)
   where public.is_admin();
$fn$;
revoke execute on function public.wall_admin() from public, anon;
grant  execute on function public.wall_admin() to authenticated;

-- the desk changes the code (old code stops working, members who joined stay in)
create or replace function public.wall_set_code(p_code text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare clean text := upper(btrim(coalesce(p_code, '')));
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if length(public.wall_norm(clean)) < 6 then
    raise exception 'Make the code at least 6 letters or numbers.' using errcode = '22023';
  end if;
  update public.wall_codes set active = false where active;
  insert into public.wall_codes (code) values (left(clean, 40));
  return left(clean, 40);
end $fn$;
revoke execute on function public.wall_set_code(text) from public, anon;
grant  execute on function public.wall_set_code(text) to authenticated;

-- the desk lists and removes casual members
create or replace function public.wall_casual_list()
returns table (user_id uuid, name text, ig text, joined_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select w.user_id, p.display_name, p.instagram, w.joined_at
    from public.wall_people w join public.profiles p on p.id = w.user_id
   where w.casual and public.is_admin()
   order by w.joined_at desc;
$fn$;
revoke execute on function public.wall_casual_list() from public, anon;
grant  execute on function public.wall_casual_list() to authenticated;

create or replace function public.wall_remove(p_user uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.wall_people set casual = false where user_id = p_user;
  return found;
end $fn$;
revoke execute on function public.wall_remove(uuid) from public, anon;
grant  execute on function public.wall_remove(uuid) to authenticated;

-- the first code, made by the database (never typed, never in this file)
insert into public.wall_codes (code)
select 'WALL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
 where not exists (select 1 from public.wall_codes);


-- SECTION 3. Going, vibe votes, comments ----------------------------------------
create table if not exists public.wall_going (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id    text not null check (event_id ~ '^f[0-9a-f]{9}$'),
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table public.wall_going enable row level security;
drop policy if exists "members see their own going" on public.wall_going;
create policy "members see their own going" on public.wall_going for select using (user_id = auth.uid());
drop policy if exists "members mark going" on public.wall_going;
create policy "members mark going" on public.wall_going for insert
  with check (user_id = auth.uid() and public.is_wall_member());
drop policy if exists "members unmark going" on public.wall_going;
create policy "members unmark going" on public.wall_going for delete using (user_id = auth.uid());
revoke all on public.wall_going from anon;
grant select, insert, delete on public.wall_going to authenticated;

create table if not exists public.wall_votes (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id    text not null check (event_id ~ '^f[0-9a-f]{9}$'),
  vibe        text not null check (vibe in ('lit','chill','dead','goth','spooky','heavy','dance','rave','diy','drag',
                                            'queer','market','fights','anime','rap','art','comedy','live')),
  created_at  timestamptz not null default now(),
  primary key (user_id, event_id, vibe)
);
alter table public.wall_votes enable row level security;
drop policy if exists "members see their own votes" on public.wall_votes;
create policy "members see their own votes" on public.wall_votes for select using (user_id = auth.uid());
drop policy if exists "members vote" on public.wall_votes;
create policy "members vote" on public.wall_votes for insert
  with check (user_id = auth.uid() and public.is_wall_member());
drop policy if exists "members take a vote back" on public.wall_votes;
create policy "members take a vote back" on public.wall_votes for delete using (user_id = auth.uid());
revoke all on public.wall_votes from anon;
grant select, insert, delete on public.wall_votes to authenticated;

create table if not exists public.wall_comments (
  id          bigint generated always as identity primary key,
  event_id    text not null check (event_id ~ '^f[0-9a-f]{9}$'),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 280),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists wall_comments_event on public.wall_comments (event_id, created_at desc);
alter table public.wall_comments enable row level security;
drop policy if exists "members comment" on public.wall_comments;
create policy "members comment" on public.wall_comments for insert
  with check (user_id = auth.uid() and public.is_wall_member() and hidden = false);
drop policy if exists "own or desk deletes" on public.wall_comments;
create policy "own or desk deletes" on public.wall_comments for delete
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "the desk hides" on public.wall_comments;
create policy "the desk hides" on public.wall_comments for update
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.wall_comments from anon;
grant insert, delete, update on public.wall_comments to authenticated;   -- reads go through wall_thread()

create or replace function public.wall_comment_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if (select count(*) from public.wall_comments c
       where c.user_id = new.user_id and c.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Slow down, try again in a bit.' using errcode = '42501';
  end if;
  new.body := left(btrim(regexp_replace(new.body, '[[:cntrl:]]', ' ', 'g')), 280);
  return new;
end $fn$;
drop trigger if exists wall_comment_guard on public.wall_comments;
create trigger wall_comment_guard before insert on public.wall_comments
  for each row execute function public.wall_comment_guard();


-- SECTION 4. Reading it back (members only) -------------------------------------
create or replace function public.wall_me()
returns table (member boolean, casual boolean, admin boolean, show_name boolean, name text, ig text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.is_wall_member(), coalesce(w.casual, false), coalesce(p.is_admin, false),
         coalesce(w.show_name, true), p.display_name, p.instagram
    from public.profiles p left join public.wall_people w on w.user_id = p.id
   where p.id = auth.uid();
$fn$;
revoke execute on function public.wall_me() from public, anon;
grant  execute on function public.wall_me() to authenticated;

create or replace function public.wall_set_show(p_show boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_wall_member() then return false; end if;
  insert into public.wall_people (user_id, show_name) values (auth.uid(), coalesce(p_show, true))
    on conflict (user_id) do update set show_name = excluded.show_name;
  return true;
end $fn$;
revoke execute on function public.wall_set_show(boolean) from public, anon;
grant  execute on function public.wall_set_show(boolean) to authenticated;

-- counts, vibe votes, comment counts and up to 30 opted-in names per flyer
create or replace function public.wall_tally(p_ids text[])
returns table (event_id text, going integer, votes jsonb, comments integer, who jsonb)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  with ids as (select distinct unnest(p_ids) as id),
  g as (select g.event_id, count(*)::int n
          from public.wall_going g join ids on ids.id = g.event_id group by 1),
  v as (select x.event_id, jsonb_object_agg(x.vibe, x.n) j
          from (select v.event_id, v.vibe, count(*)::int n
                  from public.wall_votes v join ids on ids.id = v.event_id group by 1, 2) x
         group by 1),
  c as (select c.event_id, count(*)::int n
          from public.wall_comments c join ids on ids.id = c.event_id
         where not c.hidden group by 1),
  w as (select x.event_id, jsonb_agg(jsonb_build_object('n', x.display_name, 'ig', x.instagram) order by x.created_at) j
          from (select g.event_id, p.display_name, p.instagram, g.created_at,
                       row_number() over (partition by g.event_id order by g.created_at) rn
                  from public.wall_going g join ids on ids.id = g.event_id
                  join public.profiles p on p.id = g.user_id
                  left join public.wall_people wp on wp.user_id = g.user_id
                 where coalesce(wp.show_name, true)) x
         where x.rn <= 30 group by 1)
  select ids.id, coalesce(g.n, 0), coalesce(v.j, '{}'::jsonb), coalesce(c.n, 0), coalesce(w.j, '[]'::jsonb)
    from ids
    left join g on g.event_id = ids.id
    left join v on v.event_id = ids.id
    left join c on c.event_id = ids.id
    left join w on w.event_id = ids.id
   where public.is_wall_member()
     and (g.n is not null or v.j is not null or c.n is not null);
$fn$;
revoke execute on function public.wall_tally(text[]) from public, anon;
grant  execute on function public.wall_tally(text[]) to authenticated;

-- a flyer's comments, newest first (the desk also sees hidden ones)
create or replace function public.wall_thread(p_event text)
returns table (id bigint, body text, created_at timestamptz, name text, ig text, mine boolean, hidden boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select c.id, c.body, c.created_at, p.display_name, p.instagram, c.user_id = auth.uid(), c.hidden
    from public.wall_comments c join public.profiles p on p.id = c.user_id
   where public.is_wall_member() and c.event_id = p_event
     and (not c.hidden or public.is_admin())
   order by c.created_at desc
   limit 60;
$fn$;
revoke execute on function public.wall_thread(text) from public, anon;
grant  execute on function public.wall_thread(text) to authenticated;


-- SECTION 5. Check it (one row: true, and the code exists)
select public.wall_norm('wall-7k2q9x') = 'WALL7K2Q9X' as norm_ok,
       (select count(*) from public.wall_codes where active) as active_codes;
