-- ============================================================
-- 042 · THE FIX PACK (10/11, after the full audit of the site). Database half of the bug pass.
-- ============================================================
-- Every item below was reproduced on the local replica first (99_SYSTEM/_tools/otp_dbtest, t_042.py fails on a replica
-- built without this file), fixed there, and re-tested with every other test in the kit.
--   1. PACKS. Editing a pack wiped every heart on it (the cards are re-made on each save and the faves went with them).
--      The hearts now come back to the same photos. And the desk could open a member's pack in the builder but every save
--      was refused ("Every photo has to be one you uploaded here"): the photos are now checked against the pack's maker,
--      not whoever is saving. A desk save still publishes, as it always has (`published = adm`).
--   2. STORIES. A story's cover stayed online after the story was tossed, withdrawn or given a new cover. It now goes in
--      the takedown queue the desk already drains (orphan_images, the same as a deleted post's photo). And a retired
--      member's story and word-wall lines were gone from the views but still readable straight off the tables (the 034
--      fix for posts, done for these two).
--   3. KIN. A page's friend count included friends whose pages are hidden, so it said "Friends 1" over an empty box. The
--      count and the twelve faces now follow the same rule as the list. A friend ask from somebody you blocked no longer
--      waits in your asks (a block already refuses new ones, 041).
--   4. MESSAGES. The fifteen-new-conversations-a-day ceiling counted whoever spoke last, so answered spam never hit it and
--      a member who answered fifteen people was locked out. It now counts conversations you started. A second report on a
--      conversation can no longer overwrite the first one (the desk saw the reported person as the reporter).
--   5. PAGE COMMENTS. Past the newest 40 nobody could see or delete them. wall_space_posts_before() pages back through
--      them with the same rules as the page (the Crypt's Show older button calls it).
--   6. THE TAKE. A member made a card holder lost their face on their own posts (take_feed sent no picture for card
--      holders). It now sends their card photo, or their Crypt picture when the card has none.
--   7. Two retired desk calls are dropped: wall_casual_list() and wall_remove() (replaced by wall_desk_people and
--      wall_ban in 032; nothing calls them).
-- ⛔ ORDER: migration 025 goes in BEFORE this one (and 025 only after the desk.js calendar fix is live). Nothing here
--    depends on 025, but the verify's last line checks it so a skipped 025 shows up.
-- ⛔ A "potentially destructive query" prompt WILL appear (the two drops, and triggers and policies dropped and re-made).
--    Confirm it with "Run query". Cancelling runs nothing and reports nothing.
-- Nothing else is dropped or deleted. `create or replace` on the functions, triggers and policies dropped and re-made.
-- Safe to run twice. The last statement prints the check rows (15, every one true).
-- ============================================================


-- SECTION 1. Packs: keep the hearts, let the desk fix a member's pack ---------------------
-- 037's pack_save, carried whole. Changes: `own` (whose folder the photos must come from: the pack's maker), the
-- not-yours check moved above the photo check, and `keep` (the hearts, matched back by photo after the re-insert;
-- the n-th copy of a photo if a pack repeats one).
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
  own     uuid := auth.uid();
  keep    jsonb;
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if not coalesce(public.is_wall_member(), false) then raise exception 'Members make packs.' using errcode = '42501'; end if;
  if char_length(ttl) < 2 or char_length(ttl) > 60 then raise exception 'Give it a title, 2 to 60 letters.' using errcode = '22023'; end if;
  if char_length(ln) > 200 then raise exception 'Keep the line under 200 letters.' using errcode = '22023'; end if;
  if jsonb_typeof(cards) <> 'array' or n < 3 or n > 12 then raise exception 'A pack is 3 to 12 photos.' using errcode = '22023'; end if;
  select count(*) into hits from jsonb_array_elements(cards) x where x->>'rarity' = 'hit';
  if hits > 1 then raise exception 'One hit per pack.' using errcode = '22023'; end if;
  if pid is not null then
    select x.author_id into own from public.packs x where x.id = pid and (x.author_id = uid or adm);
    if own is null then
      raise exception 'That pack is not yours.' using errcode = '42501';
    end if;
  end if;
  for c in select * from jsonb_array_elements(cards) loop
    img := c->>'image';
    if img is null or img !~* ('^' || own::text || '/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$') then
      raise exception 'Every photo has to be one you uploaded here.' using errcode = '22023';
    end if;
    if coalesce(c->>'rarity', 'common') not in ('common', 'rare', 'holo', 'fullart', 'hit') then raise exception 'Pick a rarity off the list.' using errcode = '22023'; end if;
    if char_length(coalesce(c->>'caption', '')) > 140 then raise exception 'Captions stop at 140 letters.' using errcode = '22023'; end if;
  end loop;
  if cov <> '' and cov !~* ('^' || own::text || '/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp)$') then
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
    update public.packs x
       set title = ttl, line = ln, cover = cov, published = adm, updated_at = now()
     where x.id = pid
    returning x.slug into s;
    select coalesce(jsonb_agg(jsonb_build_object('u', f.user_id, 'i', k.image, 'k', k.nth, 't', f.created_at)), '[]'::jsonb)
      into keep
      from public.pack_faves f
      join (select x.id, x.image, row_number() over (partition by x.image order by x.idx) as nth
              from public.pack_cards x where x.pack_id = pid) k on k.id = f.card_id;
    delete from public.pack_cards x where x.pack_id = pid;
  end if;

  for c in select * from jsonb_array_elements(cards) loop
    insert into public.pack_cards (pack_id, idx, image, rarity, caption)
    values (pid, i, c->>'image', coalesce(c->>'rarity', 'common'), left(coalesce(c->>'caption', ''), 140));
    i := i + 1;
  end loop;

  if keep is not null and jsonb_array_length(keep) > 0 then
    insert into public.pack_faves (user_id, card_id, created_at)
    select (e->>'u')::uuid, k.id, (e->>'t')::timestamptz
      from jsonb_array_elements(keep) e
      join (select x.id, x.image, row_number() over (partition by x.image order by x.idx) as nth
              from public.pack_cards x where x.pack_id = pid) k
        on k.image = e->>'i' and k.nth = (e->>'k')::int
    on conflict do nothing;
  end if;
  return s;
