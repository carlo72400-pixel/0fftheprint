-- ============================================================
-- 044 · THE BACK ROOM (10/11, Wave 2: people and power. His calls 2, 3, 5, 7, 9 and the members manager on /board/)
-- ============================================================
-- A ban and a close are now GATES, not flag flips. Nothing about a person is changed when the desk bans them or when
-- an account is closed: their card, name, @ and everything they made stay exactly as they were, and every surface
-- simply stops showing them. Unban and Open it again are exact.
--   S1.  New columns and tables: wall_people.card_want / out_batch / ban_note, account_closures, account_log, reports,
--        wall_dm_messages.desk_removed, house_seats (the roster seats the card door never hands out by itself).
--   S2.  Helpers (none of them are doors): acct_open, acct_ok, card_shown, dark_seats, the log, name checks, the file
--        lists, the one-profile pick, the report reads.
--   S3.  THE GATE. acct_ok goes into is_approved, is_wall_member, wall_member, take_author_ok, my_profile and the public
--        profiles rule (through card_shown). A banned or closed card holder goes dark on the whole site.
--   S4.  Profile guards: the card photo may sit in their cards or spaces folder; card holders rename through the desk;
--        three self renames a day; every name and @ change is logged; one face (Crypt pic and song) at promotion; the
--        034 name claim takes back only what an update hands out, so nobody is renamed by a change to somebody else.
--   S5.  THE ONE CARD RULE: desk_card. Make card holder (which card, in a fixed order, never a roster seat unless the
--        desk names it) and take the card back. The Crypt's ask can name the card they want.
--   S6.  THE ONE BAN RULE: desk_ban. Off the Crypt and the site; unban puts it all back.
--   S7.  Close and reopen, by the member (undoable by them) or by the desk (undoable by the desk).
--   S8.  Fix their info: name, @, frame, song, and clearing a page one thing at a time. Card art and pack photos stop
--        being listable by strangers.
--   S9.  One profile: the Crypt and the card share one photo and one song for card holders.
--   S10. Reports: one list for the desk, every kind, and DM reports move onto it. The desk removes one message.
--   S11. Block means block: no page comments, no friendship, no Top 8 spot.
--   S12. The desk takes one frame tag off.
--   S13. Backfills: Revokes from before today, /join/ asks, the DM report move, blocked pairs.
--   S14. The verify row, then informational rows.
-- ⛔ Paste after 043, before 045, in one sitting. One transaction: an error applies nothing from this file.
-- ⛔ A "potentially destructive query" prompt WILL appear (functions and policies dropped and re-made). Confirm it.
-- Nothing is deleted except what the old revoke flow already hid (nothing) and stale friendships between people who
-- blocked each other. Safe to run twice. The last statement prints the verify row (every column true) and the info rows.
-- ============================================================


-- SECTION 0. Preconditions, and what changes before anything does ---------------------
do $$ begin
  if to_regprocedure('public.wall_space_posts_before(text,timestamptz,bigint)') is null then
    raise exception 'Run migration 042 first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'frame_tags' and column_name = 'media') then
    raise exception 'Run migration 043 first.';
  end if;
  -- read before 13.1 hands old revokes their card back (they would be counted here too)
  perform set_config('otp.i044_dark', (
    select count(*)::text || coalesce(' (' || string_agg(coalesce(nullif(btrim(x.display_name), ''), 'Member'), ', ' order by x.display_name) || ')', '')
      from public.profiles x join public.wall_people w on w.user_id = x.id
     where x.approved and w.banned and not x.is_admin), false);
end $$;


-- SECTION 1. Tables and columns ----------------------------------------------------------
-- 1a. what a member asked to be called on a card, the pull batch of a Revoke from before today, the desk's ban note
alter table public.wall_people
  add column if not exists card_want text,
  add column if not exists out_batch uuid,
  add column if not exists ban_note  text;
alter table public.wall_people
  drop constraint if exists wall_people_card_want_ok,
  add  constraint wall_people_card_want_ok check (card_want is null or card_want ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  drop constraint if exists wall_people_ban_note_ok,
  add  constraint wall_people_ban_note_ok check (ban_note is null or char_length(ban_note) <= 280);
comment on column public.wall_people.out_batch is
  'The pull batch of a Revoke from before 044. Unban republishes exactly those posts, then this goes back to null.';

-- 1b. closed accounts: a row with reopened_at null is closed. A re-close updates the same row.
create table if not exists public.account_closures (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  closed_at   timestamptz not null default now(),
  closed_by   uuid,
  by_desk     boolean not null default false,
  reason      text check (reason is null or char_length(reason) <= 280),
  reopened_at timestamptz,
  reopened_by uuid
);
alter table public.account_closures enable row level security;
revoke all on table public.account_closures from public, anon, authenticated;

-- 1c. the history the Members page shows: name, ig, card_on, card_off, card_no, card_unno, ban, unban, close,
--     closed_self, reopen, reopened_self, frame, song, page_clear, dm_remove, item, untag, read
create table if not exists public.account_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  by      uuid,
  target  uuid not null references auth.users(id) on delete cascade,
  action  text not null,
  detail  jsonb not null default '{}'::jsonb
);
create index if not exists account_log_target on public.account_log (target, at desc);
create index if not exists account_log_target_action on public.account_log (target, action, at desc);
alter table public.account_log enable row level security;
revoke all on table public.account_log from public, anon, authenticated;

-- 1d. one list of reports for the desk, every kind. `about` is worked out here, never sent by a page.
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('dm','take_comment','flyer_comment','space_post','space','post','pack','room','frame_tag')),
  target      text not null check (char_length(target) between 1 and 200),
  about       uuid references auth.users(id) on delete set null,
  by_user     uuid not null references auth.users(id) on delete cascade,
  why         text check (why is null or why in ('mean','spam','private','not_them','other')),
  note        text check (note is null or char_length(note) <= 280),
  shot        jsonb,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   uuid references auth.users(id) on delete set null,
  outcome     text check (outcome is null or outcome in ('kept','hidden','removed','banned','gone'))
);
create unique index if not exists reports_one_open on public.reports (by_user, kind, target) where closed_at is null;
create index if not exists reports_open on public.reports (kind, target) where closed_at is null;
create index if not exists reports_about on public.reports (about, created_at desc);
create index if not exists reports_by on public.reports (by_user, created_at desc);
alter table public.reports enable row level security;
revoke all on table public.reports from public, anon, authenticated;

-- 1e. one message the desk took out of a reported chat (the words stay for the desk)
alter table public.wall_dm_messages add column if not exists desk_removed boolean not null default false;

-- 1f. a card holder's card photo may also be their Crypt picture (spaces folder): one photo (S9)
alter table public.profiles drop constraint if exists profiles_card_photo_ours;
alter table public.profiles add constraint profiles_card_photo_ours check (card_photo is null or card_photo ~
  '^https://frqpvcpyglhmerwpvosl\.supabase\.co/storage/v1/object/public/(cards|spaces)/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$');

-- 1g. the roster seats. Written from content/roster.json and content/creators.json (no card holders there today):
--     each seat's card_slug AND the card its name makes (slugify), when the two differ (The Ink = theink and the-ink),
--     because the pages match a roster seat to a row by either one. A new roster seat later needs its inserts here
--     (RUNBOOK says so).
create table if not exists public.house_seats (
  slug text primary key check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$')
);
alter table public.house_seats enable row level security;
revoke all on table public.house_seats from public, anon, authenticated;
comment on table public.house_seats is 'roster seats: the card door never hands one out without the desk naming it (044)';
insert into public.house_seats (slug) values
  ('kav-man'), ('virgosgateway'), ('wrathfol'), ('theink'), ('kurlytop'), ('wunmor'), ('josh-fuego'), ('vamppsych'),
  ('the-ink'), ('wun-mor')
on conflict (slug) do nothing;


-- SECTION 2. Helpers (not doors) ----------------------------------------------------------
-- open = no closure waiting to be undone
create or replace function public.acct_open(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select not exists (select 1 from public.account_closures c where c.user_id = p and c.reopened_at is null);
$fn$;
revoke execute on function public.acct_open(uuid) from public, anon, authenticated;

-- ok = open and not banned. Reads no profiles row.
create or replace function public.acct_ok(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.acct_open(p)
     and not exists (select 1 from public.wall_people w where w.user_id = p and w.banned);
$fn$;
revoke execute on function public.acct_ok(uuid) from public, anon, authenticated;

-- Is this card on show? The public profiles rule calls it as the reader. Always false for a casual member, so it says
-- nothing about them; for a card holder it says only what the cards view already shows.
create or replace function public.card_shown(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.profiles x where x.id = p and x.approved) and public.acct_ok(p);
$fn$;
revoke execute on function public.card_shown(uuid) from public;
grant  execute on function public.card_shown(uuid) to anon, authenticated;

create or replace function public.dark_seats()
returns text[] language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(array_agg(x.card_slug order by x.card_slug), '{}')
    from public.profiles x
   where x.card_slug is not null and not x.is_admin and not public.card_shown(x.id);
$fn$;
revoke execute on function public.dark_seats() from public;
grant  execute on function public.dark_seats() to anon, authenticated;
comment on function public.dark_seats() is
  'card slugs whose holder is banned, closed or demoted: the same fact their c/<slug>/ page already shows (044)';

create or replace function public.acct_log(p_target uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer
set search_path = public, pg_temp as $fn$
  insert into public.account_log (by, target, action, detail) values (auth.uid(), p_target, p_action, coalesce(p_detail, '{}'::jsonb));
$fn$;
revoke execute on function public.acct_log(uuid, text, jsonb) from public, anon, authenticated;

-- name_taken's matching (034), against every OTHER profile's name, any role: a casual member's name counts here
create or replace function public.name_worn(p_id uuid, p_name text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  with me as (select public.name_key(p_name) as k, lower(normalize(btrim(coalesce(p_name, '')), NFKC)) as raw),
       pool as (select public.name_key(q.display_name) as h, lower(normalize(q.display_name, NFKC)) as raw
                  from public.profiles q
                 where q.id <> p_id and q.display_name is not null)
  select exists (select 1 from me, pool
                  where pool.raw = me.raw
                     or (replace(me.k, '_', '') <> '' and pool.h = me.k)
                     or (length(replace(me.k, '_', '')) >= 3 and length(replace(pool.h, '_', '')) >= 3
                         and (pool.h like me.k or me.k like pool.h)));
$fn$;
revoke execute on function public.name_worn(uuid, text) from public, anon, authenticated;

-- name_taken's matching (034), one name against one other: the same words, the same letters, or a look-alike with at
-- least three plain letters to line up. The claim trigger (S4) and the 13.1 info row use it.
create or replace function public.names_clash(p_a text, p_b text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  with a as (select public.name_key(p_a) as k, lower(normalize(btrim(coalesce(p_a, '')), NFKC)) as raw),
       b as (select public.name_key(p_b) as k, lower(normalize(btrim(coalesce(p_b, '')), NFKC)) as raw)
  select p_a is not null and p_b is not null
         and (a.raw = b.raw
              or (replace(a.k, '_', '') <> '' and b.k = a.k)
              or (length(replace(a.k, '_', '')) >= 3 and length(replace(b.k, '_', '')) >= 3
                  and (b.k like a.k or a.k like b.k)))
    from a, b;
$fn$;
revoke execute on function public.names_clash(text, text) from public, anon, authenticated;

-- A name cleaned exactly the way guard_profile_name (034) cleans one, then control characters and runs of spaces.
create or replace function public.name_clean(p text)
returns text language plpgsql immutable security definer
set search_path = public, pg_temp as $fn$
declare
  invisible constant text := '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff\uffa0]';
begin
  return btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''), invisible, '', 'g'),
                                             '[[:cntrl:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g'));
end $fn$;
revoke execute on function public.name_clean(text) from public, anon, authenticated;

-- an open card ask and a pending flyer source come off when an account closes
create or replace function public.acct_withdraw(p uuid)
returns void language sql security definer
set search_path = public, pg_temp as $fn$
  update public.wall_people set card_ask = null, card_ask_at = now(), card_note = null, card_want = null
   where user_id = p and card_ask = 'asked';
  delete from public.wall_sources where user_id = p and status = 'pending';
$fn$;
revoke execute on function public.acct_withdraw(uuid) from public, anon, authenticated;

-- The files a clear may remove: their own spaces/cards files, never the current card photo, never one a page still
-- shows. Always called AFTER the clearing update. The page removes them through the Storage API.
create or replace function public.desk_space_files(p_user uuid, p_urls text[])
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(distinct jsonb_build_object('bucket', z.m[1], 'name', z.m[2])), '[]'::jsonb)
    from (select u.u, regexp_match(regexp_replace(u.u, '[?#].*$', ''), '/storage/v1/object/public/(spaces|cards)/(.+)$') as m
            from unnest(coalesce(p_urls, '{}'::text[])) as u(u)
           where u.u is not null) z
   where z.m is not null
     and left(z.m[2], 37) = p_user::text || '/'
     and z.u is distinct from (select x.card_photo from public.profiles x where x.id = p_user)
     and not exists (select 1 from public.wall_spaces s where s.pic = z.u or s.wallpaper = z.u or z.u = any(s.pics));
$fn$;
revoke execute on function public.desk_space_files(uuid, text[]) from public, anon, authenticated;

-- When a file went up: its storage row, else the epoch-ms in a card file name, else nothing
create or replace function public.file_born(p_url text)
returns timestamptz language sql stable security definer
set search_path = public, storage, pg_temp as $fn$
  select coalesce(
           (select o.created_at from storage.objects o where o.bucket_id = z.m[1] and o.name = z.m[2] limit 1),
           case when z.m[1] = 'cards' and z.m[2] ~ '/[0-9]{13}' then to_timestamp(substring(z.m[2] from '/([0-9]{13})')::bigint / 1000.0) end)
    from (select regexp_match(regexp_replace(coalesce(p_url, ''), '[?#].*$', ''), '/storage/v1/object/public/([a-z]+)/(.+)$') as m) z;
$fn$;
revoke execute on function public.file_born(text) from public, anon, authenticated;

-- One face: the Crypt pic wins when it is newer than the card photo (or there is none); the Crypt song wins when set
-- and different (the start then goes back to the top). Otherwise the card's own values come back unchanged.
create or replace function public.face_pick(p uuid, out photo text, out song text, out start integer)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case when sp.pic is not null and sp.pic is distinct from pr.card_photo
                   and (pr.card_photo is null
                        or coalesce(public.file_born(sp.pic), sp.updated_at) > coalesce(public.file_born(pr.card_photo), '-infinity'::timestamptz))
              then sp.pic else pr.card_photo end,
         case when sp.song is not null and sp.song is distinct from pr.theme_track then sp.song else pr.theme_track end,
         case when sp.song is not null and sp.song is distinct from pr.theme_track then null else pr.theme_start end
    from public.profiles pr left join public.wall_spaces sp on sp.user_id = pr.id
   where pr.id = p;
$fn$;
revoke execute on function public.face_pick(uuid) from public, anon, authenticated;

