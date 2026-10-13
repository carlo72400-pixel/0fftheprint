-- ============================================================
-- 045 · THEIR OWN AND THE ROLL (10/11, Wave 2: content. His calls 1, 6, 8, 10, 12, 16 and the members manager's reads)
-- ============================================================
-- What members made is theirs to fix and take down; the Roll goes behind the door; the desk sees everything about a
-- person in one place, and one badge counts what is waiting.
--   S1.  Columns and tables: story edits and house stories, story revisions, comment edits, posts.members_only (no
--        default: a client that sends nothing gets the safe answer), decided marks, his Crypt fixes from the phone,
--        site_overrides learns 'desk'.
--   S2.  Stories: an author edits or removes their own (until it is baked), every edit is kept and marked, the desk's
--        WRITE ONE publishes, house stories with a kicker and a shelf.
--   S3.  Lines, videos and picks: members take down their own, published or not. A video cover that goes is queued.
--   S4.  Comments: fix your own flyer or Take comment any time; delete comments on your own post; take back a card ask
--        or a pending flyer source. A blocked pair cannot comment on each other's posts.
--   S5.  THE ROLL GOES MEMBERS ONLY (call 1). FAIL CLOSED: a member's photo post with no flag lands behind the door.
--   S6.  Crypt fixes from his phone (call 10), folded into the Tuesday build with the week's key. Hearts on a pack that
--        came down leave the binder (call 16).
--   S7.  Decided marks: the badge tells waiting from already said no.
--   S8.  Every desk read door: the members list, one person's whole story, paging, the one badge, the queue.
--   S9.  His four Run nights: blanks filled from the flyer data, no rows added.
--   S10. The verify row, then informational rows.
-- ⛔ Paste right after 044 in the same sitting. One transaction: an error applies nothing from this file.
-- ⛔ A "potentially destructive query" prompt WILL appear (functions, views and policies dropped and re-made). Confirm it.
-- Nothing is deleted. Safe to run twice. The last statement prints the verify row (every column true) and the info rows.
-- ============================================================


-- SECTION 0. Precondition ------------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.desk_card(uuid,boolean,text)') is null then
    raise exception 'Run migration 044 first.';
  end if;
end $$;


-- SECTION 1. Columns and tables -------------------------------------------------------------
-- 1a. stories: edited, the house's own, its kicker and shelf, when the desk last looked
alter table public.member_stories
  add column if not exists edited_at  timestamptz,
  add column if not exists house      boolean not null default false,
  add column if not exists kicker     text,
  add column if not exists shelf      text,
  add column if not exists decided_at timestamptz;
alter table public.member_stories
  drop constraint if exists member_stories_kicker_ok,
  add  constraint member_stories_kicker_ok check (kicker is null or kicker ~ '^[A-Z0-9][A-Z0-9 &''.!?-]{1,23}$'),
  drop constraint if exists member_stories_shelf_ok,
  add  constraint member_stories_shelf_ok check (shelf is null or shelf in ('nights','guides','dates','culture','interviews'));
-- the cover's folder is the trigger's to judge now (the desk may set a cover from his own folder on a member's story);
-- the CHECK keeps the shape
alter table public.member_stories drop constraint if exists member_stories_cover_ours;
alter table public.member_stories
  drop constraint if exists member_stories_cover_shape,
  add  constraint member_stories_cover_shape check (cover_url is null or (
         cover_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/%'
         and cover_url ~* '\.(jpg|jpeg|png|webp)$'
         and cover_url not like '%..%'
         and char_length(cover_url) <= 400));

-- 1b. what a story said before each edit (the desk reads these)
create table if not exists public.member_story_revisions (
  id          bigint generated always as identity primary key,
  story_id    bigint not null references public.member_stories(id) on delete cascade,
  title       text not null,
  dek         text not null,
  body_md     text not null,
  cover_url   text,
  replaced_at timestamptz not null default now(),
  replaced_by uuid
);
create index if not exists member_story_revisions_story on public.member_story_revisions (story_id, replaced_at desc);
create index if not exists member_story_revisions_by on public.member_story_revisions (replaced_by, replaced_at desc);
alter table public.member_story_revisions enable row level security;
revoke all on table public.member_story_revisions from public, anon, authenticated;
drop policy if exists "admin reads story revisions" on public.member_story_revisions;
create policy "admin reads story revisions" on public.member_story_revisions
  for select using (public.is_admin());
grant select on public.member_story_revisions to authenticated;

-- 1c. a fixed comment says so
alter table public.wall_comments add column if not exists edited_at timestamptz;
alter table public.take_comments add column if not exists edited_at timestamptz;

-- 1d. THE ROLL. No default on purpose (S5 decides when a client sends nothing). Existing rows are all public.
alter table public.posts add column if not exists members_only boolean not null default false;
alter table public.posts alter column members_only drop default;
alter table public.posts
  drop constraint if exists posts_roll_has_photo,
  add  constraint posts_roll_has_photo check (not members_only or image_url is not null);

-- 1e. when the desk last decided (S7)
alter table public.packs           add column if not exists decided_at timestamptz;
alter table public.rooms           add column if not exists decided_at timestamptz;
alter table public.rotation_tracks add column if not exists decided_at timestamptz;
alter table public.word_entries    add column if not exists decided_at timestamptz;

-- 1f. his fixes to Crypt flyers from his phone (call 10). The Tuesday build folds them in (wall_event_fixes_by_key).
create table if not exists public.wall_event_fixes (
  event_id    text primary key check (event_id ~ '^f[0-9a-f]{9}$'),
  on_date     date not null,
  name_key    text not null default '' check (name_key ~ '^[a-z0-9]{0,12}$'),
  venue_key   text not null default '' check (venue_key ~ '^[a-z0-9]{0,9}$'),
  label       text not null check (char_length(label) between 1 and 140),
  state       text not null default 'built' check (state in ('built','on','postponed','cancelled','hidden')),
  patch       jsonb not null default '{}'::jsonb check (jsonb_typeof(patch) = 'object'),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index if not exists wall_event_fixes_date on public.wall_event_fixes (on_date);
alter table public.wall_event_fixes enable row level security;
revoke all on table public.wall_event_fixes from public, anon, authenticated;

-- 1g. the board's house-story fixes live in site_overrides under 'desk'. Only the section list is replaced: the other
--     checks on this table (key, patch shape) are left exactly as they are, so they are found by what they say.
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.site_overrides'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%section = ANY%'
  loop
    execute format('alter table public.site_overrides drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.site_overrides
  add constraint site_overrides_section_allowed
  check (section in ('work','slate','roster','site','rotation','creators','desk'));
alter table public.site_overrides
  drop constraint if exists site_overrides_desk_shape,
  add  constraint site_overrides_desk_shape check (section <> 'desk' or (
         item_key ~ '^word/[a-z0-9][a-z0-9-]{0,90}/$'
         and (patch - 'title' - 'dek' - 'kicker' - 'shelf') = '{}'::jsonb
         and (not patch ? 'title' or (jsonb_typeof(patch->'title') = 'string' and char_length(patch->>'title') between 3 and 80))
         and (not patch ? 'dek' or (jsonb_typeof(patch->'dek') = 'string' and char_length(patch->>'dek') between 3 and 200))
         and (not patch ? 'kicker' or (patch->>'kicker') ~ '^[A-Z0-9][A-Z0-9 &''.!?-]{1,23}$')
         and (not patch ? 'shelf' or patch->>'shelf' in ('nights','guides','dates','culture','interviews',''))));


-- SECTION 2. Stories (calls 8, 12) ------------------------------------------------------------
-- 023's insert guard, carried verbatim. Additions: the author's own story publishes (the desk too); members cannot
-- file house stories; the kicker is read one way; a cover comes from the author's folder (the desk may use his own).
create or replace function public.guard_member_story_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title   := replace(new.title,   chr(8212), ',');
  new.dek     := replace(new.dek,     chr(8212), ',');
  new.body_md := replace(new.body_md, chr(8212), ',');
  if not public.privileged_caller() then
    new.author_id  := auth.uid();
    new.published  := true;      -- 023: on add
    new.baked      := false;     -- still the laptop's mark
    new.created_at := now();
    new.house      := false;     -- 045: house stories are the desk's
    new.kicker     := null;
    new.shelf      := null;
  end if;
  -- 045: the author's own story publishes. The desk is privileged, so 023's line above skipped him: his WRITE ONE
  -- landed unpublished and his second one hit member_stories_one_pending.
  if auth.uid() is not null and new.author_id = auth.uid() then
    new.published := true;
  end if;
  new.kicker := nullif(upper(btrim(replace(replace(coalesce(new.kicker, ''), chr(8212), '-'), chr(8211), '-'))), '');
  if not coalesce(new.house, false) then
    new.kicker := null;
    new.shelf  := null;
  elsif not exists (select 1 from public.profiles x where x.id = new.author_id and x.is_admin) then
    raise exception 'Only the desk files house stories.' using errcode = '42501';
  end if;
  if new.cover_url is not null
     and new.cover_url not like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/' || new.author_id::text || '/%'
     and not (public.privileged_caller()
              and (auth.uid() is null or new.cover_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/' || auth.uid()::text || '/%')) then
    raise exception 'member_stories_cover_ours: that cover photo is not in your folder' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.guard_member_story_insert() from public, anon, authenticated;

-- 010's update guard, carried verbatim (every pin, published and baked included). Additions: members keep the house's
-- fields, the same kicker, house and cover rules, and every edit is marked (twenty an hour for members).
create or replace function public.guard_member_story_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.privileged_caller() then
    new.id         := old.id;
    new.author_id  := old.author_id;
    new.slug       := old.slug;
    new.published  := old.published;   -- the desk's tap
    new.baked      := old.baked;       -- the laptop's mark
    new.created_at := old.created_at;
    new.house      := old.house;       -- 045: the desk's
    new.kicker     := old.kicker;
    new.shelf      := old.shelf;
  end if;
  if new.title   is distinct from old.title   then new.title   := replace(new.title,   chr(8212), ','); end if;
  if new.dek     is distinct from old.dek     then new.dek     := replace(new.dek,     chr(8212), ','); end if;
  if new.body_md is distinct from old.body_md then new.body_md := replace(new.body_md, chr(8212), ','); end if;
  -- 045: the kicker reads one way, house stories are the desk's, a new cover comes from the author's folder
  new.kicker := nullif(upper(btrim(replace(replace(coalesce(new.kicker, ''), chr(8212), '-'), chr(8211), '-'))), '');
  if not coalesce(new.house, false) then
    new.kicker := null;
    new.shelf  := null;
  elsif not exists (select 1 from public.profiles x where x.id = new.author_id and x.is_admin) then
    raise exception 'Only the desk files house stories.' using errcode = '42501';
  end if;
  if new.cover_url is distinct from old.cover_url and new.cover_url is not null
     and new.cover_url not like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/' || new.author_id::text || '/%'
     and not (public.privileged_caller()
              and (auth.uid() is null or new.cover_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/' || auth.uid()::text || '/%')) then
    raise exception 'member_stories_cover_ours: that cover photo is not in your folder' using errcode = '23514';
  end if;
  -- 045: an edit is marked (and kept by member_story_keep_revision); twenty an hour for members
  if (new.title, new.dek, new.body_md, new.cover_url) is distinct from (old.title, old.dek, old.body_md, old.cover_url) then
    if not public.privileged_caller()
       and (select count(*) from public.member_story_revisions r
             where r.replaced_by = auth.uid() and r.replaced_at > now() - interval '1 hour') >= 20 then
      raise exception 'Slow down. Twenty edits an hour is the ceiling.' using errcode = '55000';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;
revoke execute on function public.guard_member_story_update() from public, anon, authenticated;

-- keep what a story said before each edit: every one from the last hour, and the ten newest of the older ones
create or replace function public.member_story_keep_revision()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if (new.title, new.dek, new.body_md, new.cover_url) is distinct from (old.title, old.dek, old.body_md, old.cover_url) then
    insert into public.member_story_revisions (story_id, title, dek, body_md, cover_url, replaced_by)
    values (old.id, old.title, old.dek, old.body_md, old.cover_url, auth.uid());
    delete from public.member_story_revisions r
     where r.story_id = old.id and r.replaced_at < now() - interval '1 hour'
       and r.id not in (select r2.id from public.member_story_revisions r2 where r2.story_id = old.id
                         order by r2.replaced_at desc, r2.id desc limit 10);
  end if;
  return null;
end $fn$;
revoke execute on function public.member_story_keep_revision() from public, anon, authenticated;
drop trigger if exists trg_member_stories_revision on public.member_stories;
create trigger trg_member_stories_revision after update on public.member_stories
  for each row execute function public.member_story_keep_revision();

-- the author edits and removes their own story until the laptop bakes it into the catalog
drop policy if exists "author edits pending story" on public.member_stories;
drop policy if exists "author withdraws pending story" on public.member_stories;
drop policy if exists "author edits own story" on public.member_stories;
create policy "author edits own story" on public.member_stories
  for update using (auth.uid() = author_id and not baked) with check (auth.uid() = author_id);
drop policy if exists "author removes own story" on public.member_stories;
create policy "author removes own story" on public.member_stories
  for delete using (auth.uid() = author_id and not baked);
-- a house story reads whatever the reader may see of the desk's own profile
drop policy if exists "anyone reads published stories" on public.member_stories;
create policy "anyone reads published stories" on public.member_stories
  for select using (published and (house or exists (select 1 from public.profiles pr where pr.id = member_stories.author_id and pr.approved)));

-- 010's ten columns in order, then edited_at, house, kicker, shelf. A LEFT join: a house row never depends on the
-- reader seeing the desk's profile.
create or replace view public.word_stories
with (security_invoker = on) as
  select s.id, s.slug, s.title, s.dek, s.body_md, s.cover_url, s.baked,
         s.created_at, pr.display_name, pr.card_slug,
         s.edited_at, s.house, s.kicker, s.shelf
    from public.member_stories s
    left join public.profiles pr on pr.id = s.author_id
   where s.published
     and (s.house or pr.approved);
grant select on public.word_stories to anon, authenticated;


-- SECTION 3. Lines, videos, picks (call 8) -------------------------------------------------------
drop policy if exists "author withdraws pending entry" on public.word_entries;
drop policy if exists "author removes own entry" on public.word_entries;
create policy "author removes own entry" on public.word_entries
  for delete using (auth.uid() = author_id);

drop policy if exists "author withdraws own video" on public.featured_videos;
create policy "author withdraws own video" on public.featured_videos
  for delete using (submitted_by = auth.uid());

-- 042's member_story_cover_cleanup shape: a video cover that goes is queued, unless something else still shows it
create or replace function public.featured_video_cover_cleanup()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  gone text;
begin
  if tg_op = 'UPDATE' and new.cover_url is not distinct from old.cover_url then
    return null;
  end if;
  gone := public.storage_object_name(old.cover_url);
  if gone is null then
    return null;
  end if;
  if exists (select 1 from public.featured_videos v
              where v.id <> old.id and v.cover_url is not null and public.storage_object_name(v.cover_url) = gone)
     or exists (select 1 from public.member_stories s
                 where s.cover_url is not null and public.storage_object_name(s.cover_url) = gone)
     or exists (select 1 from public.posts x
                 where x.image_url is not null and public.storage_object_name(x.image_url) = gone) then
    return null;
  end if;
  insert into public.orphan_images (object_name, reason)
  values (gone, case when tg_op = 'DELETE' then 'video deleted' else 'video cover replaced' end)
  on conflict (object_name) do update
    set reason = excluded.reason, cleared = false, created_at = now();
  return null;
end $fn$;
revoke execute on function public.featured_video_cover_cleanup() from public, anon, authenticated;
drop trigger if exists trg_featured_videos_cover_del on public.featured_videos;
create trigger trg_featured_videos_cover_del
  after delete on public.featured_videos
  for each row execute function public.featured_video_cover_cleanup();
drop trigger if exists trg_featured_videos_cover_upd on public.featured_videos;
create trigger trg_featured_videos_cover_upd
  after update of cover_url on public.featured_videos
  for each row execute function public.featured_video_cover_cleanup();

-- a pick: the member takes down their own, published or not (a swap still goes back to the desk: guard_rotation_update)
drop policy if exists "author withdraws unpublished track" on public.rotation_tracks;
drop policy if exists "author takes down own track" on public.rotation_tracks;
create policy "author takes down own track" on public.rotation_tracks
  for delete using (submitted_by = auth.uid());


-- SECTION 4. Comments and sources (calls 8, 9) -------------------------------------------------
-- is this Take post (p<id>) the caller's own?
create or replace function public.take_post_is_mine(k text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case when k ~ '^p[1-9][0-9]{0,11}$'
              then public.is_wall_member() and exists (select 1 from public.posts p where p.id = substr(k, 2)::bigint and p.author_id = auth.uid())
              else false end;
$fn$;
revoke execute on function public.take_post_is_mine(text) from public, anon, authenticated;

-- fix your own flyer comment, any time (his call said fix; the 'edited' tag tells readers)
create or replace function public.wall_comment_edit(p_id bigint, p_body text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare b text := left(btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]', ' ', 'g')), 280);
begin
  if auth.uid() is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if b = '' then raise exception 'Say something, 280 characters max.' using errcode = '22023'; end if;
  update public.wall_comments c set body = b, edited_at = now()
   where c.id = p_id and c.user_id = auth.uid() and not c.hidden;
  if not found then raise exception 'That one is not yours to fix.' using errcode = '22023'; end if;
  return true;
end $fn$;
revoke execute on function public.wall_comment_edit(bigint, text) from public, anon;
grant  execute on function public.wall_comment_edit(bigint, text) to authenticated;

-- 034's flyer thread, carried (new columns, so dropped and made again): edited_at and what kind of member wrote it
drop function if exists public.wall_thread(text);
create or replace function public.wall_thread(p_event text)
returns table (id bigint, body text, created_at timestamptz, name text, ig text, mine boolean, hidden boolean, sid text,
               edited_at timestamptz, kind text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select c.id, c.body, c.created_at, p.display_name,
         case when public.wall_open(c.user_id) or public.is_admin() then p.instagram end,
         c.user_id = auth.uid(), c.hidden,
         case when public.wall_open(c.user_id) then public.wall_sid(c.user_id) end,
         c.edited_at, case when p.is_admin then 'desk' when p.approved then 'card' else 'member' end
    from public.wall_comments c join public.profiles p on p.id = c.user_id
   where public.is_wall_member() and c.event_id = p_event
     and (not c.hidden or public.is_admin())
     and (public.wall_member(c.user_id) or public.is_admin())
   order by c.created_at desc
   limit 60;
$fn$;
revoke execute on function public.wall_thread(text) from public, anon;
grant  execute on function public.wall_thread(text) to authenticated;

-- fix your own Take comment, the same way
create or replace function public.take_comment_edit(p_id bigint, p_body text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare b text := public.wall_text(p_body);
begin
  if auth.uid() is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if b is null or char_length(b) > 280 then raise exception 'Say something, 280 characters max.' using errcode = '22023'; end if;
  update public.take_comments c set body = b, edited_at = now()
   where c.id = p_id and c.user_id = auth.uid() and not c.hidden;
  if not found then raise exception 'That one is not yours to fix.' using errcode = '22023'; end if;
  return true;
end $fn$;
revoke execute on function public.take_comment_edit(bigint, text) from public, anon;
grant  execute on function public.take_comment_edit(bigint, text) to authenticated;

-- 033's take_uncomment, carried. One change: the post's author may take down a comment on their own post.
create or replace function public.take_uncomment(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is null then return false; end if;
  delete from public.take_comments c
   where c.id = p_id and (c.user_id = auth.uid() or public.is_admin() or public.take_post_is_mine(c.post_key));
  return found;
end $fn$;
revoke execute on function public.take_uncomment(bigint) from public, anon;
grant  execute on function public.take_uncomment(bigint) to authenticated;

-- 033's take_thread, carried (new columns, so dropped and made again): can_delete counts the post's author, can_hide
-- is the desk's, on_mine says the post is the reader's, edited_at marks a fixed comment
drop function if exists public.take_thread(text);
create or replace function public.take_thread(p_key text)
returns table (id bigint, body text, created_at timestamptz, name text, sid text, pic text, kind text,
               mine boolean, can_delete boolean, hidden boolean,
               can_hide boolean, on_mine boolean, edited_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  with pm as (select public.take_post_is_mine(p_key) as m)
  select c.id, c.body, c.created_at,
         coalesce(nullif(btrim(x.display_name), ''), 'Member'),
         case when public.wall_open(x.id) then public.wall_sid(x.id) end,
         case when s.user_id is null then x.card_photo else s.pic end,
         case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
         c.user_id = auth.uid(),
         (c.user_id = auth.uid() or public.is_admin() or pm.m),
         c.hidden,
         public.is_admin(), pm.m, c.edited_at
    from public.take_comments c
    join public.profiles x on x.id = c.user_id
    left join public.wall_spaces s on s.user_id = x.id
    cross join pm
   where public.is_wall_member() and c.post_key = p_key
     and (not c.hidden or public.is_admin())
     and (public.wall_member(c.user_id) or public.is_admin())
   order by c.created_at desc
   limit 80;
$fn$;
revoke execute on function public.take_thread(text) from public, anon;
grant  execute on function public.take_thread(text) to authenticated;

-- 033's take_comment, carried. One change: somebody blocked by the post's author (or blocking them) cannot comment.
create or replace function public.take_comment(p_key text, p_body text)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); b text := public.wall_text(p_body); nid bigint;
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if not public.take_key_live(p_key) then raise exception 'That post is gone.' using errcode = '22023'; end if;
  if left(p_key, 1) = 'p' and exists (select 1 from public.posts x where x.id = substr(p_key, 2)::bigint
                                        and x.author_id <> me and public.dm_blocked(me, x.author_id)) then
    raise exception 'That post is not taking comments from you.' using errcode = '42501';
  end if;
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

-- take back a flyer source the desk has not decided yet
create or replace function public.wall_source_withdraw(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  delete from public.wall_sources s where s.id = p_id and s.user_id = auth.uid() and s.status = 'pending';
  return found;
end $fn$;
revoke execute on function public.wall_source_withdraw(bigint) from public, anon;
grant  execute on function public.wall_source_withdraw(bigint) to authenticated;


-- SECTION 5. The Roll goes members only (call 1). FAIL CLOSED. --------------------------------------
-- A post that arrives with no members_only (a Home or Roll box cached before the push) is decided here: a member's photo
-- goes behind the door (the safe mistake), a text post stays public, the desk's own posts stay public unless flagged.
-- Once posted, only the SQL editor moves a post across the door.
create or replace function public.guard_post_roll()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if tg_op = 'INSERT' then
    if new.members_only is null then
      new.members_only := (new.image_url is not null and not public.privileged_caller());
    end if;
    if new.members_only and not public.privileged_caller() and not coalesce(public.is_wall_member(), false) then
      raise exception 'The Roll is for members of the Crypt.' using errcode = '42501';
    end if;
    if new.members_only and new.image_url is null then
      raise exception 'A post on the Roll needs a photo.' using errcode = '22023';
    end if;
  else
    if not public.direct_sql_caller() then
      new.members_only := old.members_only;
    end if;
    if new.members_only and new.image_url is null then
      raise exception 'A post on the Roll keeps its photo. Delete it instead.' using errcode = '22023';
    end if;
  end if;
  if new.members_only and new.pinned then
    raise exception 'The pin is for the Take. A post on the Roll does not pin.' using errcode = '55000';
  end if;
  return new;
end $fn$;
revoke execute on function public.guard_post_roll() from public, anon, authenticated;
drop trigger if exists trg_posts_roll_guard on public.posts;
create trigger trg_posts_roll_guard before insert or update on public.posts
  for each row execute function public.guard_post_roll();

drop policy if exists "anyone reads published posts" on public.posts;
create policy "anyone reads published posts" on public.posts
  for select using (published = true and not members_only and public.take_author_ok(author_id));

-- 042's take_feed, carried whole. One change: the Roll is not on the public Take.
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
         case when pr.approved or pr.is_admin then coalesce(nullif(btrim(pr.card_photo), ''), s.pic) else s.pic end,
         coalesce(p.author_id = auth.uid(), false)
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    left join public.wall_spaces s on s.user_id = pr.id
   where p.published = true and not p.members_only and public.take_author_ok(pr.id)
   order by p.pinned desc, p.created_at desc
   limit least(greatest(coalesce(p_limit, 8), 1), 60);
$fn$;
grant execute on function public.take_feed(integer) to anon, authenticated;

-- The Roll, for members: take_feed's columns plus members_only, newest first. Runs as its owner: the WHERE is the only gate.
create or replace function public.roll_feed(p_limit integer default 60, p_photos boolean default false)
returns table (id bigint, text text, image_url text, image_alt text, pinned boolean,
               created_at timestamptz, edited_at timestamptz,
               display_name text, card_slug text, accent text,
               kind text, sid text, pic text, mine boolean, members_only boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.text, p.image_url, p.image_alt, p.pinned, p.created_at, p.edited_at,
         coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
         case when pr.approved or pr.is_admin then pr.card_slug end,
         pr.accent::text,
         case when pr.is_admin then 'desk' when pr.approved then 'card' else 'member' end,
         case when public.wall_open(pr.id) then public.wall_sid(pr.id) end,
         case when pr.approved or pr.is_admin then coalesce(nullif(btrim(pr.card_photo), ''), s.pic) else s.pic end,
         coalesce(p.author_id = auth.uid(), false),
         p.members_only
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    left join public.wall_spaces s on s.user_id = pr.id
   where public.is_wall_member()
     and p.published and public.take_author_ok(pr.id)
     and (not p.members_only or public.wall_member(pr.id))
     and (not coalesce(p_photos, false) or p.image_url is not null)
   order by p.created_at desc, p.id desc
   limit least(greatest(coalesce(p_limit, 60), 1), 60);
$fn$;
revoke execute on function public.roll_feed(integer, boolean) from public, anon;
grant  execute on function public.roll_feed(integer, boolean) to authenticated;
comment on function public.roll_feed(integer, boolean) is
  'The Roll since 045: members only. Runs as its owner, so the WHERE is the only gate; never add author_id to what it returns.';

-- 034's take_tally, carried whole. One change: a Roll post's counts are for members.
create or replace function public.take_tally(p_keys text[])
returns table (post_key text, reactions jsonb, comments integer, mine jsonb)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  with keys as (select distinct u.k from (select k from unnest(p_keys) as k limit 60) u
                 where public.take_key_ok(u.k)
                   and case when left(u.k, 1) = 's' then true
                            else (not exists (select 1 from public.posts p where p.id = substr(u.k, 2)::bigint and p.members_only)
                                  or public.is_wall_member()) end),
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

-- 005's feed columns; the Roll is not on it
create or replace view public.feed
with (security_invoker = on) as
  select p.id, p.text, p.image_url, p.image_alt, p.pinned,
         p.created_at, p.edited_at,
         pr.display_name, pr.card_slug, pr.accent
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
   where p.published = true and not p.members_only
   order by p.pinned desc, p.created_at desc;
grant select on public.feed to anon, authenticated;

-- 033's desk list, members_only appended
create or replace view public.desk_posts
with (security_invoker = on) as
  select p.id, p.author_id, p.text, p.image_url, p.image_alt,
         p.pinned, p.published, p.created_at, p.edited_at,
         p.pulled_at, p.pull_batch, p.was_pinned,
         pr.display_name, pr.card_slug,
         pr.approved as author_approved,
         (p.published and public.take_author_ok(p.author_id)) as publicly_visible,
         p.members_only
    from public.posts p
    join public.profiles pr on pr.id = p.author_id;
revoke all on public.desk_posts from anon;
grant select on public.desk_posts to authenticated;

-- the posts bucket stops being a public list (each photo still loads by its address, like the take bucket since 034)
drop policy if exists "post images are public" on storage.objects;
drop policy if exists "members see their own post files" on storage.objects;
create policy "members see their own post files" on storage.objects
  for select to authenticated
  using (bucket_id = 'posts' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));


-- SECTION 6. Crypt fixes from the phone (call 10), and kept cards (call 16) --------------------------
create or replace function public.wall_fix_key(p text, n int)
returns text language sql immutable security definer
set search_path = public, pg_temp as $fn$
  select left(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g'), n);
$fn$;
revoke execute on function public.wall_fix_key(text, integer) from public, anon, authenticated;

-- his fixes from the last eight days on, for members (the Crypt page lays them over the built flyers)
create or replace function public.wall_event_fixes()
returns table (event_id text, on_date date, name_key text, venue_key text, label text, state text, patch jsonb, updated_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
#variable_conflict use_column
begin
  if auth.uid() is null or not coalesce(public.is_wall_member(), false) then raise exception 'Members only.' using errcode = '42501'; end if;
  return query
    select f.event_id, f.on_date, f.name_key, f.venue_key, f.label, f.state, f.patch, f.updated_at
      from public.wall_event_fixes f
     where f.on_date >= (now() at time zone 'America/Chicago')::date - 8
     order by f.on_date, f.event_id;
end $fn$;
revoke execute on function public.wall_event_fixes() from public, anon;
grant  execute on function public.wall_event_fixes() to authenticated;

-- The desk fixes one flyer: its state (on, postponed, cancelled, hidden) and up to five fields (t time line, s/e start
-- and end in minutes from midnight, vf venue, dn details). Built with nothing changed clears the fix.
create or replace function public.wall_event_fix(p_event text, p_date date, p_label text, p_venue text, p_state text, p_patch jsonb)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_label text := btrim(coalesce(p_label, ''));
  v_p     jsonb := coalesce(p_patch, '{}'::jsonb);
  v_k     text;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_event is null or p_event !~ '^f[0-9a-f]{9}$' then raise exception 'That flyer id did not read.' using errcode = '22023'; end if;
  if p_date is null or p_date < v_today - 8 or p_date > v_today + 400 then
    raise exception 'That date is too far back or too far ahead.' using errcode = '22023';
  end if;
  if char_length(v_label) not between 1 and 140 then raise exception 'A flyer needs a name, 140 characters at most.' using errcode = '22023'; end if;
  if p_state is null or p_state not in ('built','on','postponed','cancelled','hidden') then
    raise exception 'Built, on, postponed, cancelled or hidden.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_p) <> 'object' then raise exception 'The changes did not read.' using errcode = '22023'; end if;
  for v_k in select jsonb_object_keys(v_p) loop
    if v_k not in ('t', 's', 'e', 'vf', 'dn') then
      raise exception 'Only the time, start, end, venue and details can change.' using errcode = '22023';
    end if;
  end loop;
  if v_p ? 't' and (jsonb_typeof(v_p->'t') <> 'string' or char_length(v_p->>'t') > 40) then
    raise exception 'The time line is 40 characters at most.' using errcode = '22023';
  end if;
  if v_p ? 'vf' and (jsonb_typeof(v_p->'vf') <> 'string' or char_length(btrim(v_p->>'vf')) not between 1 and 120) then
    raise exception 'A venue is 1 to 120 characters.' using errcode = '22023';
  end if;
  if v_p ? 'dn' and (jsonb_typeof(v_p->'dn') <> 'string' or char_length(v_p->>'dn') > 200) then
    raise exception 'Details are 200 characters at most.' using errcode = '22023';
  end if;
  foreach v_k in array array['s', 'e'] loop
    if v_p ? v_k and jsonb_typeof(v_p->v_k) <> 'null'
       and (jsonb_typeof(v_p->v_k) <> 'number' or (v_p->>v_k)::numeric <> trunc((v_p->>v_k)::numeric)
            or (v_p->>v_k)::numeric < 0 or (v_p->>v_k)::numeric > 2879) then
      raise exception 'A start or end is minutes from midnight, 0 to 2879.' using errcode = '22023';
    end if;
  end loop;
  if v_p ? 'e' and jsonb_typeof(v_p->'e') <> 'null' and not (v_p ? 's' and jsonb_typeof(v_p->'s') <> 'null') then
    raise exception 'An end needs a start.' using errcode = '22023';
  end if;
  -- the house does not print em or en dashes
  foreach v_k in array array['t', 'vf', 'dn'] loop
    if v_p ? v_k then
      v_p := jsonb_set(v_p, array[v_k], to_jsonb(replace(replace(v_p->>v_k, chr(8212), ','), chr(8211), ',')));
    end if;
  end loop;
  if v_p ? 'dn' and btrim(v_p->>'dn') = '' then v_p := v_p - 'dn'; end if;
  if p_state = 'built' and v_p = '{}'::jsonb then
    delete from public.wall_event_fixes f where f.event_id = p_event;
    return 'cleared';
  end if;
  insert into public.wall_event_fixes (event_id, on_date, name_key, venue_key, label, state, patch, updated_by, updated_at)
  values (p_event, p_date, public.wall_fix_key(v_label, 12), public.wall_fix_key(p_venue, 9), v_label, p_state, v_p, auth.uid(), now())
  on conflict (event_id) do update
    set on_date = excluded.on_date, name_key = excluded.name_key, venue_key = excluded.venue_key, label = excluded.label,
        state = excluded.state, patch = excluded.patch, updated_by = excluded.updated_by, updated_at = now();
  delete from public.wall_event_fixes f where f.on_date < v_today - 30;
  return 'saved';
end $fn$;
revoke execute on function public.wall_event_fix(text, date, text, text, text, jsonb) from public, anon;
grant  execute on function public.wall_event_fix(text, date, text, text, text, jsonb) to authenticated;

create or replace function public.wall_event_unfix(p_event text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  delete from public.wall_event_fixes f where f.event_id = p_event;
  return found;
end $fn$;
revoke execute on function public.wall_event_unfix(text) from public, anon;
grant  execute on function public.wall_event_unfix(text) to authenticated;

-- The Tuesday build reads his fixes with the week's key (call 10: folded back into the weekly build). Whoever holds that
-- key can already open the whole Crypt, so this shows nothing new; a 64-hex key cannot be guessed.
create or replace function public.wall_event_fixes_by_key(p_key text)
returns table (event_id text, on_date date, name_key text, venue_key text, label text, state text, patch jsonb, updated_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select f.event_id, f.on_date, f.name_key, f.venue_key, f.label, f.state, f.patch, f.updated_at
    from public.wall_event_fixes f
   where f.on_date >= (now() at time zone 'America/Chicago')::date - 8
     and coalesce(p_key, '') <> ''
     and exists (select 1 from public.wall_keys k where k.id = 'wall' and k.k = p_key)
   order by f.on_date, f.event_id;
$fn$;
revoke execute on function public.wall_event_fixes_by_key(text) from public;
grant  execute on function public.wall_event_fixes_by_key(text) to anon, authenticated;

-- 037's my_faves, carried. One change: a pack that came down leaves a fan's binder (the maker still sees their own).
create or replace function public.my_faves()
returns table (card_id bigint, pack_slug text, pack_title text, image text, rarity text, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select f.card_id, p.slug, p.title, c.image, c.rarity, f.created_at
    from public.pack_faves f join public.pack_cards c on c.id = f.card_id join public.packs p on p.id = c.pack_id
   where f.user_id = auth.uid() and public.pack_visible(p.id)
   order by f.created_at desc;
$fn$;
revoke execute on function public.my_faves() from public, anon;
grant  execute on function public.my_faves() to authenticated;


-- SECTION 7. Decided marks (the badge tells waiting from said no) ----------------------------------
-- Everything published before today counts as decided, and every story from before today too. Only on the first run:
-- once the stamp exists, rows it left waiting stay waiting.
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_desk_decided' and tgrelid = 'public.member_stories'::regclass) then
    update public.packs           set decided_at = updated_at where published and decided_at is null;
    update public.rooms           set decided_at = updated_at where published and decided_at is null;
    update public.rotation_tracks set decided_at = created_at where published and decided_at is null;
    update public.word_entries    set decided_at = created_at where published and decided_at is null;
    update public.member_stories  set decided_at = created_at where decided_at is null;
  end if;
end $$;

-- the desk (or the SQL editor) touching a row decides it; a member's insert or change sets it waiting again
create or replace function public.desk_decided_stamp()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if public.privileged_caller() then
    new.decided_at := now();
  elsif tg_op = 'INSERT' then
    new.decided_at := null;
  elsif new is distinct from old then
    new.decided_at := null;
  end if;
  return new;
end $fn$;
revoke execute on function public.desk_decided_stamp() from public, anon, authenticated;
drop trigger if exists zz_desk_decided on public.packs;
create trigger zz_desk_decided before insert or update on public.packs for each row execute function public.desk_decided_stamp();
drop trigger if exists zz_desk_decided on public.rooms;
create trigger zz_desk_decided before insert or update on public.rooms for each row execute function public.desk_decided_stamp();
drop trigger if exists zz_desk_decided on public.rotation_tracks;
create trigger zz_desk_decided before insert or update on public.rotation_tracks for each row execute function public.desk_decided_stamp();
drop trigger if exists zz_desk_decided on public.word_entries;
create trigger zz_desk_decided before insert or update on public.word_entries for each row execute function public.desk_decided_stamp();
drop trigger if exists zz_desk_decided on public.member_stories;
create trigger zz_desk_decided before insert or update on public.member_stories for each row execute function public.desk_decided_stamp();

-- Mark as seen: one row, or every waiting row of a kind (the "Mark all as seen" for refusals from before today)
create or replace function public.desk_mark_read(p_kind text, p_id bigint default null)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare n int := 0;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('story', 'pick', 'story_comment', 'pack', 'room') then
    raise exception 'Mark what? story, pick, story_comment, pack or room.' using errcode = '22023';
  end if;
  if p_kind = 'story' then
    update public.member_stories s set decided_at = now()
     where s.decided_at is null and (case when p_id is null then s.published else s.id = p_id end);
  elsif p_kind = 'pick' then
    update public.rotation_tracks t set decided_at = now()
     where t.decided_at is null and (case when p_id is null then not t.published else t.id = p_id end);
  elsif p_kind = 'story_comment' then
    update public.word_entries e set decided_at = now()
     where e.decided_at is null and (case when p_id is null then not e.published else e.id = p_id end);
  elsif p_kind = 'pack' then
    update public.packs p set decided_at = now()
     where p.decided_at is null and (case when p_id is null then not p.published else p.id = p_id end);
  elsif p_kind = 'room' then
    update public.rooms r set decided_at = now()
     where r.decided_at is null and (case when p_id is null then not r.published else r.id = p_id end);
  end if;
  get diagnostics n = row_count;
  perform public.acct_log(auth.uid(), 'read', jsonb_build_object('kind', p_kind, 'n', n));
  return n;
end $fn$;
revoke execute on function public.desk_mark_read(text, bigint) from public, anon;
grant  execute on function public.desk_mark_read(text, bigint) to authenticated;


-- SECTION 8. Desk read doors (the members manager, power d; one badge) ------------------------------
-- One row per person for the Members tab. Not a door: desk_members() is. No email, ever. DM times are left out of
-- last_active on purpose.
create or replace function public.desk_member_rows(p_only uuid default null)
returns table (id uuid, sid text, name text, ig text, card_slug text, requested_slug text, card_want text, role text, state text,
               asks boolean, said_no boolean, show_name boolean, pic text, joined timestamptz, crypt_joined timestamptz,
               last_in timestamptz, last_active timestamptz, banned_at timestamptz, ban_note text, closed_at timestamptz,
               closed_by_desk boolean, close_reason text, frame_grant text, card_frame text,
               n_posts int, n_roll int, n_comments int, n_page int, n_packs int, n_rooms int, n_stories int, n_catalog int,
               n_story_comments int, n_picks int, n_videos int, n_dates int, n_tags int, n_sources int, n_friends int, n_reports int)
language sql stable security definer
set search_path = public, pg_temp as $fn$
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
         case when x.is_admin then 'desk' when x.approved then 'card' when coalesce(w.casual, false) then 'member' else 'login' end,
         case when c.user_id is not null then 'closed' when coalesce(w.banned, false) then 'banned' else 'active' end,
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
$fn$;
revoke execute on function public.desk_member_rows(uuid) from public, anon, authenticated;

create or replace function public.desk_members()
returns table (id uuid, sid text, name text, ig text, card_slug text, requested_slug text, card_want text, role text, state text,
               asks boolean, said_no boolean, show_name boolean, pic text, joined timestamptz, crypt_joined timestamptz,
               last_in timestamptz, last_active timestamptz, banned_at timestamptz, ban_note text, closed_at timestamptz,
               closed_by_desk boolean, close_reason text, frame_grant text, card_frame text,
               n_posts int, n_roll int, n_comments int, n_page int, n_packs int, n_rooms int, n_stories int, n_catalog int,
               n_story_comments int, n_picks int, n_videos int, n_dates int, n_tags int, n_sources int, n_friends int, n_reports int)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select * from public.desk_member_rows(null);
$fn$;
revoke execute on function public.desk_members() from public, anon;
grant  execute on function public.desk_members() to authenticated;

-- One list of one person's things, newest first: the first 50 (p_before null) or the next 50 older than p_before.
-- Not a door: desk_member_stuff and desk_member_items are.
create or replace function public.desk_member_list(p_user uuid, p_kind text, p_before timestamptz default null, p_limit integer default 50)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare v jsonb; v_lim int := least(greatest(coalesce(p_limit, 50), 1), 50);
begin
  if p_kind = 'posts' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select p.id, p.created_at as at, jsonb_build_object('id', p.id, 'text', left(p.text, 300), 'image_url', p.image_url,
                     'published', p.published, 'members_only', p.members_only,
                     'visible', p.published and public.take_author_ok(p.author_id), 'pinned', p.pinned, 'at', p.created_at) as j
              from public.posts p where p.author_id = p_user and (p_before is null or p.created_at < p_before)
             order by p.created_at desc, p.id desc limit v_lim) z;
  elsif p_kind = 'take_comments' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select c.id, c.created_at as at, jsonb_build_object('id', c.id, 'b', c.body, 'post', c.post_key, 'hidden', c.hidden,
                     'edited_at', c.edited_at, 'at', c.created_at) as j
              from public.take_comments c where c.user_id = p_user and (p_before is null or c.created_at < p_before)
             order by c.created_at desc, c.id desc limit v_lim) z;
  elsif p_kind = 'flyer_comments' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select c.id, c.created_at as at, jsonb_build_object('id', c.id, 'b', c.body, 'ev', c.event_id, 'hidden', c.hidden,
                     'edited_at', c.edited_at, 'at', c.created_at) as j
              from public.wall_comments c where c.user_id = p_user and (p_before is null or c.created_at < p_before)
             order by c.created_at desc, c.id desc limit v_lim) z;
  elsif p_kind = 'page_comments' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select c.id, c.created_at as at, jsonb_build_object('id', c.id, 'b', c.body, 'on', public.wall_sid(c.owner),
                     'on_name', coalesce(nullif(btrim(o.display_name), ''), 'Member'), 'at', c.created_at) as j
              from public.wall_space_posts c left join public.profiles o on o.id = c.owner
             where c.author = p_user and (p_before is null or c.created_at < p_before)
             order by c.created_at desc, c.id desc limit v_lim) z;
  elsif p_kind = 'on_their_page' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select c.id, c.created_at as at, jsonb_build_object('id', c.id, 'b', c.body, 'by', public.wall_sid(c.author),
                     'by_name', coalesce(nullif(btrim(a.display_name), ''), 'Member'), 'at', c.created_at) as j
              from public.wall_space_posts c left join public.profiles a on a.id = c.author
             where c.owner = p_user and (p_before is null or c.created_at < p_before)
             order by c.created_at desc, c.id desc limit v_lim) z;
  elsif p_kind = 'packs' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select p.id, p.updated_at as at, jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'published', p.published,
                     'waiting', not p.published and p.decided_at is null,
                     'images', (select coalesce(jsonb_agg(c.image order by c.idx), '[]'::jsonb) from public.pack_cards c where c.pack_id = p.id),
                     'cover', nullif(p.cover, ''), 'at', p.updated_at) as j
              from public.packs p where p.author_id = p_user and (p_before is null or p.updated_at < p_before)
             order by p.updated_at desc, p.id desc limit v_lim) z;
  elsif p_kind = 'rooms' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select r.id, r.updated_at as at, jsonb_build_object('id', r.id, 'name', r.name, 'label', r.label, 'playlist', r.playlist,
                     'published', r.published, 'waiting', not r.published and r.decided_at is null, 'at', r.updated_at) as j
              from public.rooms r where r.author_id = p_user and (p_before is null or r.updated_at < p_before)
             order by r.updated_at desc, r.id desc limit v_lim) z;
  elsif p_kind = 'stories' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select s.id, s.created_at as at, jsonb_build_object('id', s.id, 'slug', s.slug, 'title', s.title, 'published', s.published,
                     'baked', s.baked, 'house', s.house, 'waiting', s.published and s.decided_at is null,
                     'edited_at', s.edited_at, 'at', s.created_at) as j
              from public.member_stories s where s.author_id = p_user and (p_before is null or s.created_at < p_before)
             order by s.created_at desc, s.id desc limit v_lim) z;
  elsif p_kind = 'story_comments' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select e.id, e.created_at as at, jsonb_build_object('id', e.id, 'story_slug', e.story_slug, 'text', e.text,
                     'published', e.published, 'waiting', not e.published and e.decided_at is null, 'at', e.created_at) as j
              from public.word_entries e where e.author_id = p_user and (p_before is null or e.created_at < p_before)
             order by e.created_at desc, e.id desc limit v_lim) z;
  elsif p_kind = 'picks' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select t.id, t.created_at as at, jsonb_build_object('id', t.id, 'track', t.track, 'title', t.title, 'artist', t.artist,
                     'published', t.published, 'waiting', not t.published and t.decided_at is null, 'at', t.created_at) as j
              from public.rotation_tracks t where t.submitted_by = p_user and (p_before is null or t.created_at < p_before)
             order by t.created_at desc, t.id desc limit v_lim) z;
  elsif p_kind = 'videos' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select f.id, f.created_at as at, jsonb_build_object('id', f.id, 'provider', f.provider, 'vid', f.vid, 'title', f.title,
                     'published', f.published, 'featured', f.featured, 'at', f.created_at) as j
              from public.featured_videos f where f.submitted_by = p_user and (p_before is null or f.created_at < p_before)
             order by f.created_at desc, f.id desc limit v_lim) z;
  elsif p_kind = 'dates' then
    select coalesce(jsonb_agg(z.j order by z.at desc), '[]'::jsonb) into v
      from (select d.created_at as at, jsonb_build_object('id', d.id, 'title', d.title, 'on_date', d.on_date, 'published', d.published,
                     'want_house', d.want_house, 'house_status', d.house_status, 'at', d.created_at) as j
              from public.calendar_dates d where d.submitted_by = p_user and (p_before is null or d.created_at < p_before)
             order by d.created_at desc limit v_lim) z;
  elsif p_kind = 'tags' then
    select coalesce(jsonb_agg(z.j order by z.at desc), '[]'::jsonb) into v
      from (select t.created_at as at, jsonb_build_object('event_slug', t.event_slug, 'media', t.media, 'frame', t.frame, 'at', t.created_at) as j
              from public.frame_tags t where t.user_id = p_user and (p_before is null or t.created_at < p_before)
             order by t.created_at desc limit v_lim) z;
  elsif p_kind = 'sources' then
    select coalesce(jsonb_agg(z.j order by z.at desc, z.id desc), '[]'::jsonb) into v
      from (select s.id, s.created_at as at, jsonb_build_object('id', s.id, 'source', s.source, 'kind', s.kind, 'status', s.status,
                     'found', s.found, 'at', s.created_at) as j
              from public.wall_sources s where s.user_id = p_user and (p_before is null or s.created_at < p_before)
             order by s.created_at desc, s.id desc limit v_lim) z;
  else
    raise exception 'No list by that name.' using errcode = '22023';
  end if;
  return v;
end $fn$;
revoke execute on function public.desk_member_list(uuid, text, timestamptz, integer) from public, anon, authenticated;

-- Everything about one person (power d). DMs are never read here unless a chat was reported (then it is in reports).
create or replace function public.desk_member_stuff(p_user uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare
  v_x   public.profiles;
  v_w   public.wall_people;
  v_sp  public.wall_spaces;
  v_row jsonb;
  v_n   jsonb;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  select * into v_x from public.profiles x where x.id = p_user;
  if v_x.id is null then return null; end if;
  select * into v_w from public.wall_people w where w.user_id = p_user;
  select * into v_sp from public.wall_spaces s where s.user_id = p_user;
  select to_jsonb(r) into v_row from public.desk_member_rows(p_user) r;
  select jsonb_build_object(
           'posts', (select count(*) from public.posts p where p.author_id = p_user),
           'take_comments', (select count(*) from public.take_comments c where c.user_id = p_user),
           'flyer_comments', (select count(*) from public.wall_comments c where c.user_id = p_user),
           'page_comments', (select count(*) from public.wall_space_posts c where c.author = p_user),
           'on_their_page', (select count(*) from public.wall_space_posts c where c.owner = p_user),
           'packs', (select count(*) from public.packs p where p.author_id = p_user),
           'rooms', (select count(*) from public.rooms r where r.author_id = p_user),
           'stories', (select count(*) from public.member_stories s where s.author_id = p_user),
           'story_comments', (select count(*) from public.word_entries e where e.author_id = p_user),
           'picks', (select count(*) from public.rotation_tracks t where t.submitted_by = p_user),
           'videos', (select count(*) from public.featured_videos f where f.submitted_by = p_user),
           'dates', (select count(*) from public.calendar_dates d where d.submitted_by = p_user),
           'tags', (select count(*) from public.frame_tags t where t.user_id = p_user),
           'sources', (select count(*) from public.wall_sources s where s.user_id = p_user)) into v_n;
  return jsonb_build_object(
    'person', v_row,
    'words', jsonb_build_object('tagline', v_x.tagline, 'bio', v_x.bio, 'links', v_x.links, 'link_platform', v_x.link_platform,
                                'link_handle', v_x.link_handle, 'card_photo', v_x.card_photo, 'theme_track', v_x.theme_track,
                                'theme_start', v_x.theme_start,
                                'featured', (select coalesce(jsonb_agg(jsonb_build_object('slot', f.slot, 'track', f.track) order by f.slot), '[]'::jsonb)
                                               from public.featured_tracks f where f.profile_id = p_user)),
    'page', case when v_sp.user_id is null then null
                 else to_jsonb(v_sp) - 'user_id' - 'top8'
                      || jsonb_build_object('top8', (select coalesce(jsonb_agg(public.wall_sid(u.id) order by u.ord), '[]'::jsonb)
                                                       from unnest(v_sp.top8) with ordinality as u(id, ord))) end,
    'ask', jsonb_build_object('state', v_w.card_ask, 'note', v_w.card_note, 'want', v_w.card_want, 'at', v_w.card_ask_at),
    'still_public', jsonb_build_object('catalog_stories', (select count(*) from public.member_stories s where s.author_id = p_user and s.baked),
                                       'roster_seat', v_x.card_slug is not null and exists (select 1 from public.house_seats h where h.slug = v_x.card_slug)),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'detail', l.detail,
                                                             'by_desk', coalesce((select b.is_admin from public.profiles b where b.id = l.by), false))
                                          order by l.at desc, l.id desc), '[]'::jsonb)
                  from (select * from public.account_log l0 where l0.target = p_user order by l0.at desc, l0.id desc limit 40) l),
    'posts',          jsonb_build_object('total', v_n->'posts',          'rows', public.desk_member_list(p_user, 'posts')),
    'take_comments',  jsonb_build_object('total', v_n->'take_comments',  'rows', public.desk_member_list(p_user, 'take_comments')),
    'flyer_comments', jsonb_build_object('total', v_n->'flyer_comments', 'rows', public.desk_member_list(p_user, 'flyer_comments')),
    'page_comments',  jsonb_build_object('total', v_n->'page_comments',  'rows', public.desk_member_list(p_user, 'page_comments')),
    'on_their_page',  jsonb_build_object('total', v_n->'on_their_page',  'rows', public.desk_member_list(p_user, 'on_their_page')),
    'packs',          jsonb_build_object('total', v_n->'packs',          'rows', public.desk_member_list(p_user, 'packs')),
    'rooms',          jsonb_build_object('total', v_n->'rooms',          'rows', public.desk_member_list(p_user, 'rooms')),
    'stories',        jsonb_build_object('total', v_n->'stories',        'rows', public.desk_member_list(p_user, 'stories')),
    'story_comments', jsonb_build_object('total', v_n->'story_comments', 'rows', public.desk_member_list(p_user, 'story_comments')),
    'picks',          jsonb_build_object('total', v_n->'picks',          'rows', public.desk_member_list(p_user, 'picks')),
    'videos',         jsonb_build_object('total', v_n->'videos',         'rows', public.desk_member_list(p_user, 'videos')),
    'dates',          jsonb_build_object('total', v_n->'dates',          'rows', public.desk_member_list(p_user, 'dates')),
    'tags',           jsonb_build_object('total', v_n->'tags',           'rows', public.desk_member_list(p_user, 'tags')),
    'sources',        jsonb_build_object('total', v_n->'sources',        'rows', public.desk_member_list(p_user, 'sources')),
    'reports', public.report_desk_queue('all', p_user, null, 50),
    'reports_by', (select count(*) from public.reports r where r.by_user = p_user));
end $fn$;
revoke execute on function public.desk_member_stuff(uuid) from public, anon;
grant  execute on function public.desk_member_stuff(uuid) to authenticated;

-- paging past the first 50 of one list
create or replace function public.desk_member_items(p_user uuid, p_kind text, p_before timestamptz)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  return public.desk_member_list(p_user, p_kind, p_before, 50);
end $fn$;
revoke execute on function public.desk_member_items(uuid, text, timestamptz) from public, anon;
grant  execute on function public.desk_member_items(uuid, text, timestamptz) to authenticated;

-- The one badge: what is waiting on the desk. Nothing for anybody else. The desk's own things never wait; a banned or
-- closed person's things do not count until they are back.
create or replace function public.desk_waiting()
returns table (asks int, sources int, reports int, packs int, rooms int, picks int, comments int, stories int, house int, photos_up int, total int)
language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
#variable_conflict use_column
declare v_a int; v_s int; v_r int; v_pk int; v_rm int; v_pi int; v_cm int; v_st int; v_ho int; v_ph int;
        v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if not coalesce(public.is_admin(), false) then return; end if;
  select count(*)::int into v_a from public.profiles x join public.wall_people w on w.user_id = x.id
   where w.card_ask = 'asked' and not x.approved and not x.is_admin and not x.denied and public.acct_ok(x.id);
  select count(*)::int into v_s from public.wall_sources s where s.status = 'pending' and public.acct_ok(s.user_id);
  v_r := public.report_desk_count();
  select count(*)::int into v_pk from public.packs p join public.profiles x on x.id = p.author_id
   where not p.published and p.decided_at is null and not x.is_admin and public.acct_ok(p.author_id);
  select count(*)::int into v_rm from public.rooms r join public.profiles x on x.id = r.author_id
   where not r.published and r.decided_at is null and not x.is_admin and public.acct_ok(r.author_id);
  select count(*)::int into v_pi from public.rotation_tracks t join public.profiles x on x.id = t.submitted_by
   where not t.published and t.decided_at is null and not x.is_admin and public.acct_ok(t.submitted_by);
  select count(*)::int into v_cm from public.word_entries e join public.profiles x on x.id = e.author_id
   where not e.published and e.decided_at is null and not x.is_admin and public.acct_ok(e.author_id);
  select count(*)::int into v_st from public.member_stories s join public.profiles x on x.id = s.author_id
   where s.published and s.decided_at is null and not x.is_admin and public.acct_ok(s.author_id);
  select count(*)::int into v_ho from public.calendar_dates d
   where d.want_house and d.house_status = 'none' and d.on_date >= v_today and public.acct_ok(d.submitted_by);
  select count(*)::int into v_ph from public.frame_takedowns d where d.files_gone_at is null;
  return query select v_a, v_s, v_r, v_pk, v_rm, v_pi, v_cm, v_st, v_ho, v_ph,
                      v_a + v_s + v_r + v_pk + v_rm + v_pi + v_cm + v_st + v_ho + v_ph;
end $fn$;
revoke execute on function public.desk_waiting() from public, anon;
grant  execute on function public.desk_waiting() to authenticated;

-- packs and rooms waiting (oldest first) and pending flyer sources. The same people desk_waiting counts: never a banned
-- or closed person's, so the badge and the lists always agree.
create or replace function public.desk_queue()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
begin
  if not coalesce(public.is_admin(), false) then return null; end if;
  return jsonb_build_object(
    'packs', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'line', p.line,
                                                           'cover', nullif(p.cover, ''),
                                                           'cards', (select count(*) from public.pack_cards c where c.pack_id = p.id),
                                                           'at', p.updated_at, 'by', public.desk_person(p.author_id))
                                        order by p.updated_at, p.id), '[]'::jsonb)
                from public.packs p join public.profiles x on x.id = p.author_id
               where not p.published and p.decided_at is null and not x.is_admin and public.acct_ok(p.author_id)),
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'label', r.label, 'line', r.line,
                                                           'playlist', r.playlist, 'at', r.updated_at, 'by', public.desk_person(r.author_id))
                                        order by r.updated_at, r.id), '[]'::jsonb)
                from public.rooms r join public.profiles x on x.id = r.author_id
               where not r.published and r.decided_at is null and not x.is_admin and public.acct_ok(r.author_id)),
    'sources', (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
                  from public.wall_source_queue() q
                 where q.status = 'pending'
                   and exists (select 1 from public.wall_sources s where s.id = q.id and public.acct_ok(s.user_id))));
