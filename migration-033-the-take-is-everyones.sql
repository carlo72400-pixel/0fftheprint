-- ============================================================================
-- 0FF THE PRINT, migration 033: THE TAKE IS EVERYONE'S.
--
-- His asks (10/3): "everyone can post on the timeline", and yes to reactions and
-- comments on it for all members.
--
-- 1. POSTING. Until now only approved card holders could post to The Take. Now
--    anyone on The Wall can (casual members who joined with the code), unless
--    the desk banned them. Card holders are untouched: same policies, same
--    photo and video uploads. The existing guards still run for everybody
--    (four posts in ten minutes, twenty a day, a pulled post stays pulled).
-- 2. THE FEED. take_feed() is the public timeline: published posts by card
--    holders, the desk, and casual members who are not banned. It hands back
--    exactly what the timeline prints (name, card, their space, their picture)
--    and never the author's id. The old `feed` view stays for the card pages.
-- 3. PHOTOS for casual members go to their own small bucket (`take`): 4MB,
--    jpg/png/webp only, 12 uploads a day. Card holders keep the `posts` bucket
--    (video, 50MB). Everything downstream (ownership check, takedown queue)
--    reads the object name the same way for both.
--    Also: nobody can sign up wearing a card holder's name any more.
-- 4. REACTIONS and COMMENTS on timeline posts. Counts are public; reacting,
--    reading and writing comments is for members of The Wall. Keyed by 'p<id>'
--    for a real post and 's<hash>' for the two seeded ones in take.json.
-- 5. FIX: wall_source_swept() from 032 errored on its own column name
--    (`found` is also a PL/pgSQL variable). Found by running it on a replica.
--
-- Tested end to end on a local replica of this database before it was written
-- down here. Safe to run again.
-- ============================================================================


-- SECTION 0. The 032 fix --------------------------------------------------------
create or replace function public.wall_source_swept(p_id bigint, p_found integer)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.wall_sources s
     set found = s.found + greatest(coalesce(p_found, 0), 0), swept_at = now()
   where s.id = p_id;
  return found;
end $fn$;
revoke execute on function public.wall_source_swept(bigint, integer) from public, anon;
grant  execute on function public.wall_source_swept(bigint, integer) to authenticated;


-- SECTION 1. Who the timeline belongs to ----------------------------------------
-- A card holder, the desk, or a casual Wall member who is not banned. (A Wall ban
-- on a card holder closes The Wall for them and nothing else; pulling a card
-- holder off the timeline is still admin_retire_member.)
create or replace function public.take_author_ok(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.profiles x left join public.wall_people w on w.user_id = x.id
                  where x.id = p
                    and (x.approved or x.is_admin or (coalesce(w.casual, false) and not coalesce(w.banned, false))));
$fn$;
revoke execute on function public.take_author_ok(uuid) from public, anon;
grant  execute on function public.take_author_ok(uuid) to authenticated;

create or replace function public.take_can_post()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select auth.uid() is not null and public.take_author_ok(auth.uid());
$fn$;
grant execute on function public.take_can_post() to anon, authenticated;

-- Nobody signs up wearing a card holder's name. The profile guard from 002 already
-- refuses a RENAME onto a reserved name or somebody's card; signup had no such check,
-- and with the timeline open a stranger could have posted in public as VAMPPSYCH.
-- Its own trigger, same as the door (023) and the text guard (018): 002's guard is
-- not rewritten. A taken name at signup becomes "Member a1b2c3"; a taken name on a
-- rename reverts, the way the existing guard does it.
create or replace function public.guard_profile_name()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare s text; taken boolean;
begin
  if tg_op = 'UPDATE' then
    if new.display_name is not distinct from old.display_name or public.privileged_caller() then return new; end if;
  elsif new.approved or new.is_admin then
    return new;
  end if;
  s := public.slugify(new.display_name);
  if s is null or s = '' then return new; end if;
  taken := exists (select 1 from public.reserved_slugs r where r.slug = s)
        or exists (select 1 from public.profiles q
                    where q.id <> new.id and (q.approved or q.is_admin)
                      and (public.slugify(q.display_name) = s
                           or (q.card_slug is not null and public.slugify(q.card_slug) = s)));
  if taken then
    if tg_op = 'UPDATE' then new.display_name := old.display_name;
    else new.display_name := 'Member ' || left(md5(new.id::text), 6);
    end if;
  end if;
  return new;
end $fn$;
drop trigger if exists profiles_guard_name on public.profiles;
create trigger profiles_guard_name
  before insert or update of display_name on public.profiles
  for each row execute function public.guard_profile_name();

