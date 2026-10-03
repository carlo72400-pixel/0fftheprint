-- ============================================================================
-- 0FF THE PRINT, migration 034: THE WALK-THROUGH.
--
-- His ask (10/3): "do a pass thru and fix any bugs". This is the database half.
-- Every item below was reproduced on a local replica of this database first
-- (99_SYSTEM/_tools/otp_dbtest), fixed there, and re-tested before it was
-- written down here.
--
--  1. FLYER COMMENTS. Delete and Hide on a flyer comment did nothing (029 gave
--     the table no read rule, so the delete never found its row). A comment's
--     time is the database's now, not the sender's.
--  2. GOING and VIBE VOTES had no ceiling at all. Now: 200 nights marked at a
--     time, 300 votes a day, only nights that are on the wall, server time.
--  3. A POST'S PHOTO has to be exactly one of our files (the old rule only
--     checked how the address started). Thirty edits an hour is the ceiling.
--  4. NAMES. The 033 rule could be walked past with a look-alike letter, an
--     invisible character or a missing space, and the Instagram handle was
--     never checked. A name that becomes a card holder's is taken back from
--     anybody else wearing it.
--  5. A BANNED member's posts were still readable straight off the posts table.
--  6. REVOKE + PULL POSTS now closes The Wall for that person too (since 033 a
--     revoked card holder could walk back in with the member code and post).
--     A banned person cannot be handed a card until the ban comes off.
--     Ban and yes/no refuse an empty answer instead of guessing.
--  7. COUNTS on a flyer skip banned and removed people, the same as the
--     comment list already did. A member who turned "show me" off no longer
--     has their Instagram handle sent with their comment.
--  8. TIMELINE: p7 and p07 were two keys for one post; the 60-key cap on
--     counts could be walked past; the reaction ceiling was a lifetime total
--     (a regular would have been locked out for good one day). Now a day's worth.
--  9. The `take` photo bucket could be listed by anyone. Photos still load
--     for everyone by their address; the list is the owner's and the desk's.
-- 10. CARD FRAMES. 007's rule let anyone without a grant wear any house frame
--     (a comparison against nothing counts as a pass). Fixed going forward.
-- 11. THE DOOR. Somebody who asked for a card on /join/ and then took the
--     member code stays in the desk's queue. Taking back a "no" on the board
--     takes it back on The Wall too. The desk queue learns who is banned.
--     Code tries are counted one at a time (ten at once all used to pass).
-- 12. A member page headline may be as long as a card tagline (80), because a
--     new page borrows the tagline and a long one could never be saved.
--
-- Safe to run again.
-- ============================================================================


-- SECTION 1. Flyer comments ------------------------------------------------------
-- UPDATE/DELETE ... WHERE id = x also needs a SELECT rule; 029 made none, so they matched 0 rows.
drop policy if exists "own or desk reads" on public.wall_comments;
create policy "own or desk reads" on public.wall_comments for select
  using (user_id = auth.uid() or public.is_admin());
grant select on public.wall_comments to authenticated;

