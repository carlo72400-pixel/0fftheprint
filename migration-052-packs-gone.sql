-- ⛔⛔ THIS CANNOT BE UNDONE. Once this file has run, every member and artist pack, every card in one and every heart
--      on one is gone for good, and nothing in this file or on the site can bring them back.
--
-- LOOK FIRST. This block only reads. Paste it by itself, without the leading dashes, to see what will be destroyed:
--
--   select 'packs' as what,                        count(*) as n from public.packs
--   union all select 'packs that are published',   count(*) from public.packs where published
--   union all select 'members who made a pack',    count(distinct author_id) from public.packs
--   union all select 'cards in those packs',       count(*) from public.pack_cards
--   union all select 'hearts on cards (faves)',    count(*) from public.pack_faves
--   union all select 'open reports on a pack',     count(*) from public.reports where kind = 'pack' and closed_at is null
--   union all select 'files in the packs bucket',  count(*) from storage.objects where bucket_id = 'packs';
--
-- ============================================================
-- 052 · THE PACKS ARE GONE (11/12, his call: member and artist packs are destroyed)
-- ============================================================
-- The pack maker (037) came off the site on 11/12: the /packs/ page, the shelf on the Photos tab, the binder's pack
-- sections, the board's pack queue and the Crypt's Packs box. This file takes the database half out, data and all.
-- NIGHT PACKS are not in the database and are not touched (events/<night>/, sealed.js, the roster's house pack).
--   S0. The guard. The nine functions S1 rewrites must still be the ones the repo holds (044, 045, 049), or already
--       this file's own. Anything else on the database stops the file before it changes a thing.
--   S1. The nine board and report functions that read the pack tables, carried whole from the file that last wrote
--       each, with only the pack parts cut: report_state, report_target, desk_item_act, desk_mark_read,
--       desk_member_rows, desk_member_list, desk_member_stuff, desk_waiting, desk_queue. Same names, same arguments,
--       same shapes: desk_waiting keeps its packs column (always 0), desk_member_rows keeps n_packs (always 0),
--       desk_queue and desk_member_stuff keep a 'packs' key (always empty). So the board reads the same answer
--       whether its page is from before or after the push.
--   S2. Open reports on a pack close as 'gone' (the thing they point at is). Closed ones keep their rows.
--   S3. The five storage policies of the `packs` bucket come off storage.objects.
--   S4. The twelve pack functions are dropped.
--   S5. The three tables are dropped: pack_faves, pack_cards, packs (their indexes, constraints, sequences and the
--       zz_desk_decided trigger on packs go with them).
--   S6. The verify row (every column should say true).
--   S7. THE BUCKET. By hand, in the dashboard. Read it: SQL does not empty a bucket.
-- KEPT ON PURPOSE: frame_tags and its four functions (037's "I'm in this one"), uploads_today, desk_decided_stamp
--    (rooms, picks and stories use it), the word 'pack' in reports.kind (old closed reports keep their rows) and
--    every account_log row.
-- ⛔ NOT RUN ANYWHERE YET. Written 11/12 from the repo's own files with no database at hand: not on the replica, not
--    on Supabase. Run the DB test kit first (99_SYSTEM/_tools/otp_dbtest/run.sh). Its pack tests (t_037 and the pack
--    checks in t_042, t_044 and t_045) are expected to fail once this file is in the replay and want retiring.
-- ⛔ Paste after 051, in one go. One transaction: an error applies nothing from this file. Safe to run twice (the
--    second run finds nothing left to drop).
-- ⛔ The editor WILL ask to confirm a "destructive" query, and this time it is one: drop table, drop function,
--    drop policy. That click is yours.
-- ⛔ Push the pages first, then run this. A page from before the push still asks packs_list and my_faves; after this
--    file those answer "not found" (the old shelf says it did not load, nothing else breaks).
-- ============================================================

begin;

-- S0 · the guard ---------------------------------------------
-- md5 of each function's source: old_md5 = the repo's (the file named beside it), new_md5 = this file's.
do $guard$
declare r record; v text;
begin
  for r in select * from (values
    ('public.report_state(text, text)', '5ab3eea4c9e26b6c6c515c03955dae4e', '0999ccf85907d1e2e00e235dd6c37faa', 'migration-044-the-back-room.sql'),
    ('public.report_target(text, text, uuid)', '356197fdc0b31ec1af111f77a6c52b2c', '8e1507aee83a5e4b7d9839f7ab6e5700', 'migration-044-the-back-room.sql'),
    ('public.desk_item_act(text, text, text)', 'b3946b9c978b2cc64ac62f9a7b98edaa', '737a85f0e22ec39022074e4d79e01e72', 'migration-044-the-back-room.sql'),
    ('public.desk_mark_read(text, bigint)', '35f4a69be99b5fd82a01be69ea673b0a', 'feb75999e344466e93a0b6c6cd54d2a7', 'migration-045-their-own-and-the-roll.sql'),
    ('public.desk_member_rows(uuid)', '743a3570456b19410c72d5268f843468', '1f457ea02917f2e66f656790b28bb330', 'migration-049-the-door-looks-first.sql'),
    ('public.desk_member_list(uuid, text, timestamptz, integer)', 'a6c37dec294ef046a9335b1bc32dcb3b', '0993a24e7dbfabf756f3391b21548082', 'migration-045-their-own-and-the-roll.sql'),
    ('public.desk_member_stuff(uuid)', 'd76568e3f03e154d8a0a1df84276742c', 'f79c240874c9ee8d387d725f3442ab31', 'migration-045-their-own-and-the-roll.sql'),
    ('public.desk_waiting()', 'ae7407f6e80bf621381be8f7ae95d9e1', 'c600bf17213a7316cf96f609c2bc1172', 'migration-045-their-own-and-the-roll.sql'),
    ('public.desk_queue()', '909b7715563b79a66517b260447f6287', '947fb9a1ce9f45aed51653e395653218', 'migration-045-their-own-and-the-roll.sql')
  ) as t(fn, old_md5, new_md5, src)
  loop
    if to_regprocedure(r.fn) is null then
      raise exception '052 stopped: % is not on this database. Nothing was changed.', r.fn;
    end if;
    select md5(p.prosrc) into v from pg_proc p where p.oid = to_regprocedure(r.fn);
    if v is distinct from r.old_md5 and v is distinct from r.new_md5 then
      raise exception '052 stopped: % is not the one in % (somebody changed it since). Nothing was changed. Tell Claude.', r.fn, r.src;
    end if;
  end loop;
end $guard$;

-- S1 · the board and the reports, without the packs ----------
-- report_state, carried (migration-044-the-back-room.sql, line 330). Cut: the pack parts, nothing else.
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

-- report_target, carried (migration-044-the-back-room.sql, line 377). Cut: the pack parts, nothing else.
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

-- desk_item_act, carried (migration-044-the-back-room.sql, line 1989). Cut: the pack parts, nothing else.
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

-- desk_mark_read, carried (migration-045-their-own-and-the-roll.sql, line 809). Cut: the pack parts, nothing else.
create or replace function public.desk_mark_read(p_kind text, p_id bigint default null)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare n int := 0;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('story', 'pick', 'story_comment', 'room') then
    raise exception 'Mark what? story, pick, story_comment or room.' using errcode = '22023';
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

-- desk_member_rows, carried (migration-049-the-door-looks-first.sql, line 188). Cut: the pack parts, nothing else.
create or replace function public.desk_member_rows(p_only uuid default null)
returns table(id uuid, sid text, name text, ig text, card_slug text, requested_slug text, card_want text, role text,
              state text, asks boolean, said_no boolean, show_name boolean, pic text, joined timestamptz,
              crypt_joined timestamptz, last_in timestamptz, last_active timestamptz, banned_at timestamptz,
              ban_note text, closed_at timestamptz, closed_by_desk boolean, close_reason text, frame_grant text,
              card_frame text, n_posts integer, n_roll integer, n_comments integer, n_page integer, n_packs integer,
              n_rooms integer, n_stories integer, n_catalog integer, n_story_comments integer, n_picks integer,
              n_videos integer, n_dates integer, n_tags integer, n_sources integer, n_friends integer, n_reports integer)
language sql stable security definer set search_path = public, pg_temp as $f$
  with
  po as (select p.author_id as u, count(*)::int as n, (count(*) filter (where p.members_only))::int as roll, max(p.created_at) as at
           from public.posts p group by 1),
  tc as (select c.user_id as u, count(*)::int as n, max(c.created_at) as at from public.take_comments c group by 1),
  fc as (select c.user_id as u, count(*)::int as n, max(c.created_at) as at from public.wall_comments c group by 1),
  pg as (select c.author as u, count(*)::int as n, max(c.created_at) as at from public.wall_space_posts c group by 1),
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
         -- 049: 'door' = waiting for the desk to look at their @
         case when x.is_admin then 'desk' when x.approved then 'card' when coalesce(w.casual, false) then 'member'
              when w.door = 'wait' then 'door' else 'login' end,
         -- 049: 'turned' = the desk turned them away at the door
         case when c.user_id is not null then 'closed' when coalesce(w.banned, false) then 'banned'
              when w.door = 'no' and not x.approved and not x.is_admin and not coalesce(w.casual, false) then 'turned'
              else 'active' end,
         (coalesce(w.card_ask = 'asked', false) and not x.approved and not x.is_admin and not x.denied and public.acct_ok(x.id)) as asks,
         (x.denied or coalesce(w.card_ask = 'denied', false)),
         coalesce(w.show_name, true),
         coalesce(sp.pic, x.card_photo),
         x.created_at, w.joined_at,
         (to_jsonb(au) ->> 'last_sign_in_at')::timestamptz,
         greatest(po.at, tc.at, fc.at, pg.at, rm.at, st.at, we.at, rt.at, fv.at, cd.at, ft.at, so.at),
         case when coalesce(w.banned, false) then w.banned_at end, case when coalesce(w.banned, false) then w.ban_note end,
         c.closed_at, coalesce(c.by_desk, false), c.reason,
         x.frame_grant::text, x.card_frame::text,
         coalesce(po.n, 0), coalesce(po.roll, 0), coalesce(tc.n, 0) + coalesce(fc.n, 0), coalesce(pg.n, 0),
         0,      -- n_packs: the packs are gone (052); the column stays so the board's list keeps its shape
         coalesce(rm.n, 0), coalesce(st.n, 0), coalesce(st.baked, 0),
         coalesce(we.n, 0), coalesce(rt.n, 0), coalesce(fv.n, 0), coalesce(cd.n, 0), coalesce(ft.n, 0), coalesce(so.n, 0),
         coalesce(fr.n, 0), coalesce(rp.n, 0)
    from public.profiles x
    left join auth.users au on au.id = x.id
    left join public.wall_people w on w.user_id = x.id
    left join public.wall_spaces sp on sp.user_id = x.id
    left join public.account_closures c on c.user_id = x.id and c.reopened_at is null
    left join po on po.u = x.id left join tc on tc.u = x.id left join fc on fc.u = x.id left join pg on pg.u = x.id
    left join rm on rm.u = x.id left join st on st.u = x.id left join we on we.u = x.id
    left join rt on rt.u = x.id left join fv on fv.u = x.id left join cd on cd.u = x.id left join ft on ft.u = x.id
    left join so on so.u = x.id left join fr on fr.u = x.id left join rp on rp.u = x.id
   where public.is_admin() and (p_only is null or x.id = p_only)
   order by asks desc, x.is_admin desc, x.created_at desc
   limit 2000;
$f$;
revoke execute on function public.desk_member_rows(uuid) from public, anon, authenticated;

-- desk_member_list, carried (migration-045-their-own-and-the-roll.sql, line 926). Cut: the pack parts, nothing else.
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

-- desk_member_stuff, carried (migration-045-their-own-and-the-roll.sql, line 1028). Cut: the pack parts, nothing else.
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
    -- the packs are gone (052); the key stays, empty, for a board page that has not reloaded yet
    'packs',          jsonb_build_object('total', 0, 'rows', '[]'::jsonb),
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

-- desk_waiting, carried (migration-045-their-own-and-the-roll.sql, line 1110). Cut: the pack parts, nothing else.
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
  v_pk := 0;      -- the packs are gone (052); the column stays so the badge keeps its shape
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

-- desk_queue, carried (migration-045-their-own-and-the-roll.sql, line 1144). Cut: the pack parts, nothing else.
create or replace function public.desk_queue()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
begin
  if not coalesce(public.is_admin(), false) then return null; end if;
  return jsonb_build_object(
    'packs', '[]'::jsonb,      -- gone (052); the key stays, empty, for a board page that has not reloaded yet
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

-- S2 · open reports on a pack close as gone ------------------
update public.reports set closed_at = now(), outcome = 'gone' where kind = 'pack' and closed_at is null;

-- S3 · the packs bucket's policies ----------------------------
-- (the delete policy calls pack_image_in_use, so the policies go before the functions)
drop policy if exists "pack photos are public" on storage.objects;
drop policy if exists "members see their own pack photos" on storage.objects;
drop policy if exists "members upload pack photos" on storage.objects;
drop policy if exists "members delete own pack photos" on storage.objects;
drop policy if exists "admin deletes any pack photo" on storage.objects;

-- S4 · the pack functions --------------------------------------
drop function if exists public.packs_list();
drop function if exists public.pack_open(text);
drop function if exists public.pack_save(jsonb);
drop function if exists public.pack_publish(bigint, boolean);
drop function if exists public.pack_delete(bigint);
drop function if exists public.my_packs();
drop function if exists public.desk_packs();
drop function if exists public.pack_fave(bigint, boolean);
drop function if exists public.pack_fave_tally(bigint[]);
drop function if exists public.my_faves();
drop function if exists public.pack_visible(bigint);
drop function if exists public.pack_image_in_use(text);

-- S5 · the tables: hearts, then cards, then packs --------------
-- No cascade on purpose: if anything this file does not know about still hangs off one, it stops here and applies nothing.
drop table if exists public.pack_faves;
drop table if exists public.pack_cards;
drop table if exists public.packs;

commit;

-- S6 · verify: every column should say true ------------------
select
  to_regclass('public.packs') is null and to_regclass('public.pack_cards') is null
    and to_regclass('public.pack_faves') is null                                                 as the_pack_tables_are_gone,
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public'
                 and p.proname in ('packs_list', 'pack_open', 'pack_save', 'pack_publish', 'pack_delete', 'my_packs',
                                   'desk_packs', 'pack_fave', 'pack_fave_tally', 'my_faves', 'pack_visible',
                                   'pack_image_in_use'))                                         as the_pack_functions_are_gone,
  not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass
                 and polname in ('pack photos are public', 'members see their own pack photos',
                                 'members upload pack photos', 'members delete own pack photos',
                                 'admin deletes any pack photo'))                                as the_bucket_policies_are_gone,
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public'
                 and p.prosrc ~ 'public\.packs|pack_cards|pack_faves|pack_visible|pack_image_in_use') as nothing_still_reads_them,
  'packs' = any ((select p.proargnames from pg_proc p where p.oid = 'public.desk_waiting()'::regprocedure)::text[])
    and 'n_packs' = any ((select p.proargnames from pg_proc p where p.oid = 'public.desk_member_rows(uuid)'::regprocedure)::text[])
                                                                                                 as the_board_kept_its_shapes,
  not exists (select 1 from public.reports where kind = 'pack' and closed_at is null)            as no_open_report_on_a_pack,
  to_regclass('public.frame_tags') is not null
    and to_regprocedure('public.frames_of(text)') is not null                                    as im_in_this_one_is_untouched;

-- S7 · THE BUCKET, BY HAND ------------------------------------
-- ⛔ This file does NOT delete the pack photos. They are files in Supabase Storage, in the bucket named `packs`, and
--    SQL on storage.objects does not remove files (no migration in this repo has ever deleted from storage.objects).
--    After this file has run and the verify row is all true:
--      1. Supabase dashboard > Storage > the `packs` bucket.
--      2. Empty the bucket (the bucket's menu > Empty bucket). This is the part that destroys the photos.
--      3. Delete the bucket (the same menu > Delete bucket).
--    The bucket is public, so until step 2 every pack photo still opens for anybody who kept its address.
--    To check it is done, this should say 0 files and no bucket (read-only):
--      select (select count(*) from storage.objects where bucket_id = 'packs') as files_left,
--             exists (select 1 from storage.buckets where id = 'packs')         as the_bucket_is_still_there;