end
$fn$;
revoke execute on function public.pack_save(jsonb) from public, anon;
grant  execute on function public.pack_save(jsonb) to authenticated;


-- SECTION 2. Stories: a gone cover goes in the takedown queue; a retired member is off the tables ---
-- Same shape as posts_cleanup_image (002): queue the file, the desk's drain removes it through the Storage API. Kept
-- when another story or a post still points at the same file.
create or replace function public.member_story_cover_cleanup()
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
  if exists (select 1 from public.member_stories s
              where s.id <> old.id and s.cover_url is not null and public.storage_object_name(s.cover_url) = gone)
     or exists (select 1 from public.posts x
                 where x.image_url is not null and public.storage_object_name(x.image_url) = gone) then
    return null;
  end if;
  insert into public.orphan_images (object_name, reason)
  values (gone, case when tg_op = 'DELETE' then 'story deleted' else 'story cover replaced' end)
  on conflict (object_name) do update
    set reason = excluded.reason, cleared = false, created_at = now();
  return null;
end $fn$;
revoke execute on function public.member_story_cover_cleanup() from public, anon, authenticated;

drop trigger if exists trg_member_stories_cover_del on public.member_stories;
create trigger trg_member_stories_cover_del
  after delete on public.member_stories
  for each row execute function public.member_story_cover_cleanup();

drop trigger if exists trg_member_stories_cover_upd on public.member_stories;
create trigger trg_member_stories_cover_upd
  after update of cover_url on public.member_stories
  for each row execute function public.member_story_cover_cleanup();

-- The word_stories and word_wall views already hide a member who is not approved (008, 010). The tables behind them
-- did not, so a retired member's story still opened at its link (word/live falls back to the table). The author still
-- reads their own, and the desk reads everything, through their own rules (unchanged).
drop policy if exists "anyone reads published stories" on public.member_stories;
create policy "anyone reads published stories" on public.member_stories
  for select using (published and exists (select 1 from public.profiles pr where pr.id = member_stories.author_id and pr.approved));

