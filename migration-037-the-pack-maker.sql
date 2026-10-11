-- ============================================================
-- 037 · THE PACK MAKER + I'M IN THIS ONE (10/11, his picks off the Photos brainstorm:
-- "make it so people can make their own packs ... their own rarities based on the photos",
-- "a tool for other photographers or artists ... drop an art pack", "you can favorite people's
-- pictures", and the wildcard "I'm in this one").
-- ============================================================
-- PACKS. A member builds a pack: a title, a line, three to twelve photos, each with a rarity the
-- maker picks (common, rare, holo, fullart, hit; at most one hit, the chase). Photos go to the
-- `packs` bucket under the member's own folder. A pack is PRE-MODERATED like a story: every save
-- by a member puts it back to published = false and the desk flips it; the desk's own packs
-- publish on save. Anyone can open a published pack; the maker and the desk can open one that is
-- not. Members favourite cards (one row each), counts are public, who favourited is not.
-- FRAME TAGS. A member marks "I'm in this one" on a frame of a house night (events/<slug>/).
-- Their own list is theirs; other members see it on the member's page; strangers see nothing.
-- Every table has RLS on with no policies and no grants: the functions below are the only door.
-- Safe to run twice. Nothing here drops or deletes anything.
-- ============================================================

create table if not exists public.packs (
  id         bigserial primary key,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  title      text not null check (char_length(btrim(title)) between 2 and 60),
  line       text not null default '' check (char_length(line) <= 200),
  cover      text not null default '',
  published  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.packs enable row level security;
revoke all on table public.packs from public, anon, authenticated;
create index if not exists packs_author_idx on public.packs (author_id);

create table if not exists public.pack_cards (
  id       bigserial primary key,
  pack_id  bigint not null references public.packs(id) on delete cascade,
  idx      integer not null check (idx between 0 and 11),
  image    text not null check (image ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$'),
  rarity   text not null default 'common' check (rarity in ('common', 'rare', 'holo', 'fullart', 'hit')),
  caption  text not null default '' check (char_length(caption) <= 140),
  unique (pack_id, idx)
);
alter table public.pack_cards enable row level security;
revoke all on table public.pack_cards from public, anon, authenticated;
create unique index if not exists pack_cards_one_hit on public.pack_cards (pack_id) where rarity = 'hit';

create table if not exists public.pack_faves (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id    bigint not null references public.pack_cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
alter table public.pack_faves enable row level security;
revoke all on table public.pack_faves from public, anon, authenticated;

create table if not exists public.frame_tags (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_slug text not null check (event_slug ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$'),
  frame      integer not null check (frame between 0 and 999),
  created_at timestamptz not null default now(),
  primary key (user_id, event_slug, frame)
);
alter table public.frame_tags enable row level security;
revoke all on table public.frame_tags from public, anon, authenticated;

-- ---------- the bucket: a member's pack photos, own folder, forty a day ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('packs', 'packs', true, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 6291456,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create or replace function public.pack_image_in_use(p_name text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.pack_cards c where c.image = p_name)
      or exists (select 1 from public.packs p where p.cover = p_name);
$fn$;
revoke execute on function public.pack_image_in_use(text) from public, anon, authenticated;

drop policy if exists "pack photos are public" on storage.objects;
create policy "pack photos are public" on storage.objects
  for select using (bucket_id = 'packs');

drop policy if exists "members upload pack photos" on storage.objects;
create policy "members upload pack photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'packs'
    and public.is_wall_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$'
    and public.uploads_today('packs') < 40
  );

drop policy if exists "members delete own pack photos" on storage.objects;
create policy "members delete own pack photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'packs'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and not public.pack_image_in_use(name));

drop policy if exists "admin deletes any pack photo" on storage.objects;
create policy "admin deletes any pack photo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'packs' and public.is_admin());

-- ---------- who may see a pack ----------
create or replace function public.pack_visible(p_pack bigint)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.packs p
                  where p.id = p_pack
                    and ((p.published and public.wall_member(p.author_id))
                         or p.author_id = auth.uid()
                         or coalesce(public.is_admin(), false)));
$fn$;
revoke execute on function public.pack_visible(bigint) from public, anon, authenticated;

-- ---------- the shelf: every pack anyone may see, newest first ----------
create or replace function public.packs_list()
returns table (id bigint, slug text, title text, line text, cover text, published boolean, created_at timestamptz,
               author text, kind text, sid text, card_slug text, cards integer, faves integer, has_hit boolean, mine boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.slug, p.title, p.line,
         case when p.cover <> '' then p.cover else coalesce((select c.image from public.pack_cards c where c.pack_id = p.id order by c.idx limit 1), '') end,
         p.published, p.created_at,
         coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
         case when pr.is_admin then 'desk' when pr.approved then 'card' else 'member' end,
         case when public.wall_open(pr.id) then public.wall_sid(pr.id) end,
         case when pr.approved or pr.is_admin then pr.card_slug end,
         (select count(*) from public.pack_cards c where c.pack_id = p.id)::int,
         (select count(*) from public.pack_faves f join public.pack_cards c on c.id = f.card_id where c.pack_id = p.id)::int,
         exists (select 1 from public.pack_cards c where c.pack_id = p.id and c.rarity = 'hit'),
         coalesce(p.author_id = auth.uid(), false)
    from public.packs p
    join public.profiles pr on pr.id = p.author_id
   where public.pack_visible(p.id)
   order by p.published desc, p.created_at desc
   limit 200;
$fn$;
grant execute on function public.packs_list() to anon, authenticated;

-- ---------- one pack, opened ----------
create or replace function public.pack_open(p_slug text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case when public.pack_visible(p.id) then jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title, 'line', p.line, 'cover', p.cover, 'published', p.published, 'created_at', p.created_at,
    'author', coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
    'kind', case when pr.is_admin then 'desk' when pr.approved then 'card' else 'member' end,
    'sid', case when public.wall_open(pr.id) then public.wall_sid(pr.id) end,
    'card_slug', case when pr.approved or pr.is_admin then pr.card_slug end,
    'mine', coalesce(p.author_id = auth.uid(), false),
    'cards', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'idx', c.idx, 'image', c.image, 'rarity', c.rarity, 'caption', c.caption,
                        'faves', (select count(*) from public.pack_faves f where f.card_id = c.id),
                        'mine', exists (select 1 from public.pack_faves f where f.card_id = c.id and f.user_id = auth.uid())) order by c.idx)
                      from public.pack_cards c where c.pack_id = p.id), '[]'::jsonb)) end
    from public.packs p join public.profiles pr on pr.id = p.author_id
   where p.slug = p_slug;
