-- ============================================================
-- 039 · THE REST OF THE PAGE (10/11, his asks on the Crypt's People tab: "first thing people should be
-- able to see when they click people is their page", then "flesh out their page or the pages as well")
-- ============================================================
-- A member's space (030) had a look, a pic, a headline, a mood, About me, Who I'd like to meet, a song,
-- a Top 8 and friends' comments. MySpace had more, and so does the house. This adds, on wall_spaces:
--   DETAILS    pronouns, city (SA / San Marcos / Austin / elsewhere), here for (up to five off a list),
--              scene (up to five of the Crypt's own vibe keys), sign, gear (one line)
--   INTERESTS  music, movies, haunts (the rooms they are always at), short texts
--   PICS       up to six pictures of their own (the spaces bucket, their own folder, like the wallpaper)
-- and wall_space() now also answers with the numbers a page can wear (nights marked, frames they are in,
-- comments left on flyers) and a card holder's link-in-bio row (profiles.links, 021), so the page prints
-- them without another call. wall_space_save() takes the new fields: every list is a CHECK, every text runs
-- through wall_line / wall_text (030), pictures must sit in the member's own folder. A key the page does not
-- send is left as it was, so the page that is live right now (which sends none of them) cannot wipe them.
-- Nothing is dropped, nothing is deleted: `add column if not exists`, constraints only when missing,
-- `create or replace` on the functions. Safe to run twice. The last statement prints the check rows.
-- ============================================================


-- SECTION 1. The columns ----------------------------------------------------------
alter table public.wall_spaces
  add column if not exists pronouns text,
  add column if not exists city     text,
  add column if not exists here_for text[] not null default '{}',
  add column if not exists scene    text[] not null default '{}',
  add column if not exists sign     text,
  add column if not exists gear     text,
  add column if not exists music    text,
  add column if not exists movies   text,
  add column if not exists haunts   text,
  add column if not exists pics     text[] not null default '{}';

-- every picture in the member's own folder of the spaces bucket, six at most (a CHECK cannot loop, so a function)
create or replace function public.wall_pics_ok(p text[])
returns boolean language sql immutable
set search_path = public, pg_temp as $fn$
  select p is null or (cardinality(p) <= 6 and not exists (
    select 1 from unnest(p) u
     where u !~ '^https://frqpvcpyglhmerwpvosl\.supabase\.co/storage/v1/object/public/spaces/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$'));
$fn$;
revoke execute on function public.wall_pics_ok(text[]) from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_pronouns_ok') then
    alter table public.wall_spaces add constraint wall_spaces_pronouns_ok
      check (pronouns is null or (char_length(pronouns) <= 20 and pronouns !~ '[\n\r]'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_city_ok') then
    alter table public.wall_spaces add constraint wall_spaces_city_ok
      check (city is null or city in ('sa','smtx','atx','elsewhere'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_here_for_ok') then
    alter table public.wall_spaces add constraint wall_spaces_here_for_ok
      check (cardinality(here_for) <= 5 and here_for <@ array['shooting','dancing','djing','playing','vending','the pit','the bar','friends','afters','markets']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_scene_ok') then
    alter table public.wall_spaces add constraint wall_spaces_scene_ok
      check (cardinality(scene) <= 5 and scene <@ array['goth','spooky','heavy','dance','rave','diy','drag','queer','market','fights',
                                                        'anime','rap','art','film','comedy','live','late','scene','culture']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_sign_ok') then
    alter table public.wall_spaces add constraint wall_spaces_sign_ok
      check (sign is null or sign in ('aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_gear_ok') then
    alter table public.wall_spaces add constraint wall_spaces_gear_ok
      check (gear is null or (char_length(gear) <= 80 and gear !~ '[\n\r]'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_music_ok') then
    alter table public.wall_spaces add constraint wall_spaces_music_ok check (music is null or char_length(music) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_movies_ok') then
    alter table public.wall_spaces add constraint wall_spaces_movies_ok check (movies is null or char_length(movies) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_haunts_ok') then
    alter table public.wall_spaces add constraint wall_spaces_haunts_ok check (haunts is null or char_length(haunts) <= 160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wall_spaces_pics_ok') then
    alter table public.wall_spaces add constraint wall_spaces_pics_ok check (public.wall_pics_ok(pics));
  end if;
end $$;


-- SECTION 2. Opening a space answers with the rest of the page ---------------------------
-- Same door and the same keys as 030 (the live page keeps working), plus:
--   details    {pronouns, city, here_for[], scene[], sign, gear, music, movies, haunts}
--   pics       [url, ...]
--   nights_n   every night they ever marked going (the `going` list stays: yesterday on)
--   frames_n   frames they marked "I'm in this one" (037)
--   comments_n comments they left on flyers that are not hidden
--   links      a card holder's link-in-bio row (021), [] for everyone else
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
    'details',  jsonb_build_object(
                  'pronouns', sp.pronouns, 'city', sp.city,
                  'here_for', coalesce(to_jsonb(sp.here_for), '[]'::jsonb),
                  'scene',    coalesce(to_jsonb(sp.scene), '[]'::jsonb),
                  'sign', sp.sign, 'gear', sp.gear, 'music', sp.music, 'movies', sp.movies, 'haunts', sp.haunts),
    'pics',     coalesce(to_jsonb(sp.pics), '[]'::jsonb),
    'nights_n', (select count(*) from public.wall_going g where g.user_id = who),
    'frames_n', (select count(*) from public.frame_tags t where t.user_id = who),
    'comments_n', (select count(*) from public.wall_comments c where c.user_id = who and not c.hidden),
    'links',    case when pr.approved and jsonb_typeof(pr.links) = 'array' then pr.links else '[]'::jsonb end,
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


-- SECTION 3. Saving takes the new fields --------------------------------------------------
-- Same as 030 for everything it already took. The new keys: a key the page did not send leaves that column
-- as it was (the live page sends none of them); a key sent empty clears it. Lists arrive as JSON arrays,
-- lower-cased, de-duplicated, in the order sent; the CHECKs refuse anything off the lists. Pictures must be
-- in the member's own folder, six at most, with a plain error before the CHECK gets to say it.
create or replace function public.wall_space_save(p jsonb)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me     uuid := auth.uid();
  mine   text := 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/spaces/' || auth.uid()::text || '/';
  card   text;
  v_pic  text := nullif(btrim(p->>'pic'), '');
  v_wp   text := nullif(btrim(p->>'wallpaper'), '');
  t8     uuid[];
  v_hf   text[];
  v_sc   text[];
  v_pics text[];
  bad    text;
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
  -- the lists: lower, trimmed, one of each, in the order sent
  select coalesce(array_agg(z.v order by z.ord), '{}') into v_hf
    from (select lower(btrim(u.v)) as v, min(u.ord) as ord
            from jsonb_array_elements_text(case when jsonb_typeof(p->'here_for') = 'array' then p->'here_for' else '[]'::jsonb end)
                 with ordinality as u(v, ord)
           where btrim(u.v) <> '' group by lower(btrim(u.v))) z;
  select coalesce(array_agg(z.v order by z.ord), '{}') into v_sc
    from (select lower(btrim(u.v)) as v, min(u.ord) as ord
            from jsonb_array_elements_text(case when jsonb_typeof(p->'scene') = 'array' then p->'scene' else '[]'::jsonb end)
                 with ordinality as u(v, ord)
           where btrim(u.v) <> '' group by lower(btrim(u.v))) z;
  select coalesce(array_agg(z.v order by z.ord), '{}') into v_pics
    from (select btrim(u.v) as v, min(u.ord) as ord
            from jsonb_array_elements_text(case when jsonb_typeof(p->'pics') = 'array' then p->'pics' else '[]'::jsonb end)
                 with ordinality as u(v, ord)
           where btrim(u.v) <> '' group by btrim(u.v)) z;
  if cardinality(v_pics) > 6 then
    raise exception 'Six pictures is the ceiling.' using errcode = '22023';
  end if;
  select u into bad from unnest(v_pics) u where left(u, length(mine)) <> mine limit 1;
  if bad is not null then
    raise exception 'That picture is not yours.' using errcode = '42501';
  end if;
  insert into public.wall_spaces as s
         (user_id, skin, bg, box, ink, hot, pattern, font, fall, sparkle, marquee, pic, wallpaper, tile,
          headline, mood_e, mood, about, meet, song, top8, wear,
          pronouns, city, here_for, scene, sign, gear, music, movies, haunts, pics, updated_at)
  values (me,
          coalesce(nullif(p->>'skin', ''), 'classic'),
          lower(nullif(p->>'bg', '')), lower(nullif(p->>'box', '')), lower(nullif(p->>'ink', '')), lower(nullif(p->>'hot', '')),
          coalesce(nullif(p->>'pattern', ''), 'none'), coalesce(nullif(p->>'font', ''), 'skin'), coalesce(nullif(p->>'fall', ''), 'none'),
          coalesce((p->>'sparkle')::boolean, false), coalesce((p->>'marquee')::boolean, false),
          v_pic, v_wp, coalesce((p->>'tile')::boolean, false),
          public.wall_line(p->>'headline'), nullif(p->>'mood_e', ''), public.wall_line(p->>'mood'),
          public.wall_text(p->>'about'), public.wall_text(p->>'meet'),
          nullif(btrim(p->>'song'), ''), t8, coalesce((p->>'wear')::boolean, false),
          public.wall_line(p->>'pronouns'), lower(nullif(btrim(p->>'city'), '')), v_hf, v_sc,
          lower(nullif(btrim(p->>'sign'), '')), public.wall_line(p->>'gear'),
          public.wall_text(p->>'music'), public.wall_text(p->>'movies'), public.wall_text(p->>'haunts'), v_pics, now())
  on conflict (user_id) do update set
    skin = excluded.skin, bg = excluded.bg, box = excluded.box, ink = excluded.ink, hot = excluded.hot,
    pattern = excluded.pattern, font = excluded.font, fall = excluded.fall, sparkle = excluded.sparkle,
    marquee = excluded.marquee, pic = excluded.pic, wallpaper = excluded.wallpaper, tile = excluded.tile,
    headline = excluded.headline, mood_e = excluded.mood_e, mood = excluded.mood, about = excluded.about,
    meet = excluded.meet, song = excluded.song, top8 = excluded.top8, wear = excluded.wear,
    pronouns = case when p ? 'pronouns' then excluded.pronouns else s.pronouns end,
    city     = case when p ? 'city'     then excluded.city     else s.city     end,
    here_for = case when p ? 'here_for' then excluded.here_for else s.here_for end,
    scene    = case when p ? 'scene'    then excluded.scene    else s.scene    end,
    sign     = case when p ? 'sign'     then excluded.sign     else s.sign     end,
    gear     = case when p ? 'gear'     then excluded.gear     else s.gear     end,
    music    = case when p ? 'music'    then excluded.music    else s.music    end,
    movies   = case when p ? 'movies'   then excluded.movies   else s.movies   end,
    haunts   = case when p ? 'haunts'   then excluded.haunts   else s.haunts   end,
    pics     = case when p ? 'pics'     then excluded.pics     else s.pics     end,
    updated_at = now();
  return public.wall_sid(me);
end $fn$;
revoke execute on function public.wall_space_save(jsonb) from public, anon;
grant  execute on function public.wall_space_save(jsonb) to authenticated;


-- SECTION 4. A 037 slip, mended ----------------------------------------------------------
-- 037's storage DELETE policy on pack photos calls pack_image_in_use(), and 037 revoked that function from
-- authenticated. Postgres does not promise to test `bucket_id = 'packs'` before the call, so a member deleting any
-- file of their own (a take photo, a space pic, a pack photo) can be told "permission denied for function
-- pack_image_in_use" (the replica reproduced it on every take-photo delete). The function only answers whether a
-- file is in a pack, so members may run it.
grant execute on function public.pack_image_in_use(text) to authenticated;


-- ---------- verify: every line should say true ----------
select 'the ten columns are there'      as test, ((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'wall_spaces'
                                                     and column_name in ('pronouns','city','here_for','scene','sign','gear','music','movies','haunts','pics')) = 10)::text as ok
union all select 'the ten checks are there',    ((select count(*) from pg_constraint where conname in ('wall_spaces_pronouns_ok','wall_spaces_city_ok','wall_spaces_here_for_ok',
                                                     'wall_spaces_scene_ok','wall_spaces_sign_ok','wall_spaces_gear_ok','wall_spaces_music_ok','wall_spaces_movies_ok',
                                                     'wall_spaces_haunts_ok','wall_spaces_pics_ok')) = 10)::text
union all select 'wall_space answers with details', (pg_get_functiondef('public.wall_space(text)'::regprocedure) like '%''details''%')::text
union all select 'wall_space_save takes pics',      (pg_get_functiondef('public.wall_space_save(jsonb)'::regprocedure) like '%v_pics%')::text
union all select 'anon cannot open a space',        (not has_function_privilege('anon', 'public.wall_space(text)', 'execute'))::text
union all select 'anon cannot save one',            (not has_function_privilege('anon', 'public.wall_space_save(jsonb)', 'execute'))::text
union all select 'spaces table still locked',       (not has_table_privilege('authenticated', 'public.wall_spaces', 'select'))::text
union all select 'members may ask pack_image_in_use', has_function_privilege('authenticated', 'public.pack_image_in_use(text)', 'execute')::text;
