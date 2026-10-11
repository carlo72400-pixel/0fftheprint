-- ============================================================
-- 040 · MEMBERS TALK (10/11, his ask: "we need to implement a messaging system so members can talk to each other")
-- ============================================================
-- Direct messages between two members of the Crypt. One thread per pair, plain text, members only.
--   dm_send(sid, body)       write to somebody (a new thread needs their page open: Show me in the Crypt; a reply works
--                            either way). 600 letters. 60 messages an hour, 15 new threads a day.
--   dm_inbox()               my threads, newest first, with the other person, a preview line and my unread count
--   dm_thread(thread, sid, before)  one conversation (by thread id, or by the other person's sid before a thread
--                            exists), the last 60 messages, older ones with `before`
--   dm_read(thread)          I have read it up to now
--   dm_unread()              one number for the badge
--   dm_delete(message)       take back my own message (the other side sees "message deleted")
--   dm_hide(thread)          take a conversation off my inbox; a new message from them brings it back
--   dm_block(sid, on)        no more messages either way. Both sides get the same answer ("not taking messages"),
--                            so nobody learns who blocked whom
--   dm_report(thread, note)  flag a conversation for the desk
--   dm_desk_reports() / dm_desk_close(thread)   the desk reads ONLY reported conversations, and closes a report
-- A ban (032) ends membership, so every call here refuses a banned account; what they already sent stays.
-- Every table has RLS on with no policies and no grants: the functions are the only door. Nothing is dropped.
-- Safe to run twice. The last statement prints the check rows.
-- ============================================================


-- SECTION 1. The tables -----------------------------------------------------------
create table if not exists public.wall_dm_threads (
  id          bigint generated always as identity primary key,
  a           uuid not null references auth.users(id) on delete cascade,
  b           uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  last_by     uuid,
  last_line   text,
  a_read_at   timestamptz,
  b_read_at   timestamptz,
  a_hidden    boolean not null default false,
  b_hidden    boolean not null default false,
  reported_by uuid,
  reported_at timestamptz,
  report_note text,
  constraint wall_dm_threads_pair check (a < b),
  constraint wall_dm_threads_note check (report_note is null or char_length(report_note) <= 280),
  unique (a, b)
);
create index if not exists wall_dm_threads_a on public.wall_dm_threads (a, last_at desc);
create index if not exists wall_dm_threads_b on public.wall_dm_threads (b, last_at desc);
alter table public.wall_dm_threads enable row level security;
revoke all on table public.wall_dm_threads from public, anon, authenticated;

create table if not exists public.wall_dm_messages (
  id          bigint generated always as identity primary key,
  thread_id   bigint not null references public.wall_dm_threads(id) on delete cascade,
  sender      uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 600),
  created_at  timestamptz not null default now(),
  deleted     boolean not null default false
);
create index if not exists wall_dm_messages_thread on public.wall_dm_messages (thread_id, id);
create index if not exists wall_dm_messages_sender on public.wall_dm_messages (sender, created_at desc);
alter table public.wall_dm_messages enable row level security;
revoke all on table public.wall_dm_messages from public, anon, authenticated;

create table if not exists public.wall_dm_blocks (
  blocker     uuid not null references auth.users(id) on delete cascade,
  blocked     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.wall_dm_blocks enable row level security;
revoke all on table public.wall_dm_blocks from public, anon, authenticated;


-- SECTION 2. Helpers (not callable from the API) ----------------------------------------
-- the two sides of a pair, always in the same order, so one thread per pair
create or replace function public.dm_pair(x uuid, y uuid, out lo uuid, out hi uuid)
language sql immutable as $fn$ select least(x, y), greatest(x, y) $fn$;

-- somebody by their sid (030), or null
create or replace function public.dm_who(p_sid text)
returns uuid language sql stable security definer
set search_path = public, pg_temp as $fn$
  select x.id from public.profiles x where public.wall_sid(x.id) = p_sid limit 1;
$fn$;

-- is either side blocking the other?
create or replace function public.dm_blocked(x uuid, y uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.wall_dm_blocks k where (k.blocker = x and k.blocked = y) or (k.blocker = y and k.blocked = x));
$fn$;

-- the other person on a thread, as the page draws people everywhere else
create or replace function public.dm_person(p uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'sid',  public.wall_sid(x.id),
    'name', coalesce(nullif(btrim(x.display_name), ''), 'Member'),
    'pic',  case when s.user_id is null then x.card_photo else s.pic end,
    'kind', case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
    'open', public.wall_open(x.id),
    'member', public.wall_member(x.id))
    from public.profiles x left join public.wall_spaces s on s.user_id = x.id where x.id = p;
$fn$;

revoke execute on function public.dm_pair(uuid, uuid), public.dm_who(text), public.dm_blocked(uuid, uuid), public.dm_person(uuid)
  from public, anon, authenticated;


-- SECTION 3. The doors (members only) ------------------------------------------------------

-- Write to somebody. Returns {thread, message}.
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
         where t.created_at > now() - interval '1 day'
           and ((t.a = me and t.last_by = me) or (t.b = me and t.last_by = me))) >= 15 then
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