drop policy if exists "anyone reads published entries" on public.word_entries;
create policy "anyone reads published entries" on public.word_entries
  for select using (published and exists (select 1 from public.profiles pr where pr.id = word_entries.author_id and pr.approved));


-- SECTION 3. Kin: the count follows the faces; a blocked ask leaves your asks -------------
-- 041's friend_asks, carried whole, one line added (the block).
create or replace function public.friend_asks()
returns table (sid text, name text, pic text, kind text, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.wall_sid(x.id), coalesce(nullif(btrim(x.display_name), ''), 'Member'),
         case when s.user_id is null then x.card_photo else s.pic end,
         case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
         f.created_at
    from public.wall_friends f
    join public.profiles x on x.id = f.a
    left join public.wall_spaces s on s.user_id = x.id
   where public.is_wall_member() and f.b = auth.uid() and f.status = 'asked' and public.wall_member(f.a)
     and not public.dm_blocked(f.a, auth.uid())
   order by f.created_at desc
   limit 200;
$fn$;
revoke execute on function public.friend_asks() from public, anon;
grant  execute on function public.friend_asks() to authenticated;

-- 041's wall_space, carried whole. Changes: friends_n counts what the faces and friends_list show (all of them on your
-- own page or for the desk, open pages for everyone else); the twelve faces are picked after that filter, not before;
-- comments sort by time then id, so wall_space_posts_before() can pick up exactly where this stops.
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
    'friend',   public.friend_state_of(me, who),
    'friends_n', (select count(*) from public.friend_rows(who) r
                   where who = me or public.is_admin() or public.wall_open(r.id)),
    'friends',  (select coalesce(jsonb_agg(jsonb_build_object(
                          's', public.wall_sid(x.id),
                          'n', coalesce(nullif(btrim(x.display_name), ''), 'Member'),
                          'p', case when s2.user_id is null then x.card_photo else s2.pic end) order by r.since desc nulls last), '[]'::jsonb)
                   from (select r0.id, r0.since from public.friend_rows(who) r0
                          where who = me or public.is_admin() or public.wall_open(r0.id)
                          order by r0.since desc nulls last
                          limit 12) r
                   join public.profiles x on x.id = r.id
                   left join public.wall_spaces s2 on s2.user_id = x.id),
    'asks_n',   case when who = me then (select count(*) from public.friend_asks()) else 0 end,
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
                          order by q.created_at desc, q.id desc), '[]'::jsonb)
                   from (select c.id, c.body, c.created_at,
                                coalesce(nullif(btrim(a.display_name), ''), 'Member') as name,
                                case when public.wall_open(a.id) then public.wall_sid(a.id) end as sid,
                                case when sa.user_id is null then a.card_photo else sa.pic end as pic,
                                (c.author = me or c.owner = me or public.is_admin()) as del
                           from public.wall_space_posts c
                           join public.profiles a on a.id = c.author
                           left join public.wall_spaces sa on sa.user_id = a.id
                          where c.owner = who and public.wall_member(a.id)
                          order by c.created_at desc, c.id desc limit 40) q),
    'posts_n',  (select count(*) from public.wall_space_posts c
                  where c.owner = who and public.wall_member(c.author))
  );
end $fn$;
revoke execute on function public.wall_space(text) from public, anon;
grant  execute on function public.wall_space(text) to authenticated;


-- SECTION 4. Page comments past the newest 40 ---------------------------------------------
-- The next 40 older than a comment the page already shows (its `t` and `id`), newest first, the same rows and the same
-- keys as wall_space's `posts`, under the same door (members only; somebody else's page only while it is open, or the
-- desk). A new name, not a new argument on wall_space: a second wall_space signature would make the API call ambiguous.
create or replace function public.wall_space_posts_before(p_sid text, p_before timestamptz, p_before_id bigint default null)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare
  me   uuid := auth.uid();
  who  uuid;
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
  if p_before is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', q.id, 'b', q.body, 't', q.created_at, 'n', q.name, 's', q.sid, 'p', q.pic, 'del', q.del)
                   order by q.created_at desc, q.id desc), '[]'::jsonb)
            from (select c.id, c.body, c.created_at,
                         coalesce(nullif(btrim(a.display_name), ''), 'Member') as name,
                         case when public.wall_open(a.id) then public.wall_sid(a.id) end as sid,
                         case when sa.user_id is null then a.card_photo else sa.pic end as pic,
                         (c.author = me or c.owner = me or public.is_admin()) as del
                    from public.wall_space_posts c
                    join public.profiles a on a.id = c.author
                    left join public.wall_spaces sa on sa.user_id = a.id
                   where c.owner = who and public.wall_member(a.id)
                     and case when p_before_id is null then c.created_at < p_before
                              else (c.created_at, c.id) < (p_before, p_before_id) end
                   order by c.created_at desc, c.id desc limit 40) q);