create or replace function public.wall_comment_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  new.created_at := now();        -- was the sender's: a back date dodged the hourly limit, a future date sat on top
  if (select count(*) from public.wall_comments c
       where c.user_id = new.user_id and c.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Slow down, try again in a bit.' using errcode = '42501';
  end if;
  new.body := left(btrim(regexp_replace(new.body, '[[:cntrl:]]', ' ', 'g')), 280);
  return new;
end $fn$;


-- SECTION 2. Going and vibe votes get a ceiling ------------------------------------
-- (The page keeps a mark for the whole week it was made in, so the window reaches
--  back eight days; the month page reaches forward about five weeks.)
create or replace function public.wall_mark_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare today date := (now() at time zone 'America/Chicago')::date;
begin
  new.created_at := now();
  if tg_table_name = 'wall_going' then
    if new.day < today - 8 or new.day > today + 120 then
      raise exception 'That night is not on the wall.' using errcode = '22023';
    end if;
    if (select count(*) from public.wall_going g where g.user_id = new.user_id and g.day >= today - 8) >= 200 then
      raise exception 'Slow down.' using errcode = '42501';
    end if;
  elsif (select count(*) from public.wall_votes v
          where v.user_id = new.user_id and v.created_at > now() - interval '1 day') >= 300 then
    raise exception 'Slow down.' using errcode = '42501';
  end if;
  return new;
end $fn$;
revoke execute on function public.wall_mark_guard() from public, anon, authenticated;
drop trigger if exists wall_going_guard on public.wall_going;
create trigger wall_going_guard before insert on public.wall_going
  for each row execute function public.wall_mark_guard();
drop trigger if exists wall_votes_guard on public.wall_votes;
create trigger wall_votes_guard before insert on public.wall_votes
  for each row execute function public.wall_mark_guard();


-- SECTION 3. A post's photo is exactly one of our files --------------------------
-- <bucket>/<member id>/<one file name>, nothing after it. (Checked against every
-- post on the live site before this was written: all pass.)
alter table public.posts drop constraint if exists posts_image_url_ours;
alter table public.posts add constraint posts_image_url_ours check (
  image_url is null or image_url ~
  '^https://frqpvcpyglhmerwpvosl\.supabase\.co/storage/v1/object/public/(posts|take)/[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.[A-Za-z0-9]{2,5}$'
) not valid;
alter table public.posts validate constraint posts_image_url_ours;

-- every edit keeps the old words in post_revisions; nothing capped how many
create or replace function public.guard_post_edit_rate()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if public.privileged_caller() then return new; end if;
  if (new.text is distinct from old.text or new.image_url is distinct from old.image_url
      or new.image_alt is distinct from old.image_alt)
     and (select count(*) from public.post_revisions r
           where r.replaced_by = auth.uid() and r.replaced_at > now() - interval '1 hour') >= 30 then
    raise exception 'Slow down. Thirty edits an hour is the ceiling.' using errcode = '55000';
  end if;
  return new;
end $fn$;
revoke execute on function public.guard_post_edit_rate() from public, anon, authenticated;
drop trigger if exists trg_posts_edit_rate on public.posts;
create trigger trg_posts_edit_rate before update on public.posts
  for each row execute function public.guard_post_edit_rate();


-- SECTION 4. Names -----------------------------------------------------------------
-- What a name looks like to somebody reading it: fancy and fullwidth letters fold to
-- plain ones, the Cyrillic, Greek and small-capital letters that read as Latin ones
-- fold to them, invisible characters and punctuation drop out, and any other
-- character becomes "_" (one unknown letter, so a look-alike still lines up under LIKE).
create or replace function public.name_key(t text)
returns text language sql immutable
set search_path = pg_temp as $fn$
  select regexp_replace(regexp_replace(regexp_replace(
           translate(lower(normalize(coalesce(t, ''), NFKC)),
                     'аАвВеЕёЁкКмМнНоОрРсСтТуУхХѕЅіІјЈѵѴԛԚԝԜһҺԁԀαΑβΒεΕζΖιΙκΚοΟρΡτΤχΧᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀᴛᴜᴠᴡʏᴢ',
                     'aabbeeeekkmmhhooppccttyyxxssiijjvvqqwwhhddaabbeezziikkooppttxxabcdefghijklmnopqrtuvwyz'),
           '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0]', '', 'g'),
           '[\u0001-\u002f\u003a-\u0060\u007b-\u007f]', '', 'g'),
           '[^a-z0-9]', '_', 'g');
$fn$;

-- Is this name the house's or a card holder's (anybody but p_id)?
create or replace function public.name_taken(p_id uuid, p_name text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  with me as (select public.name_key(p_name) as k, lower(normalize(btrim(coalesce(p_name, '')), NFKC)) as raw),
       pool as (select public.name_key(r.slug) as h, r.slug as raw from public.reserved_slugs r
                union all
                select public.name_key(v.x), lower(normalize(v.x, NFKC))
                  from public.profiles q, lateral (values (q.display_name), (q.card_slug)) v(x)
                 where q.id <> p_id and (q.approved or q.is_admin) and v.x is not null)
  select exists (select 1 from me, pool
                  where pool.raw = me.raw
                     or (replace(me.k, '_', '') <> '' and pool.h = me.k)
                     -- look-alikes: only when at least three plain letters are left to line up
                     or (length(replace(me.k, '_', '')) >= 3 and length(replace(pool.h, '_', '')) >= 3
                         and (pool.h like me.k or me.k like pool.h)));
$fn$;
revoke execute on function public.name_key(text), public.name_taken(uuid, text) from public, anon, authenticated;

-- Signup and rename. A taken name at signup becomes "Member a1b2c3"; on a rename it
-- reverts. The handle beside the name is identity too. Nothing in here is ever the
-- reason a signup fails: if the check itself breaks, the name goes through unchecked.
create or replace function public.guard_profile_name()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  invisible constant text := '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0]';
  clean text;
begin
  if tg_op = 'UPDATE' and public.privileged_caller() then return new; end if;
  if tg_op = 'INSERT' and (new.approved or new.is_admin) then return new; end if;
  begin
    if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then
      clean := btrim(regexp_replace(new.display_name, invisible, '', 'g'));
      if clean is null or clean = '' or public.name_taken(new.id, clean) then
        new.display_name := case when tg_op = 'UPDATE' then old.display_name
                                 else 'Member ' || left(md5(new.id::text), 6) end;
      else
        new.display_name := clean;
      end if;
    end if;
    if new.instagram is not null and (tg_op = 'INSERT' or new.instagram is distinct from old.instagram)
       and (exists (select 1 from public.reserved_slugs r where public.name_key(r.slug) = public.name_key(new.instagram))
            or exists (select 1 from public.profiles q
                        where q.id <> new.id and (q.approved or q.is_admin)
                          and lower(q.instagram) = lower(new.instagram))) then
      new.instagram := case when tg_op = 'UPDATE' then old.instagram else null end;
    end if;
  exception when others then
    raise warning 'guard_profile_name: %', sqlerrm;
  end;
  return new;
end $fn$;
drop trigger if exists profiles_guard_name on public.profiles;
create trigger profiles_guard_name
  before insert or update of display_name, instagram on public.profiles
  for each row execute function public.guard_profile_name();

-- A name or handle that BECOMES a card holder's (approval, a desk rename, a new
-- card) is taken back from everybody else who is not one.
create or replace function public.profiles_name_claim()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if new.approved or new.is_admin then
    begin
      update public.profiles p
         set display_name = 'Member ' || left(md5(p.id::text), 6)
       where p.id <> new.id and not p.approved and not p.is_admin
         and public.name_taken(p.id, p.display_name);
      if new.instagram is not null then
        update public.profiles p
           set instagram = null
         where p.id <> new.id and not p.approved and not p.is_admin
           and lower(p.instagram) = lower(new.instagram);
      end if;
    exception when others then
      raise warning 'profiles_name_claim: %', sqlerrm;
    end;
  end if;
  return null;
end $fn$;
revoke execute on function public.profiles_name_claim() from public, anon, authenticated;
drop trigger if exists profiles_name_claim on public.profiles;
create trigger profiles_name_claim
  after update of approved, display_name, card_slug, instagram on public.profiles
  for each row execute function public.profiles_name_claim();

-- one time: anybody already wearing a card holder's name or handle (033 never looked
-- back). Checked against the live site before this was written: nobody is.
update public.profiles p
   set display_name = 'Member ' || left(md5(p.id::text), 6)
 where not p.approved and not p.is_admin and public.name_taken(p.id, p.display_name);