-- a person, the way the desk's lists draw them
create or replace function public.desk_person(p uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'user_id', x.id,
    'sid',     public.wall_sid(x.id),
    'name',    coalesce(nullif(btrim(x.display_name), ''), 'Member'),
    'pic',     coalesce(s.pic, x.card_photo),
    'kind',    case when x.is_admin then 'desk' when x.approved then 'card' when coalesce(w.casual, false) then 'member' else 'login' end,
    'ig',      x.instagram,
    'open',    public.wall_open(x.id),
    'member',  public.wall_member(x.id),
    'banned',  coalesce(w.banned, false),
    'closed',  not public.acct_open(x.id))
    from public.profiles x
    left join public.wall_spaces s on s.user_id = x.id
    left join public.wall_people w on w.user_id = x.id
   where x.id = p;
$fn$;
revoke execute on function public.desk_person(uuid) from public, anon, authenticated;

-- what a reported chat said at report time (deleted and desk-removed lines carry no words)
create or replace function public.dm_snapshot(p_thread bigint)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'from', public.wall_sid(q.sender),
                                               'b', case when q.deleted or q.desk_removed then null else q.body end,
                                               't', q.created_at) order by q.id), '[]'::jsonb)
    from (select m.id, m.sender, m.body, m.created_at, m.deleted, m.desk_removed
            from public.wall_dm_messages m where m.thread_id = p_thread order by m.id desc limit 20) q;
$fn$;
revoke execute on function public.dm_snapshot(bigint) from public, anon, authenticated;

-- the desk's view of a reported chat: the words always, and whether each line was taken back or removed
create or replace function public.dm_desk_msgs(p_thread bigint)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'from', public.wall_sid(q.sender), 'b', q.body,
                                               't', q.created_at, 'removed', q.deleted or q.desk_removed) order by q.id), '[]'::jsonb)
    from (select m.id, m.sender, m.body, m.created_at, m.deleted, m.desk_removed
            from public.wall_dm_messages m where m.thread_id = p_thread order by m.id desc limit 40) q;
$fn$;
revoke execute on function public.dm_desk_msgs(bigint) from public, anon, authenticated;

-- Is a reported thing still up, hidden, or gone?
create or replace function public.report_state(p_kind text, p_target text)
returns text language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare v_n bigint; v_m text[]; v_s text;
begin
  if p_kind in ('dm','take_comment','flyer_comment','space_post','post','pack','room') then
    if p_target is null or p_target !~ '^[1-9][0-9]{0,17}$' then return 'gone'; end if;
    v_n := p_target::bigint;
  end if;
  case p_kind
    when 'dm' then
      select 'up' into v_s from public.wall_dm_threads t where t.id = v_n;
    when 'take_comment' then
      select case when c.hidden or not public.wall_member(c.user_id) then 'hidden' else 'up' end into v_s
        from public.take_comments c where c.id = v_n;
    when 'flyer_comment' then
      select case when c.hidden or not public.wall_member(c.user_id) then 'hidden' else 'up' end into v_s
        from public.wall_comments c where c.id = v_n;
    when 'space_post' then
      select case when public.wall_member(c.author) and public.wall_member(c.owner) then 'up' else 'hidden' end into v_s
        from public.wall_space_posts c where c.id = v_n;
    when 'post' then
      select case when p.published then 'up' else 'hidden' end into v_s from public.posts p where p.id = v_n;
    when 'pack' then
      select case when p.published then 'up' else 'hidden' end into v_s from public.packs p where p.id = v_n;
    when 'room' then
      select case when r.published then 'up' else 'hidden' end into v_s from public.rooms r where r.id = v_n;
    when 'space' then
      -- a page is up while its owner is open, saved or not (a fresh page has no wall_spaces row; report_target agrees)
      select case when public.wall_open(x.id) then 'up' else 'hidden' end into v_s
        from public.profiles x
       where p_target ~ '^[0-9a-f]{10}$' and public.wall_sid(x.id) = p_target limit 1;
    when 'frame_tag' then
      v_m := regexp_match(coalesce(p_target, ''), '^([0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60})/([a-z0-9][a-z0-9_-]{0,40})/([0-9a-f]{10})$');
      if v_m is not null then
        select case when public.wall_open(t.user_id) then 'up' else 'hidden' end into v_s
          from public.frame_tags t where t.event_slug = v_m[1] and t.media = v_m[2] and public.wall_sid(t.user_id) = v_m[3] limit 1;
      end if;
    else
      v_s := null;
  end case;
  return coalesce(v_s, 'gone');
end $fn$;
revoke execute on function public.report_state(text, text) from public, anon, authenticated;

-- Who a reported thing belongs to, and a copy of it, as THIS member can see it. No row = not theirs to report:
-- missing, hidden, or (a chat) one they are not in. Numeric targets are checked before any cast.
create or replace function public.report_target(p_kind text, p_target text, p_me uuid)
returns table (who_id uuid, snap jsonb) language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
#variable_conflict use_column
declare v_n bigint; v_m text[];
begin
  if p_target is null or char_length(p_target) not between 1 and 200 then return; end if;
  if p_kind in ('dm','take_comment','flyer_comment','space_post','post','pack','room') then
    if p_target !~ '^[1-9][0-9]{0,17}$' then return; end if;
    v_n := p_target::bigint;
  end if;
  if p_kind = 'dm' then
    return query select case when t.a = p_me then t.b else t.a end, jsonb_build_object('msgs', public.dm_snapshot(t.id))
                   from public.wall_dm_threads t where t.id = v_n and p_me in (t.a, t.b);
  elsif p_kind = 'take_comment' then
    return query select c.user_id, jsonb_build_object('b', c.body, 'post', c.post_key)
                   from public.take_comments c
                  where c.id = v_n and not c.hidden and public.wall_member(c.user_id) and public.take_key_live(c.post_key);
  elsif p_kind = 'flyer_comment' then
    return query select c.user_id, jsonb_build_object('b', c.body, 'ev', c.event_id)
                   from public.wall_comments c
                  where c.id = v_n and not c.hidden and public.wall_member(c.user_id);
  elsif p_kind = 'space_post' then
    return query select c.author, jsonb_build_object('b', c.body, 'on', public.wall_sid(c.owner))
                   from public.wall_space_posts c
                  where c.id = v_n and public.wall_member(c.author) and public.wall_member(c.owner)
                    and (c.owner = p_me or public.wall_open(c.owner));
  elsif p_kind = 'space' then
    if p_target !~ '^[0-9a-f]{10}$' then return; end if;
    return query select x.id, to_jsonb(s) - 'top8' - 'user_id'
                   from public.profiles x left join public.wall_spaces s on s.user_id = x.id
                  where public.wall_sid(x.id) = p_target and public.wall_open(x.id)
                  limit 1;
  elsif p_kind = 'post' then
    -- members_only arrives in 045: plpgsql reads the column when this runs, not when it is made
    return query select p.author_id, jsonb_build_object('text', p.text, 'img', p.image_url, 'members_only', p.members_only)
                   from public.posts p
                  where p.id = v_n and p.published and public.take_author_ok(p.author_id)
                    and (not p.members_only or public.wall_member(p.author_id));
  elsif p_kind = 'pack' then
    return query select p.author_id, jsonb_build_object('slug', p.slug, 'title', p.title, 'line', p.line, 'cover', p.cover)
                   from public.packs p
                  where p.id = v_n and p.published and public.wall_member(p.author_id);
  elsif p_kind = 'room' then
    return query select r.author_id, jsonb_build_object('name', r.name, 'label', r.label, 'line', r.line, 'playlist', r.playlist)
                   from public.rooms r
                  where r.id = v_n and r.published and public.wall_member(r.author_id);
  elsif p_kind = 'frame_tag' then
    v_m := regexp_match(p_target, '^([0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60})/([a-z0-9][a-z0-9_-]{0,40})/([0-9a-f]{10})$');
    if v_m is null then return; end if;
    return query select t.user_id, jsonb_build_object('slug', t.event_slug, 'media', t.media)
                   from public.frame_tags t
                  where t.event_slug = v_m[1] and t.media = v_m[2] and public.wall_sid(t.user_id) = v_m[3]
                    and public.wall_open(t.user_id)
                  limit 1;
  end if;
end $fn$;
revoke execute on function public.report_target(text, text, uuid) from public, anon, authenticated;

-- a block ends a friendship (any status) and the Top 8 spot both ways
create or replace function public.block_cleanup(x uuid, y uuid)
returns void language sql security definer
set search_path = public, pg_temp as $fn$
  delete from public.wall_friends f where (f.a = x and f.b = y) or (f.a = y and f.b = x);
  update public.wall_spaces s set top8 = array_remove(s.top8, y) where s.user_id = x and y = any(s.top8);
  update public.wall_spaces s set top8 = array_remove(s.top8, x) where s.user_id = y and x = any(s.top8);
$fn$;
revoke execute on function public.block_cleanup(uuid, uuid) from public, anon, authenticated;


-- SECTION 3. The gate ----------------------------------------------------------------------
-- 002's is_approved, carried. One change: a banned or closed card holder is not approved to anything.
create or replace function public.is_approved()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce((select p.approved and public.acct_ok(p.id) from public.profiles p where p.id = auth.uid()), false);
$fn$;
grant execute on function public.is_approved() to anon, authenticated;

-- 032's is_wall_member, carried. One change: a closed account is not a member.
create or replace function public.is_wall_member()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(public.is_admin(), false)
      or ((coalesce(public.is_approved(), false)
           or exists (select 1 from public.wall_people w where w.user_id = auth.uid() and w.casual))
          and not exists (select 1 from public.wall_people w where w.user_id = auth.uid() and w.banned)
          and public.acct_open(auth.uid()));
$fn$;
revoke execute on function public.is_wall_member() from public, anon;
grant  execute on function public.is_wall_member() to authenticated;

-- 032's wall_member, carried. One change: a closed account is not a member (wall_open follows it).
create or replace function public.wall_member(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.profiles x left join public.wall_people w on w.user_id = x.id
                  where x.id = p
                    and (x.is_admin or ((x.approved or coalesce(w.casual, false)) and not coalesce(w.banned, false) and public.acct_open(x.id))));
$fn$;
revoke execute on function public.wall_member(uuid) from public, anon, authenticated;

-- 033's take_author_ok, carried. One change: a banned card holder leaves the Take too (since 044 the Crypt ban and the
-- old Revoke are one thing), and so does a closed account.
create or replace function public.take_author_ok(p uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.profiles x left join public.wall_people w on w.user_id = x.id
                  where x.id = p
                    and (x.is_admin or ((x.approved or coalesce(w.casual, false)) and not coalesce(w.banned, false) and public.acct_open(x.id))));
$fn$;
revoke execute on function public.take_author_ok(uuid) from public;
grant  execute on function public.take_author_ok(uuid) to anon, authenticated;

-- The public profiles rule. A banned, closed or demoted card holder drops off the cards view, the feed, word_stories,
-- the word wall, the rotation, videos, the calendar and every rule that looks a profile up.
drop policy if exists "approved profiles are public" on public.profiles;
create policy "approved profiles are public" on public.profiles
  for select using (approved = true and public.card_shown(id));

-- 023's my_profile, carried (same sixteen columns). One change: approved answers false while banned or closed.
create or replace function public.my_profile()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, accent public.accent,
               created_at timestamptz,
               card_frame public.card_frame, frame_grant public.card_frame,
               card_photo text, theme_track text, theme_start integer,
               link_platform text, link_handle text,
               -- 023, appended
               denied boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved and public.acct_ok(p.id), p.is_admin, p.accent, p.created_at,
         p.card_frame, p.frame_grant, p.card_photo, p.theme_track,
         p.theme_start, p.link_platform, p.link_handle,
         p.denied
    from public.profiles p
   where p.id = auth.uid();
$fn$;
revoke execute on function public.my_profile() from public, anon;
grant  execute on function public.my_profile() to authenticated;

