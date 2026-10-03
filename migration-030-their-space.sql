-- ============================================================================
-- 0FF THE PRINT, migration 030: THEIR SPACE.
--
-- His ask (10/2): "lets make ther page customizable like a myspace page".
--
-- Every member of The Wall (card holders, the desk, casual members with the
-- code) gets a page other members can open by tapping their name on a going
-- list or a comment. They dress it up: a skin, their own colors, a pattern or
-- a wallpaper, a font, falling bats, a sparkle trail, a scrolling headline, a
-- pic, a mood, About me, Who I'd like to meet, a profile song, a Top 8, and
-- friends' comments. Everyone starts in 2006 with the desk as their Tom.
--
-- HOW IT STAYS SAFE. Nothing a member types is ever CSS or HTML. Skins,
-- patterns, fonts and effects are fixed lists (CHECKs below), colors are
-- #rrggbb, pictures must sit in the member's own folder of the spaces bucket,
-- the song is a bare Spotify track id, and every text field is plain text the
-- page escapes. Both tables have RLS on and NO grants: the only way in or out
-- is the security definer functions in section 3, and each one checks
-- is_wall_member() first. Anonymous visitors get nothing.
--
-- WHO SEES A SPACE. Members see each other's spaces when the owner has
-- "Show me on The Wall" on (wall_people.show_name, the same switch as the
-- going lists). The owner always sees their own; the desk sees all of them.
-- A casual member the desk removes stops being a member, so their space and
-- their comments drop out on their own.
--
-- Run it once in the Supabase SQL editor. It is safe to run again.
-- ============================================================================


-- SECTION 1. Helpers ------------------------------------------------------------

-- A space's short public id. Ten hex characters off a hash of the user id, so
-- links never carry the uuid and nothing has to be stored to have one.
create or replace function public.wall_sid(p uuid)
returns text language sql immutable
set search_path = public, pg_temp as $fn$
  select left(md5('wall-space:' || p::text), 10);
$fn$;

-- Is this person on The Wall at all (card holder, desk, or casual member)?
create or replace function public.wall_member(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.profiles x left join public.wall_people w on w.user_id = x.id
                  where x.id = p and (x.approved or x.is_admin or coalesce(w.casual, false)));
$fn$;