$fn$;
grant execute on function public.packs_list() to anon, authenticated;
grant execute on function public.pack_open(text) to anon, authenticated;

-- ---------- make or change your own pack ----------
-- p = {id?, title, line?, cover?, cards:[{image, rarity?, caption?}, ...]} ; returns the slug.
-- A member's save always lands unpublished (the desk flips it); the desk's own saves publish.
create or replace function public.pack_save(p jsonb)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  uid     uuid := auth.uid();
  adm     boolean := coalesce(public.is_admin(), false);
  pid     bigint := nullif(p->>'id', '')::bigint;
  ttl     text := btrim(coalesce(p->>'title', ''));
  ln      text := btrim(coalesce(p->>'line', ''));
  cov     text := btrim(coalesce(p->>'cover', ''));
  cards   jsonb := coalesce(p->'cards', '[]'::jsonb);
  n       integer := jsonb_array_length(coalesce(p->'cards', '[]'::jsonb));
  hits    integer;
  c       jsonb;
  i       integer := 0;
  s       text;
  base    text;
  img     text;
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if not coalesce(public.is_wall_member(), false) then raise exception 'Members make packs.' using errcode = '42501'; end if;
  if char_length(ttl) < 2 or char_length(ttl) > 60 then raise exception 'Give it a title, 2 to 60 letters.' using errcode = '22023'; end if;
  if char_length(ln) > 200 then raise exception 'Keep the line under 200 letters.' using errcode = '22023'; end if;
  if jsonb_typeof(cards) <> 'array' or n < 3 or n > 12 then raise exception 'A pack is 3 to 12 photos.' using errcode = '22023'; end if;
  select count(*) into hits from jsonb_array_elements(cards) x where x->>'rarity' = 'hit';
  if hits > 1 then raise exception 'One hit per pack.' using errcode = '22023'; end if;
  for c in select * from jsonb_array_elements(cards) loop
    img := c->>'image';
    if img is null or img !~* ('^' || uid::text || '/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$') then
      raise exception 'Every photo has to be one you uploaded here.' using errcode = '22023';
    end if;
    if coalesce(c->>'rarity', 'common') not in ('common', 'rare', 'holo', 'fullart', 'hit') then raise exception 'Pick a rarity off the list.' using errcode = '22023'; end if;
    if char_length(coalesce(c->>'caption', '')) > 140 then raise exception 'Captions stop at 140 letters.' using errcode = '22023'; end if;
  end loop;
  if cov <> '' and cov !~* ('^' || uid::text || '/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$') then
    raise exception 'The cover has to be one of your photos.' using errcode = '22023';
  end if;

  if pid is null then
    if (select count(*) from public.packs x where x.author_id = uid) >= 20 then raise exception 'Twenty packs is the ceiling. Take one down first.' using errcode = '22023'; end if;
    base := trim(both '-' from regexp_replace(lower(ttl), '[^a-z0-9]+', '-', 'g'));
    if char_length(base) < 3 then base := 'pack'; end if;
    base := left(base, 48);
    loop
      s := base || '-' || substr(md5(random()::text), 1, 4);
      exit when not exists (select 1 from public.packs x where x.slug = s);
    end loop;
    insert into public.packs (author_id, slug, title, line, cover, published)
    values (uid, s, ttl, ln, cov, adm) returning id into pid;
  else
    if not exists (select 1 from public.packs x where x.id = pid and (x.author_id = uid or adm)) then
      raise exception 'That pack is not yours.' using errcode = '42501';
    end if;
    update public.packs x
       set title = ttl, line = ln, cover = cov, published = adm, updated_at = now()
     where x.id = pid
    returning x.slug into s;
    delete from public.pack_cards x where x.pack_id = pid;
  end if;

  for c in select * from jsonb_array_elements(cards) loop
    insert into public.pack_cards (pack_id, idx, image, rarity, caption)
    values (pid, i, c->>'image', coalesce(c->>'rarity', 'common'), left(coalesce(c->>'caption', ''), 140));
    i := i + 1;
  end loop;
  return s;