update public.profiles p
   set instagram = null
 where not p.approved and not p.is_admin and p.instagram is not null
   and exists (select 1 from public.profiles q where q.id <> p.id and (q.approved or q.is_admin)
                and lower(q.instagram) = lower(p.instagram));


-- SECTION 5. A banned member's posts come off the raw table too --------------------
-- take_feed() already left them out; reading public.posts directly did not.
grant execute on function public.take_author_ok(uuid) to anon;
drop policy if exists "anyone reads published posts" on public.posts;
create policy "anyone reads published posts" on public.posts
  for select using (published = true and public.take_author_ok(author_id));


-- SECTION 6. Revoke closes The Wall; a ban blocks a card; yes and no need an answer --
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
  -- 033 made "Wall member" enough to post, so revoking has to close The Wall for them too.
  -- ("Put them back" on the desk lifts this again.)
  insert into public.wall_people (user_id, casual, banned, banned_at) values (p_author, false, true, now())
  on conflict (user_id) do update set banned = true, banned_at = coalesce(wall_people.banned_at, now());
  b := public.admin_pull_author(p_author);
  return b;
end;
$fn$;

create or replace function public.guard_profile_banned()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if new.approved and not old.approved
     and exists (select 1 from public.wall_people w where w.user_id = new.id and w.banned) then
    raise exception 'Banned on The Wall. Unban them first.' using errcode = '42501';
  end if;
  return new;