-- ...and is their space open to other members?
create or replace function public.wall_open(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.wall_member(p)
     and coalesce((select w.show_name from public.wall_people w where w.user_id = p), true);
$fn$;

-- One line of plain text (headline, mood): no control characters, runs of
-- whitespace become one space. Dashes become commas, same as the card back.
create or replace function public.wall_line(t text)
returns text language sql immutable
set search_path = public, pg_temp as $fn$
  select nullif(btrim(regexp_replace(replace(replace(coalesce(t, ''), chr(8212), ','), chr(8211), ','),
                                     '[[:cntrl:][:space:]]+', ' ', 'g')), '');
$fn$;

-- A block of plain text (About me, comments): keeps line breaks, at most one
-- blank line in a row, everything else that is a control character goes.
create or replace function public.wall_text(t text)
returns text language sql immutable
set search_path = public, pg_temp as $fn$
  select nullif(btrim(regexp_replace(regexp_replace(
           replace(replace(replace(replace(coalesce(t, ''), chr(13), ''), chr(9), ' '), chr(8212), ','), chr(8211), ','),
           '[\x01-\x09\x0b-\x1f\x7f]', '', 'g'), '\n{3,}', E'\n\n', 'g'), E' \n'), '');
$fn$;

revoke execute on function public.wall_sid(uuid), public.wall_member(uuid), public.wall_open(uuid),
                           public.wall_line(text), public.wall_text(text) from public, anon, authenticated;


-- SECTION 2. The tables -----------------------------------------------------------

create table if not exists public.wall_spaces (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  skin        text not null default 'classic'
              check (skin in ('classic','emo','scene','church','glitter','chrome','zine','house')),
  bg          text check (bg  ~ '^#[0-9a-f]{6}$'),
  box         text check (box ~ '^#[0-9a-f]{6}$'),
  ink         text check (ink ~ '^#[0-9a-f]{6}$'),
  hot         text check (hot ~ '^#[0-9a-f]{6}$'),
  pattern     text not null default 'none'
              check (pattern in ('none','checker','stars','hearts','bats','crosses','zebra','leopard','sparkles','plaid')),
  font        text not null default 'skin'
              check (font in ('skin','verdana','comic','gothic','pixel','type','script','chrome','marker','house')),
  fall        text not null default 'none' check (fall in ('none','snow','bats','hearts','stars','petals')),
  sparkle     boolean not null default false,
  marquee     boolean not null default false,
  pic         text check (pic is null or pic ~
                '^https://frqpvcpyglhmerwpvosl\.supabase\.co/storage/v1/object/public/(spaces|cards)/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$'),
  wallpaper   text check (wallpaper is null or wallpaper ~
                '^https://frqpvcpyglhmerwpvosl\.supabase\.co/storage/v1/object/public/spaces/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$'),
  tile        boolean not null default false,
  headline    text check (headline is null or (char_length(headline) <= 60 and headline !~ '[\n\r]')),
  mood_e      text check (mood_e is null or mood_e in
                ('😈','🖤','🥀','💀','👻','🦇','🌙','✨','🔥','😌','😴','😭','😤','🥳','😎','🤘','💅','🤡','🎧','🍓')),
  mood        text check (mood is null or (char_length(mood) <= 24 and mood !~ '[\n\r]')),
  about       text check (about is null or char_length(about) <= 600),
  meet        text check (meet is null or char_length(meet) <= 300),
  song        text check (song is null or song ~ '^[A-Za-z0-9]{22}$'),
  top8        uuid[] not null default '{}' check (cardinality(top8) <= 8),
  wear        boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.wall_spaces enable row level security;
revoke all on public.wall_spaces from anon, authenticated;

create table if not exists public.wall_space_posts (
  id          bigint generated always as identity primary key,
  owner       uuid not null references auth.users(id) on delete cascade,
  author      uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 280),
  created_at  timestamptz not null default now()
);
create index if not exists wall_space_posts_owner  on public.wall_space_posts (owner, created_at desc);
create index if not exists wall_space_posts_author on public.wall_space_posts (author, created_at desc);
alter table public.wall_space_posts enable row level security;
revoke all on public.wall_space_posts from anon, authenticated;


-- SECTION 3. The only doors in and out (members only) -----------------------------

-- Open a space. No sid means "mine". Returns null when it is not there or not open.
-- Before a member saves anything their space borrows what they already did on the
-- site (card photo, tagline, bio, theme song), and their Top 8 is the desk.
create or replace function public.wall_space(p_sid text default null)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare
  me   uuid := auth.uid();
  who  uuid;
  pr   public.profiles;
  sp   public.wall_spaces;
  t8   uuid[];
begin
  if me is null or not public.is_wall_member() then return null; end if;
  if coalesce(p_sid, '') = '' then
    who := me;
  else
    select x.id into who from public.profiles x where public.wall_sid(x.id) = p_sid limit 1;
    if who is null then return null; end if;
    if who <> me and not public.wall_open(who) and not public.is_admin() then return null; end if;
    if who <> me and not public.wall_member(who) then return null; end if;
  end if;
  select * into pr from public.profiles where id = who;
  select * into sp from public.wall_spaces where user_id = who;
  t8 := coalesce(sp.top8, '{}');
  if sp.user_id is null then
    -- everyone starts with Tom. Here, Tom is the desk.
    select coalesce(array_agg(d.id), '{}') into t8
      from (select x.id from public.profiles x where x.is_admin and x.id <> who order by x.created_at limit 1) d;
  end if;
  return jsonb_build_object(
    'sid',      public.wall_sid(who),
    'mine',     who = me,
    'open',     public.wall_open(who),
    'fresh',    sp.user_id is null,
    'name',     coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
    'ig',       pr.instagram,
    'kind',     case when pr.is_admin then 'desk' when pr.approved then 'card' else 'member' end,
    'card',     case when pr.approved then pr.card_slug end,
    'since',    pr.created_at,
    'look',     case when sp.user_id is null then null else jsonb_build_object(
                  'skin', sp.skin, 'bg', sp.bg, 'box', sp.box, 'ink', sp.ink, 'hot', sp.hot,
                  'pattern', sp.pattern, 'font', sp.font, 'fall', sp.fall, 'sparkle', sp.sparkle,
                  'marquee', sp.marquee, 'wallpaper', sp.wallpaper, 'tile', sp.tile) end,
    'pic',      case when sp.user_id is null then pr.card_photo  else sp.pic end,
    'headline', case when sp.user_id is null then pr.tagline     else sp.headline end,
    'about',    case when sp.user_id is null then pr.bio         else sp.about end,
    'song',     case when sp.user_id is null then pr.theme_track else sp.song end,
    'mood_e',   sp.mood_e,
    'mood',     sp.mood,
    'meet',     sp.meet,
    'wear',     coalesce(sp.wear, false),
    'top8',     (select coalesce(jsonb_agg(jsonb_build_object(
                          's', public.wall_sid(x.id),
                          'n', coalesce(nullif(btrim(x.display_name), ''), 'Member'),
                          'p', case when s2.user_id is null then x.card_photo else s2.pic end) order by u.ord), '[]'::jsonb)
                   from unnest(t8) with ordinality as u(id, ord)
                   join public.profiles x on x.id = u.id
                   left join public.wall_spaces s2 on s2.user_id = x.id
                  where public.wall_open(x.id)),
    'fans',     (select count(*) from public.wall_spaces s3
                  where who = any(s3.top8) and s3.user_id <> who and public.wall_open(s3.user_id)),
    'going',    (select coalesce(jsonb_agg(g.event_id order by g.day, g.created_at), '[]'::jsonb)
                   from (select g.event_id, g.day, g.created_at from public.wall_going g
                          where g.user_id = who and g.day >= (now() at time zone 'America/Chicago')::date - 1
                          order by g.day, g.created_at limit 40) g),
    'posts',    (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', q.id, 'b', q.body, 't', q.created_at, 'n', q.name, 's', q.sid, 'p', q.pic, 'del', q.del)
                          order by q.created_at desc), '[]'::jsonb)
                   from (select c.id, c.body, c.created_at,
                                coalesce(nullif(btrim(a.display_name), ''), 'Member') as name,
                                case when public.wall_open(a.id) then public.wall_sid(a.id) end as sid,
                                case when sa.user_id is null then a.card_photo else sa.pic end as pic,
                                (c.author = me or c.owner = me or public.is_admin()) as del
                           from public.wall_space_posts c
                           join public.profiles a on a.id = c.author
                           left join public.wall_spaces sa on sa.user_id = a.id
                          where c.owner = who and public.wall_member(a.id)
                          order by c.created_at desc limit 40) q),
    'posts_n',  (select count(*) from public.wall_space_posts c
                  where c.owner = who and public.wall_member(c.author))
  );