drop policy if exists "wall members post" on public.posts;
create policy "wall members post" on public.posts
  for insert with check (auth.uid() = author_id and public.take_can_post());

drop policy if exists "wall members edit own posts" on public.posts;
create policy "wall members edit own posts" on public.posts
  for update using (auth.uid() = author_id and public.take_can_post() and published = true)
  with check (auth.uid() = author_id);

drop policy if exists "wall members delete own posts" on public.posts;
create policy "wall members delete own posts" on public.posts
  for delete using (auth.uid() = author_id and public.take_can_post() and published = true);


-- SECTION 2. The public timeline -------------------------------------------------
create or replace function public.take_feed(p_limit integer default 8)
returns table (id bigint, text text, image_url text, image_alt text, pinned boolean,
               created_at timestamptz, edited_at timestamptz,
               display_name text, card_slug text, accent text,
               kind text, sid text, pic text, mine boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.text, p.image_url, p.image_alt, p.pinned, p.created_at, p.edited_at,
         coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
         case when pr.approved or pr.is_admin then pr.card_slug end,
         pr.accent::text,
         case when pr.is_admin then 'desk' when pr.approved then 'card' else 'member' end,
         case when public.wall_open(pr.id) then public.wall_sid(pr.id) end,
         case when pr.approved or pr.is_admin then null else s.pic end,
         coalesce(p.author_id = auth.uid(), false)
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    left join public.wall_spaces s on s.user_id = pr.id
   where p.published = true and public.take_author_ok(pr.id)
   order by p.pinned desc, p.created_at desc
   limit least(greatest(coalesce(p_limit, 8), 1), 60);
$fn$;
grant execute on function public.take_feed(integer) to anon, authenticated;

comment on function public.take_feed(integer) is
  'The public timeline since 033: published posts by card holders, the desk and casual Wall members who are
   not banned. Runs as its owner, so the WHERE is the only gate; never add author_id to what it returns.';

-- the desk's own list has to agree with what visitors can load
drop view if exists public.desk_posts;
create view public.desk_posts
with (security_invoker = on) as
  select p.id, p.author_id, p.text, p.image_url, p.image_alt,
         p.pinned, p.published, p.created_at, p.edited_at,
         p.pulled_at, p.pull_batch, p.was_pinned,
         pr.display_name, pr.card_slug,
         pr.approved as author_approved,
         (p.published and public.take_author_ok(p.author_id)) as publicly_visible
    from public.posts p
    join public.profiles pr on pr.id = p.author_id;
revoke all on public.desk_posts from anon;
grant select on public.desk_posts to authenticated;


-- SECTION 3. Photos for casual members: their own small bucket ---------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('take', 'take', true, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 4194304,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- How many files this caller put in a bucket in the last day. A policy on storage.objects cannot
-- query storage.objects itself (Postgres calls that infinite recursion and refuses every upload),
-- so the count lives in a definer function.
create or replace function public.uploads_today(p_bucket text)
returns integer language sql stable security definer
set search_path = public, storage, pg_temp as $fn$
  select count(*)::int from storage.objects o
   where auth.uid() is not null
     and o.bucket_id = p_bucket
     and (storage.foldername(o.name))[1] = auth.uid()::text
     and o.created_at > now() - interval '1 day';
$fn$;
revoke execute on function public.uploads_today(text) from public, anon;
grant  execute on function public.uploads_today(text) to authenticated;

drop policy if exists "take photos are public" on storage.objects;
create policy "take photos are public" on storage.objects
  for select using (bucket_id = 'take');

-- own folder, one level deep, a real photo extension, and twelve a day
drop policy if exists "members upload take photos" on storage.objects;
create policy "members upload take photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'take'
    and public.take_can_post()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$'
    and public.uploads_today('take') < 12
  );

drop policy if exists "members delete own take photos" on storage.objects;
create policy "members delete own take photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'take'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and not public.post_image_in_use(name));

drop policy if exists "admin deletes any take photo" on storage.objects;
create policy "admin deletes any take photo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'take' and public.is_admin());

-- the same daily ceiling on space pictures (030 had none)
drop policy if exists "wall members upload to their space" on storage.objects;
create policy "wall members upload to their space" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'spaces'
    and public.is_wall_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$'
    and public.uploads_today('spaces') < 30
  );