-- 040's dm_person, carried. One change: a closed account shows as Closed account (the desk still sees who).
create or replace function public.dm_person(p uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case when not public.acct_open(x.id) and not coalesce(public.is_admin(), false) then jsonb_build_object(
    'sid', public.wall_sid(x.id), 'name', 'Closed account', 'pic', null, 'kind', 'member', 'open', false, 'member', false)
  else jsonb_build_object(
    'sid',  public.wall_sid(x.id),
    'name', coalesce(nullif(btrim(x.display_name), ''), 'Member'),
    'pic',  case when s.user_id is null then x.card_photo else s.pic end,
    'kind', case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
    'open', public.wall_open(x.id),
    'member', public.wall_member(x.id)) end
    from public.profiles x left join public.wall_spaces s on s.user_id = x.id where x.id = p;
$fn$;
revoke execute on function public.dm_person(uuid) from public, anon, authenticated;

-- 035's wall_join, carried whole. One change: a closed account gets a word, not an error (shut = the desk closed it).
create or replace function public.wall_join(p_ig text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  uid  uuid := auth.uid();
  have text;
  want text := public.wall_ig_norm(p_ig);
  isin boolean;
begin
  if uid is null then return 'need'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wall_redeem:' || uid::text, 0));
  if exists (select 1 from public.wall_people w where w.user_id = uid and w.banned) then
    raise exception 'This account can''t join the Crypt.' using errcode = '42501';   -- 044: the Crypt
  end if;
  if not public.acct_open(uid) then
    return case when exists (select 1 from public.account_closures c where c.user_id = uid and c.reopened_at is null and c.by_desk)
                then 'shut' else 'closed' end;
  end if;
  select p.instagram into have from public.profiles p where p.id = uid;
  if not found then return 'need'; end if;
  isin := public.is_wall_member();
  -- already in, and nothing to add: a card holder, or a member from before this rule
  if isin and (have is not null or want is null) then return 'in'; end if;
  -- no handle on the account and none typed: nothing was tried, so nothing is counted.
  -- (The pages ask this on every load for a login that is not on The Wall yet.)
  if have is null and want is null then return 'need'; end if;

  if (select count(*) from public.wall_code_tries t
       where t.user_id = uid and t.at > now() - interval '1 hour') >= 10 then
    return 'slow';
  end if;
  insert into public.wall_code_tries (user_id) values (uid);

  if have is null then
    begin
      update public.profiles set instagram = want where id = uid;
    exception when unique_violation then
      return 'taken';
    end;
    -- the name guard hands a card holder's or the house's handle back: same answer
    select p.instagram into have from public.profiles p where p.id = uid;
    if have is distinct from want then return 'taken'; end if;
  end if;
  if isin then return 'in'; end if;            -- they were in already and now carry a handle too

  insert into public.wall_people (user_id, casual) values (uid, true)
    on conflict (user_id) do update set casual = true;
  -- 034 (b), unchanged: somebody who signed up on /join/ asked for a card and stays an open
  -- ask; The Wall's own form says via = wall, and those people asked for nothing
  if exists (select 1 from public.profiles x where x.id = uid and not x.approved and not x.is_admin and not coalesce(x.denied, false))
     and coalesce((select u.raw_user_meta_data ->> 'via' from auth.users u where u.id = uid), '') <> 'wall' then
    update public.wall_people set card_ask = 'asked', card_ask_at = now()
     where user_id = uid and card_ask is null;
  end if;
  return 'in';
end $fn$;
revoke execute on function public.wall_join(text) from public, anon;
grant  execute on function public.wall_join(text) to authenticated;

-- 034's guard, re-made: approving somebody banned or closed is refused (the SQL editor steps past it)
create or replace function public.guard_profile_banned()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if new.approved and not old.approved and not public.direct_sql_caller() then
    if exists (select 1 from public.wall_people w where w.user_id = new.id and w.banned) then
      raise exception 'Banned. Unban them first.' using errcode = '42501';
    end if;
    if not public.acct_open(new.id) then
      raise exception 'That account is closed. Open it back up first.' using errcode = '42501';
    end if;
  end if;
  return new;
end $fn$;
revoke execute on function public.guard_profile_banned() from public, anon, authenticated;
drop trigger if exists profiles_guard_banned on public.profiles;
create trigger profiles_guard_banned before update of approved on public.profiles
  for each row execute function public.guard_profile_banned();


-- SECTION 4. Profile guards and triggers ------------------------------------------------------
-- BEFORE UPDATE triggers fire in name order: guard_profile_privileges, profiles_guard_banned, profiles_guard_door,
-- profiles_guard_handle, profiles_guard_name, profiles_guard_rename, profiles_text_guard, profiles_zz_one_face.

-- 007's guard, carried VERBATIM. One change: the card photo may sit in their cards OR spaces folder (one photo, S9).
-- guard_profile_handle (035) is NOT touched: members do not change their own @ this wave (his call 7: later).
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.privileged_caller() then
    new.id             := old.id;
    new.approved       := old.approved;
    new.is_admin       := old.is_admin;
    new.card_slug      := old.card_slug;
    new.requested_slug := old.requested_slug;
    new.created_at     := old.created_at;
    new.frame_grant    := old.frame_grant;   -- 007: a member cannot grant themselves a tier

    if new.display_name is distinct from old.display_name then
      if exists (select 1 from public.reserved_slugs r
                 where r.slug = public.slugify(new.display_name))
         or exists (select 1 from public.profiles p
                    where p.id <> new.id
                      and p.card_slug = public.slugify(new.display_name)) then
        new.display_name := old.display_name;
      end if;
    end if;

    -- 007: the card photo has to sit in this member's own storage folder.
    -- The CHECK constraint pins the URL SHAPE; only a trigger can compare the
    -- uid segment to the caller, because a CHECK has no caller.
    if new.card_photo is distinct from old.card_photo and new.card_photo is not null then
      if split_part(regexp_replace(new.card_photo, '^.*/storage/v1/object/public/(cards|spaces)/', ''), '/', 1) <> old.id::text then   -- 044: cards or spaces
        raise exception 'That photo is not in your folder.' using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end $$;
revoke execute on function public.guard_profile_privileges() from public, anon, authenticated;

-- A member renames themself up to three times a day. A card holder's name changes through the desk (his call 7), and
-- a closed account keeps its name. Reverts, never errors, like every other guard on this table.
create or replace function public.guard_profile_rename()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if public.privileged_caller() or new.display_name is not distinct from old.display_name then return new; end if;
  if not public.acct_open(old.id)
     or old.approved
     or (select count(*) from public.account_log l
          where l.target = old.id and l.by = old.id and l.action = 'name' and l.at > now() - interval '24 hours') >= 3 then
    new.display_name := old.display_name;
  end if;
  return new;
end $fn$;
revoke execute on function public.guard_profile_rename() from public, anon, authenticated;
drop trigger if exists profiles_guard_rename on public.profiles;
create trigger profiles_guard_rename before update of display_name on public.profiles
  for each row execute function public.guard_profile_rename();

-- every name and @ change goes in the history, whoever made it. Never the reason a save fails.
create or replace function public.profiles_change_log()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  begin
    if new.display_name is distinct from old.display_name then
      insert into public.account_log (by, target, action, detail)
      values (auth.uid(), new.id, 'name', jsonb_build_object('old', old.display_name, 'new', new.display_name));
    end if;
    if new.instagram is distinct from old.instagram then
      insert into public.account_log (by, target, action, detail)
      values (auth.uid(), new.id, 'ig', jsonb_build_object('old', old.instagram, 'new', new.instagram));
    end if;
  exception when others then
    raise warning 'profiles_change_log: %', sqlerrm;
  end;
  return null;
end $fn$;
revoke execute on function public.profiles_change_log() from public, anon, authenticated;
drop trigger if exists profiles_change_log on public.profiles;
create trigger profiles_change_log after update of display_name, instagram on public.profiles
  for each row execute function public.profiles_change_log();

-- Made a card holder: their Crypt pic and song go on the card, unless this same update sets the card's own.
create or replace function public.profiles_one_face()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare f record;
begin
  select * into f from public.face_pick(new.id);
  if new.card_photo is not distinct from old.card_photo then
    new.card_photo := f.photo;
  end if;
  if new.theme_track is not distinct from old.theme_track then
    new.theme_track := f.song;
    new.theme_start := f.start;
  end if;
  return new;
end $fn$;
revoke execute on function public.profiles_one_face() from public, anon, authenticated;
drop trigger if exists profiles_zz_one_face on public.profiles;
create trigger profiles_zz_one_face before update of approved on public.profiles
  for each row when (new.approved and not old.approved)
  execute function public.profiles_one_face();

-- A card holder's card photo and song ARE their Crypt pic and song: every change to the card copies to the page.
create or replace function public.profiles_face_mirror()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  update public.wall_spaces s
     set pic  = case when old.card_photo  is distinct from new.card_photo  or new.card_photo  is not null then new.card_photo  else s.pic  end,
         song = case when old.theme_track is distinct from new.theme_track or new.theme_track is not null then new.theme_track else s.song end
   where s.user_id = new.id
     and (s.pic is distinct from new.card_photo or s.song is distinct from new.theme_track);
  return null;
end $fn$;
revoke execute on function public.profiles_face_mirror() from public, anon, authenticated;
drop trigger if exists profiles_face_mirror on public.profiles;
create trigger profiles_face_mirror after update on public.profiles
  for each row when ((new.approved or new.is_admin)
                     and (old.card_photo is distinct from new.card_photo
                          or old.theme_track is distinct from new.theme_track
                          or (new.approved and not old.approved)))
  execute function public.profiles_face_mirror();

-- 034's claim, carried VERBATIM but for one change: it takes back only what THIS update hands out (a new card holder's
-- name and card, a new name, a new card), checked against that one row. 034 swept every member against every holder,
-- so a member who wears the name of a Revoke handed back by 13.1 was renamed the next time the desk touched ANY card
-- holder. The @ half stays as it was (one account per @ since 035, so it never meets anybody else's). Trigger unchanged.
create or replace function public.profiles_name_claim()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare became boolean := not (old.approved or old.is_admin);   -- 044: a card holder as of this update
begin
  if new.approved or new.is_admin then
    begin
      update public.profiles p
         set display_name = 'Member ' || left(md5(p.id::text), 6)
       where p.id <> new.id and not p.approved and not p.is_admin
         -- 044: only what this update hands out, checked against this one row
         and exists (select 1 from (values (new.display_name, became or new.display_name is distinct from old.display_name),
                                           (new.card_slug,    became or new.card_slug    is distinct from old.card_slug)) v(x, fresh)
                      where v.fresh and v.x is not null and public.names_clash(p.display_name, v.x));
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


-- SECTION 5. The one card rule -------------------------------------------------------------
-- Make card holder, or take the card back. Which card, in this order: the one the desk names (a roster seat only this
-- way), the card they already hold, the one they asked for, the one they asked for at /join/, then one off their name
-- (a roster seat's name starts at -2). Taking it back keeps the slug and the frame grant, so the same card comes back.
create or replace function public.desk_card(p_user uuid, p_on boolean, p_slug text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_x    public.profiles;
  v_want text;
  v_req  text;
  v_s    text;
  v_base text;
  v_cand text;
  v_i    int;
  v_got  text;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Card or no card?' using errcode = '22023'; end if;
  select * into v_x from public.profiles x where x.id = p_user;
  if v_x.id is null then raise exception 'Nobody by that id.' using errcode = '22023'; end if;

  if not p_on then
    if v_x.is_admin then raise exception 'The desk keeps its card.' using errcode = '22023'; end if;
    if p_user = auth.uid() then raise exception 'That is you. Pick somebody else.' using errcode = '55000'; end if;
    update public.profiles set approved = false where id = p_user and approved;
    insert into public.wall_people (user_id, casual) values (p_user, true)
    on conflict (user_id) do update set casual = true;
    perform public.acct_log(p_user, 'card_off', jsonb_build_object('slug', v_x.card_slug));
    return null;
  end if;

  if not public.acct_open(p_user) then
    raise exception 'That account is closed. Open it back up first.' using errcode = '42501';
  end if;
  if exists (select 1 from public.wall_people w where w.user_id = p_user and w.banned) then
    raise exception 'Banned. Unban them first.' using errcode = '42501';
  end if;
  if p_slug is not null then
    v_s := public.slugify(p_slug);
    if v_s is null or v_s = '' then
      raise exception 'That card name needs letters or numbers.' using errcode = '22023';
    end if;
    if not v_x.is_admin and exists (select 1 from public.reserved_slugs r where r.slug = v_s) then
      raise exception 'That card name is the house''s.' using errcode = '22023';
    end if;
  end if;
  select w.card_want into v_want from public.wall_people w where w.user_id = p_user;

  update public.profiles set denied = false where id = p_user and denied;
  update public.profiles set approved = true where id = p_user and not approved;
  update public.wall_people set card_ask = null, card_ask_at = now(), card_want = null where user_id = p_user;

  -- 1. the card the desk names (a roster seat is allowed this way, and only this way)
  if v_s is not null then
    begin
      v_got := public.admin_set_card(p_user, v_s);
    exception when sqlstate '55000' then
      raise exception 'Somebody already holds that card.' using errcode = '55000';
    end;
  end if;
  -- 2. the card they already hold
  if v_got is null then v_got := v_x.card_slug; end if;
  -- 3. the card they asked for, then 4. the one they asked for at /join/: free, not the house's, not a roster seat
  if v_got is null then
    v_req := public.slugify(v_x.requested_slug);
    foreach v_cand in array array[public.slugify(v_want), v_req] loop
      if v_got is null and v_cand is not null
         and not exists (select 1 from public.reserved_slugs r where r.slug = v_cand)
         and not exists (select 1 from public.house_seats h where h.slug = v_cand)
         and not exists (select 1 from public.profiles q where q.id <> p_user and q.card_slug is not null
                                                          and public.slugify(q.card_slug) = v_cand) then
        begin
          v_got := public.admin_set_card(p_user, v_cand);
        exception when sqlstate '55000' then
          v_got := null;
        end;
      end if;
    end loop;
  end if;
  -- 5. one off their name (034's loop); a roster seat's name starts at -2
  if v_got is null then
    v_base := coalesce(public.slugify(v_x.display_name), 'member');
    if v_base = '' or exists (select 1 from public.reserved_slugs r where r.slug = v_base) then v_base := 'member'; end if;
    v_i := case when exists (select 1 from public.house_seats h where h.slug = v_base) then 2 else 1 end;
    loop
      v_cand := case when v_i = 1 then v_base else v_base || '-' || v_i end;
      begin
        v_got := public.admin_set_card(p_user, v_cand);
        exit;
      exception when sqlstate '55000' then
        v_i := v_i + 1;
        if v_i > 30 then exit; end if;
      end;
    end loop;
  end if;
  perform public.acct_log(p_user, 'card_on', jsonb_build_object('slug', v_got));
  return v_got;
end $fn$;
revoke execute on function public.desk_card(uuid, boolean, text) from public, anon;
grant  execute on function public.desk_card(uuid, boolean, text) to authenticated;

-- 034's wall_card_decide, re-made with an optional card name. Yes is desk_card. No is 034's no, plus the wanted card
-- comes off and it is logged. A page from before today calling it with two named arguments still works.
drop function if exists public.wall_card_decide(uuid, boolean);
create or replace function public.wall_card_decide(p_user uuid, p_yes boolean, p_slug text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_yes is null then raise exception 'Yes or no?' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles x where x.id = p_user) then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if p_yes then
    return public.desk_card(p_user, true, p_slug);
  end if;
  if exists (select 1 from public.profiles x where x.id = p_user and (x.approved or x.is_admin)) then
    raise exception 'They already hold a card.' using errcode = '22023';
  end if;
  update public.profiles set denied = true where id = p_user and not approved;  -- trigger stamps denied_at
  insert into public.wall_people (user_id, card_ask, card_ask_at) values (p_user, 'denied', now())
  on conflict (user_id) do update set card_ask = 'denied', card_ask_at = now(), card_want = null;
  perform public.acct_log(p_user, 'card_no');
  return 'denied';
end $fn$;
revoke execute on function public.wall_card_decide(uuid, boolean, text) from public, anon;
grant  execute on function public.wall_card_decide(uuid, boolean, text) to authenticated;

-- 032's wall_card_ask, re-made: an ask may name the card they want. 'held' = somebody has it, or the house does.
-- A roster seat nobody holds is allowed (that is how a roster artist claims theirs; the desk still has to name it).
drop function if exists public.wall_card_ask(text);
create or replace function public.wall_card_ask(p_note text default null, p_slug text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); v_ask text; v_want text; v_note text := left(public.wall_text(p_note), 280);
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if coalesce(public.is_approved(), false) or coalesce(public.is_admin(), false) then return 'holder'; end if;
  if exists (select 1 from public.profiles x where x.id = me and x.denied) then return 'denied'; end if;
  if p_slug is not null and btrim(p_slug) <> '' then
    v_want := public.slugify(p_slug);
    -- a name with nothing to make a card from is a mistake to fix, never somebody else's card
    if v_want is null then raise exception 'That card name needs letters or numbers.' using errcode = '22023'; end if;
    if char_length(v_want) > 60 then raise exception 'That card name is too long. Keep it to 60 characters.' using errcode = '22023'; end if;
    if exists (select 1 from public.reserved_slugs r where r.slug = v_want)
       or exists (select 1 from public.profiles q where q.id <> me and q.card_slug is not null and public.slugify(q.card_slug) = v_want) then
      return 'held';
    end if;
  end if;
  select w.card_ask into v_ask from public.wall_people w where w.user_id = me;
  if v_ask = 'asked' then
    update public.wall_people
       set card_note = coalesce(v_note, card_note),
           card_want = case when p_slug is null then card_want when btrim(p_slug) = '' then null else v_want end
     where user_id = me;
    return 'asked';
  end if;
  insert into public.wall_people (user_id, card_ask, card_ask_at, card_note, card_want)
  values (me, 'asked', now(), v_note, v_want)
  on conflict (user_id) do update set card_ask = 'asked', card_ask_at = now(), card_note = excluded.card_note, card_want = excluded.card_want;
  return 'asked';
end $fn$;
revoke execute on function public.wall_card_ask(text, text) from public, anon;
grant  execute on function public.wall_card_ask(text, text) to authenticated;

-- take back my own ask
create or replace function public.wall_card_unask()
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if auth.uid() is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  update public.wall_people set card_ask = null, card_ask_at = now(), card_note = null, card_want = null
   where user_id = auth.uid() and card_ask = 'asked';
  return found;
end $fn$;
revoke execute on function public.wall_card_unask() from public, anon;
grant  execute on function public.wall_card_unask() to authenticated;

-- Take back the no. profiles_card_ask_sync (034) moves their ask from denied back to asked; the second update covers
-- a denied ask whose profile no is already gone.
create or replace function public.desk_unno(p_user uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare n1 int; n2 int;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.profiles set denied = false where id = p_user and denied;
  get diagnostics n1 = row_count;
  update public.wall_people set card_ask = 'asked', card_ask_at = now() where user_id = p_user and card_ask = 'denied';
  get diagnostics n2 = row_count;
  if n1 + n2 = 0 then return false; end if;
  perform public.acct_log(p_user, 'card_unno');
  return true;
end $fn$;
revoke execute on function public.desk_unno(uuid) from public, anon;
grant  execute on function public.desk_unno(uuid) to authenticated;

-- 032's list for the Crypt's desk, carried. Two columns appended (the card they asked for, and closed).
drop function if exists public.wall_desk_people();
create function public.wall_desk_people()
returns table (user_id uuid, name text, ig text, kind text, banned boolean, card_ask text, card_note text,
               card_ask_at timestamptz, joined timestamptz, sid text, denied boolean,
               -- 044, appended
               card_want text, closed boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select x.id, coalesce(nullif(btrim(x.display_name), ''), 'Member'), x.instagram,
         case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
         coalesce(w.banned, false), w.card_ask, w.card_note, w.card_ask_at,
         coalesce(w.joined_at, x.created_at), public.wall_sid(x.id), coalesce(x.denied, false),
         w.card_want, not public.acct_open(x.id)
    from public.profiles x left join public.wall_people w on w.user_id = x.id
   where public.is_admin()
     and (x.approved or x.is_admin or coalesce(w.casual, false) or coalesce(w.banned, false) or w.card_ask is not null)
   order by (w.card_ask = 'asked') desc nulls last, coalesce(w.banned, false), x.is_admin desc,
            coalesce(w.joined_at, x.created_at) desc
   limit 500;
$fn$;
revoke execute on function public.wall_desk_people() from public, anon;
grant  execute on function public.wall_desk_people() to authenticated;


-- SECTION 6. The one ban rule ----------------------------------------------------------------
-- Off the Crypt and the whole site. Nothing is pulled and nothing about them changes: the gate (S3) hides it all, so
-- unban puts back exactly what was there. A Revoke from before today republishes the posts it pulled.
create or replace function public.desk_ban(p_user uuid, p_on boolean, p_note text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_w public.wall_people; v_note text := left(public.wall_line(p_note), 280);
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Ban or unban?' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles x where x.id = p_user) then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles x where x.id = p_user and x.is_admin) then
    raise exception 'The desk can''t be banned.' using errcode = '22023';
  end if;
  if p_user = auth.uid() then raise exception 'That is you. Pick somebody else.' using errcode = '55000'; end if;
  select * into v_w from public.wall_people w where w.user_id = p_user;
  if p_on then
    if coalesce(v_w.banned, false) then return 'banned'; end if;
    insert into public.wall_people (user_id, casual, banned, banned_at, ban_note)
    values (p_user, false, true, now(), v_note)
    on conflict (user_id) do update
      set banned = true, banned_at = now(), ban_note = excluded.ban_note,
          card_ask = case when wall_people.card_ask = 'asked' then null else wall_people.card_ask end;
    perform public.acct_log(p_user, 'ban', jsonb_build_object('note', v_note));
    return 'banned';
  end if;
  if not coalesce(v_w.banned, false) then
    return case when public.acct_open(p_user) then 'active' else 'closed' end;
  end if;
  update public.wall_people set banned = false, banned_at = null, ban_note = null where user_id = p_user;
  if v_w.out_batch is not null then
    update public.posts set published = true where pull_batch = v_w.out_batch and author_id = p_user;
    update public.wall_people set out_batch = null where user_id = p_user;
  end if;
  perform public.acct_log(p_user, 'unban');
  return case when public.acct_open(p_user) then 'active' else 'closed' end;
end $fn$;
revoke execute on function public.desk_ban(uuid, boolean, text) from public, anon;
grant  execute on function public.desk_ban(uuid, boolean, text) to authenticated;

-- 034's wall_ban keeps its name and answers for pages from before today: it is desk_ban now
create or replace function public.wall_ban(p_user uuid, p_ban boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_ban is null then raise exception 'Ban or unban?' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles x where x.id = p_user) then
    raise exception 'Nobody by that id.' using errcode = '22023';
  end if;
  perform public.desk_ban(p_user, p_ban, null);
  return true;
end $fn$;
revoke execute on function public.wall_ban(uuid, boolean) from public, anon;
grant  execute on function public.wall_ban(uuid, boolean) to authenticated;

-- The old Revoke (Retire on /desk/) is the ban now. No pull batch: unban brings it all back by itself.
create or replace function public.admin_retire_member(p_author uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  perform public.desk_ban(p_author, true, 'revoked');
  return null;
end $fn$;
revoke execute on function public.admin_retire_member(uuid) from public, anon;
grant  execute on function public.admin_retire_member(uuid) to authenticated;


-- SECTION 7. Close and reopen (a hide: nothing is deleted, and it undoes exactly) ----------------
create or replace function public.account_close(p_reason text default null, p_take_back boolean default false)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid(); v_tids bigint[];
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if coalesce(public.is_admin(), false) then raise exception 'The desk account stays open.' using errcode = '55000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('acct:' || uid::text, 0));
  if not public.acct_open(uid) then return 'closed'; end if;     -- a desk close stays a desk close
  insert into public.account_closures (user_id, closed_at, closed_by, by_desk, reason, reopened_at, reopened_by)
  values (uid, now(), uid, false, left(public.wall_text(p_reason), 280), null, null)
  on conflict (user_id) do update
    set closed_at = now(), closed_by = uid, by_desk = false, reason = excluded.reason, reopened_at = null, reopened_by = null;
  perform public.acct_withdraw(uid);
  if coalesce(p_take_back, false) then
    -- the same as dm_delete (040) on every message they sent; this one cannot be undone. A reported chat keeps the
    -- copy its report took (reports.shot).
    with gone as (
      update public.wall_dm_messages m set deleted = true, body = '.'
       where m.sender = uid and not m.deleted
      returning m.thread_id)
    select array_agg(distinct g.thread_id) into v_tids from gone g;
    update public.wall_dm_threads t
       set last_line = coalesce((select left(x.body, 120) from public.wall_dm_messages x
                                  where x.thread_id = t.id and not x.deleted and not x.desk_removed
                                  order by x.id desc limit 1), '')
     where t.id = any(coalesce(v_tids, '{}'::bigint[]));
  end if;
  perform public.acct_log(uid, 'closed_self', jsonb_build_object('take_back', coalesce(p_take_back, false)));
  return 'closed';
end $fn$;
revoke execute on function public.account_close(text, boolean) from public, anon;
grant  execute on function public.account_close(text, boolean) to authenticated;

-- open it again: their own close only ('shut' = the desk closed it, and nothing changes)
create or replace function public.account_reopen()
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid(); v_c public.account_closures;
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  select * into v_c from public.account_closures c where c.user_id = uid and c.reopened_at is null;
  if v_c.user_id is null then return 'open'; end if;
  if v_c.by_desk then return 'shut'; end if;
  update public.account_closures set reopened_at = now(), reopened_by = uid where user_id = uid and reopened_at is null;
  perform public.acct_log(uid, 'reopened_self');
  return 'open';
end $fn$;
revoke execute on function public.account_reopen() from public, anon;
grant  execute on function public.account_reopen() to authenticated;

-- the desk closes somebody (a self close becomes a desk close)
create or replace function public.desk_close(p_user uuid, p_note text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_note text := left(public.wall_text(p_note), 280);
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles x where x.id = p_user) then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if p_user = auth.uid() or exists (select 1 from public.profiles x where x.id = p_user and x.is_admin) then
    raise exception 'The desk stays open.' using errcode = '22023';
  end if;
  insert into public.account_closures (user_id, closed_at, closed_by, by_desk, reason, reopened_at, reopened_by)
  values (p_user, now(), auth.uid(), true, v_note, null, null)
  on conflict (user_id) do update
    set by_desk = true, closed_by = auth.uid(),
        closed_at = case when account_closures.reopened_at is null then account_closures.closed_at else now() end,
        reason = coalesce(excluded.reason, account_closures.reason),
        reopened_at = null, reopened_by = null;
  perform public.acct_withdraw(p_user);
  perform public.acct_log(p_user, 'close', jsonb_build_object('note', v_note));
  return 'closed';
end $fn$;
revoke execute on function public.desk_close(uuid, text) from public, anon;
grant  execute on function public.desk_close(uuid, text) to authenticated;

create or replace function public.desk_reopen(p_user uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare n int;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles x where x.id = p_user) then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  update public.account_closures set reopened_at = now(), reopened_by = auth.uid() where user_id = p_user and reopened_at is null;
  get diagnostics n = row_count;
  if n > 0 then perform public.acct_log(p_user, 'reopen'); end if;
  return 'open';
end $fn$;
revoke execute on function public.desk_reopen(uuid) from public, anon;
grant  execute on function public.desk_reopen(uuid) to authenticated;

-- Your account, for /my/. can_reopen is the only close fact a page needs (it never says who closed it).
create or replace function public.my_account()
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'name',       x.display_name,
    'ig',         x.instagram,
    'kind',       case when x.is_admin then 'desk' when x.approved then 'card' when coalesce(w.casual, false) then 'member' else 'pending' end,
    'banned',     coalesce(w.banned, false),
    'closed',     c.user_id is not null,
    'can_reopen', c.user_id is not null and not c.by_desk,
    'closed_at',  c.closed_at,
    'card_slug',  case when x.approved then x.card_slug end,
    'card_ask',   w.card_ask,
    'card_want',  w.card_want,
    'names_left', case when x.approved or x.is_admin then null
                       else greatest(0, 3 - (select count(*)::int from public.account_log l
                                              where l.target = x.id and l.by = x.id and l.action = 'name'
                                                and l.at > now() - interval '24 hours')) end,
    'sid',        public.wall_sid(x.id))
    from public.profiles x
    left join public.wall_people w on w.user_id = x.id
    left join public.account_closures c on c.user_id = x.id and c.reopened_at is null
   where auth.uid() is not null and x.id = auth.uid();
$fn$;
revoke execute on function public.my_account() from public, anon;
grant  execute on function public.my_account() to authenticated;


-- SECTION 8. Fix their info (the members manager, power b), and their own name (his call 7) -----
-- Rename yourself. Words, never errors: closed, empty, long, same, card, slow, taken, ok. The update runs as the member,
-- so every guard on the table applies. The desk may rename himself here too.
create or replace function public.my_rename(p_name text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me     uuid := auth.uid();
  v_x    public.profiles;
  v_name text := public.name_clean(p_name);
  v_got  text;
  v_n    int;
  v_tk   boolean;
begin
  if me is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  select * into v_x from public.profiles x where x.id = me;
  if v_x.id is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if not public.acct_open(me) then return jsonb_build_object('ok', false, 'why', 'closed', 'name', v_x.display_name, 'shared', 0); end if;
  if v_name = '' then return jsonb_build_object('ok', false, 'why', 'empty', 'name', v_x.display_name, 'shared', 0); end if;
  if char_length(v_name) > 40 then return jsonb_build_object('ok', false, 'why', 'long', 'name', v_x.display_name, 'shared', 0); end if;
  if v_name = v_x.display_name then
    select count(*)::int into v_n from public.profiles q
     where q.id <> me and public.name_key(q.display_name) = public.name_key(v_name) and public.wall_member(q.id);
    return jsonb_build_object('ok', true, 'why', 'same', 'name', v_name, 'shared', v_n);
  end if;
  if v_x.approved and not v_x.is_admin then return jsonb_build_object('ok', false, 'why', 'card', 'name', v_x.display_name, 'shared', 0); end if;
  if not v_x.is_admin and (select count(*) from public.account_log l
                            where l.target = me and l.by = me and l.action = 'name' and l.at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'why', 'slow', 'name', v_x.display_name, 'shared', 0);
  end if;
  if v_x.is_admin then
    -- the house's own names are his: another card holder's name or card is taken for the desk, and so is a name
    -- somebody in the Crypt already wears (desk_set_name's rule), so the 034 claim trigger never quietly renames them
    v_tk := exists (select 1 from public.profiles q
                     where q.id <> me and (q.approved or q.is_admin)
                       and (public.name_key(q.display_name) = public.name_key(v_name)
                            or (q.card_slug is not null and public.slugify(q.card_slug) = public.slugify(v_name))))
         or public.name_worn(me, v_name);
  else
    v_tk := public.name_taken(me, v_name)
         or exists (select 1 from public.reserved_slugs r where r.slug = public.slugify(v_name))
         or exists (select 1 from public.profiles q where q.id <> me and q.card_slug is not null
                                                     and public.slugify(q.card_slug) = public.slugify(v_name));
  end if;
  if v_tk then return jsonb_build_object('ok', false, 'why', 'taken', 'name', v_x.display_name, 'shared', 0); end if;
  update public.profiles set display_name = v_name where id = me;
  select x.display_name into v_got from public.profiles x where x.id = me;
  if v_got is distinct from v_name then
    return jsonb_build_object('ok', false, 'why', 'taken', 'name', v_got, 'shared', 0);
  end if;
  select count(*)::int into v_n from public.profiles q
   where q.id <> me and public.name_key(q.display_name) = public.name_key(v_got) and public.wall_member(q.id);
  return jsonb_build_object('ok', true, 'why', 'ok', 'name', v_got, 'shared', v_n);
end $fn$;
revoke execute on function public.my_rename(text) from public, anon;
grant  execute on function public.my_rename(text) to authenticated;

-- The desk renames somebody. A card holder may not be given a name somebody in the Crypt already wears, so the 034 claim
-- trigger never quietly renames a member.
create or replace function public.desk_set_name(p_user uuid, p_name text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_x public.profiles; v_name text := public.name_clean(p_name);
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  select * into v_x from public.profiles x where x.id = p_user;
  if v_x.id is null then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if v_name = '' or char_length(v_name) > 40 then raise exception 'A name is 1 to 40 characters.' using errcode = '22023'; end if;
  if public.name_taken(p_user, v_name) then raise exception 'That name is taken.' using errcode = '22023'; end if;
  if (v_x.approved or v_x.is_admin) and public.name_worn(p_user, v_name) then
    raise exception 'Someone in the Crypt goes by that. Rename them first or pick another.' using errcode = '22023';
  end if;
  update public.profiles set display_name = v_name where id = p_user;
  return (select x.display_name from public.profiles x where x.id = p_user);
end $fn$;
revoke execute on function public.desk_set_name(uuid, text) from public, anon;
grant  execute on function public.desk_set_name(uuid, text) to authenticated;

-- The desk fixes somebody's @ (card holders too, I121). The old handle is written down. ok, cleared, same, taken, bad.
create or replace function public.desk_set_instagram(p_user uuid, p_ig text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_x public.profiles; v text := public.wall_ig_norm(p_ig);
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  select * into v_x from public.profiles x where x.id = p_user;
  if v_x.id is null then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_ig, '')), '') is not null and v is null then return 'bad'; end if;
  if v is not distinct from lower(v_x.instagram) then return 'same'; end if;
  if v is not null and ((not v_x.is_admin and exists (select 1 from public.reserved_slugs r where public.name_key(r.slug) = public.name_key(v)))
                        or exists (select 1 from public.profiles q where q.id <> p_user and lower(q.instagram) = v)) then
    return 'taken';
  end if;
  begin
    update public.profiles set instagram = v where id = p_user;
  exception when unique_violation then
    return 'taken';
  end;
  if v_x.instagram is not null then
    insert into public.wall_ig_settled (user_id, instagram, kept_by) values (p_user, v_x.instagram, null);
  end if;
  if not v_x.approved and not v_x.is_admin then
    if v is null then
      update public.wall_people set casual = false where user_id = p_user and casual;
    elsif public.acct_ok(p_user) then
      insert into public.wall_people (user_id, casual) values (p_user, true)
      on conflict (user_id) do update set casual = true;
    end if;
  end if;
  return case when v is null then 'cleared' else 'ok' end;
end $fn$;
revoke execute on function public.desk_set_instagram(uuid, text) from public, anon;
grant  execute on function public.desk_set_instagram(uuid, text) to authenticated;

-- The desk grants a house frame (or takes it back). Swapping a grant takes the old one off if they were wearing it.
create or replace function public.desk_set_frame(p_user uuid, p_frame text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare f public.card_frame;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles x where x.id = p_user) then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_frame, '')), '') is not null then
    begin
      f := btrim(p_frame)::public.card_frame;
    exception when invalid_text_representation then
      raise exception 'No frame by that name.' using errcode = '22023';
    end;
    if f in ('common', 'uncommon', 'rare', 'rare-holo') then
      raise exception 'Anyone can wear that one. Pick a house frame.' using errcode = '22023';
    end if;
  end if;
  update public.profiles
     set card_frame = case when card_frame = frame_grant and f is distinct from frame_grant then null else card_frame end,
         frame_grant = f
   where id = p_user;
  perform public.acct_log(p_user, 'frame', jsonb_build_object('frame', f::text));
  return f::text;
end $fn$;
revoke execute on function public.desk_set_frame(uuid, text) from public, anon;
grant  execute on function public.desk_set_frame(uuid, text) to authenticated;

-- The desk sets a card holder's card song (the mirror puts it on their Crypt page too)
create or replace function public.desk_set_song(p_user uuid, p_track text, p_start integer default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_x public.profiles; v_t text := nullif(btrim(coalesce(p_track, '')), '');
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  select * into v_x from public.profiles x where x.id = p_user;
  if v_x.id is null then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if not v_x.approved and not v_x.is_admin then raise exception 'Only a card holder has a card song.' using errcode = '22023'; end if;
  if v_t is null then
    update public.profiles set theme_track = null, theme_start = null where id = p_user;
  elsif v_t !~ '^[A-Za-z0-9]{22}$' then
    raise exception 'That song link did not read.' using errcode = '22023';
  else
    update public.profiles set theme_track = v_t, theme_start = case when p_start between 1 and 3600 then p_start end where id = p_user;
  end if;
  perform public.acct_log(p_user, 'song', jsonb_build_object('track', v_t, 'start', case when p_start between 1 and 3600 then p_start end));
  return v_t;
end $fn$;
revoke execute on function public.desk_set_song(uuid, text, integer) from public, anon;
grant  execute on function public.desk_set_song(uuid, text, integer) to authenticated;

-- The desk clears one thing off somebody's page or card. Returns what came off and the files the page may now remove
-- through the Storage API (never the current card photo, never a file a page still shows).
create or replace function public.desk_space_clear(p_user uuid, p_what text, p_url text default null)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_x      public.profiles;
  v_sp     public.wall_spaces;
  v_shared boolean;
  v_n      int := 0;
  v_m      int := 0;
  v_urls   text[] := '{}';
  v_links  jsonb;
  v_p      text;
  v_h      text;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  select * into v_x from public.profiles x where x.id = p_user;
  if v_x.id is null then raise exception 'Nobody by that id.' using errcode = '22023'; end if;
  if p_what is null or p_what not in ('page','pic','wallpaper','pic_one','about','headline','mood','meet','song','links','link_one','tracks') then
    raise exception 'Clear what? page, pic, wallpaper, pic_one, about, headline, mood, meet, song, links, link_one or tracks.' using errcode = '22023';
  end if;
  select * into v_sp from public.wall_spaces s where s.user_id = p_user;
  v_shared := v_x.approved or v_x.is_admin;
  if p_what = 'page' then
    delete from public.wall_spaces s where s.user_id = p_user;
    get diagnostics v_n = row_count;
    v_urls := array[v_sp.pic, v_sp.wallpaper] || coalesce(v_sp.pics, '{}'::text[]);
  elsif p_what = 'pic' then
    if v_shared then
      update public.profiles set card_photo = null where id = p_user and card_photo is not null;   -- the mirror clears the Crypt copy
      get diagnostics v_m = row_count;
    end if;
    update public.wall_spaces s set pic = null where s.user_id = p_user and s.pic is not null;
    get diagnostics v_n = row_count;
    v_n := v_n + v_m;
    v_urls := array[case when v_shared then v_x.card_photo end, v_sp.pic];
  elsif p_what = 'wallpaper' then
    update public.wall_spaces s set wallpaper = null where s.user_id = p_user and s.wallpaper is not null;
    get diagnostics v_n = row_count;
    v_urls := array[v_sp.wallpaper];
  elsif p_what = 'pic_one' then
    if v_sp.user_id is null or p_url is null or not (p_url = any(v_sp.pics)) then
      raise exception 'That picture is not on their page.' using errcode = '22023';
    end if;
    update public.wall_spaces s set pics = array_remove(s.pics, p_url) where s.user_id = p_user;
    get diagnostics v_n = row_count;
    v_urls := array[p_url];
  elsif p_what = 'about' then
    update public.wall_spaces s set about = null where s.user_id = p_user and s.about is not null;
    get diagnostics v_n = row_count;
  elsif p_what = 'headline' then
    update public.wall_spaces s set headline = null where s.user_id = p_user and s.headline is not null;
    get diagnostics v_n = row_count;
  elsif p_what = 'mood' then
    update public.wall_spaces s set mood = null, mood_e = null where s.user_id = p_user and (s.mood is not null or s.mood_e is not null);
    get diagnostics v_n = row_count;
  elsif p_what = 'meet' then
    update public.wall_spaces s set meet = null where s.user_id = p_user and s.meet is not null;
    get diagnostics v_n = row_count;
  elsif p_what = 'song' then
    if v_shared then
      update public.profiles set theme_track = null, theme_start = null where id = p_user and theme_track is not null;
      get diagnostics v_m = row_count;
    end if;
    update public.wall_spaces s set song = null where s.user_id = p_user and s.song is not null;
    get diagnostics v_n = row_count;
    v_n := v_n + v_m;
  elsif p_what = 'links' then
    update public.profiles set links = '[]'::jsonb, link_platform = null, link_handle = null
     where id = p_user and (links <> '[]'::jsonb or link_platform is not null or link_handle is not null);
    get diagnostics v_n = row_count;
  elsif p_what = 'link_one' then
    v_p := lower(split_part(coalesce(p_url, ''), ':', 1));
    v_h := substr(coalesce(p_url, ''), length(split_part(coalesce(p_url, ''), ':', 1)) + 2);
    select coalesce(jsonb_agg(e.v order by e.o), '[]'::jsonb) into v_links
      from jsonb_array_elements(case when jsonb_typeof(v_x.links) = 'array' then v_x.links else '[]'::jsonb end) with ordinality as e(v, o)
     where not (e.v->>'p' = v_p and lower(e.v->>'h') = lower(v_h));
    if jsonb_array_length(v_links) = jsonb_array_length(case when jsonb_typeof(v_x.links) = 'array' then v_x.links else '[]'::jsonb end)
       and not (v_x.link_platform = v_p and lower(v_x.link_handle) = lower(v_h)) then
      raise exception 'That link is not on their card.' using errcode = '22023';
    end if;
    update public.profiles
       set links = v_links,
           link_platform = case when link_platform = v_p and lower(link_handle) = lower(v_h) then null else link_platform end,
           link_handle   = case when link_platform = v_p and lower(link_handle) = lower(v_h) then null else link_handle end
     where id = p_user;
    get diagnostics v_n = row_count;
  elsif p_what = 'tracks' then
    delete from public.featured_tracks f where f.profile_id = p_user;
    get diagnostics v_n = row_count;
  end if;
  if v_n = 0 then
    return jsonb_build_object('cleared', null, 'files', '[]'::jsonb);
  end if;
  perform public.acct_log(p_user, 'page_clear', jsonb_build_object('what', p_what));
  return jsonb_build_object('cleared', p_what, 'files', public.desk_space_files(p_user, v_urls));
end $fn$;
revoke execute on function public.desk_space_clear(uuid, text, text) from public, anon;
grant  execute on function public.desk_space_clear(uuid, text, text) to authenticated;

-- Card art and pack photos: still served to everyone at their public address, but no longer listable by strangers
-- (the take, spaces and posts buckets' rule). The desk may delete any card art (I156).
drop policy if exists "admin deletes any card art" on storage.objects;
create policy "admin deletes any card art" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cards' and public.is_admin());
drop policy if exists "card art is public" on storage.objects;
drop policy if exists "members see their own card art" on storage.objects;
create policy "members see their own card art" on storage.objects
  for select to authenticated
  using (bucket_id = 'cards' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
drop policy if exists "pack photos are public" on storage.objects;
drop policy if exists "members see their own pack photos" on storage.objects;
create policy "members see their own pack photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'packs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));


-- SECTION 9. One profile (his call 2) --------------------------------------------------------
-- 042's wall_space, carried whole. Two lines change: a card holder's page shows the card's photo and song (the
-- Crypt's own copy when the card has none).
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
    'pic',      case when pr.approved or pr.is_admin then coalesce(pr.card_photo, sp.pic) when sp.user_id is null then pr.card_photo else sp.pic end,
    'headline', case when sp.user_id is null then pr.tagline     else sp.headline end,
    'about',    case when sp.user_id is null then pr.bio         else sp.about end,
    'song',     case when pr.approved or pr.is_admin then coalesce(pr.theme_track, sp.song) when sp.user_id is null then pr.theme_track else sp.song end,
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

-- 039's wall_space_save, carried whole. Changes: a card holder may use a picture from their own cards folder; the song
-- must read; and ONLY the new Crypt (v = 2) writes a card holder's pic and song through to the card. A page from before
-- today saves to the Crypt page alone, exactly as 039 did, so an old tab never puts a private pic on the public card.
create or replace function public.wall_space_save(p jsonb)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me     uuid := auth.uid();
  mine   text := 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/spaces/' || auth.uid()::text || '/';
  mine_c text := 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/cards/' || auth.uid()::text || '/';   -- 044: a card holder's own cards folder
  card   text;
  tune   text;
  shared boolean;
  v_song text := nullif(btrim(p->>'song'), '');
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
  select x.card_photo, x.theme_track, (x.approved or x.is_admin) into card, tune, shared from public.profiles x where x.id = me;
  if v_pic is not null and left(v_pic, length(mine)) <> mine and not (shared and left(v_pic, length(mine_c)) = mine_c)
     and v_pic is distinct from card then
    raise exception 'That picture is not yours.' using errcode = '42501';
  end if;
  if v_wp is not null and left(v_wp, length(mine)) <> mine then
    raise exception 'That wallpaper is not yours.' using errcode = '42501';
  end if;
  if v_song is not null and v_song !~ '^[A-Za-z0-9]{22}$' then
    raise exception 'That song link did not read.' using errcode = '22023';
  end if;
  -- 044: ONLY the new Crypt (v = 2) writes a card holder's pic and song through to the card. A key it does not send
  -- leaves the card as it is; the page then keeps the card's values (the mirror's copy).
  if shared and p->>'v' = '2' then
    if p ? 'pic' and v_pic is distinct from card then
      update public.profiles set card_photo = v_pic where id = me;
    end if;
    if p ? 'song' and v_song is distinct from tune then
      update public.profiles set theme_track = v_song, theme_start = null where id = me;
    end if;
    v_pic  := case when p ? 'pic'  then null else (select s.pic  from public.wall_spaces s where s.user_id = me) end;
    v_song := case when p ? 'song' then null else (select s.song from public.wall_spaces s where s.user_id = me) end;
    select coalesce(x.card_photo, v_pic), coalesce(x.theme_track, v_song) into card, tune from public.profiles x where x.id = me;
    v_pic := card; v_song := tune;
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
          v_song, t8, coalesce((p->>'wear')::boolean, false),
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

-- a card's Crypt page, for a member reading c/<slug>/ (null when hidden, or for a stranger)
create or replace function public.wall_page_of(p_slug text)
returns text language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.wall_sid(x.id)
    from public.profiles x
   where public.is_wall_member()
     and x.card_slug = lower(btrim(p_slug))
     and (x.approved or x.is_admin)
     and (x.id = auth.uid() or public.wall_open(x.id) or public.is_admin())
   limit 1;
$fn$;
revoke execute on function public.wall_page_of(text) from public, anon;
grant  execute on function public.wall_page_of(text) to authenticated;

-- STEP 1 of oneprofile-merge.sql: every change face_merge would make, and nothing written. 'only' (card slugs) limits
-- the photo and song copy (steps 1 and 1b); the seed songs and links (steps 2 to 4) are public already and go to all.
create or replace function public.face_plan(p_seeds jsonb default '{}'::jsonb)
returns table (card_slug text, name text, what text, now_value text, crypt_value text, seed_value text, after_value text)
language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
#variable_conflict use_column
declare v_only text[];
begin
  if not public.privileged_caller() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if jsonb_typeof(p_seeds -> 'only') = 'array' then
    select coalesce(array_agg(lower(btrim(v))), '{}') into v_only from jsonb_array_elements_text(p_seeds -> 'only') v;
  end if;
  return query
  with base as (
    select x.id, x.card_slug as slug, coalesce(nullif(btrim(x.display_name), ''), 'Member') as nm,
           x.card_photo, x.theme_track, x.theme_start, x.links, x.link_platform, x.link_handle,
           sp.user_id as sp_id, sp.pic as sp_pic, sp.song as sp_song,
           (x.approved or x.is_admin) and (v_only is null or x.card_slug = any(v_only)) as in_scope,
           f.photo as f_photo, f.song as f_song, f.start as f_start
      from public.profiles x
      left join public.wall_spaces sp on sp.user_id = x.id
      cross join lateral public.face_pick(x.id) f
  ),
  after1 as (
    select b.*, case when b.in_scope then b.f_song else b.theme_track end as tt,
                case when b.in_scope then b.f_photo else b.card_photo end as cp
      from base b
  ),
  seeds as (
    select s.key as slug, s.value ->> 0 as track, coalesce((s.value ->> 1)::int, 0) as st
      from jsonb_each(case when jsonb_typeof(p_seeds -> 'songs') = 'object' then p_seeds -> 'songs' else '{}'::jsonb end) s
     where jsonb_typeof(s.value) = 'array' and (s.value ->> 0) ~ '^[A-Za-z0-9]{22}$'
  ),
  folded as (
    select a.*, case when a.link_platform is not null and a.link_handle is not null
                          and jsonb_array_length(a.links) < 5
                          and not exists (select 1 from jsonb_array_elements(a.links) e
                                           where e ->> 'p' = a.link_platform and lower(e ->> 'h') = lower(a.link_handle))
                     then a.links || jsonb_build_array(jsonb_build_object('p', a.link_platform, 'h', a.link_handle))
                     else a.links end as links2
      from after1 a
  )
  select b.slug, b.nm, 'photo', b.card_photo, b.sp_pic, null::text, b.f_photo
    from base b where b.in_scope and b.f_photo is distinct from b.card_photo
  union all
  select b.slug, b.nm, 'song', b.theme_track, b.sp_song, null::text, b.f_song
    from base b where b.in_scope and b.f_song is distinct from b.theme_track
  union all
  select b.slug, b.nm, 'crypt pic', b.sp_pic, b.sp_pic, null::text, b.f_photo
    from base b where b.in_scope and b.sp_id is not null and b.f_photo is not null and b.f_photo = b.card_photo and b.sp_pic is distinct from b.card_photo
  union all
  select b.slug, b.nm, 'crypt song', b.sp_song, b.sp_song, null::text, b.f_song
    from base b where b.in_scope and b.sp_id is not null and b.f_song is not null and b.f_song = b.theme_track and b.sp_song is distinct from b.theme_track
  union all
  select a.slug, a.nm, 'seed song', a.tt, a.sp_song, s.track || ' @' || s.st, s.track
    from after1 a join seeds s on s.slug = a.slug where a.tt is null
  union all
  select f.slug, f.nm, 'link fold', f.links::text, null::text, null::text, f.links2::text
    from folded f where f.links2 is distinct from f.links
  union all
  select f.slug, f.nm, 'seed links', f.links2::text, null::text, (p_seeds -> 'links' -> f.slug)::text, (p_seeds -> 'links' -> f.slug)::text
    from folded f
   where jsonb_typeof(p_seeds -> 'links') = 'object' and f.slug is not null
     and jsonb_typeof(p_seeds -> 'links' -> f.slug) = 'array'
     and jsonb_array_length(f.links2) = 0 and public.links_ok(p_seeds -> 'links' -> f.slug)
     and jsonb_array_length(p_seeds -> 'links' -> f.slug) > 0;
end $fn$;
revoke execute on function public.face_plan(jsonb) from public, anon, authenticated;

-- STEP 2: make one face. Returns how many cards took their Crypt pic or song (step 1); a second run returns 0.
create or replace function public.face_merge(p_seeds jsonb default '{}'::jsonb)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_only text[]; v_n int := 0; r record; f record; v_keep uuid[]; v_song text[];
begin
  if not public.privileged_caller() then raise exception 'Desk only.' using errcode = '42501'; end if;
  if jsonb_typeof(p_seeds -> 'only') = 'array' then
    select coalesce(array_agg(lower(btrim(v))), '{}') into v_only from jsonb_array_elements_text(p_seeds -> 'only') v;
  end if;
  -- 1. the Crypt pic and song onto the card (the mirror then keeps the page in step)
  for r in select x.id, x.card_photo, x.theme_track, x.theme_start from public.profiles x
            where (x.approved or x.is_admin) and (v_only is null or x.card_slug = any(v_only)) loop
    select * into f from public.face_pick(r.id);
    if f.photo is distinct from r.card_photo or f.song is distinct from r.theme_track then
      update public.profiles
         set card_photo = f.photo, theme_track = f.song, theme_start = f.start
       where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  -- 1b. where the card side won and did not change, the Crypt page takes the card's values
  update public.wall_spaces s
     set pic  = coalesce(x.card_photo, s.pic),
         song = coalesce(x.theme_track, s.song)
    from public.profiles x
   where x.id = s.user_id and (x.approved or x.is_admin) and (v_only is null or x.card_slug = any(v_only))
     and ((x.card_photo is not null and s.pic is distinct from x.card_photo)
          or (x.theme_track is not null and s.song is distinct from x.theme_track));
  -- 2. the house's seed songs, where the card still has none. A Crypt song a card holder outside 'only' picked is kept
  --    on their page row (the mirror would overwrite it); the page reads the card's song from now on either way.
  select array_agg(sp.user_id), array_agg(sp.song) into v_keep, v_song
    from public.wall_spaces sp join public.profiles x on x.id = sp.user_id
   where sp.song is not null and x.theme_track is null and x.card_slug is not null
     and jsonb_typeof(p_seeds -> 'songs') = 'object' and p_seeds -> 'songs' ? x.card_slug;
  update public.profiles x
     set theme_track = s.value ->> 0, theme_start = coalesce((s.value ->> 1)::int, 0)
    from jsonb_each(case when jsonb_typeof(p_seeds -> 'songs') = 'object' then p_seeds -> 'songs' else '{}'::jsonb end) s
   where x.card_slug = s.key and x.theme_track is null
     and jsonb_typeof(s.value) = 'array' and (s.value ->> 0) ~ '^[A-Za-z0-9]{22}$';
  update public.wall_spaces sp set song = k.song
    from unnest(coalesce(v_keep, '{}'::uuid[]), coalesce(v_song, '{}'::text[])) as k(id, song)
   where sp.user_id = k.id and sp.song is distinct from k.song;
  -- 3. the card builder's one link goes into the links row (once)
  update public.profiles x
     set links = x.links || jsonb_build_array(jsonb_build_object('p', x.link_platform, 'h', x.link_handle))
   where x.link_platform is not null and x.link_handle is not null
     and jsonb_typeof(x.links) = 'array' and jsonb_array_length(x.links) < 5
     and not exists (select 1 from jsonb_array_elements(x.links) e
                      where e ->> 'p' = x.link_platform and lower(e ->> 'h') = lower(x.link_handle));
  -- 4. the house's links fill an empty links row
  update public.profiles x
     set links = l.value
    from jsonb_each(case when jsonb_typeof(p_seeds -> 'links') = 'object' then p_seeds -> 'links' else '{}'::jsonb end) l
   where x.card_slug = l.key and x.links = '[]'::jsonb
     and jsonb_typeof(l.value) = 'array' and jsonb_array_length(l.value) > 0 and public.links_ok(l.value);
  return v_n;
end $fn$;
revoke execute on function public.face_merge(jsonb) from public, anon, authenticated;


-- SECTION 10. Reports and DMs (his call 9) -----------------------------------------------------
-- Report something. Members only, things you can see, not your own and not the house's. A second report of the same
-- thing updates the first. Twenty a day.
create or replace function public.report_add(p_kind text, p_target text, p_why text default null, p_note text default null)
returns text language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  me     uuid := auth.uid();
  v_why  text := case when p_why is null then null when p_why in ('mean','spam','private','not_them','other') then p_why else 'other' end;
  v_note text := left(public.wall_line(p_note), 280);
  v_who  uuid;
  v_snap jsonb;
  v_ok   boolean := false;
  v_id   bigint;
begin
  if me is null or not coalesce(public.is_wall_member(), false) then raise exception 'Members only.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('dm','take_comment','flyer_comment','space_post','space','post','pack','room','frame_tag') then
    raise exception 'That is not something you can report.' using errcode = '22023';
  end if;
  select true, t.who_id, t.snap into v_ok, v_who, v_snap from public.report_target(p_kind, p_target, me) t limit 1;
  if not coalesce(v_ok, false) or v_who is null then raise exception 'That is gone already.' using errcode = '22023'; end if;
  if v_who = me then raise exception 'That one is yours.' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles x where x.id = v_who and x.is_admin) then
    raise exception 'That one is the house''s.' using errcode = '22023';
  end if;
  select r.id into v_id from public.reports r
   where r.by_user = me and r.kind = p_kind and r.target = p_target and r.closed_at is null;
  if v_id is not null then
    update public.reports set why = coalesce(v_why, why), note = coalesce(v_note, note) where id = v_id;
    return 'already';
  end if;
  if (select count(*) from public.reports r where r.by_user = me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'That is a lot of reports today. The desk is on it.' using errcode = '42501';
  end if;
  insert into public.reports (kind, target, about, by_user, why, note, shot)
  values (p_kind, p_target, v_who, me, v_why, v_note, v_snap)
  on conflict (by_user, kind, target) where closed_at is null
  do update set why = coalesce(excluded.why, reports.why), note = coalesce(excluded.note, reports.note);
  return 'sent';
end $fn$;
revoke execute on function public.report_add(text, text, text, text) from public, anon;
grant  execute on function public.report_add(text, text, text, text) to authenticated;

-- which of these the caller has an open report on (a page marks them)
create or replace function public.report_mine(p_kind text, p_targets text[])
returns text[] language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare v text[];
begin
  if auth.uid() is null or not coalesce(public.is_wall_member(), false) then raise exception 'Members only.' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct r.target), '{}') into v
    from public.reports r
   where r.by_user = auth.uid() and r.kind = p_kind and r.closed_at is null
     and r.target = any((coalesce(p_targets, '{}'::text[]))[1:200]);
  return v;
end $fn$;
revoke execute on function public.report_mine(text, text[]) from public, anon;
grant  execute on function public.report_mine(text, text[]) to authenticated;

-- The desk's list: one entry per reported thing, open first, then newest. State: open, closed or all.
create or replace function public.report_desk_queue(p_state text default 'open', p_about uuid default null,
                                                    p_by uuid default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare v_state text := case when p_state in ('open', 'closed', 'all') then p_state else 'open' end;
        v_lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
        v jsonb;
begin
  if not coalesce(public.is_admin(), false) then return '[]'::jsonb; end if;
  with rows as (
    select r.* from public.reports r
     where v_state = 'all' or (v_state = 'open' and r.closed_at is null) or (v_state = 'closed' and r.closed_at is not null)
  ),
  grp as (
    select x.kind, x.target, count(*)::int as n, min(x.created_at) as first_at, max(x.created_at) as last_at,
           bool_and(x.closed_at is not null) as closed, max(x.closed_at) as closed_at,
           (array_agg(x.outcome order by x.closed_at desc nulls last))[1] as outcome,
           (array_agg(x.shot order by x.created_at desc))[1] as shot,
           (array_agg(x.about order by x.created_at desc))[1] as about
      from rows x
     group by x.kind, x.target
    having (p_about is null or bool_or(x.about = p_about)) and (p_by is null or bool_or(x.by_user = p_by))
     order by bool_and(x.closed_at is not null), max(x.created_at) desc
     limit v_lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', g.kind, 'target', g.target, 'about', public.desk_person(g.about), 'n', g.n,
           'first_at', g.first_at, 'last_at', g.last_at, 'closed', g.closed,
           'closed_at', case when g.closed then g.closed_at end, 'outcome', g.outcome, 'shot', g.shot,
           'state', public.report_state(g.kind, g.target),
           'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'by', public.desk_person(y.by_user), 'why', y.why,
                                                                    'note', y.note, 'at', y.created_at, 'closed_at', y.closed_at)
                                                 order by y.created_at), '[]'::jsonb)
                         from rows y where y.kind = g.kind and y.target = g.target),
           'pair', case when g.kind = 'dm' then (select jsonb_build_array(public.desk_person(t.a), public.desk_person(t.b))
                                                   from public.wall_dm_threads t where t.id::text = g.target) end,
           'msgs', case when g.kind = 'dm' and not g.closed and g.target ~ '^[1-9][0-9]{0,17}$'
                        then public.dm_desk_msgs(g.target::bigint) end)
         order by g.closed, g.last_at desc), '[]'::jsonb)
    into v
    from grp g;
  return v;
end $fn$;
revoke execute on function public.report_desk_queue(text, uuid, uuid, integer) from public, anon;
grant  execute on function public.report_desk_queue(text, uuid, uuid, integer) to authenticated;

create or replace function public.report_desk_count()
returns integer language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case when coalesce(public.is_admin(), false)
              then (select count(*)::int from (select distinct r.kind, r.target from public.reports r where r.closed_at is null) z)
              else 0 end;
$fn$;
revoke execute on function public.report_desk_count() from public, anon;
grant  execute on function public.report_desk_count() to authenticated;

create or replace function public.report_desk_close(p_kind text, p_target text, p_outcome text default 'kept')
returns integer language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare n int;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.reports
     set closed_at = now(), closed_by = auth.uid(),
         outcome = case when p_outcome in ('kept','hidden','removed','banned','gone') then p_outcome else 'kept' end
   where kind = p_kind and target = p_target and closed_at is null;
  get diagnostics n = row_count;
  return n;
end $fn$;
revoke execute on function public.report_desk_close(text, text, text) from public, anon;
grant  execute on function public.report_desk_close(text, text, text) to authenticated;

-- The desk acts on one thing: keep, hide, unhide or remove. Anything but unhide closes its open reports.
create or replace function public.desk_item_act(p_kind text, p_target text, p_do text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_n       bigint;
  v_m       text[];
  v_owner   uuid;
  v_out     text;
  v_changed int := 0;
  v_closed  int := 0;
  v_files   jsonb := '[]'::jsonb;
  v_imgs    text[];
  v_sp      public.wall_spaces;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_do is null or p_do not in ('keep', 'hide', 'unhide', 'remove') then
    raise exception 'Keep, hide, unhide or remove.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('dm','take_comment','flyer_comment','space_post','space','post','pack','room','frame_tag') then
    raise exception 'That is not something you can report.' using errcode = '22023';
  end if;
  if p_kind = 'dm' then
    raise exception 'A conversation stays. Remove one message, or ban somebody.' using errcode = '22023';
  end if;
  if p_kind in ('space_post', 'frame_tag') and p_do in ('hide', 'unhide') then
    raise exception '%', case when p_kind = 'space_post' then 'A page comment comes down or stays.' else 'A tag comes off or stays.' end
      using errcode = '22023';
  end if;
  if p_kind = 'space' and p_do in ('hide', 'unhide') then
    raise exception 'A page gets reset or stays. One picture at a time is on the members list.' using errcode = '22023';
  end if;
  if p_kind in ('take_comment','flyer_comment','space_post','post','pack','room') and coalesce(p_target, '') ~ '^[1-9][0-9]{0,17}$' then
    v_n := p_target::bigint;
  end if;
  v_m := regexp_match(coalesce(p_target, ''), '^([0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60})/([a-z0-9][a-z0-9_-]{0,40})/([0-9a-f]{10})$');
  select (array_agg(r.about order by r.created_at desc))[1] into v_owner from public.reports r where r.kind = p_kind and r.target = p_target;

  if p_do = 'keep' then
    v_out := case when public.report_state(p_kind, p_target) = 'gone' then 'gone' else 'kept' end;
  elsif p_kind = 'take_comment' then
    select c.user_id into v_owner from public.take_comments c where c.id = v_n;
    if p_do = 'remove' then delete from public.take_comments c where c.id = v_n;
    else update public.take_comments c set hidden = (p_do = 'hide') where c.id = v_n; end if;
    get diagnostics v_changed = row_count;
  elsif p_kind = 'flyer_comment' then
    select c.user_id into v_owner from public.wall_comments c where c.id = v_n;
    if p_do = 'remove' then delete from public.wall_comments c where c.id = v_n;
    else update public.wall_comments c set hidden = (p_do = 'hide') where c.id = v_n; end if;
    get diagnostics v_changed = row_count;
  elsif p_kind = 'space_post' then
    select c.author into v_owner from public.wall_space_posts c where c.id = v_n;
    delete from public.wall_space_posts c where c.id = v_n;
    get diagnostics v_changed = row_count;
  elsif p_kind = 'post' then
    select p.author_id into v_owner from public.posts p where p.id = v_n;
    if p_do = 'remove' then delete from public.posts p where p.id = v_n;
    else update public.posts p set published = (p_do = 'unhide') where p.id = v_n; end if;     -- 002's guard stamps pulled_at
    get diagnostics v_changed = row_count;
  elsif p_kind = 'pack' then
    select p.author_id into v_owner from public.packs p where p.id = v_n;
    if p_do = 'remove' then
      select array_agg(distinct z.img) into v_imgs
        from (select c.image as img from public.pack_cards c where c.pack_id = v_n
              union all select p.cover from public.packs p where p.id = v_n and p.cover <> '') z;
      delete from public.packs p where p.id = v_n;
      get diagnostics v_changed = row_count;
      select coalesce(jsonb_agg(jsonb_build_object('bucket', 'packs', 'name', u.u)), '[]'::jsonb) into v_files
        from unnest(coalesce(v_imgs, '{}'::text[])) as u(u)
       where not public.pack_image_in_use(u.u);
    else
      update public.packs p set published = (p_do = 'unhide'), updated_at = now() where p.id = v_n;
      get diagnostics v_changed = row_count;
    end if;
  elsif p_kind = 'room' then
    select r.author_id into v_owner from public.rooms r where r.id = v_n;
    if p_do = 'remove' then delete from public.rooms r where r.id = v_n;
    else update public.rooms r set published = (p_do = 'unhide'), updated_at = now() where r.id = v_n; end if;
    get diagnostics v_changed = row_count;
  elsif p_kind = 'frame_tag' then
    if v_m is not null then
      with gone as (
        delete from public.frame_tags t
         where t.event_slug = v_m[1] and t.media = v_m[2] and public.wall_sid(t.user_id) = v_m[3]
        returning t.user_id)
      select count(*), (array_agg(g.user_id))[1] into v_changed, v_owner from gone g;
    end if;
  elsif p_kind = 'space' then
    v_owner := null;      -- only the page the target names, never a guess
    if coalesce(p_target, '') ~ '^[0-9a-f]{10}$' then
      select x.id into v_owner from public.profiles x where public.wall_sid(x.id) = p_target limit 1;
    end if;
    if exists (select 1 from public.profiles x where x.id = v_owner and x.is_admin) then
      raise exception 'The desk''s own page stays.' using errcode = '22023';
    end if;
    select * into v_sp from public.wall_spaces s where s.user_id = v_owner;
    delete from public.wall_spaces s where s.user_id = v_owner;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      v_files := public.desk_space_files(v_owner, array[v_sp.pic, v_sp.wallpaper] || coalesce(v_sp.pics, '{}'::text[]));
    end if;
  end if;

  if p_do <> 'keep' then
    -- a page that was never saved is already the reset page: resetting it is done, not gone
    v_out := case when v_changed = 0 and not (p_kind = 'space' and v_owner is not null) then 'gone'
                  when p_do = 'hide' then 'hidden'
                  when p_do = 'remove' then 'removed'
                  else 'unhidden' end;
  end if;
  if v_out <> 'unhidden' then
    update public.reports
       set closed_at = now(), closed_by = auth.uid(), outcome = v_out
     where kind = p_kind and target = p_target and closed_at is null;
    get diagnostics v_closed = row_count;
  end if;
  if v_owner is not null and exists (select 1 from auth.users u where u.id = v_owner) then
    perform public.acct_log(v_owner, 'item', jsonb_build_object('kind', p_kind, 'target', p_target, 'do', p_do));
  end if;
  return jsonb_build_object('outcome', v_out, 'changed', v_changed, 'closed', v_closed, 'files', v_files);
end $fn$;
revoke execute on function public.desk_item_act(text, text, text) from public, anon;
grant  execute on function public.desk_item_act(text, text, text) to authenticated;

-- 040's dm_report, re-made on the one list: only somebody in the chat can report it, each side files their own.
create or replace function public.dm_report(p_thread bigint, p_note text default null)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_wall_member() then return false; end if;
  if not exists (select 1 from public.wall_dm_threads t where t.id = p_thread and (t.a = me or t.b = me)) then return false; end if;
  begin
    perform public.report_add('dm', p_thread::text, null, p_note);
  exception when sqlstate '22023' then
    return false;
  end;
  return true;
end $fn$;
revoke execute on function public.dm_report(bigint, text) from public, anon;
grant  execute on function public.dm_report(bigint, text) to authenticated;

-- 040's inbox, carried. Changes: unread skips a line the desk removed; `reported` is only the reader's own report (I111).
create or replace function public.dm_inbox()
returns table (thread bigint, who jsonb, last_at timestamptz, last_line text, last_mine boolean, unread integer, reported boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select t.id,
         public.dm_person(case when t.a = auth.uid() then t.b else t.a end),
         t.last_at,
         t.last_line,
         t.last_by = auth.uid(),
         (select count(*)::int from public.wall_dm_messages m
           where m.thread_id = t.id and m.sender <> auth.uid() and not m.deleted and not m.desk_removed
             and m.created_at > coalesce(case when t.a = auth.uid() then t.a_read_at else t.b_read_at end, 'epoch'::timestamptz)),
         exists (select 1 from public.reports r
                  where r.kind = 'dm' and r.target = t.id::text and r.by_user = auth.uid() and r.closed_at is null)
    from public.wall_dm_threads t
   where public.is_wall_member()
     and ((t.a = auth.uid() and not t.a_hidden) or (t.b = auth.uid() and not t.b_hidden))
   order by t.last_at desc
   limit 100;
$fn$;
revoke execute on function public.dm_inbox() from public, anon;
grant  execute on function public.dm_inbox() to authenticated;

-- 040's thread, carried. Changes: `reported` is the reader's own report; a line the desk removed reads like a deleted
-- one, marked desk.
create or replace function public.dm_thread(p_thread bigint default null, p_sid text default null, p_before bigint default null)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
declare
  me   uuid := auth.uid();
  t    public.wall_dm_threads;
  who  uuid;
begin
  if me is null or not public.is_wall_member() then return null; end if;
  if p_thread is not null then
    select * into t from public.wall_dm_threads x where x.id = p_thread and (x.a = me or x.b = me);
    if t.id is null then return null; end if;
    who := case when t.a = me then t.b else t.a end;
  else
    who := public.dm_who(p_sid);
    if who is null or who = me or not public.wall_member(who) then return null; end if;
    select * into t from public.wall_dm_threads x where x.a = least(me, who) and x.b = greatest(me, who);
  end if;
  return jsonb_build_object(
    'thread',   t.id,
    'with',     public.dm_person(who),
    'blocked',  exists (select 1 from public.wall_dm_blocks k where k.blocker = me and k.blocked = who),   -- by me (theirs stays unseen)
    'closed',   public.dm_blocked(me, who),                                                                  -- either way: the composer says so
    'reported', exists (select 1 from public.reports r
                         where r.kind = 'dm' and r.target = t.id::text and r.by_user = me and r.closed_at is null),
    'read_at',  case when t.a = me then t.a_read_at else t.b_read_at end,
    'msgs',     (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'mine', q.sender = me, 'b', case when q.deleted or q.desk_removed then null else q.body end,
                                                              't', q.created_at, 'del', q.deleted or q.desk_removed, 'desk', q.desk_removed) order by q.id), '[]'::jsonb)
                   from (select m.id, m.sender, m.body, m.created_at, m.deleted, m.desk_removed
                           from public.wall_dm_messages m
                          where t.id is not null and m.thread_id = t.id and (p_before is null or m.id < p_before)
                          order by m.id desc limit 60) q),
    'more',     t.id is not null and (select count(*) from public.wall_dm_messages m where m.thread_id = t.id and (p_before is null or m.id < p_before)) > 60
  );