end $fn$;
revoke execute on function public.guard_profile_banned() from public, anon, authenticated;
drop trigger if exists profiles_guard_banned on public.profiles;
create trigger profiles_guard_banned before update of approved on public.profiles
  for each row execute function public.guard_profile_banned();

create or replace function public.wall_ban(p_user uuid, p_ban boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_ban is null then raise exception 'Ban or unban?' using errcode = '22023'; end if;     -- was: nothing meant BAN
  if not exists (select 1 from public.profiles x where x.id = p_user) then
    raise exception 'Nobody by that id.' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles x where x.id = p_user and x.is_admin) then
    raise exception 'The desk can''t be banned.' using errcode = '22023';
  end if;
  insert into public.wall_people (user_id, casual, banned, banned_at)
  values (p_user, false, p_ban, case when p_ban then now() end)
  on conflict (user_id) do update
    set banned = excluded.banned, banned_at = excluded.banned_at,
        -- an open card request does not outlive a ban
        card_ask = case when excluded.banned and wall_people.card_ask = 'asked' then null else wall_people.card_ask end;
  return true;
end $fn$;

create or replace function public.wall_card_decide(p_user uuid, p_yes boolean)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare nm text; cur text; base text; cand text; i int := 1;
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_yes is null then raise exception 'Yes or no?' using errcode = '22023'; end if;        -- was: nothing meant NO
  if not exists (select 1 from public.profiles x where x.id = p_user) then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if p_yes then
    update public.profiles set denied = false where id = p_user and denied;     -- the door trigger clears denied_at
    update public.profiles set approved = true where id = p_user;               -- profiles_guard_banned refuses a banned person here
    update public.wall_people set card_ask = null, card_ask_at = now() where user_id = p_user;
    select x.display_name, x.card_slug into nm, cur from public.profiles x where x.id = p_user;
    if cur is not null then return cur; end if;
    base := coalesce(public.slugify(nm), 'member');
    if base = '' or exists (select 1 from public.reserved_slugs r where r.slug = base) then base := 'member'; end if;   -- was: could hand out "admin"
    loop
      cand := case when i = 1 then base else base || '-' || i end;
      begin
        return public.admin_set_card(p_user, cand);
      exception when sqlstate '55000' then
        i := i + 1;
        if i > 30 then return null; end if;
      end;
    end loop;
  else
    if exists (select 1 from public.profiles x where x.id = p_user and (x.approved or x.is_admin)) then
      raise exception 'They already hold a card.' using errcode = '22023';       -- was: stamped a "no" on a card holder
    end if;
    update public.profiles set denied = true where id = p_user and not approved;  -- trigger stamps denied_at
    insert into public.wall_people (user_id, card_ask, card_ask_at) values (p_user, 'denied', now())
    on conflict (user_id) do update set card_ask = 'denied', card_ask_at = now();
    return 'denied';
  end if;
end $fn$;