-- My inbox: newest first, the other person, a preview, how many I have not read.
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
           where m.thread_id = t.id and m.sender <> auth.uid() and not m.deleted
             and m.created_at > coalesce(case when t.a = auth.uid() then t.a_read_at else t.b_read_at end, 'epoch'::timestamptz)),
         t.reported_by is not null
    from public.wall_dm_threads t
   where public.is_wall_member()
     and ((t.a = auth.uid() and not t.a_hidden) or (t.b = auth.uid() and not t.b_hidden))
   order by t.last_at desc
   limit 100;
$fn$;
revoke execute on function public.dm_inbox() from public, anon;
grant  execute on function public.dm_inbox() to authenticated;

-- One number for the badge.
create or replace function public.dm_unread()
returns integer language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(sum(x.unread), 0)::int from public.dm_inbox() x;
$fn$;
revoke execute on function public.dm_unread() from public, anon;
grant  execute on function public.dm_unread() to authenticated;

-- One conversation. By thread id, or by the other person's sid (then `thread` may be null: nothing sent yet).
-- `before` = a message id: the 60 before it (older pages).
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
    'reported', t.reported_by is not null,
    'read_at',  case when t.a = me then t.a_read_at else t.b_read_at end,
    'msgs',     (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'mine', q.sender = me, 'b', case when q.deleted then null else q.body end,
                                                              't', q.created_at, 'del', q.deleted) order by q.id), '[]'::jsonb)
                   from (select m.id, m.sender, m.body, m.created_at, m.deleted
                           from public.wall_dm_messages m
                          where t.id is not null and m.thread_id = t.id and (p_before is null or m.id < p_before)
                          order by m.id desc limit 60) q),
    'more',     t.id is not null and (select count(*) from public.wall_dm_messages m where m.thread_id = t.id and (p_before is null or m.id < p_before)) > 60
  );
end $fn$;
revoke execute on function public.dm_thread(bigint, text, bigint) from public, anon;
grant  execute on function public.dm_thread(bigint, text, bigint) to authenticated;

-- I have read this one.
create or replace function public.dm_read(p_thread bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_wall_member() then return false; end if;
  update public.wall_dm_threads t
     set a_read_at = case when t.a = me then now() else t.a_read_at end,
         b_read_at = case when t.b = me then now() else t.b_read_at end
   where t.id = p_thread and (t.a = me or t.b = me);
  return found;
end $fn$;
revoke execute on function public.dm_read(bigint) from public, anon;
grant  execute on function public.dm_read(bigint) to authenticated;

-- Take back my own message.
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
                                                             where x.thread_id = tid and not x.deleted order by x.id desc limit 1), '')
   where t.id = tid;
  return true;
end $fn$;
revoke execute on function public.dm_delete(bigint) from public, anon;
grant  execute on function public.dm_delete(bigint) to authenticated;