end $fn$;
revoke execute on function public.desk_queue() from public, anon;
grant  execute on function public.desk_queue() to authenticated;


-- SECTION 9. His Run nights (data only: blanks filled from the flyer data, no rows added) ---------------
update public.calendar_dates c
   set link = coalesce(c.link, 'https://www.germaniaamp.com/events/suicideboys'),
       start_time = coalesce(c.start_time, time '18:00'),
       note = coalesce(c.note, 'With Destroy Lonely, Shakewell, DRAIN, Black Kray and $lim Gucci. Doors 5, show 6. Destroy Lonely''s first night back on the tour.')
 where c.on_date = date '2026-10-13' and c.title ~* 'grey day|suicideboy';
update public.calendar_dates c
   set link = coalesce(c.link, 'https://www.eventbrite.com/e/halloween-at-3oak-hosted-bt-2-chainz-tickets-1994237290419'),
       start_time = coalesce(c.start_time, time '22:00'),
       note = coalesce(c.note, 'Hosted by 2 Chainz, with DJ Henny K. 21 and up, from $48.19.')
 where c.on_date = date '2026-10-17' and c.title ~* 'chainz';
update public.calendar_dates c
   set link = coalesce(c.link, 'https://www.sicknewworldfest.com/')
 where c.on_date = date '2026-10-24' and c.title ~* 'sick new world';