end $fn$;
revoke execute on function public.wall_space(text) from public, anon;
grant  execute on function public.wall_space(text) to authenticated;

-- Save my space. The page sends the whole thing every time; the CHECKs above
-- refuse anything off the lists. Top 8 arrives as sids and only open members stay.
create or replace function public.wall_space_save(p jsonb)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me    uuid := auth.uid();
  mine  text := 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/spaces/' || auth.uid()::text || '/';
  card  text;
  v_pic text := nullif(btrim(p->>'pic'), '');
  v_wp  text := nullif(btrim(p->>'wallpaper'), '');
  t8    uuid[];
begin
  if me is null or not public.is_wall_member() then
    raise exception 'Members only.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;
  select x.card_photo into card from public.profiles x where x.id = me;
  if v_pic is not null and left(v_pic, length(mine)) <> mine and v_pic is distinct from card then
    raise exception 'That picture is not yours.' using errcode = '42501';
  end if;
  if v_wp is not null and left(v_wp, length(mine)) <> mine then
    raise exception 'That wallpaper is not yours.' using errcode = '42501';
  end if;
  select coalesce(array_agg(z.id order by z.ord), '{}') into t8
    from (select x.id, min(u.ord) as ord
            from jsonb_array_elements_text(case when jsonb_typeof(p->'top8') = 'array' then p->'top8' else '[]'::jsonb end)
                 with ordinality as u(sid, ord)
            join public.profiles x on public.wall_sid(x.id) = u.sid
           where x.id <> me and public.wall_open(x.id)
           group by x.id
           order by min(u.ord)
           limit 8) z;
  insert into public.wall_spaces as s
         (user_id, skin, bg, box, ink, hot, pattern, font, fall, sparkle, marquee, pic, wallpaper, tile,
          headline, mood_e, mood, about, meet, song, top8, wear, updated_at)
  values (me,
          coalesce(nullif(p->>'skin', ''), 'classic'),
          lower(nullif(p->>'bg', '')), lower(nullif(p->>'box', '')), lower(nullif(p->>'ink', '')), lower(nullif(p->>'hot', '')),
          coalesce(nullif(p->>'pattern', ''), 'none'), coalesce(nullif(p->>'font', ''), 'skin'), coalesce(nullif(p->>'fall', ''), 'none'),
          coalesce((p->>'sparkle')::boolean, false), coalesce((p->>'marquee')::boolean, false),
          v_pic, v_wp, coalesce((p->>'tile')::boolean, false),
          public.wall_line(p->>'headline'), nullif(p->>'mood_e', ''), public.wall_line(p->>'mood'),
          public.wall_text(p->>'about'), public.wall_text(p->>'meet'),
          nullif(btrim(p->>'song'), ''), t8, coalesce((p->>'wear')::boolean, false), now())
  on conflict (user_id) do update set
    skin = excluded.skin, bg = excluded.bg, box = excluded.box, ink = excluded.ink, hot = excluded.hot,
    pattern = excluded.pattern, font = excluded.font, fall = excluded.fall, sparkle = excluded.sparkle,
    marquee = excluded.marquee, pic = excluded.pic, wallpaper = excluded.wallpaper, tile = excluded.tile,
    headline = excluded.headline, mood_e = excluded.mood_e, mood = excluded.mood, about = excluded.about,
    meet = excluded.meet, song = excluded.song, top8 = excluded.top8, wear = excluded.wear, updated_at = now();
  return public.wall_sid(me);
