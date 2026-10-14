-- ============================================================
-- 040 REPAIR (10/14). On 10/14 the SQL editor swapped a loaded file for an old saved query and migration 040 ran a second
-- time. 040 itself is safe twice (no rows deleted, the tables, rights and rules came out the same), but it put back its
-- ORIGINAL bodies of 10 message functions that 042 and 044 had replaced later: dm_send and dm_report (042), and dm_block,
-- dm_delete, dm_desk_close, dm_desk_count, dm_desk_reports, dm_inbox, dm_person, dm_report, dm_thread (044). That brought
-- back, until this runs: a report showing the reporter, block not reaching page comments, the old report list, and more.
-- This file puts back the CURRENT bodies exactly (copied from a replica built 002..045), nothing else. Rights are unchanged
-- (CREATE OR REPLACE keeps them). Safe to run twice. One verify row at the end: every column should say true.
-- ============================================================

-- dm_block(text,boolean)
CREATE OR REPLACE FUNCTION public.dm_block(p_sid text, p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare me uuid := auth.uid(); who uuid := public.dm_who(p_sid);
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if who is null or who = me then raise exception 'Nobody there.' using errcode = '22023'; end if;
  if p_on then insert into public.wall_dm_blocks (blocker, blocked) values (me, who) on conflict do nothing;
    perform public.block_cleanup(me, who);   -- 044: block means block
  else delete from public.wall_dm_blocks k where k.blocker = me and k.blocked = who; end if;
  return p_on;
end $function$;

-- dm_delete(bigint)
CREATE OR REPLACE FUNCTION public.dm_delete(p_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

-- dm_desk_close(bigint)
CREATE OR REPLACE FUNCTION public.dm_desk_close(p_thread bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.reports set closed_at = now(), closed_by = auth.uid(), outcome = 'kept'
   where kind = 'dm' and target = p_thread::text and closed_at is null;
  return found;
end $function$;

-- dm_desk_count()
CREATE OR REPLACE FUNCTION public.dm_desk_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when public.is_admin()
              then (select count(distinct r.target)::int from public.reports r where r.kind = 'dm' and r.closed_at is null)
              else 0 end;
$function$;

-- dm_desk_reports()
CREATE OR REPLACE FUNCTION public.dm_desk_reports()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- dm_inbox()
CREATE OR REPLACE FUNCTION public.dm_inbox()
 RETURNS TABLE(thread bigint, who jsonb, last_at timestamp with time zone, last_line text, last_mine boolean, unread integer, reported boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- dm_person(uuid)
CREATE OR REPLACE FUNCTION public.dm_person(p uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- dm_report(bigint,text)
CREATE OR REPLACE FUNCTION public.dm_report(p_thread bigint, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

-- dm_send(text,text)
CREATE OR REPLACE FUNCTION public.dm_send(p_sid text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

-- dm_thread(bigint,text,bigint)
CREATE OR REPLACE FUNCTION public.dm_thread(p_thread bigint DEFAULT NULL::bigint, p_sid text DEFAULT NULL::text, p_before bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

-- VERIFY: every column should say true (each body is the current one again)
select
  (select md5(p.prosrc) = '5b1b068fb69676e750d9b387861833f8' from pg_proc p where p.oid = 'public.dm_block(text,boolean)'::regprocedure) as dm_block,
  (select md5(p.prosrc) = 'f238ea1a23212567e1ece5327bf0ab25' from pg_proc p where p.oid = 'public.dm_delete(bigint)'::regprocedure) as dm_delete,
  (select md5(p.prosrc) = 'ce786a14e1d89152fd8a9f88497b89f0' from pg_proc p where p.oid = 'public.dm_desk_close(bigint)'::regprocedure) as dm_desk_close,
  (select md5(p.prosrc) = '494d8b29d5c767b6a1d3cc630e1cc794' from pg_proc p where p.oid = 'public.dm_desk_count()'::regprocedure) as dm_desk_count,
  (select md5(p.prosrc) = '1e8cf7ad0e46f7a81610a4846880c3e8' from pg_proc p where p.oid = 'public.dm_desk_reports()'::regprocedure) as dm_desk_reports,
  (select md5(p.prosrc) = '08be417ceaf26b75d931183c0cf35187' from pg_proc p where p.oid = 'public.dm_inbox()'::regprocedure) as dm_inbox,
  (select md5(p.prosrc) = 'd3cb7c4de0d530417f5eb388d248c109' from pg_proc p where p.oid = 'public.dm_person(uuid)'::regprocedure) as dm_person,
  (select md5(p.prosrc) = '9e6a483a9847cf6dbb7d7c38e9ccf786' from pg_proc p where p.oid = 'public.dm_report(bigint,text)'::regprocedure) as dm_report,
  (select md5(p.prosrc) = 'aff0182bfaa2a5eaafc2996be9e89fd1' from pg_proc p where p.oid = 'public.dm_send(text,text)'::regprocedure) as dm_send,
  (select md5(p.prosrc) = '2f83e3bc921538be736ae909c116f12b' from pg_proc p where p.oid = 'public.dm_thread(bigint,text,bigint)'::regprocedure) as dm_thread;