end $fn$;
revoke execute on function public.dm_thread(bigint, text, bigint) from public, anon;
grant  execute on function public.dm_thread(bigint, text, bigint) to authenticated;

-- 040's dm_delete, carried. One change: the preview it refreshes skips a line the desk removed (its words stay the desk's).
create or replace function public.dm_delete(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); tid bigint;
begin
  if me is null or not public.is_wall_member() then return false; end if;
  update public.wall_dm_messages m set deleted = true, body = '.' where m.id = p_id and m.sender = me and not m.deleted
   returning m.thread_id into tid;
  if tid is null then return false; end if;
  update public.wall_dm_threads t set last_line = coalesce((select left(x.body, 120) from public.wall_dm_messages x
                                                             where x.thread_id = tid and not x.deleted and not x.desk_removed
                                                             order by x.id desc limit 1), '')
   where t.id = tid;
  return true;
end $fn$;
revoke execute on function public.dm_delete(bigint) from public, anon;
grant  execute on function public.dm_delete(bigint) to authenticated;

-- The desk reads reported chats only: 040's shape, from the one list. by / at / note are the FIRST open report's; n is
-- how many open reports; msgs carry the words even of lines that were taken back.
create or replace function public.dm_desk_reports()
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'thread', t.id, 'a', public.dm_person(t.a), 'b', public.dm_person(t.b),
           'by', public.dm_person(f.by_user), 'at', f.created_at, 'note', f.note, 'n', g.n,
           'msgs', public.dm_desk_msgs(t.id))
           order by f.created_at desc), '[]'::jsonb)
    from (select r.target, count(*)::int as n from public.reports r
           where r.kind = 'dm' and r.closed_at is null group by r.target) g
    join lateral (select r2.by_user, r2.created_at, r2.note from public.reports r2
                   where r2.kind = 'dm' and r2.target = g.target and r2.closed_at is null
                   order by r2.created_at, r2.id limit 1) f on true
    join public.wall_dm_threads t on t.id::text = g.target
   where public.is_admin();