end $fn$;
revoke execute on function public.wall_space_save(jsonb) from public, anon;
grant  execute on function public.wall_space_save(jsonb) to authenticated;

-- Everyone whose space is open, for picking a Top 8.
create or replace function public.wall_space_people()
returns table (sid text, name text, ig text, pic text, kind text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.wall_sid(x.id), coalesce(nullif(btrim(x.display_name), ''), 'Member'), x.instagram,
         case when s.user_id is null then x.card_photo else s.pic end,
         case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end
    from public.profiles x left join public.wall_spaces s on s.user_id = x.id
   where public.is_wall_member() and x.id <> auth.uid() and public.wall_open(x.id)
   order by x.is_admin desc, lower(x.display_name)
   limit 500;
$fn$;
revoke execute on function public.wall_space_people() from public, anon;
grant  execute on function public.wall_space_people() to authenticated;

-- Leave a comment on a space. 20 an hour, 280 characters.
create or replace function public.wall_space_post(p_sid text, p_body text)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me   uuid := auth.uid();
  who  uuid;
  b    text := public.wall_text(p_body);
  nid  bigint;
begin
  if me is null or not public.is_wall_member() then
    raise exception 'Members only.' using errcode = '42501';
  end if;
  select x.id into who from public.profiles x where public.wall_sid(x.id) = p_sid limit 1;
  if who is null or not public.wall_member(who) or (who <> me and not public.wall_open(who)) then
    raise exception 'That space is not open.' using errcode = '42501';
  end if;
  if b is null or char_length(b) > 280 then
    raise exception 'Say something, 280 characters max.' using errcode = '22023';
  end if;
  if (select count(*) from public.wall_space_posts c
       where c.author = me and c.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Slow down, try again in a bit.' using errcode = '42501';
  end if;
  insert into public.wall_space_posts (owner, author, body) values (who, me, b) returning id into nid;
  return nid;
end $fn$;
revoke execute on function public.wall_space_post(text, text) from public, anon;
grant  execute on function public.wall_space_post(text, text) to authenticated;

-- Take a comment down: whoever wrote it, whoever owns the space, or the desk.
create or replace function public.wall_space_unpost(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is null or not public.is_wall_member() then return false; end if;
  delete from public.wall_space_posts c
   where c.id = p_id and (c.author = auth.uid() or c.owner = auth.uid() or public.is_admin());
  return found;
end $fn$;
revoke execute on function public.wall_space_unpost(bigint) from public, anon;
grant  execute on function public.wall_space_unpost(bigint) to authenticated;

-- The desk wipes a space back to 2006 (their comments stay, the desk can delete those one by one).
create or replace function public.wall_space_reset(p_sid text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  delete from public.wall_spaces s using public.profiles x
   where x.id = s.user_id and public.wall_sid(x.id) = p_sid;
  return found;
end $fn$;
revoke execute on function public.wall_space_reset(text) from public, anon;
grant  execute on function public.wall_space_reset(text) to authenticated;


-- SECTION 4. Names on going lists and comments now open the person's space -------
-- wall_tally keeps its shape; each name in "who" gains its sid. Removed casual
-- members drop off the name lists (the counts are unchanged).
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
  w as (select x.event_id, jsonb_agg(jsonb_build_object('n', x.display_name, 'ig', x.instagram, 's', x.sid) order by x.created_at) j
          from (select g.event_id, p.display_name, p.instagram, g.created_at, public.wall_sid(g.user_id) as sid,
                       row_number() over (partition by g.event_id order by g.created_at) rn
                  from public.wall_going g join ids on ids.id = g.event_id
                  join public.profiles p on p.id = g.user_id
                  left join public.wall_people wp on wp.user_id = g.user_id
                 where coalesce(wp.show_name, true) and public.wall_member(g.user_id)) x
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

-- wall_thread gains a column (sid, null when that person's space is closed), so it is
-- dropped and made again. The page that is live right now ignores the extra column.
drop function if exists public.wall_thread(text);
create function public.wall_thread(p_event text)
returns table (id bigint, body text, created_at timestamptz, name text, ig text, mine boolean, hidden boolean, sid text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select c.id, c.body, c.created_at, p.display_name, p.instagram, c.user_id = auth.uid(), c.hidden,
         case when public.wall_open(c.user_id) then public.wall_sid(c.user_id) end
    from public.wall_comments c join public.profiles p on p.id = c.user_id
   where public.is_wall_member() and c.event_id = p_event
     and (not c.hidden or public.is_admin())
   order by c.created_at desc
   limit 60;
$fn$;
revoke execute on function public.wall_thread(text) from public, anon;
grant  execute on function public.wall_thread(text) to authenticated;


-- SECTION 5. Pictures: pic and wallpaper, each member in their own folder --------
-- Public bucket so the pictures load as plain image URLs; there is no listing
-- policy for anyone but the owner. 3MB, images only; the page shrinks them first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spaces', 'spaces', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "wall members upload to their space" on storage.objects;
create policy "wall members upload to their space" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'spaces'
    and public.is_wall_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists "wall members see their own space files" on storage.objects;
create policy "wall members see their own space files" on storage.objects
  for select to authenticated
  using (bucket_id = 'spaces' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

drop policy if exists "wall members delete their own space files" on storage.objects;
create policy "wall members delete their own space files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'spaces' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));


-- SECTION 6. Check it. One row, every column true.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('wall_spaces', 'wall_space_posts')) = 2          as tables_ok,
  (select public from storage.buckets where id = 'spaces')                                           as bucket_ok,
  public.wall_sid('00000000-0000-0000-0000-000000000000'::uuid)
    = left(md5('wall-space:00000000-0000-0000-0000-000000000000'), 10)                               as sid_ok,
  public.wall_line(E'  dead \n   inside ' || chr(8212) || ' lol ') = 'dead inside , lol'             as line_ok,
  public.wall_text(E'hi' || chr(1) || E'\n\n\n\nthere 😈 ') = E'hi\n\nthere 😈'                        as text_ok,
  not has_function_privilege('anon', 'public.wall_space(text)', 'execute')                           as anon_locked,
  not has_table_privilege('authenticated', 'public.wall_spaces', 'select')                           as table_locked,
  (select count(*) from pg_proc where proname = 'wall_thread' and pronamespace = 'public'::regnamespace) = 1 as thread_ok;