-- One name for a photo whichever of the two buckets it sits in. Object names are
-- <uid>/<time>-<random>.<ext>, so the same name in both buckets does not happen,
-- and everything that reasons about "this post's photo" keeps working unchanged:
-- the ownership check in the post guards, post_image_in_use(), the takedown queue.
create or replace function public.storage_object_name(p_url text)
returns text language sql immutable
set search_path = public, pg_temp as $fn$
  select case
    when p_url is null then null
    when position('/storage/v1/object/public/posts/' in p_url) > 0 then
      nullif(regexp_replace(split_part(p_url, '/storage/v1/object/public/posts/', 2), '[?#].*$', ''), '')
    when position('/storage/v1/object/public/take/' in p_url) > 0 then
      nullif(regexp_replace(split_part(p_url, '/storage/v1/object/public/take/', 2), '[?#].*$', ''), '')
    else null
  end;
$fn$;

alter table public.posts drop constraint if exists posts_image_url_ours;
alter table public.posts add constraint posts_image_url_ours check (
  image_url is null
  or image_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/%'
  or image_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/take/%'
) not valid;
alter table public.posts validate constraint posts_image_url_ours;


-- SECTION 4. Reactions and comments ------------------------------------------------
create or replace function public.take_key_ok(k text)
returns boolean language sql immutable
set search_path = public, pg_temp as $fn$
  select k is not null and k ~ '^(p[0-9]{1,12}|s[0-9a-f]{16})$';
$fn$;

create table if not exists public.take_reactions (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  post_key    text not null check (public.take_key_ok(post_key)),
  kind        text not null check (kind in ('heart', 'fire', 'skull', 'eye')),
  created_at  timestamptz not null default now(),
  primary key (user_id, post_key, kind)
);
create index if not exists take_reactions_key on public.take_reactions (post_key);
alter table public.take_reactions enable row level security;
revoke all on public.take_reactions from anon, authenticated;

create table if not exists public.take_comments (
  id          bigint generated always as identity primary key,
  post_key    text not null check (public.take_key_ok(post_key)),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 280),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists take_comments_key on public.take_comments (post_key, created_at desc);
alter table public.take_comments enable row level security;
revoke all on public.take_comments from anon, authenticated;