$fn$;
revoke execute on function public.dm_desk_reports() from public, anon;
grant  execute on function public.dm_desk_reports() to authenticated;

create or replace function public.dm_desk_close(p_thread bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.reports set closed_at = now(), closed_by = auth.uid(), outcome = 'kept'
   where kind = 'dm' and target = p_thread::text and closed_at is null;
  return found;
end $fn$;
revoke execute on function public.dm_desk_close(bigint) from public, anon;
grant  execute on function public.dm_desk_close(bigint) to authenticated;

create or replace function public.dm_desk_count()
returns integer language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case when public.is_admin()
              then (select count(distinct r.target)::int from public.reports r where r.kind = 'dm' and r.closed_at is null)
              else 0 end;
$fn$;
revoke execute on function public.dm_desk_count() from public, anon;
grant  execute on function public.dm_desk_count() to authenticated;

-- The desk takes one message out of a chat somebody IN it reported (never any other chat). Both sides see it removed.
create or replace function public.dm_desk_remove(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_tid bigint; v_from uuid;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.wall_dm_messages m set desk_removed = true
   where m.id = p_id and not m.desk_removed
     and exists (select 1 from public.reports r where r.kind = 'dm' and r.target = m.thread_id::text)
  returning m.thread_id, m.sender into v_tid, v_from;
  if v_tid is null then return false; end if;
  update public.wall_dm_threads t
     set last_line = coalesce((select left(x.body, 120) from public.wall_dm_messages x
                                where x.thread_id = v_tid and not x.deleted and not x.desk_removed
                                order by x.id desc limit 1), '')
   where t.id = v_tid;
  perform public.acct_log(v_from, 'dm_remove', jsonb_build_object('thread', v_tid, 'message', p_id));
  return true;
end $fn$;
revoke execute on function public.dm_desk_remove(bigint) from public, anon;
grant  execute on function public.dm_desk_remove(bigint) to authenticated;


-- SECTION 11. Block means block (I110) ----------------------------------------------------------
-- nobody you blocked (or who blocked you) sits in your Top 8, whatever a page sends
create or replace function public.wall_spaces_top8_unblocked()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  new.top8 := coalesce((select array_agg(u.id order by u.ord)
                          from unnest(coalesce(new.top8, '{}'::uuid[])) with ordinality as u(id, ord)
                         where not public.dm_blocked(new.user_id, u.id)), '{}'::uuid[]);
  return new;
end $fn$;
revoke execute on function public.wall_spaces_top8_unblocked() from public, anon, authenticated;
drop trigger if exists trg_wall_spaces_top8 on public.wall_spaces;
create trigger trg_wall_spaces_top8 before insert or update of top8 on public.wall_spaces
  for each row execute function public.wall_spaces_top8_unblocked();

-- 040's dm_block, carried. One change: a block also ends the friendship and the Top 8 spot, both ways.
create or replace function public.dm_block(p_sid text, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); who uuid := public.dm_who(p_sid);
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if who is null or who = me then raise exception 'Nobody there.' using errcode = '22023'; end if;
  if p_on then insert into public.wall_dm_blocks (blocker, blocked) values (me, who) on conflict do nothing;
    perform public.block_cleanup(me, who);   -- 044: block means block
  else delete from public.wall_dm_blocks k where k.blocker = me and k.blocked = who; end if;
  return p_on;
end $fn$;
revoke execute on function public.dm_block(text, boolean) from public, anon;
grant  execute on function public.dm_block(text, boolean) to authenticated;

-- 030's wall_space_post, carried. One change: a blocked pair cannot comment on each other's pages.
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
  if who is null or not public.wall_member(who) or (who <> me and not public.wall_open(who))
     or (who <> me and public.dm_blocked(me, who)) then
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

-- block the person who wrote a comment (their page may be hidden; their sid may be unknown to you)
create or replace function public.dm_block_author(p_kind text, p_target text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); v_who uuid;
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('take_comment', 'flyer_comment', 'space_post') then
    raise exception 'Block the writer of a comment from here.' using errcode = '22023';
  end if;
  select t.who_id into v_who from public.report_target(p_kind, p_target, me) t limit 1;
  if v_who is null or v_who = me then raise exception 'Nobody there.' using errcode = '22023'; end if;
  insert into public.wall_dm_blocks (blocker, blocked) values (me, v_who) on conflict do nothing;
  perform public.block_cleanup(me, v_who);
  return true;
end $fn$;
revoke execute on function public.dm_block_author(text, text) from public, anon;
grant  execute on function public.dm_block_author(text, text) to authenticated;

-- the people I blocked
create or replace function public.dm_blocked_list()
returns table (sid text, name text, pic text, since timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.wall_sid(k.blocked), public.dm_person(k.blocked) ->> 'name', public.dm_person(k.blocked) ->> 'pic', k.created_at
    from public.wall_dm_blocks k
   where public.is_wall_member() and k.blocker = auth.uid()
     and exists (select 1 from public.profiles x where x.id = k.blocked)
   order by k.created_at desc
   limit 200;
$fn$;
revoke execute on function public.dm_blocked_list() from public, anon;
grant  execute on function public.dm_blocked_list() to authenticated;


-- SECTION 12. Frames, desk side -------------------------------------------------------------------
-- take one tag off one photo; it closes the reports on that tag
create or replace function public.desk_frame_untag(p_user uuid, p_slug text, p_media text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare v_m text := lower(btrim(coalesce(p_media, ''))); n int;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  delete from public.frame_tags t where t.user_id = p_user and t.event_slug = p_slug and t.media = v_m;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update public.reports
     set closed_at = now(), closed_by = auth.uid(), outcome = 'removed'
   where kind = 'frame_tag' and target = p_slug || '/' || v_m || '/' || public.wall_sid(p_user) and closed_at is null;
  perform public.acct_log(p_user, 'untag', jsonb_build_object('slug', p_slug, 'media', v_m));
  return true;
end $fn$;
revoke execute on function public.desk_frame_untag(uuid, text, text) from public, anon;
grant  execute on function public.desk_frame_untag(uuid, text, text) to authenticated;


-- SECTION 13. Backfills (direct SQL) -----------------------------------------------------------------
-- 13.1 Revokes from before today (I161). Those holders get their card back while they stay banned (the gate keeps them
--      hidden); unban republishes the posts the Revoke pulled. The claim, one-face and mirror triggers sit out, so
--      nobody else is renamed and no Crypt pic is copied. A holder the desk also said no to is left a member. A member
--      who took a Revoke's freed name keeps it (S4's claim never comes back for it); the info row names them.
do $$
declare v_ids uuid[];
begin
  alter table public.profiles disable trigger profiles_name_claim;
  alter table public.profiles disable trigger profiles_zz_one_face;
  alter table public.profiles disable trigger profiles_face_mirror;
  select coalesce(array_agg(x.id), '{}') into v_ids
    from public.profiles x join public.wall_people w on w.user_id = x.id
   where w.banned and not x.approved and not x.is_admin and not x.denied and x.card_slug is not null;
  update public.wall_people w
     set out_batch = (select p.pull_batch from public.posts p
                       where p.author_id = w.user_id and p.pull_batch is not null and not p.published
                       order by p.pulled_at desc nulls last limit 1)
   where w.user_id = any(v_ids) and w.banned and w.out_batch is null;
  update public.profiles set approved = true where id = any(v_ids);
  perform set_config('otp.i044_revokes', (
    select count(*)::text || coalesce(' (' || string_agg(coalesce(nullif(btrim(x.display_name), ''), 'Member'), ', ' order by x.display_name) || ')', '')
      from public.profiles x where x.id = any(v_ids)), false);
  perform set_config('otp.i044_worn', (
    select count(*)::text || coalesce(' (' || string_agg(coalesce(nullif(btrim(m.display_name), ''), 'Member'), ', ' order by m.display_name) || ')', '')
      from public.profiles m
     where not m.approved and not m.is_admin
       and exists (select 1 from public.profiles x, lateral (values (x.display_name), (x.card_slug)) v(y)
                    where x.id = any(v_ids) and v.y is not null and public.names_clash(m.display_name, v.y))), false);
  alter table public.profiles enable trigger profiles_name_claim;
  alter table public.profiles enable trigger profiles_zz_one_face;
  alter table public.profiles enable trigger profiles_face_mirror;
end $$;

-- 13.2 /join/ requests with no ask on file (never asked, never withdrew, never decided), filed as asks
do $$
declare n int;
begin
  insert into public.wall_people (user_id, card_ask, card_ask_at)
  select x.id, 'asked', x.created_at
    from public.profiles x join auth.users u on u.id = x.id
   where not x.approved and not x.denied and not x.is_admin and x.card_slug is null
     and coalesce(u.raw_user_meta_data ->> 'via', '') <> 'wall'
     and public.acct_open(x.id)
     and not exists (select 1 from public.wall_people w
                      where w.user_id = x.id and (w.banned or w.card_ask is not null or w.card_ask_at is not null))
  on conflict (user_id) do update set card_ask = 'asked', card_ask_at = excluded.card_ask_at
   where wall_people.card_ask is null and wall_people.card_ask_at is null and not wall_people.banned;
  get diagnostics n = row_count;
  perform set_config('otp.i044_asks', n::text, false);
end $$;

-- 13.3 DM reports move onto the one list (the thread columns stay, unused)
do $$
declare n int;
begin
  insert into public.reports (kind, target, about, by_user, note, shot, created_at)
  select 'dm', t.id::text, case when t.a = t.reported_by then t.b else t.a end, t.reported_by,
         left(t.report_note, 280), jsonb_build_object('msgs', public.dm_snapshot(t.id)), coalesce(t.reported_at, now())
    from public.wall_dm_threads t
   where t.reported_by is not null
     and t.reported_by in (t.a, t.b)
     and exists (select 1 from auth.users u where u.id = t.reported_by)
     and not exists (select 1 from public.reports r
                      where r.kind = 'dm' and r.target = t.id::text and r.by_user = t.reported_by and r.closed_at is null);
  get diagnostics n = row_count;
  update public.wall_dm_threads set reported_by = null, reported_at = null, report_note = null where reported_by is not null;
  perform set_config('otp.i044_dms', n::text, false);
end $$;

-- 13.4 people who blocked each other before today lose the friendship and the Top 8 spot too
do $$
declare r record; n int := 0;
begin
  for r in select k.blocker, k.blocked from public.wall_dm_blocks k loop
    if exists (select 1 from public.wall_friends f where (f.a = r.blocker and f.b = r.blocked) or (f.a = r.blocked and f.b = r.blocker))
       or exists (select 1 from public.wall_spaces s where (s.user_id = r.blocker and r.blocked = any(s.top8))
                                                       or (s.user_id = r.blocked and r.blocker = any(s.top8))) then
      n := n + 1;
    end if;
    perform public.block_cleanup(r.blocker, r.blocked);
  end loop;
  perform set_config('otp.i044_blocks', n::text, false);
end $$;


notify pgrst, 'reload schema';

-- SECTION 14. Verify: the first row, every column true. Then what moved. --------------------------
with v as (
  select
    coalesce(pg_get_functiondef('public.is_approved()'::regprocedure) like '%acct_ok%', false) as gate_in_is_approved,
    coalesce(pg_get_functiondef('public.wall_member(uuid)'::regprocedure) like '%acct_open%', false) as gate_in_wall_member,
    coalesce(pg_get_functiondef('public.is_wall_member()'::regprocedure) like '%acct_open%', false) as gate_in_is_wall_member,
    coalesce(pg_get_functiondef('public.take_author_ok(uuid)'::regprocedure) like '%acct_open%', false) as gate_in_take_author_ok,
    coalesce((select pg_get_expr(p.polqual, p.polrelid) like '%card_shown%' from pg_policy p
               where p.polrelid = 'public.profiles'::regclass and p.polname = 'approved profiles are public'), false) as profiles_policy_gated,
    has_function_privilege('anon', 'public.card_shown(uuid)', 'execute') as anon_runs_card_shown,
    has_function_privilege('anon', 'public.dark_seats()', 'execute') as anon_runs_dark_seats,
    not (has_function_privilege('anon', 'public.acct_open(uuid)', 'execute') or has_function_privilege('anon', 'public.acct_ok(uuid)', 'execute')
         or has_function_privilege('authenticated', 'public.acct_open(uuid)', 'execute') or has_function_privilege('authenticated', 'public.acct_ok(uuid)', 'execute')) as status_helpers_hidden,
    (select bool_and(c.relrowsecurity and not has_table_privilege('authenticated', c.oid, 'select') and not has_table_privilege('anon', c.oid, 'select'))
       from pg_class c where c.oid in ('public.account_closures'::regclass, 'public.account_log'::regclass, 'public.reports'::regclass, 'public.house_seats'::regclass))
      and to_regclass('public.house_marks') is null as tables_locked,
    (select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
       from unnest(array['public.desk_card(uuid,boolean,text)', 'public.desk_unno(uuid)', 'public.desk_ban(uuid,boolean,text)',
                         'public.desk_close(uuid,text)', 'public.desk_reopen(uuid)', 'public.desk_set_name(uuid,text)',
                         'public.desk_set_instagram(uuid,text)', 'public.desk_set_frame(uuid,text)', 'public.desk_set_song(uuid,text,integer)',
                         'public.desk_space_clear(uuid,text,text)', 'public.desk_item_act(text,text,text)',
                         'public.report_desk_queue(text,uuid,uuid,integer)', 'public.report_desk_count()', 'public.report_desk_close(text,text,text)',
                         'public.dm_desk_remove(bigint)', 'public.dm_desk_reports()', 'public.dm_desk_close(bigint)', 'public.dm_desk_count()',
                         'public.desk_frame_untag(uuid,text,text)', 'public.account_close(text,boolean)', 'public.account_reopen()',
                         'public.my_account()', 'public.my_rename(text)', 'public.wall_card_ask(text,text)', 'public.wall_card_unask()',
                         'public.wall_card_decide(uuid,boolean,text)', 'public.wall_desk_people()', 'public.report_add(text,text,text,text)',
                         'public.report_mine(text,text[])', 'public.dm_block_author(text,text)', 'public.dm_blocked_list()',
                         'public.wall_page_of(text)', 'public.wall_space(text)', 'public.wall_space_save(jsonb)', 'public.dm_inbox()',
                         'public.dm_thread(bigint,text,bigint)', 'public.dm_delete(bigint)', 'public.dm_report(bigint,text)', 'public.dm_block(text,boolean)',
                         'public.wall_space_post(text,text)']) as f) as doors_for_members,
    (select bool_and(not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
       from unnest(array['public.acct_log(uuid,text,jsonb)', 'public.name_worn(uuid,text)', 'public.name_clean(text)', 'public.acct_withdraw(uuid)',
                         'public.names_clash(text,text)', 'public.profiles_name_claim()',
                         'public.desk_space_files(uuid,text[])', 'public.file_born(text)', 'public.face_pick(uuid)',
                         'public.face_plan(jsonb)', 'public.face_merge(jsonb)', 'public.report_target(text,text,uuid)',
                         'public.report_state(text,text)', 'public.block_cleanup(uuid,uuid)', 'public.desk_person(uuid)',
                         'public.dm_snapshot(bigint)', 'public.dm_desk_msgs(bigint)']) as f) as helpers_hidden,
    pg_get_functiondef('public.dm_desk_reports()'::regprocedure) like '%is_admin()%'
      and pg_get_functiondef('public.wall_desk_people()'::regprocedure) like '%is_admin()%' as desk_doors_check_admin,
    (select count(*) from pg_trigger where not tgisinternal and tgrelid in ('public.profiles'::regclass, 'public.wall_spaces'::regclass)
        and tgname in ('profiles_guard_rename', 'profiles_change_log', 'profiles_zz_one_face', 'profiles_face_mirror', 'trg_wall_spaces_top8')) = 5
      and coalesce((select tgenabled = 'O' from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_name_claim'), false) as triggers_present,
    pg_get_functiondef('public.profiles_name_claim()'::regprocedure) like '%names_clash(p.display_name, v.x)%'
      and pg_get_functiondef('public.profiles_name_claim()'::regprocedure) not like '%name_taken%' as claim_takes_only_whats_new,
    pg_get_functiondef('public.wall_join(text)'::regprocedure) like '%shut%' as wall_join_knows_closed,
    pg_get_functiondef('public.guard_profile_privileges()'::regprocedure) like '%new.frame_grant%:= old.frame_grant%'
      and pg_get_functiondef('public.guard_profile_privileges()'::regprocedure) like '%(cards|spaces)%' as privileges_guard_kept,
    pg_get_functiondef('public.guard_profile_handle()'::regprocedure) not like '%otp.%' as handle_guard_unchanged,
    pg_get_functiondef('public.wall_space(text)'::regprocedure) like '%coalesce(pr.card_photo%' as one_profile_read,
    pg_get_functiondef('public.wall_space_save(jsonb)'::regprocedure) like '%''v''%'
      and pg_get_functiondef('public.wall_space_save(jsonb)'::regprocedure) like '%update public.profiles set card_photo%' as one_profile_write_v2,
    pg_get_functiondef('public.wall_space(text)'::regprocedure) like '%friend_rows(who) r%where who = me%' as carried_042_kept,
    exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'admin deletes any card art') as card_art_desk_delete,
    not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'card art is public')
      and exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'members see their own card art') as cards_not_listable,
    not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'pack photos are public')
      and exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'members see their own pack photos') as packs_not_listable,
    pg_get_functiondef('public.dm_inbox()'::regprocedure) like '%by_user = auth.uid()%' as dm_inbox_reporter_only,
    not exists (select 1 from public.wall_dm_threads t where t.reported_by is not null) as no_thread_reported_by,
    pg_get_functiondef('public.wall_space_post(text,text)'::regprocedure) like '%dm_blocked%' as wall_space_post_blocks,
    pg_get_functiondef('public.dm_block(text,boolean)'::regprocedure) like '%block_cleanup%' as dm_block_cleans,
    (select count(*) from public.house_seats) >= 10 as house_seats_seeded,
    not exists (select 1 from public.profiles x
                 where x.is_admin and (exists (select 1 from public.wall_people w where w.user_id = x.id and w.banned)
                                       or not public.acct_open(x.id))) as no_admin_banned_or_closed
),
info (n, what) as (values
  (1, 'Card holders banned in the Crypt who now come off the site too: ' || coalesce(nullif(current_setting('otp.i044_dark', true), ''), '0')),
  (2, 'Revokes from before today, card handed back while banned: ' || coalesce(nullif(current_setting('otp.i044_revokes', true), ''), '0')),
  (3, '/join/ asks filed: ' || coalesce(nullif(current_setting('otp.i044_asks', true), ''), '0')),
  (4, 'DM reports moved to the one list: ' || coalesce(nullif(current_setting('otp.i044_dms', true), ''), '0')),
  (5, 'Blocked pairs cleaned: ' || coalesce(nullif(current_setting('otp.i044_blocks', true), ''), '0')),
  (6, 'Members who go by the name of a card handed back (nobody was renamed): ' || coalesce(nullif(current_setting('otp.i044_worn', true), ''), '0'))
)
(select 'verify: every column should say true' as what, v.* from v)
union all
(select i.what, v.* from info i left join v on false order by i.n);