end
$fn$;
revoke execute on function public.pack_save(jsonb) from public, anon;
grant  execute on function public.pack_save(jsonb) to authenticated;

create or replace function public.pack_publish(p_id bigint, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.packs set published = coalesce(p_on, false), updated_at = now() where id = p_id;
  if not found then raise exception 'No such pack.' using errcode = '22023'; end if;
  return coalesce(p_on, false);
end
$fn$;
revoke execute on function public.pack_publish(bigint, boolean) from public, anon;
grant  execute on function public.pack_publish(bigint, boolean) to authenticated;

create or replace function public.pack_delete(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  delete from public.packs where id = p_id and (author_id = auth.uid() or coalesce(public.is_admin(), false));
  if not found then raise exception 'That pack is not yours.' using errcode = '42501'; end if;
  return true;
end
$fn$;
revoke execute on function public.pack_delete(bigint) from public, anon;
grant  execute on function public.pack_delete(bigint) to authenticated;

-- the maker's own shelf, drafts included; the desk's queue
create or replace function public.my_packs()
returns setof public.packs language sql stable security definer
set search_path = public, pg_temp as $fn$
  select * from public.packs where author_id = auth.uid() order by created_at desc;
$fn$;
revoke execute on function public.my_packs() from public, anon;
grant  execute on function public.my_packs() to authenticated;

create or replace function public.desk_packs()
returns table (id bigint, slug text, title text, published boolean, created_at timestamptz, updated_at timestamptz, author text, cards integer)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.slug, p.title, p.published, p.created_at, p.updated_at,
         coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
         (select count(*) from public.pack_cards c where c.pack_id = p.id)::int
    from public.packs p join public.profiles pr on pr.id = p.author_id
   where coalesce(public.is_admin(), false)
   order by p.published, p.updated_at desc;
$fn$;
revoke execute on function public.desk_packs() from public, anon;
grant  execute on function public.desk_packs() to authenticated;

-- ---------- favourites ----------
create or replace function public.pack_fave(p_card bigint, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid(); pk bigint;
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if not coalesce(public.is_wall_member(), false) then raise exception 'Members only.' using errcode = '42501'; end if;
  select c.pack_id into pk from public.pack_cards c where c.id = p_card;
  if pk is null or not exists (select 1 from public.packs p where p.id = pk and p.published and public.wall_member(p.author_id)) then
    raise exception 'That card is not out.' using errcode = '22023';
  end if;
  if coalesce(p_on, true) then
    insert into public.pack_faves (user_id, card_id) values (uid, p_card) on conflict do nothing;
  else
    delete from public.pack_faves where user_id = uid and card_id = p_card;
  end if;
  return coalesce(p_on, true);
end
$fn$;
revoke execute on function public.pack_fave(bigint, boolean) from public, anon;
grant  execute on function public.pack_fave(bigint, boolean) to authenticated;

create or replace function public.pack_fave_tally(p_cards bigint[])
returns table (card_id bigint, n integer, mine boolean) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select k, (select count(*) from public.pack_faves f where f.card_id = k)::int,
         exists (select 1 from public.pack_faves f where f.card_id = k and f.user_id = auth.uid())
    from unnest(p_cards[1:60]) as k;
$fn$;
grant execute on function public.pack_fave_tally(bigint[]) to anon, authenticated;

-- the cards a member has favourited, for their binder (theirs only)
create or replace function public.my_faves()
returns table (card_id bigint, pack_slug text, pack_title text, image text, rarity text, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select f.card_id, p.slug, p.title, c.image, c.rarity, f.created_at
    from public.pack_faves f join public.pack_cards c on c.id = f.card_id join public.packs p on p.id = c.pack_id
   where f.user_id = auth.uid()
   order by f.created_at desc;
$fn$;
revoke execute on function public.my_faves() from public, anon;
grant  execute on function public.my_faves() to authenticated;

-- ---------- I'm in this one ----------
create or replace function public.frame_tag(p_slug text, p_frame integer, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if not coalesce(public.is_wall_member(), false) then raise exception 'Members only.' using errcode = '42501'; end if;
  if p_slug is null or p_slug !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$' then raise exception 'No such night.' using errcode = '22023'; end if;
  if p_frame is null or p_frame < 0 or p_frame > 999 then raise exception 'No such frame.' using errcode = '22023'; end if;
  if coalesce(p_on, true) then
    if (select count(*) from public.frame_tags t where t.user_id = uid) >= 400 then raise exception 'That is a lot of frames. Untag a few first.' using errcode = '22023'; end if;
    insert into public.frame_tags (user_id, event_slug, frame) values (uid, p_slug, p_frame) on conflict do nothing;
  else
    delete from public.frame_tags where user_id = uid and event_slug = p_slug and frame = p_frame;
  end if;
  return coalesce(p_on, true);
end
$fn$;
revoke execute on function public.frame_tag(text, integer, boolean) from public, anon;
grant  execute on function public.frame_tag(text, integer, boolean) to authenticated;

create or replace function public.my_frames()
returns table (event_slug text, frame integer, created_at timestamptz) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select t.event_slug, t.frame, t.created_at from public.frame_tags t where t.user_id = auth.uid() order by t.created_at desc;
$fn$;
revoke execute on function public.my_frames() from public, anon;
grant  execute on function public.my_frames() to authenticated;

-- a member's tagged frames, for other members (their page); only when they show themselves on The Wall
create or replace function public.frames_of(p_sid text)
returns table (event_slug text, frame integer) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select t.event_slug, t.frame
    from public.frame_tags t
   where coalesce(public.is_wall_member(), false)
     and public.wall_open(t.user_id)
     and public.wall_sid(t.user_id) = p_sid
   order by t.created_at desc
   limit 200;
$fn$;
revoke execute on function public.frames_of(text) from public, anon;
grant  execute on function public.frames_of(text) to authenticated;

-- who is in this night's frames, for members on the night page
create or replace function public.frame_tags_of(p_slug text)
returns table (frame integer, sid text, name text) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select t.frame, public.wall_sid(t.user_id), coalesce(nullif(btrim(pr.display_name), ''), 'Member')
    from public.frame_tags t join public.profiles pr on pr.id = t.user_id
   where coalesce(public.is_wall_member(), false)
     and t.event_slug = p_slug
     and public.wall_open(t.user_id)
   order by t.frame, t.created_at;
$fn$;
revoke execute on function public.frame_tags_of(text) from public, anon;
grant  execute on function public.frame_tags_of(text) to authenticated;

-- ---------- verify: every line should say true ----------
select 'packs has RLS on'                 as test, (select relrowsecurity from pg_class where oid = 'public.packs'::regclass)::text as ok
union all select 'cards has RLS on',          (select relrowsecurity from pg_class where oid = 'public.pack_cards'::regclass)::text
union all select 'faves has RLS on',          (select relrowsecurity from pg_class where oid = 'public.pack_faves'::regclass)::text
union all select 'tags has RLS on',           (select relrowsecurity from pg_class where oid = 'public.frame_tags'::regclass)::text
union all select 'anon cannot read packs',    (not has_table_privilege('anon', 'public.packs', 'select'))::text
union all select 'anon cannot save a pack',   (not has_function_privilege('anon', 'public.pack_save(jsonb)', 'execute'))::text
union all select 'anyone reads the shelf',    has_function_privilege('anon', 'public.packs_list()', 'execute')::text
union all select 'anyone opens a pack',       has_function_privilege('anon', 'public.pack_open(text)', 'execute')::text
union all select 'anon cannot tag a frame',   (not has_function_privilege('anon', 'public.frame_tag(text, integer, boolean)', 'execute'))::text
union all select 'the packs bucket exists',   (select (public and file_size_limit = 6291456) from storage.buckets where id = 'packs')::text;
