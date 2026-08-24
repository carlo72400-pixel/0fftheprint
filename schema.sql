-- 0FF THE PRINT — the timeline backend.
-- Paste this whole file into Supabase SQL Editor and hit Run. Safe to re-run.
--
-- The rule this enforces: nobody posts until Gianni approves them, and that gate
-- lives in the database, not in the web page, so it holds no matter what someone
-- does in their browser.

-- ============================================================
-- PROFILES — one row per person, created automatically on signup
-- ============================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'NEW MEMBER',
  card_slug     text,                       -- ties them to their card art
  approved      boolean not null default false,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- a new signup gets a profile automatically, unapproved
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, card_slug)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'card_slug'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- who is an admin, without recursive policy lookups
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select approved from public.profiles where id = auth.uid()), false);
$$;

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
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "admin updates profiles" on public.profiles;
create policy "admin updates profiles" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Nobody can hand themselves approval or admin. Only an admin can move those two
-- columns, and this trigger is what actually guarantees it.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() is NULL in the Supabase SQL editor. If we guarded that path too,
  -- the very first admin could never be seeded (it bit us once already).
  if auth.uid() is not null and not public.is_admin() then
    new.approved   := old.approved;
    new.is_admin   := old.is_admin;
    -- card_slug IS the identity key: the timeline resolves name, avatar and seat
    -- from it. Member-writable meant a member could wear somebody else's face.
    new.card_slug  := old.card_slug;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ============================================================
-- POSTS
-- ============================================================
create table if not exists public.posts (
  id          bigint generated always as identity primary key,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 800),
  -- image_url lands in an <a href> on a page strangers load, and HTML escaping
  -- does not stop "javascript:". Constrained to our own bucket, nothing else.
  image_url   text check (
                image_url is null
                or image_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/%'
              ),
  image_alt   text,
  pinned      boolean not null default false,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists posts_created_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

drop policy if exists "anyone reads published posts" on public.posts;
create policy "anyone reads published posts" on public.posts
  for select using (published = true);

drop policy if exists "author reads own posts" on public.posts;
create policy "author reads own posts" on public.posts
  for select using (auth.uid() = author_id);

-- THE GATE: you must be approved, and you can only post as yourself
drop policy if exists "approved members post" on public.posts;
create policy "approved members post" on public.posts
  for insert with check (auth.uid() = author_id and public.is_approved());

drop policy if exists "author edits own posts" on public.posts;
create policy "author edits own posts" on public.posts
  for update using (auth.uid() = author_id and public.is_approved())
  with check (auth.uid() = author_id);

drop policy if exists "author deletes own posts" on public.posts;
create policy "author deletes own posts" on public.posts
  for delete using (auth.uid() = author_id);

drop policy if exists "admin manages posts" on public.posts;
create policy "admin manages posts" on public.posts
  for all using (public.is_admin()) with check (public.is_admin());

-- a public view so the feed can read author info without exposing the table
create or replace view public.feed as
  select p.id, p.text, p.image_url, p.image_alt, p.pinned, p.created_at,
         pr.display_name, pr.card_slug
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.published = true
  order by p.pinned desc, p.created_at desc;

-- ============================================================
-- IMAGE STORAGE
-- ============================================================
insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict (id) do nothing;

drop policy if exists "post images are public" on storage.objects;
create policy "post images are public" on storage.objects
  for select using (bucket_id = 'posts');

drop policy if exists "approved members upload" on storage.objects;
create policy "approved members upload" on storage.objects
  for insert with check (bucket_id = 'posts' and public.is_approved());

drop policy if exists "members delete own uploads" on storage.objects;
create policy "members delete own uploads" on storage.objects
  for delete using (bucket_id = 'posts' and owner = auth.uid());