-- a real post has to be up for anyone to react to it; a seed key is taken as given
create or replace function public.take_key_live(k text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.take_key_ok(k)
     and (left(k, 1) = 's'
          or exists (select 1 from public.posts p where p.id = substr(k, 2)::bigint and p.published));
$fn$;
revoke execute on function public.take_key_live(text) from public, anon, authenticated;

-- counts for everyone, plus which ones are yours when you are signed in
create or replace function public.take_tally(p_keys text[])
returns table (post_key text, reactions jsonb, comments integer, mine jsonb)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  with keys as (select distinct k from unnest(p_keys[1:60]) as k where public.take_key_ok(k)),
  r as (select x.post_key, jsonb_object_agg(x.kind, x.n) j
          from (select t.post_key, t.kind, count(*)::int n
                  from public.take_reactions t join keys on keys.k = t.post_key group by 1, 2) x
         group by 1),
  c as (select t.post_key, count(*)::int n
          from public.take_comments t join keys on keys.k = t.post_key
         where not t.hidden and public.wall_member(t.user_id) group by 1),
  m as (select t.post_key, jsonb_agg(t.kind) j
          from public.take_reactions t join keys on keys.k = t.post_key
         where t.user_id = auth.uid() group by 1)
  select keys.k, coalesce(r.j, '{}'::jsonb), coalesce(c.n, 0), coalesce(m.j, '[]'::jsonb)
    from keys
    left join r on r.post_key = keys.k
    left join c on c.post_key = keys.k
    left join m on m.post_key = keys.k
   where r.j is not null or c.n is not null or m.j is not null;
$fn$;
grant execute on function public.take_tally(text[]) to anon, authenticated;

-- react / take it back (members)
create or replace function public.take_react(p_key text, p_kind text, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('heart', 'fire', 'skull', 'eye') then raise exception 'Not a reaction.' using errcode = '22023'; end if;
  if not coalesce(p_on, true) then
    delete from public.take_reactions t where t.user_id = me and t.post_key = p_key and t.kind = p_kind;
    return false;
  end if;
  if not public.take_key_live(p_key) then raise exception 'That post is gone.' using errcode = '22023'; end if;
  if (select count(*) from public.take_reactions t where t.user_id = me) >= 3000 then
    raise exception 'Slow down.' using errcode = '42501';
  end if;
  insert into public.take_reactions (user_id, post_key, kind) values (me, p_key, p_kind)
  on conflict do nothing;
  return true;
end $fn$;
revoke execute on function public.take_react(text, text, boolean) from public, anon;
grant  execute on function public.take_react(text, text, boolean) to authenticated;

-- a post's comments, newest first (members; the desk also sees hidden ones)
create or replace function public.take_thread(p_key text)
returns table (id bigint, body text, created_at timestamptz, name text, sid text, pic text, kind text,
               mine boolean, can_delete boolean, hidden boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select c.id, c.body, c.created_at,
         coalesce(nullif(btrim(x.display_name), ''), 'Member'),
         case when public.wall_open(x.id) then public.wall_sid(x.id) end,
         case when s.user_id is null then x.card_photo else s.pic end,
         case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
         c.user_id = auth.uid(),
         (c.user_id = auth.uid() or public.is_admin()),
         c.hidden
    from public.take_comments c
    join public.profiles x on x.id = c.user_id
    left join public.wall_spaces s on s.user_id = x.id
   where public.is_wall_member() and c.post_key = p_key
     and (not c.hidden or public.is_admin())
     and (public.wall_member(c.user_id) or public.is_admin())
   order by c.created_at desc
   limit 80;
$fn$;
revoke execute on function public.take_thread(text) from public, anon;
grant  execute on function public.take_thread(text) to authenticated;

-- say something: 280 characters, twenty an hour
create or replace function public.take_comment(p_key text, p_body text)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); b text := public.wall_text(p_body); nid bigint;
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if not public.take_key_live(p_key) then raise exception 'That post is gone.' using errcode = '22023'; end if;
  if b is null or char_length(b) > 280 then raise exception 'Say something, 280 characters max.' using errcode = '22023'; end if;
  if (select count(*) from public.take_comments c
       where c.user_id = me and c.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Slow down, try again in a bit.' using errcode = '42501';
  end if;
  insert into public.take_comments (post_key, user_id, body) values (p_key, me, b) returning id into nid;
  return nid;
end $fn$;
revoke execute on function public.take_comment(text, text) from public, anon;
grant  execute on function public.take_comment(text, text) to authenticated;

-- take one down: whoever wrote it, or the desk
create or replace function public.take_uncomment(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is null then return false; end if;
  delete from public.take_comments c
   where c.id = p_id and (c.user_id = auth.uid() or public.is_admin());
  return found;
end $fn$;
revoke execute on function public.take_uncomment(bigint) from public, anon;
grant  execute on function public.take_uncomment(bigint) to authenticated;

-- the desk hides one without deleting it
create or replace function public.take_hide(p_id bigint, p_hidden boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.take_comments c set hidden = coalesce(p_hidden, true) where c.id = p_id;
  return found;
end $fn$;
revoke execute on function public.take_hide(bigint, boolean) from public, anon;
grant  execute on function public.take_hide(bigint, boolean) to authenticated;

-- a deleted post takes its reactions and comments with it
create or replace function public.posts_take_cleanup()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  delete from public.take_reactions t where t.post_key = 'p' || old.id::text;
  delete from public.take_comments  c where c.post_key = 'p' || old.id::text;
  return null;
end $fn$;
drop trigger if exists trg_posts_take_cleanup on public.posts;
create trigger trg_posts_take_cleanup
  after delete on public.posts
  for each row execute function public.posts_take_cleanup();


-- SECTION 5. Check it. One row, every column true.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('take_reactions', 'take_comments')) = 2            as tables_ok,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
     ('take_author_ok', 'take_can_post', 'take_feed', 'take_tally', 'take_react', 'take_thread',
      'take_comment', 'take_uncomment', 'take_hide', 'posts_take_cleanup', 'uploads_today',
      'guard_profile_name')) = 12                                                                       as functions_ok,
  (select count(*) from pg_policy where polrelid = 'public.posts'::regclass
      and polname in ('wall members post', 'wall members edit own posts', 'wall members delete own posts')) = 3 as policies_ok,
  (select public and file_size_limit = 4194304 from storage.buckets where id = 'take')                  as bucket_ok,
  (select convalidated from pg_constraint where conname = 'posts_image_url_ours')                       as constraint_ok,
  public.storage_object_name('https://x.supabase.co/storage/v1/object/public/take/abc/1.jpg?x=1') = 'abc/1.jpg'
    and public.storage_object_name('https://x.supabase.co/storage/v1/object/public/posts/abc/2.mp4') = 'abc/2.mp4' as names_ok,
  not has_function_privilege('anon', 'public.take_react(text, text, boolean)', 'execute')
    and has_function_privilege('anon', 'public.take_feed(integer)', 'execute')                          as grants_ok,
  not has_table_privilege('authenticated', 'public.take_comments', 'select')                            as tables_locked;