update public.calendar_dates c
   set link = coalesce(c.link, 'https://posh.vip/e/latto-bar3oak'),
       start_time = coalesce(c.start_time, time '21:00'),
       note = coalesce(c.note, '18 and up.')
 where c.on_date = date '2026-11-06' and c.title ~* 'latto';


notify pgrst, 'reload schema';

-- SECTION 10. Verify: the first row, every column true. Then what he should look at. -------------------
with v as (
  select
    (select bool_and(pg_get_expr(p.polqual, p.polrelid) like '%baked%') from pg_policy p
      where p.polrelid = 'public.member_stories'::regclass and p.polname in ('author edits own story', 'author removes own story'))
      and (select count(*) from pg_policy p where p.polrelid = 'public.member_stories'::regclass
            and p.polname in ('author edits own story', 'author removes own story')) = 2 as story_policies_say_baked,
    not exists (select 1 from pg_policy p
                 where p.polrelid in ('public.member_stories'::regclass, 'public.word_entries'::regclass, 'public.featured_videos'::regclass, 'public.rotation_tracks'::regclass)
                   and p.polcmd = 'd' and pg_get_expr(p.polqual, p.polrelid) like '%published%')
      and exists (select 1 from pg_policy p where p.polrelid = 'public.word_entries'::regclass and p.polname = 'author removes own entry')
      and exists (select 1 from pg_policy p where p.polrelid = 'public.rotation_tracks'::regclass and p.polname = 'author takes down own track') as deletes_not_published_only,
    (select count(*) from pg_trigger where not tgisinternal and tgname in ('trg_member_stories_revision', 'trg_featured_videos_cover_del', 'trg_featured_videos_cover_upd')) = 3 as revision_and_cover_triggers,
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'word_stories'
        and column_name in ('edited_at', 'house', 'kicker', 'shelf')) = 4
      and pg_get_viewdef('public.word_stories'::regclass) ilike '%left join%' as word_stories_has_edited_and_house,
    pg_get_functiondef('public.guard_member_story_insert()'::regprocedure) like '%new.author_id = auth.uid()%' as own_story_publishes,
    has_function_privilege('authenticated', 'public.wall_comment_edit(bigint,text)', 'execute')
      and has_function_privilege('authenticated', 'public.take_comment_edit(bigint,text)', 'execute')
      and not has_function_privilege('anon', 'public.wall_comment_edit(bigint,text)', 'execute')
      and not has_function_privilege('anon', 'public.take_comment_edit(bigint,text)', 'execute')
      and pg_get_functiondef('public.wall_comment_edit(bigint,text)'::regprocedure) not like '%interval%'
      and pg_get_functiondef('public.take_comment_edit(bigint,text)'::regprocedure) not like '%interval%' as comment_edits,
    pg_get_functiondef('public.take_uncomment(bigint)'::regprocedure) like '%take_post_is_mine%' as take_uncomment_post_author,
    pg_get_function_result('public.take_thread(text)'::regprocedure) like '%can_hide%' as take_thread_can_hide,
    (select column_default is null and is_nullable = 'NO' from information_schema.columns
      where table_schema = 'public' and table_name = 'posts' and column_name = 'members_only') as roll_no_default,
    exists (select 1 from pg_trigger where not tgisinternal and tgname = 'trg_posts_roll_guard')
      and pg_get_functiondef('public.guard_post_roll()'::regprocedure) like '%members_only is null%' as roll_guard_fails_closed,
    coalesce((select pg_get_expr(p.polqual, p.polrelid) like '%members_only%' from pg_policy p
               where p.polrelid = 'public.posts'::regclass and p.polname = 'anyone reads published posts'), false) as roll_off_the_table,
    pg_get_functiondef('public.take_feed(integer)'::regprocedure) like '%not p.members_only%'
      and pg_get_functiondef('public.take_feed(integer)'::regprocedure) like '%card_photo%' as take_feed_public_only,
    has_function_privilege('anon', 'public.take_feed(integer)', 'execute')
      and not has_function_privilege('anon', 'public.roll_feed(integer,boolean)', 'execute')
      and has_function_privilege('authenticated', 'public.roll_feed(integer,boolean)', 'execute') as roll_feed_members,
    pg_get_viewdef('public.feed'::regclass) like '%members_only%' as feed_view_public_only,
    pg_get_functiondef('public.take_tally(text[])'::regprocedure) like '%members_only%' as tally_hides_roll,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'desk_posts' and column_name = 'members_only') as desk_posts_has_members_only,
    not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'post images are public')
      and exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'members see their own post files') as posts_not_listable,
    (select relrowsecurity from pg_class where oid = 'public.wall_event_fixes'::regclass)
      and not has_table_privilege('anon', 'public.wall_event_fixes', 'select, insert, update, delete')
      and not has_table_privilege('authenticated', 'public.wall_event_fixes', 'select, insert, update, delete') as fixes_locked,
    not has_function_privilege('anon', 'public.wall_event_fixes()', 'execute')
      and not has_function_privilege('anon', 'public.wall_event_fix(text,date,text,text,text,jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.wall_event_unfix(text)', 'execute')
      and has_function_privilege('anon', 'public.wall_event_fixes_by_key(text)', 'execute') as fixes_doors,
    coalesce((select pg_get_constraintdef(oid) like '%desk%' from pg_constraint where conname = 'site_overrides_section_allowed'), false)
      and exists (select 1 from pg_constraint where conname = 'site_overrides_desk_shape') as site_overrides_desk,
    exists (select 1 from pg_constraint where conname = 'member_stories_cover_shape')
      and not exists (select 1 from pg_constraint where conname = 'member_stories_cover_ours') as story_cover_shape,
    pg_get_functiondef('public.my_faves()'::regprocedure) like '%pack_visible%' as my_faves_visible,
    (select count(*) from pg_trigger where not tgisinternal and tgname = 'zz_desk_decided') = 5 as decided,
    (select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
       from unnest(array['public.desk_members()', 'public.desk_member_stuff(uuid)', 'public.desk_member_items(uuid,text,timestamptz)',
                         'public.desk_waiting()', 'public.desk_queue()', 'public.desk_mark_read(text,bigint)',
                         'public.wall_comment_edit(bigint,text)', 'public.take_comment_edit(bigint,text)', 'public.wall_source_withdraw(bigint)',
                         'public.roll_feed(integer,boolean)', 'public.wall_thread(text)', 'public.take_thread(text)',
                         'public.take_uncomment(bigint)', 'public.take_comment(text,text)']) as f) as desk_doors,
    (select bool_and(not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
       from unnest(array['public.desk_member_rows(uuid)', 'public.desk_member_list(uuid,text,timestamptz,integer)',
                         'public.desk_decided_stamp()', 'public.take_post_is_mine(text)', 'public.wall_fix_key(text,integer)']) as f) as helpers_hidden
),
nights (n, d, pat, label) as (values
  (1, date '2026-10-13', 'grey day|suicideboy', '10/13 Grey Day'),
  (2, date '2026-10-17', 'chainz',              '10/17 2 Chainz'),
  (3, date '2026-10-24', 'sick new world',      '10/24 Sick New World'),
  (4, date '2026-11-06', 'latto',               '11/06 Latto')
),
seen as (
  select g.n, g.label,
         exists (select 1 from public.calendar_dates c join public.profiles p on p.id = c.submitted_by
                  where c.on_date = g.d and c.title ~* g.pat and c.published and p.approved and public.card_shown(p.id)) as live,
         exists (select 1 from public.calendar_dates c where c.on_date = g.d and c.title ~* g.pat) as found
    from nights g
),
roll as (
  select count(*) as n, string_agg(p.id::text, ', ' order by p.id) as ids
    from public.posts p
   where p.image_url is not null and p.published and not p.members_only
     and p.created_at >= timestamptz '2026-10-11 11:21:00 America/Chicago'
),
info (n, what) as (
  select 0, 'His four nights published on the Run: ' || (select count(*) from seen where live) || ' of 4'
  union all
  select s.n, s.label || ': ' || case when s.live then 'found and published'
                                      when s.found then 'found but hidden: publish it on the board'
                                      else 'not on the Run: add it on the board' end
    from seen s
  union all
  select 5, 'Photo posts since the Roll opened (10/11 11:21 AM) that are still public: ' || r.n
            || case when r.n > 0 then ' (' || r.ids || '). To put one behind the door: update public.posts set members_only = true where id = <id>;' else '' end
    from roll r
  union all
  select 6, 'Waiting from before today, you may have said no to some: packs '
            || (select count(*) from public.packs p where not p.published and p.decided_at is null)
            || ', rooms ' || (select count(*) from public.rooms r where not r.published and r.decided_at is null)
            || ', picks ' || (select count(*) from public.rotation_tracks t where not t.published and t.decided_at is null)
            || ', comments ' || (select count(*) from public.word_entries e where not e.published and e.decided_at is null)
            || '. Mark all as seen clears a kind.'
)
(select 'verify: every column should say true' as what, v.* from v)
union all
(select i.what, v.* from info i left join v on false order by i.n);
