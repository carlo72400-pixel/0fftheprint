-- ============================================================================
-- 0FF THE PRINT, MIGRATION 002: the posting system (post / edit / delete)
-- Project ref: frqpvcpyglhmerwpvosl        Written: 2026-08-20
--
-- Paste the whole file into the Supabase SQL editor and hit Run. Safe to re-run.
-- Supersedes the posting half of schema.sql AND patch-identity-and-urls.sql.
--
-- CARRIES THE 2026-08-20 LIVE PATCH to guard_profile_privileges(). Section 0
-- keeps the exact "no auth.uid() and no request context means privileged"
-- escape hatch that made seeding the first admin possible. Running this file
-- can never lock him out again.
--
-- DEPLOY ORDER: run this SQL first, then push assets/js/desk.js, compose/,
-- desk/ and index.html in the same sitting. Uploads move to <uid>/name.ext,
-- so the old uploadImage starts failing the moment this lands.
-- ============================================================================

begin;

-- ============================================================================
-- SECTION 0, CALLER CONTEXT
-- One place that answers "is this caller allowed past the guards?"
-- ============================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$fn$;

create or replace function public.is_approved()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce((select p.approved from public.profiles p where p.id = auth.uid()), false);
$fn$;

-- The SAME normalizer the homepage uses (index.html slugify, line 3635).
-- Identity has to be compared the way it is rendered, or "-vamppsych" sneaks
-- past a uniqueness check on lower() and still paints as vamppsych.
create or replace function public.slugify(t text)
returns text language sql immutable
set search_path = pg_temp as $fn$
  select nullif(trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g')), '');
$fn$;

-- True only for a caller with NO PostgREST request context and NO signed-in
-- user: the SQL editor, psql, a migration. THIS IS THE 2026-08-20 PATCH,
-- factored out so it is stated once and cannot rot.
create or replace function public.direct_sql_caller()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(current_setting('request.jwt.claims', true), '') = ''
     and auth.uid() is null;
$fn$;

-- Direct SQL, or service_role, or a real admin. A request that HAS a JWT but
-- no auth.uid() (the anon key, a webhook, an Edge Function) is NOT privileged.
create or replace function public.privileged_caller()
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare claims text;
begin
  if public.direct_sql_caller() then
    return true;   -- removing this re-breaks admin seeding. Leave it.
  end if;
  claims := coalesce(current_setting('request.jwt.claims', true), '');
  begin
    if coalesce((claims::jsonb) ->> 'role', '') = 'service_role' then
      return true;
    end if;
  exception when others then
    null;  -- unparseable claims are simply not privileged
  end;
  return public.is_admin();
end;
$fn$;

-- Maps a public URL back to its object name, so the database can reason about
-- its own photos. Returns null for anything that is not one of ours.
create or replace function public.storage_object_name(p_url text)
returns text language sql immutable
set search_path = public, pg_temp as $fn$
  select case
    when p_url is null then null
    when position('/storage/v1/object/public/posts/' in p_url) = 0 then null
    else nullif(regexp_replace(split_part(p_url, '/storage/v1/object/public/posts/', 2),
                               '[?#].*$', ''), '')
  end;
$fn$;

revoke execute on function public.privileged_caller() from public, anon, authenticated;
revoke execute on function public.direct_sql_caller() from public, anon, authenticated;
grant  execute on function public.is_admin()     to anon, authenticated;
grant  execute on function public.is_approved()  to anon, authenticated;
grant  execute on function public.slugify(text)  to anon, authenticated;
grant  execute on function public.storage_object_name(text) to anon, authenticated;


-- ============================================================================
-- SECTION 1, PROFILES AND IDENTITY
-- card_slug decides whose name, avatar, seat and outbound link a post wears.
-- It is granted by the desk now, never self-served at signup.
-- ============================================================================

alter table public.profiles add column if not exists requested_slug text;

comment on column public.profiles.requested_slug is
  'The card this person asked for at signup. Display only. Never resolves
   identity. The desk copies it into card_slug when it approves them.';

-- Names nobody gets to self-assign, ever.
create table if not exists public.reserved_slugs (slug text primary key);
insert into public.reserved_slugs (slug) values
  ('vamppsych'), ('the-desk'), ('desk'), ('otp'), ('admin'),
  ('0ff-the-print'), ('off-the-print'), ('theprint')
on conflict (slug) do nothing;

alter table public.reserved_slugs enable row level security;
revoke all on public.reserved_slugs from anon, authenticated;

-- Collapse any duplicate slugs onto the oldest holder before indexing.
do $blk$
begin
  update public.profiles p
     set card_slug = null
   where p.card_slug is not null
     and exists (
       select 1 from public.profiles q
        where q.card_slug is not null
          and public.slugify(q.card_slug) = public.slugify(p.card_slug)
          and (q.created_at, q.id) < (p.created_at, p.id));
end;
$blk$;

-- A stored slug must already BE its normal form, so stored and rendered
-- identity can never diverge again.
alter table public.profiles drop constraint if exists profiles_card_slug_shape;
alter table public.profiles add constraint profiles_card_slug_shape
  check (card_slug is null or card_slug = public.slugify(card_slug)) not valid;

do $blk$
begin
  alter table public.profiles validate constraint profiles_card_slug_shape;
exception when others then
  raise notice 'profiles_card_slug_shape left NOT VALID: %', sqlerrm;
end;
$blk$;

drop index if exists public.profiles_card_slug_uniq;
create unique index profiles_card_slug_uniq
  on public.profiles (public.slugify(card_slug)) where card_slug is not null;

-- display_name is the byline whenever a member has no card yet, so it needs a
-- ceiling. 200KB of newlines used to be a legal name.
alter table public.profiles drop constraint if exists profiles_display_name_sane;
alter table public.profiles add constraint profiles_display_name_sane
  check (char_length(display_name) between 1 and 40
         and display_name !~ '[[:cntrl:]]'
         and btrim(display_name) = display_name) not valid;

do $blk$
begin
  alter table public.profiles validate constraint profiles_display_name_sane;
exception when others then
  raise notice 'profiles_display_name_sane left NOT VALID (fix the long names, then validate by hand): %', sqlerrm;
end;
$blk$;

-- Signup records what they asked for and grants nothing. card_slug stays null
-- until the desk hands it over. Four people will ever use this; one extra tap
-- from Gianni buys a whole class of impersonation going away.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  want_name text;
begin
  want_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  want_name := coalesce(want_name, split_part(new.email, '@', 1), 'NEW MEMBER');
  want_name := left(regexp_replace(want_name, '[[:cntrl:]]', '', 'g'), 40);
  if btrim(want_name) = '' then want_name := 'NEW MEMBER'; end if;

  insert into public.profiles (id, display_name, card_slug, requested_slug, approved, is_admin)
  values (
    new.id,
    btrim(want_name),
    null,
    public.slugify(nullif(btrim(new.raw_user_meta_data ->> 'card_slug'), '')),
    false,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- THE GUARD, patch carried forward and widened. id, approved, is_admin,
-- card_slug, requested_slug and created_at are desk-only. display_name stays
-- theirs, unless they try to wear a reserved name or somebody else's card.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.privileged_caller() then
    new.id             := old.id;
    new.approved       := old.approved;
    new.is_admin       := old.is_admin;
    new.card_slug      := old.card_slug;
    new.requested_slug := old.requested_slug;
    new.created_at     := old.created_at;

    if new.display_name is distinct from old.display_name then
      if exists (select 1 from public.reserved_slugs r
                  where r.slug = public.slugify(new.display_name))
         or exists (select 1 from public.profiles q
                     where q.id <> old.id
                       and q.card_slug is not null
                       and public.slugify(q.card_slug) = public.slugify(new.display_name))
      then
        new.display_name := old.display_name;   -- reverts, does not error
      end if;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "approved profiles are public" on public.profiles;
create policy "approved profiles are public" on public.profiles
  for select using (approved = true);

drop policy if exists "admin reads all profiles" on public.profiles;
create policy "admin reads all profiles" on public.profiles
  for select using (public.is_admin());

drop policy if exists "own display name" on public.profiles;
create policy "own display name" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "admin updates profiles" on public.profiles;
create policy "admin updates profiles" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- is_admin stops being a public column. Before this, anyone holding the
-- publishable key could ask profiles?select=*&is_admin=eq.true and get the
-- owner's name and auth UUID back. Signed-in members could too.
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, card_slug, approved) on public.profiles to anon;
grant select (id, display_name, card_slug, approved, created_at) on public.profiles to authenticated;
-- `approved` is granted because the security_invoker feed view reads it in the
-- "approved profiles are public" predicate, and every row anon can see is
-- approved = true by definition. is_admin and requested_slug are the ones that
-- stop being readable. posts keeps its full SELECT grant on purpose: the view
-- joins on p.author_id and a joined column needs the privilege, but the view
-- does not return it.

-- The caller's own row, is_admin included, without granting the column.
create or replace function public.my_profile()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.created_at
    from public.profiles p
   where p.id = auth.uid();
$fn$;

-- The desk's roster. Returns nothing at all to a non-admin.
create or replace function public.desk_profiles()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.created_at
    from public.profiles p
   where public.is_admin()
   order by p.created_at desc;
$fn$;

-- Hand somebody a card. Desk only. Empty string or null takes the card away.
create or replace function public.admin_set_card(p_id uuid, p_slug text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare s text;
begin
  if not public.is_admin() then
    raise exception 'Desk only.' using errcode = '42501';
  end if;
  s := public.slugify(p_slug);
  if s is not null and exists (select 1 from public.profiles q
                                where q.id <> p_id
                                  and q.card_slug is not null
                                  and public.slugify(q.card_slug) = s) then
    raise exception 'Somebody already holds that card.' using errcode = '55000';
  end if;
  update public.profiles set card_slug = s where id = p_id;
  return s;
end;
$fn$;

revoke execute on function public.my_profile()               from public, anon;
revoke execute on function public.desk_profiles()            from public, anon;
revoke execute on function public.admin_set_card(uuid, text) from public, anon;
grant  execute on function public.my_profile()               to authenticated;
grant  execute on function public.desk_profiles()            to authenticated;
grant  execute on function public.admin_set_card(uuid, text) to authenticated;


-- ============================================================================
-- SECTION 2, POSTS: COLUMNS, CONSTRAINTS, INDEXES
-- ============================================================================

alter table public.posts add column if not exists edited_at  timestamptz;
alter table public.posts add column if not exists pulled_at  timestamptz;
alter table public.posts add column if not exists pull_batch uuid;
alter table public.posts add column if not exists was_pinned boolean not null default false;

comment on column public.posts.edited_at is
  'Database owned. Written only by the guard triggers. Any value a client sends
   is discarded. Null means never edited.';
comment on column public.posts.was_pinned is
  'Remembers that a post held the pin when it got pulled, so the desk knows
   which one to offer re-pinning after a restore.';

alter table public.posts drop constraint if exists posts_image_alt_len;
alter table public.posts add constraint posts_image_alt_len
  check (image_alt is null or char_length(image_alt) <= 300) not valid;

-- Drop EVERY older image_url check, whatever it got named: the inline one from
-- schema.sql's create table, and posts_image_url_is_ours from the 8/20 patch.
do $blk$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.posts'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%storage/v1/object/public/posts%'
  loop
    execute format('alter table public.posts drop constraint %I', c.conname);
  end loop;
end;
$blk$;

-- The photo must live in the POSTER'S OWN folder. Prefix-only was not enough:
-- pointing your post at somebody else's object made their photo undeletable by
-- them and kept it serving after they took their own post down.
alter table public.posts add constraint posts_image_url_ours
  check (
    image_url is null
    or (
      image_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/'
                     || author_id::text || '/%'
      and image_url not like '%..%'
      and image_url !~ '[[:space:]]'
      and char_length(image_url) <= 400
    )
  ) not valid;

do $blk$
begin
  alter table public.posts validate constraint posts_image_alt_len;
exception when others then
  raise notice 'posts_image_alt_len left NOT VALID: %', sqlerrm;
end;
$blk$;

do $blk$
begin
  alter table public.posts validate constraint posts_image_url_ours;
exception when others then
  raise notice 'posts_image_url_ours left NOT VALID (old rows point outside their own folder): %', sqlerrm;
end;
$blk$;

create index if not exists posts_feed_idx   on public.posts (pinned desc, created_at desc) where published;
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_batch_idx  on public.posts (pull_batch) where pull_batch is not null;

-- At most one pinned post, and only among LIVE ones. Without the published
-- term a pulled post keeps squatting the pin slot and the next pin errors on a
-- competitor nobody can see.
do $blk$
begin
  update public.posts set pinned = false
   where pinned
     and id <> (select id from public.posts where pinned
                 order by published desc, created_at desc, id desc limit 1);
  update public.posts set pinned = false where pinned and not published;
end;
$blk$;

drop index if exists public.posts_one_pinned;
create unique index posts_one_pinned on public.posts ((pinned)) where pinned and published;


-- ============================================================================
-- SECTION 3, THE RECORD: archive, revisions, rate ledger
-- Nothing a member does destroys the only copy of anything.
-- ============================================================================

create table if not exists public.post_archive (
  id          bigint primary key,
  author_id   uuid not null,
  text        text not null,
  image_url   text,
  image_alt   text,
  created_at  timestamptz,
  deleted_at  timestamptz not null default now(),
  deleted_by  uuid default auth.uid()
);

create table if not exists public.post_revisions (
  rev         bigint generated always as identity primary key,
  post_id     bigint not null,
  text        text not null,
  image_url   text,
  image_alt   text,
  replaced_at timestamptz not null default now(),
  replaced_by uuid default auth.uid()
);
create index if not exists post_revisions_post_idx on public.post_revisions (post_id, replaced_at desc);

alter table public.post_archive   enable row level security;
alter table public.post_revisions enable row level security;

drop policy if exists "admin reads archive" on public.post_archive;
create policy "admin reads archive" on public.post_archive
  for select using (public.is_admin());

drop policy if exists "admin reads revisions" on public.post_revisions;
create policy "admin reads revisions" on public.post_revisions
  for select using (public.is_admin());

revoke all on public.post_archive   from anon, authenticated;
revoke all on public.post_revisions from anon, authenticated;
grant select on public.post_archive   to authenticated;
grant select on public.post_revisions to authenticated;

-- Append only. Deleting your posts must not reset your own rate limit, so the
-- counter cannot live in the posts table. No policies, so PostgREST cannot
-- touch this at all; only the SECURITY DEFINER trigger writes it.
create table if not exists public.post_events (
  id        bigint generated always as identity primary key,
  author_id uuid not null,
  at        timestamptz not null default now()
);
create index if not exists post_events_author_idx on public.post_events (author_id, at desc);
alter table public.post_events enable row level security;
revoke all on public.post_events from anon, authenticated;


-- ============================================================================
-- SECTION 4, THE GUARD TRIGGERS
-- Members own three columns: text, image_url, image_alt. Nothing else.
-- RLS WITH CHECK only sees the new row, so it can never say "pinned must equal
-- what it was". That is why these are triggers and not policies. They REVERT
-- rather than error, so a console call resolves cleanly and changes nothing.
-- ============================================================================

create or replace function public.guard_post_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  recent  int;
  today   int;
  norm    text;
begin
  if not public.direct_sql_caller() then
    new.edited_at := null;   -- never client set, admin included
  end if;

  new.text := replace(new.text, chr(8212), ',');   -- em-dash reads as AI

  if not public.privileged_caller() then
    new.author_id  := coalesce(auth.uid(), new.author_id);
    new.created_at := now();      -- no future dating a permanent top slot
    new.pinned     := false;      -- the pin is the desk's to give
    new.published  := true;
    new.pulled_at  := null;
    new.pull_batch := null;
    new.was_pinned := false;

    -- The photo has to be theirs. Belt for the CHECK, and it fails loudly
    -- with a sentence instead of a constraint name.
    if new.image_url is not null
       and split_part(coalesce(public.storage_object_name(new.image_url), ''), '/', 1)
           is distinct from coalesce(auth.uid()::text, '') then
      raise exception 'That photo is not yours.' using errcode = '42501';
    end if;

    -- A pull has to be a hold. Every published guard used to sit on the UPDATE
    -- path, so a pulled post came straight back as a fresh insert.
    norm := regexp_replace(lower(new.text), '[^a-z0-9]', '', 'g');
    if exists (
      select 1 from public.posts q
       where q.author_id = new.author_id
         and q.published = false
         and (
           (new.image_url is not null and q.image_url = new.image_url)
           or (char_length(norm) >= 8
               and regexp_replace(lower(q.text), '[^a-z0-9]', '', 'g') = norm)
         )
    ) then
      raise exception 'The desk pulled this one. Talk to Gianni before it goes back up.'
        using errcode = '42501';
    end if;

    select count(*) into recent from public.post_events
     where author_id = new.author_id and at > now() - interval '10 minutes';
    if recent >= 4 then
      raise exception 'Slow down. Four posts every ten minutes is the ceiling.'
        using errcode = '55000';
    end if;

    select count(*) into today from public.post_events
     where author_id = new.author_id and at > now() - interval '24 hours';
    if today >= 20 then
      raise exception 'That is twenty posts today. Go outside, we will still be here.'
        using errcode = '55000';
    end if;

    insert into public.post_events (author_id) values (new.author_id);
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_posts_guard_insert on public.posts;
create trigger trg_posts_guard_insert
  before insert on public.posts
  for each row execute function public.guard_post_insert();

create or replace function public.guard_post_update()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare content_changed boolean;
begin
  -- ONLY normalize when the caller actually touched the text. Unconditional,
  -- this rewrote old posts on a pull or a pin and then stamped them "edited".
  if new.text is distinct from old.text then
    new.text := replace(new.text, chr(8212), ',');
  end if;

  if not public.privileged_caller() then
    new.id         := old.id;
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
    new.pinned     := old.pinned;      -- no seizing the hero slot
    new.published  := old.published;   -- a pull by the desk stays pulled
    new.pulled_at  := old.pulled_at;
    new.pull_batch := old.pull_batch;
    new.was_pinned := old.was_pinned;

    if new.image_url is not null
       and new.image_url is distinct from old.image_url
       and split_part(coalesce(public.storage_object_name(new.image_url), ''), '/', 1)
           is distinct from coalesce(auth.uid()::text, '') then
      raise exception 'That photo is not yours.' using errcode = '42501';
    end if;
  end if;

  -- A post going dark gives up the pin, so the slot is never squatted by
  -- something nobody can see, and Restore does not silently land on top.
  if old.published and not new.published then
    new.was_pinned := old.pinned;
    new.pinned     := false;
    new.pulled_at  := coalesce(new.pulled_at, now());
  elsif not old.published and new.published then
    new.pulled_at  := null;
    new.pull_batch := null;
  end if;

  -- edited_at belongs to the database. Whatever a client PATCHed is dropped,
  -- admin included, so the marker cannot be dodged or backdated from the site.
  if not public.direct_sql_caller() then
    content_changed :=
         new.text      is distinct from old.text
      or new.image_url is distinct from old.image_url
      or new.image_alt is distinct from old.image_alt;
    if content_changed then
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;   -- a pin or a pull is not an edit
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_posts_guard_update on public.posts;
create trigger trg_posts_guard_update
  before update on public.posts
  for each row execute function public.guard_post_update();

-- Keep the words that were actually written. Fires AFTER the guard because
-- 'g' sorts before 's' and same-timing triggers run in name order.
create or replace function public.snapshot_post()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if new.text is distinct from old.text
     or new.image_url is distinct from old.image_url
     or new.image_alt is distinct from old.image_alt then
    insert into public.post_revisions (post_id, text, image_url, image_alt)
    values (old.id, old.text, old.image_url, old.image_alt);
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_posts_snapshot on public.posts;
create trigger trg_posts_snapshot
  before update on public.posts
  for each row execute function public.snapshot_post();

create or replace function public.archive_post()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  insert into public.post_archive (id, author_id, text, image_url, image_alt, created_at)
  values (old.id, old.author_id, old.text, old.image_url, old.image_alt, old.created_at)
  on conflict (id) do nothing;
  return old;
end;
$fn$;

drop trigger if exists trg_posts_archive on public.posts;
create trigger trg_posts_archive
  before delete on public.posts
  for each row execute function public.archive_post();


-- ============================================================================
-- SECTION 5, POSTS POLICIES
-- ============================================================================

alter table public.posts enable row level security;

drop policy if exists "anyone reads published posts" on public.posts;
create policy "anyone reads published posts" on public.posts
  for select using (published = true);

drop policy if exists "author reads own posts" on public.posts;
create policy "author reads own posts" on public.posts
  for select using (auth.uid() = author_id);

drop policy if exists "admin reads all posts" on public.posts;
create policy "admin reads all posts" on public.posts
  for select using (public.is_admin());

drop policy if exists "approved members post" on public.posts;
create policy "approved members post" on public.posts
  for insert with check (auth.uid() = author_id and public.is_approved());

drop policy if exists "author edits own posts" on public.posts;
create policy "author edits own posts" on public.posts
  for update using (auth.uid() = author_id and public.is_approved() and published = true)
  with check (auth.uid() = author_id);

-- Delete is narrower than edit on purpose. published = true means once the
-- desk pulls something only the desk can destroy it. is_approved() means
-- revoking somebody freezes their history instead of handing them a one call
-- wipe of everything they ever wrote.
drop policy if exists "author deletes own posts" on public.posts;
create policy "author deletes own posts" on public.posts
  for delete using (auth.uid() = author_id and public.is_approved() and published = true);

drop policy if exists "admin manages posts" on public.posts;
create policy "admin manages posts" on public.posts
  for all using (public.is_admin()) with check (public.is_admin());

-- One click in Auth > Users used to cascade through profiles into posts and
-- shred somebody's whole history plus every photo. Make that deliberate.
do $blk$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.posts'::regclass
       and contype = 'f'
       and pg_get_constraintdef(oid) like '%author_id%'
  loop
    execute format('alter table public.posts drop constraint %I', c.conname);
  end loop;
end;
$blk$;

alter table public.posts add constraint posts_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete restrict;


-- ============================================================================
-- SECTION 6, THE VIEWS
-- ============================================================================

drop view if exists public.feed;

-- security_invoker: the feed stops bypassing RLS. Bonus worth having, a
-- revoked member's profile stops matching "approved profiles are public", the
-- join drops, and their posts leave the homepage the second you revoke them.
create view public.feed
with (security_invoker = on) as
  select p.id, p.text, p.image_url, p.image_alt, p.pinned,
         p.created_at, p.edited_at,
         pr.display_name, pr.card_slug
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
   where p.published = true
   order by p.pinned desc, p.created_at desc;

grant select on public.feed to anon, authenticated;

comment on view public.feed is
  'Public timeline. security_invoker, so anonymous readers see it through the
   anon RLS policies. Do not add author_id. The client must restate ORDER BY on
   the query: a view ORDER BY is not guaranteed to survive LIMIT.';

-- Visibility is decided by TWO columns now (posts.published and the author
-- being approved). The desk has to see the combination or it will show a post
-- as live that no visitor can load.
drop view if exists public.desk_posts;
create view public.desk_posts
with (security_invoker = on) as
  select p.id, p.author_id, p.text, p.image_url, p.image_alt,
         p.pinned, p.published, p.created_at, p.edited_at,
         p.pulled_at, p.pull_batch, p.was_pinned,
         pr.display_name, pr.card_slug,
         pr.approved as author_approved,
         (p.published and pr.approved) as publicly_visible
    from public.posts p
    join public.profiles pr on pr.id = p.author_id;

revoke all on public.desk_posts from anon;
grant select on public.desk_posts to authenticated;


-- ============================================================================
-- SECTION 7, STORAGE
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', true, 8388608,
        array['image/jpeg','image/jpg','image/png','image/webp','image/gif',
              'image/heic','image/heif','image/avif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- image/jpg is in the list on purpose. The client now sends an explicit
-- contentType, but plenty of Android pickers report image/jpg and there is no
-- reason for a member's photo to bounce over a spelling.

create or replace function public.post_image_in_use(p_name text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from public.posts
     where image_url is not null
       and public.storage_object_name(image_url) = p_name);
$fn$;

grant execute on function public.post_image_in_use(text)   to authenticated;

drop policy if exists "post images are public" on storage.objects;
create policy "post images are public" on storage.objects
  for select using (bucket_id = 'posts');

-- Uploads land in the member's own folder, one level deep, with a real image
-- extension. Ownership reads off the path, so nothing depends on the
-- deprecated storage.objects.owner column.
drop policy if exists "approved members upload" on storage.objects;
create policy "approved members upload" on storage.objects
  for insert with check (
    bucket_id = 'posts'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp|gif|heic|heif|avif)$'
  );

drop policy if exists "members delete own uploads" on storage.objects;
create policy "members delete own uploads" on storage.objects
  for delete using (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not public.post_image_in_use(name)
  );

-- "If I'm on the admin account, I have full control." True of the files now.
-- Without this the desk could delete a post and the photo kept serving at its
-- public URL forever.
drop policy if exists "admin deletes any upload" on storage.objects;
create policy "admin deletes any upload" on storage.objects
  for delete using (bucket_id = 'posts' and public.is_admin());

-- Still no UPDATE policy on storage.objects, so overwriting a live image in
-- place stays impossible. Leave it that way.


-- ============================================================================
-- SECTION 8, TAKEDOWN TAKES THE PHOTO DOWN
-- The trigger QUEUES the orphan. It does not delete storage rows itself.
-- Deleting from storage.objects in SQL makes the URL 404 but never reclaims
-- the stored file, and once the metadata row is gone nothing can list it, so
-- the free tier bucket fills with files that cannot be found or purged.
-- The desk drains this queue through the Storage API, which deletes both.
-- ============================================================================

create table if not exists public.orphan_images (
  object_name text primary key,
  reason      text,
  created_at  timestamptz not null default now(),
  cleared     boolean not null default false
);

alter table public.orphan_images enable row level security;

drop policy if exists "admin reads orphans" on public.orphan_images;
create policy "admin reads orphans" on public.orphan_images
  for select using (public.is_admin());

drop policy if exists "admin clears orphans" on public.orphan_images;
create policy "admin clears orphans" on public.orphan_images
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin deletes orphans" on public.orphan_images;
create policy "admin deletes orphans" on public.orphan_images
  for delete using (public.is_admin());

revoke all on public.orphan_images from anon, authenticated;
grant select, update, delete on public.orphan_images to authenticated;

create or replace function public.posts_cleanup_image()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  gone_name  text;
  still_used boolean;
begin
  if tg_op = 'DELETE' then
    gone_name := public.storage_object_name(old.image_url);
  else
    if new.image_url is not distinct from old.image_url then
      return null;
    end if;
    gone_name := public.storage_object_name(old.image_url);
  end if;

  if gone_name is null then
    return null;
  end if;

  -- Same author only. A row belonging to somebody else can no longer reference
  -- this object at all (posts_image_url_ours), and pretending otherwise is how
  -- a foreign reference used to keep a photo alive against its owner.
  select exists (
    select 1 from public.posts
     where id <> old.id
       and author_id = old.author_id
       and image_url is not null
       and public.storage_object_name(image_url) = gone_name
  ) into still_used;

  if still_used then
    return null;
  end if;

  insert into public.orphan_images (object_name, reason)
  values (gone_name,
          case when tg_op = 'DELETE' then 'post deleted' else 'photo replaced' end)
  on conflict (object_name) do update
    set reason = excluded.reason, cleared = false, created_at = now();

  return null;
end;
$fn$;

drop trigger if exists trg_posts_cleanup_image_del on public.posts;
create trigger trg_posts_cleanup_image_del
  after delete on public.posts
  for each row execute function public.posts_cleanup_image();

drop trigger if exists trg_posts_cleanup_image_upd on public.posts;
create trigger trg_posts_cleanup_image_upd
  after update of image_url on public.posts
  for each row execute function public.posts_cleanup_image();


-- ============================================================================
-- SECTION 9, DESK ONLY ACTIONS
-- ============================================================================

-- Pin exactly one live post, atomically, without tripping posts_one_pinned.
create or replace function public.admin_set_pinned(p_id bigint, p_on boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then
    raise exception 'Desk only.' using errcode = '42501';
  end if;

  if p_on then
    -- Never republish as a side effect of pinning. This used to hard-code
    -- published = true, so a mis-tap put a pulled post back on the homepage.
    if not exists (select 1 from public.posts where id = p_id and published) then
      raise exception 'That one is pulled. Put it back first, then pin it.'
        using errcode = '55000';
    end if;
    update public.posts set pinned = false where pinned and id <> p_id;
    update public.posts set pinned = true  where id = p_id;
  else
    update public.posts set pinned = false where id = p_id;
  end if;
end;
$fn$;

-- Pull everything one person ever posted, in one press, reversibly.
create or replace function public.admin_pull_author(p_author uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare b uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'Desk only.' using errcode = '42501';
  end if;
  update public.posts
     set published = false, pull_batch = b
   where author_id = p_author and published;
  return b;
end;
$fn$;

-- The way back. Restores exactly the posts one press took down, and nothing
-- he had already pulled on purpose months ago.
create or replace function public.admin_restore_batch(p_batch uuid)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Desk only.' using errcode = '42501';
  end if;
  update public.posts set published = true where pull_batch = p_batch;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- Revoke and take the feed down in one move, instead of deleting the person
-- in the Auth dashboard and shredding the record.
create or replace function public.admin_retire_member(p_author uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare b uuid;
begin
  if not public.is_admin() then
    raise exception 'Desk only.' using errcode = '42501';
  end if;
  if p_author = auth.uid() then
    raise exception 'That is you. Pick somebody else.' using errcode = '55000';
  end if;
  update public.profiles set approved = false where id = p_author;
  b := public.admin_pull_author(p_author);
  return b;
end;
$fn$;

revoke execute on function public.admin_set_pinned(bigint, boolean) from public, anon;
revoke execute on function public.admin_pull_author(uuid)           from public, anon;
revoke execute on function public.admin_restore_batch(uuid)         from public, anon;
revoke execute on function public.admin_retire_member(uuid)         from public, anon;
grant  execute on function public.admin_set_pinned(bigint, boolean) to authenticated;
grant  execute on function public.admin_pull_author(uuid)           to authenticated;
grant  execute on function public.admin_restore_batch(uuid)         to authenticated;
grant  execute on function public.admin_retire_member(uuid)         to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- AFTER RUNNING, from the SQL editor:
--
--   select id, pinned, published, created_at, edited_at from public.posts;
--   select * from public.feed;                 -- must still return rows
--   select id, display_name, card_slug, requested_slug, approved, is_admin
--     from public.profiles;                    -- Gio still approved + admin
--   select * from public.orphan_images where not cleared;   -- expect zero
--
-- Then re-seed yourself if anything looks off. This still works, and that is
-- the whole point of keeping direct_sql_caller():
--
--   update public.profiles set approved = true, is_admin = true
--    where card_slug = 'vamppsych';
-- ============================================================================