-- SECTION 7. Counts skip banned people; "show me" off hides the handle too ----------
create or replace function public.wall_tally(p_ids text[])
returns table (event_id text, going integer, votes jsonb, comments integer, who jsonb)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  with ids as (select distinct unnest(p_ids) as id),
  g as (select g.event_id, count(*)::int n
          from public.wall_going g join ids on ids.id = g.event_id
         where public.wall_member(g.user_id) group by 1),
  v as (select x.event_id, jsonb_object_agg(x.vibe, x.n) j
          from (select v.event_id, v.vibe, count(*)::int n
                  from public.wall_votes v join ids on ids.id = v.event_id
                 where public.wall_member(v.user_id) group by 1, 2) x
         group by 1),
  c as (select c.event_id, count(*)::int n
          from public.wall_comments c join ids on ids.id = c.event_id
         where not c.hidden and public.wall_member(c.user_id) group by 1),
  w as (select x.event_id, jsonb_agg(jsonb_build_object('n', x.display_name, 'ig', x.instagram, 's', x.sid, 'k', x.kind) order by x.created_at) j
          from (select g.event_id, p.display_name, p.instagram, g.created_at, public.wall_sid(g.user_id) as sid,
                       case when p.is_admin then 'desk' when p.approved then 'card' else 'member' end as kind,
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

create or replace function public.wall_thread(p_event text)
returns table (id bigint, body text, created_at timestamptz, name text, ig text, mine boolean, hidden boolean, sid text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select c.id, c.body, c.created_at, p.display_name,
         case when public.wall_open(c.user_id) or public.is_admin() then p.instagram end,
         c.user_id = auth.uid(), c.hidden,
         case when public.wall_open(c.user_id) then public.wall_sid(c.user_id) end
    from public.wall_comments c join public.profiles p on p.id = c.user_id
   where public.is_wall_member() and c.event_id = p_event
     and (not c.hidden or public.is_admin())
     and (public.wall_member(c.user_id) or public.is_admin())
   order by c.created_at desc
   limit 60;
$fn$;


-- SECTION 8. Timeline keys, counts, and the reaction ceiling -------------------------
create or replace function public.take_key_ok(k text)
returns boolean language sql immutable
set search_path = public, pg_temp as $fn$
  select k is not null and k ~ '^(p[1-9][0-9]{0,11}|s[0-9a-f]{16})$';     -- p07 used to be a second key for post 7
$fn$;

create or replace function public.take_tally(p_keys text[])
returns table (post_key text, reactions jsonb, comments integer, mine jsonb)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  with keys as (select distinct u.k from (select k from unnest(p_keys) as k limit 60) u where public.take_key_ok(u.k)),
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

-- The ceiling was 3000 reactions in a lifetime, which a regular reaches one day and
-- never comes back from. Real posts: 600 a day. Seed keys cannot be checked against
-- anything, so those keep a small standing total.
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
  if left(p_key, 1) = 's' then
    if (select count(*) from public.take_reactions t where t.user_id = me and left(t.post_key, 1) = 's') >= 200 then
      raise exception 'Slow down.' using errcode = '42501';
    end if;
  elsif (select count(*) from public.take_reactions t
          where t.user_id = me and t.created_at > now() - interval '1 day') >= 600 then
    raise exception 'Slow down.' using errcode = '42501';
  end if;
  insert into public.take_reactions (user_id, post_key, kind) values (me, p_key, p_kind)
  on conflict do nothing;
  return true;
end $fn$;


-- SECTION 9. The take bucket is not a public list ----------------------------------
-- A public bucket serves every file by its address without asking this table, so
-- photos on posts still load for everyone. What this closes is LISTING the bucket
-- (member ids as folder names, and photos somebody attached and never posted).
-- Same shape as the spaces bucket since 030.
drop policy if exists "take photos are public" on storage.objects;
drop policy if exists "members see their own take photos" on storage.objects;
create policy "members see their own take photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'take' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));


-- SECTION 10. The frame ladder (007) -------------------------------------------------
-- "card_frame = frame_grant" is NULL when there is no grant, and a CHECK lets NULL
-- through, so anybody without a grant could wear any house frame. NOT VALID: rows
-- already saved are left alone (nobody on the live site is wearing one they were not given).
alter table public.profiles
  drop constraint if exists profiles_card_frame_allowed,
  add  constraint profiles_card_frame_allowed
       check (card_frame is null
              or card_frame in ('common','uncommon','rare','rare-holo')
              or (frame_grant is not null and card_frame = frame_grant)) not valid;


-- SECTION 11. The door ---------------------------------------------------------------
-- (a) Code tries are taken one at a time (ten requests sent together all used to pass
--     the count). (b) Somebody who signed up on /join/ asked for a card; when they
--     also take the member code they stay in the desk's queue as an open ask.
--     The Wall's own join form says via = wall, and those people asked for nothing.
create or replace function public.wall_redeem(p_code text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('wall_redeem:' || uid::text, 0));
  if exists (select 1 from public.wall_people w where w.user_id = uid and w.banned) then
    raise exception 'This account can''t join The Wall.' using errcode = '42501';
  end if;
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
    if exists (select 1 from public.profiles x where x.id = uid and not x.approved and not x.is_admin and not coalesce(x.denied, false))
       and coalesce((select u.raw_user_meta_data ->> 'via' from auth.users u where u.id = uid), '') <> 'wall' then
      update public.wall_people set card_ask = 'asked', card_ask_at = now()
       where user_id = uid and card_ask is null;
    end if;
    return true;
  end if;
  return false;
end $fn$;

-- the board's "no" and The Wall's "no" are one answer, both ways
create or replace function public.profiles_card_ask_sync()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if old.denied and not new.denied then
    update public.wall_people set card_ask = 'asked', card_ask_at = now()
     where user_id = new.id and card_ask = 'denied';
  elsif new.denied and not old.denied then
    update public.wall_people set card_ask = 'denied', card_ask_at = now()
     where user_id = new.id and card_ask = 'asked';
  end if;
  return null;
end $fn$;
revoke execute on function public.profiles_card_ask_sync() from public, anon, authenticated;
drop trigger if exists profiles_card_ask_sync on public.profiles;
create trigger profiles_card_ask_sync after update of denied on public.profiles
  for each row execute function public.profiles_card_ask_sync();

-- the /desk/ queue learns who is banned (one column appended at the end)
drop function if exists public.desk_profiles();
create function public.desk_profiles()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, created_at timestamptz,
               instagram text,
               denied boolean, denied_at timestamptz,
               -- 032, appended
               wall_casual boolean, card_ask text,
               -- 034, appended
               wall_banned boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.created_at, p.instagram,
         p.denied, p.denied_at,
         coalesce(w.casual, false), w.card_ask,
         coalesce(w.banned, false)
    from public.profiles p left join public.wall_people w on w.user_id = p.id
   where public.is_admin()
   order by p.created_at desc;
$fn$;
revoke execute on function public.desk_profiles() from public, anon;
grant  execute on function public.desk_profiles() to authenticated;


-- SECTION 12. A headline as long as a tagline ---------------------------------------
alter table public.wall_spaces
  drop constraint if exists wall_spaces_headline_check,
  add  constraint wall_spaces_headline_check
       check (headline is null or (char_length(headline) <= 80 and headline !~ '[\n\r]'));


-- SECTION 13. Check it. One row, every column true.
select
  (select count(*) from pg_policy where polrelid = 'public.wall_comments'::regclass and polname = 'own or desk reads') = 1 as comments_readable,
  (select count(*) from pg_trigger where not tgisinternal and tgname in
     ('wall_going_guard', 'wall_votes_guard', 'trg_posts_edit_rate', 'profiles_guard_name', 'profiles_name_claim',
      'profiles_guard_banned', 'profiles_card_ask_sync')) = 7                                              as triggers_ok,
  (select convalidated from pg_constraint where conname = 'posts_image_url_ours')                          as photo_rule_ok,
  public.name_key('V' || chr(1040) || 'MP PSYCH' || chr(8203)) = 'vamppsych'                             as names_fold,
  public.name_taken(gen_random_uuid(), 'vamp' || chr(8203) || 'psych')                                    as house_name_taken,
  not public.name_taken(gen_random_uuid(), 'Somebody Brand New 9000')                                     as new_name_free,
  has_function_privilege('anon', 'public.take_author_ok(uuid)', 'execute')                                as feed_rule_ok,
  not public.take_key_ok('p07') and public.take_key_ok('p7')                                              as keys_ok,
  (select count(*) from pg_policy where polrelid = 'storage.objects'::regclass
      and polname in ('take photos are public', 'members see their own take photos')) = 1                 as take_list_closed,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'wall_spaces' and column_name = 'headline') = 1
    and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'wall_spaces_headline_check') like '%80%' as headline_ok,
  (select pronargs = 0 and prorettype = 'record'::regtype from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'desk_profiles')
    and (select pg_get_function_result(oid) from pg_proc
          where pronamespace = 'public'::regnamespace and proname = 'desk_profiles') like '%wall_banned%'  as desk_queue_ok;
