-- ============================================================
-- 038 · THEIR ROOMS, AND A PHOTO SAYS ENOUGH (10/11, his asks: "make it so people can create
-- their own rooms" and "we don't need to have text when we post on coven or the timeline")
-- ============================================================
-- ROOMS. The Music tab's rooms were the desk's playlists only (content/music.json). Now a member
-- can put up a room of their own: a Spotify playlist, a name, a label, a line. Pre-moderated like
-- a story: a member's save lands unpublished and the desk flips it; the desk's own rooms publish
-- on save. Five rooms per member. Anyone reads the published rooms; the maker sees their own.
-- POSTS. `text` had to be 1 to 800 letters. A post with a photo may now carry no words at all;
-- a post with no photo still needs them. The guard keeps every other rule (rate, pulls, dupes).
-- Every table has RLS on with no policies and no grants: the functions below are the only door.
-- Safe to run twice. ⛔ One `drop constraint` below, by the name Postgres gave the inline check
-- (looked up, never guessed, see migration 016); it is replaced in the same statement block.
-- ============================================================

create table if not exists public.rooms (
  id         bigserial primary key,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  playlist   text not null check (playlist ~ '^[A-Za-z0-9]{22}$'),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  label      text not null default '' check (char_length(label) <= 40),
  line       text not null default '' check (char_length(line) <= 200),
  published  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, playlist)
);
alter table public.rooms enable row level security;
revoke all on table public.rooms from public, anon, authenticated;

create or replace function public.rooms_list()
returns table (id bigint, playlist text, name text, label text, line text, published boolean, created_at timestamptz,
               author text, kind text, sid text, card_slug text, mine boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select r.id, r.playlist, r.name, r.label, r.line, r.published, r.created_at,
         coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
         case when pr.is_admin then 'desk' when pr.approved then 'card' else 'member' end,
         case when public.wall_open(pr.id) then public.wall_sid(pr.id) end,
         case when pr.approved or pr.is_admin then pr.card_slug end,
         coalesce(r.author_id = auth.uid(), false)
    from public.rooms r join public.profiles pr on pr.id = r.author_id
   where (r.published and public.wall_member(r.author_id)) or r.author_id = auth.uid() or coalesce(public.is_admin(), false)
   order by r.published desc, r.created_at desc
   limit 200;
$fn$;
grant execute on function public.rooms_list() to anon, authenticated;

-- p = {id?, playlist (the 22-character id), name, label?, line?}; returns the id
create or replace function public.room_save(p jsonb)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  uid  uuid := auth.uid();
  adm  boolean := coalesce(public.is_admin(), false);
  rid  bigint := nullif(p->>'id', '')::bigint;
  pl   text := btrim(coalesce(p->>'playlist', ''));
  nm   text := btrim(coalesce(p->>'name', ''));
  lb   text := btrim(coalesce(p->>'label', ''));
  ln   text := btrim(coalesce(p->>'line', ''));
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if not coalesce(public.is_wall_member(), false) then raise exception 'Members make rooms.' using errcode = '42501'; end if;
  if pl !~ '^[A-Za-z0-9]{22}$' then raise exception 'That is not a Spotify playlist link.' using errcode = '22023'; end if;
  if char_length(nm) < 1 or char_length(nm) > 60 then raise exception 'Give the room a name, up to 60 letters.' using errcode = '22023'; end if;
  if char_length(lb) > 40 then raise exception 'Keep the label under 40 letters.' using errcode = '22023'; end if;
  if char_length(ln) > 200 then raise exception 'Keep the line under 200 letters.' using errcode = '22023'; end if;
  if rid is null then
    if (select count(*) from public.rooms x where x.author_id = uid) >= 5 then raise exception 'Five rooms is the ceiling. Take one down first.' using errcode = '22023'; end if;
    if exists (select 1 from public.rooms x where x.author_id = uid and x.playlist = pl) then raise exception 'That playlist is already one of your rooms.' using errcode = '22023'; end if;
    insert into public.rooms (author_id, playlist, name, label, line, published) values (uid, pl, nm, lb, ln, adm) returning id into rid;
  else
    if not exists (select 1 from public.rooms x where x.id = rid and (x.author_id = uid or adm)) then raise exception 'That room is not yours.' using errcode = '42501'; end if;
    update public.rooms x set playlist = pl, name = nm, label = lb, line = ln, published = adm, updated_at = now() where x.id = rid;
  end if;
  return rid;
end
$fn$;
revoke execute on function public.room_save(jsonb) from public, anon;
grant  execute on function public.room_save(jsonb) to authenticated;

create or replace function public.room_publish(p_id bigint, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.rooms set published = coalesce(p_on, false), updated_at = now() where id = p_id;
  if not found then raise exception 'No such room.' using errcode = '22023'; end if;
  return coalesce(p_on, false);
end
$fn$;
revoke execute on function public.room_publish(bigint, boolean) from public, anon;
grant  execute on function public.room_publish(bigint, boolean) to authenticated;

create or replace function public.room_delete(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  delete from public.rooms where id = p_id and (author_id = auth.uid() or coalesce(public.is_admin(), false));
  if not found then raise exception 'That room is not yours.' using errcode = '42501'; end if;
  return true;
end
$fn$;
revoke execute on function public.room_delete(bigint) from public, anon;
grant  execute on function public.room_delete(bigint) to authenticated;

-- ---------- a photo says enough ----------
-- posts.text was `check (char_length(text) between 1 and 800)`, declared inline, so Postgres named it.
-- Find every check on the column, drop it by name, put the new rule in: words, or a photo with no words.
do $do$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.posts'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) ilike '%char_length(text)%'
  loop
    execute format('alter table public.posts drop constraint %I', r.conname);
  end loop;
end
$do$;
alter table public.posts
  add constraint posts_words_or_photo
  check (char_length(text) <= 800 and (char_length(btrim(text)) >= 1 or image_url is not null));

-- ---------- verify: every line should say true ----------
select 'rooms has RLS on'               as test, (select relrowsecurity from pg_class where oid = 'public.rooms'::regclass)::text as ok
union all select 'anon cannot read rooms',     (not has_table_privilege('anon', 'public.rooms', 'select'))::text
union all select 'anon cannot save a room',    (not has_function_privilege('anon', 'public.room_save(jsonb)', 'execute'))::text
union all select 'anyone reads the rooms',     has_function_privilege('anon', 'public.rooms_list()', 'execute')::text
union all select 'posts: words or a photo',    (exists (select 1 from pg_constraint where conname = 'posts_words_or_photo'))::text
union all select 'posts: the old rule is gone', (not exists (select 1 from pg_constraint c where c.conrelid = 'public.posts'::regclass and c.contype = 'c'
                                                   and pg_get_constraintdef(c.oid) ilike '%char_length(text)%' and c.conname <> 'posts_words_or_photo'))::text;