-- Take a conversation off my inbox (the other side keeps it; their next message brings it back).
create or replace function public.dm_hide(p_thread bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_wall_member() then return false; end if;
  update public.wall_dm_threads t
     set a_hidden = case when t.a = me then true else t.a_hidden end,
         b_hidden = case when t.b = me then true else t.b_hidden end
   where t.id = p_thread and (t.a = me or t.b = me);
  return found;
end $fn$;
revoke execute on function public.dm_hide(bigint) from public, anon;
grant  execute on function public.dm_hide(bigint) to authenticated;

-- Block or unblock somebody. Returns the new state.
create or replace function public.dm_block(p_sid text, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid(); who uuid := public.dm_who(p_sid);
begin
  if me is null or not public.is_wall_member() then raise exception 'Members only.' using errcode = '42501'; end if;
  if who is null or who = me then raise exception 'Nobody there.' using errcode = '22023'; end if;
  if p_on then insert into public.wall_dm_blocks (blocker, blocked) values (me, who) on conflict do nothing;
  else delete from public.wall_dm_blocks k where k.blocker = me and k.blocked = who; end if;
  return p_on;
end $fn$;
revoke execute on function public.dm_block(text, boolean) from public, anon;
grant  execute on function public.dm_block(text, boolean) to authenticated;

-- Flag a conversation for the desk.
create or replace function public.dm_report(p_thread bigint, p_note text default null)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_wall_member() then return false; end if;
  update public.wall_dm_threads t set reported_by = me, reported_at = now(), report_note = public.wall_line(p_note)
   where t.id = p_thread and (t.a = me or t.b = me);
  return found;
end $fn$;
revoke execute on function public.dm_report(bigint, text) from public, anon;
grant  execute on function public.dm_report(bigint, text) to authenticated;

-- The desk reads reported conversations only: both people, the note, the last 40 messages.
create or replace function public.dm_desk_reports()
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'thread', t.id, 'a', public.dm_person(t.a), 'b', public.dm_person(t.b),
           'by', public.dm_person(t.reported_by), 'at', t.reported_at, 'note', t.report_note,
           'msgs', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'from', public.wall_sid(q.sender), 'b', case when q.deleted then null else q.body end, 't', q.created_at) order by q.id), '[]'::jsonb)
                      from (select m.id, m.sender, m.body, m.created_at, m.deleted from public.wall_dm_messages m where m.thread_id = t.id order by m.id desc limit 40) q))
           order by t.reported_at desc), '[]'::jsonb)
    from public.wall_dm_threads t
   where public.is_admin() and t.reported_by is not null;
$fn$;
revoke execute on function public.dm_desk_reports() from public, anon;
grant  execute on function public.dm_desk_reports() to authenticated;

create or replace function public.dm_desk_close(p_thread bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not public.is_admin() then raise exception 'Desk only.' using errcode = '42501'; end if;
  update public.wall_dm_threads t set reported_by = null, reported_at = null, report_note = null where t.id = p_thread;
  return found;
end $fn$;
revoke execute on function public.dm_desk_close(bigint) from public, anon;
grant  execute on function public.dm_desk_close(bigint) to authenticated;

-- the desk's count of waiting reports (the People tab badge already counts card asks + sources)
create or replace function public.dm_desk_count()
returns integer language sql stable security definer
set search_path = public, pg_temp as $fn$
  select case when public.is_admin() then (select count(*)::int from public.wall_dm_threads t where t.reported_by is not null) else 0 end;
$fn$;
revoke execute on function public.dm_desk_count() from public, anon;
grant  execute on function public.dm_desk_count() to authenticated;


-- ---------- verify: every line should say true ----------
select 'threads table, RLS on, locked'   as test, ((select relrowsecurity from pg_class where oid = 'public.wall_dm_threads'::regclass) and not has_table_privilege('authenticated', 'public.wall_dm_threads', 'select'))::text as ok
union all select 'messages table, RLS on, locked', ((select relrowsecurity from pg_class where oid = 'public.wall_dm_messages'::regclass) and not has_table_privilege('authenticated', 'public.wall_dm_messages', 'select'))::text
union all select 'blocks table, RLS on, locked',   ((select relrowsecurity from pg_class where oid = 'public.wall_dm_blocks'::regclass) and not has_table_privilege('authenticated', 'public.wall_dm_blocks', 'select'))::text
union all select 'members may send',              has_function_privilege('authenticated', 'public.dm_send(text, text)', 'execute')::text
union all select 'strangers may not send',        (not has_function_privilege('anon', 'public.dm_send(text, text)', 'execute'))::text
union all select 'strangers may not read',        (not has_function_privilege('anon', 'public.dm_inbox()', 'execute') and not has_function_privilege('anon', 'public.dm_thread(bigint, text, bigint)', 'execute'))::text
union all select 'the helpers are not doors',     (not has_function_privilege('authenticated', 'public.dm_person(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.dm_who(text)', 'execute'))::text
union all select 'eleven doors in all',           ((select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('dm_send','dm_inbox','dm_unread','dm_thread','dm_read','dm_delete','dm_hide','dm_block','dm_report','dm_desk_reports','dm_desk_close','dm_desk_count')) = 12)::text;