end $fn$;
revoke execute on function public.wall_space_posts_before(text, timestamptz, bigint) from public, anon;
grant  execute on function public.wall_space_posts_before(text, timestamptz, bigint) to authenticated;


-- SECTION 5. Messages: fifteen new conversations means fifteen you started; a report stays the reporter's ---
-- 040's dm_send, carried whole. One change: the ceiling counts today's threads whose FIRST message is mine (messages
-- are never removed, only marked deleted, so the first one stays the first one).
create or replace function public.dm_send(p_sid text, p_body text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me    uuid := auth.uid();
  who   uuid := public.dm_who(p_sid);
  txt   text := public.wall_text(p_body);   -- not `b`: that is a column of the threads table, and PL/pgSQL would not know which one
  lo    uuid; hi uuid;
  tid   bigint;
  mid   bigint;
  fresh boolean := false;
begin
  if me is null or not public.is_wall_member() then
    raise exception 'Members only.' using errcode = '42501';
  end if;
  if who is null or who = me or not public.wall_member(who) then
    raise exception 'Nobody there to write to.' using errcode = '22023';
  end if;
  if txt is null or char_length(txt) > 600 then
    raise exception 'Say something, 600 letters max.' using errcode = '22023';
  end if;
  if public.dm_blocked(me, who) then
    raise exception 'They are not taking messages.' using errcode = '42501';
  end if;
  select p.lo, p.hi into lo, hi from public.dm_pair(me, who) p;
  perform pg_advisory_xact_lock(hashtextextended('dm:' || lo::text || hi::text, 0));
  select t.id into tid from public.wall_dm_threads t where t.a = lo and t.b = hi;
  if tid is null then
    -- a first message needs their page open, and there is a ceiling on new conversations
    if not public.wall_open(who) then
      raise exception 'They are not taking messages.' using errcode = '42501';
    end if;
    if (select count(*) from public.wall_dm_threads t
         where (t.a = me or t.b = me)
           and t.created_at > now() - interval '1 day'
           and (select m.sender from public.wall_dm_messages m where m.thread_id = t.id order by m.id limit 1) = me) >= 15 then
      raise exception 'Slow down: that is fifteen new conversations today.' using errcode = '42501';
    end if;
    fresh := true;
  end if;
  if (select count(*) from public.wall_dm_messages m where m.sender = me and m.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Slow down, try again in a bit.' using errcode = '42501';
  end if;
  if fresh then
    insert into public.wall_dm_threads (a, b, last_by, last_line) values (lo, hi, me, left(txt, 120)) returning id into tid;
  end if;
  insert into public.wall_dm_messages (thread_id, sender, body) values (tid, me, txt) returning id into mid;
  update public.wall_dm_threads t
     set last_at = now(), last_by = me, last_line = left(txt, 120),
         a_hidden = false, b_hidden = false,
         a_read_at = case when t.a = me then now() else t.a_read_at end,
         b_read_at = case when t.b = me then now() else t.b_read_at end
   where t.id = tid;
  return jsonb_build_object('thread', tid, 'message', mid);
end $fn$;
revoke execute on function public.dm_send(text, text) from public, anon;
grant  execute on function public.dm_send(text, text) to authenticated;

-- 040's dm_report, carried whole. One change: once a conversation is reported, only the person who reported it can
-- change the note; the other side's report leaves the first one standing (it still answers true, as before).
create or replace function public.dm_report(p_thread bigint, p_note text default null)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_wall_member() then return false; end if;
  update public.wall_dm_threads t
     set reported_by = coalesce(t.reported_by, me),
         reported_at = case when t.reported_by is null or t.reported_by = me then now() else t.reported_at end,
         report_note = case when t.reported_by is null or t.reported_by = me then public.wall_line(p_note) else t.report_note end
   where t.id = p_thread and (t.a = me or t.b = me);
  return found;
end $fn$;
revoke execute on function public.dm_report(bigint, text) from public, anon;
grant  execute on function public.dm_report(bigint, text) to authenticated;


-- SECTION 6. The Take: a card holder keeps a face on their posts ----------------------------
-- 033's take_feed, carried whole. One change: `pic` for a card holder or the desk was null (the homepage paints a
-- roster card holder from roster.json), so somebody made a card holder in the Crypt or on /desk/, who has no roster
-- entry yet, went from their picture to a bare letter. Now: their card photo, else their Crypt picture. Roster card
-- holders still paint from the roster first. Same columns, still never the author's id.
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
   where p.published = true and public.take_author_ok(pr.id)
   order by p.pinned desc, p.created_at desc
   limit least(greatest(coalesce(p_limit, 8), 1), 60);
$fn$;
grant execute on function public.take_feed(integer) to anon, authenticated;


-- SECTION 7. Retired desk calls -------------------------------------------------------------
drop function if exists public.wall_casual_list();
drop function if exists public.wall_remove(uuid);


-- ---------- verify: every line should say true ----------
select 'pack edits keep their hearts'          as test, (pg_get_functiondef('public.pack_save(jsonb)'::regprocedure) like '%into keep%')::text as ok
union all select 'the desk can fix a member''s pack',   (pg_get_functiondef('public.pack_save(jsonb)'::regprocedure) like '%own::text%')::text
union all select 'story covers go in the takedown queue', ((select count(*) from pg_trigger where tgrelid = 'public.member_stories'::regclass
                                                           and tgname in ('trg_member_stories_cover_del', 'trg_member_stories_cover_upd')) = 2)::text
union all select 'a retired member''s story is off the table', (select qual like '%approved%' from pg_policies where schemaname = 'public'
                                                           and tablename = 'member_stories' and policyname = 'anyone reads published stories')::text
union all select 'and their word-wall lines',          (select qual like '%approved%' from pg_policies where schemaname = 'public'
                                                           and tablename = 'word_entries' and policyname = 'anyone reads published entries')::text
union all select 'a blocked ask leaves your asks',     (pg_get_functiondef('public.friend_asks()'::regprocedure) like '%dm_blocked%')::text
union all select 'the friend count follows the faces', (pg_get_functiondef('public.wall_space(text)'::regprocedure) like '%friend_rows(who) r%where who = me%')::text
union all select 'older comments can be paged',        has_function_privilege('authenticated', 'public.wall_space_posts_before(text, timestamptz, bigint)', 'execute')::text
union all select 'strangers cannot page them',         (not has_function_privilege('anon', 'public.wall_space_posts_before(text, timestamptz, bigint)', 'execute'))::text
union all select 'fifteen counts the ones you started', (pg_get_functiondef('public.dm_send(text, text)'::regprocedure) like '%order by m.id limit 1%')::text
union all select 'a second report keeps the first',    (pg_get_functiondef('public.dm_report(bigint, text)'::regprocedure) like '%coalesce(t.reported_by, me)%')::text
union all select 'card holders keep a face on the Take', (pg_get_functiondef('public.take_feed(integer)'::regprocedure) like '%card_photo%')::text
union all select 'anyone still reads the Take',        has_function_privilege('anon', 'public.take_feed(integer)', 'execute')::text
union all select 'the two retired desk calls are gone', ((select count(*) from pg_proc where pronamespace = 'public'::regnamespace
                                                           and proname in ('wall_casual_list', 'wall_remove')) = 0)::text
union all select 'migration 025 went in first',        (exists (select 1 from information_schema.columns where table_schema = 'public'
                                                           and table_name = 'calendar_dates' and column_name = 'credited_to'))::text;
