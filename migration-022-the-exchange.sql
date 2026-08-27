-- ============================================================================
-- 0FF THE PRINT, MIGRATION 022: THE EXCHANGE
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-27
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this drops and
--    recreates the calendar view and the calendar guard trigger). CONFIRM IT
--    by clicking "Run query". Cancelling runs nothing AND reports nothing.
--
-- ⛔ VERIFY IS ONE ROW AT THE BOTTOM AND EVERY COLUMN MUST SAY true.
--
-- WHAT THIS IS FOR.
--
-- /seats/ says it out loud: "What it costs is nothing. What it asks is that you
-- post sometimes." It asks, and it has never once offered anything back. That
-- is the whole hole. Somebody takes a seat, posts a polite first post inside the
-- ninety seconds of the handoff, and never returns, because this is a timeline
-- with no comments, no counts, no algorithm and no audience, and they came from
-- platforms that have all four. Nothing here has ever given anybody a reason to
-- post a SECOND time.
--
-- The house owns exactly one thing those platforms do not hand out free: it
-- shows up with a camera. So the seat stops being a credential and becomes a
-- standing trade. Put your date up, and if the house can make it, the house
-- shoots it, and the frames come back with your name on them.
--
-- ⛔ NO NEW TABLE. The calendar already collects "when am I playing" and
--    /events/ already publishes the graded dumps and /c/<slug>/ already exists.
--    The loop was never missing a table, it was missing THREE COLUMNS wiring
--    those three things to each other.
--
-- ⛔ TWO OWNERS, SO TWO COLUMNS. want_house is the MEMBER's ask and they own it.
--    house_status is the DESK's answer and only the desk may write it. Folding
--    them into one field would let a member mark their own night 'shot' and
--    print a link to a dump that does not exist.
-- ============================================================================


-- ============================================================================
-- SECTION 1. The three columns.
-- ============================================================================
alter table public.calendar_dates
  add column if not exists want_house   boolean not null default false,
  add column if not exists house_status text    not null default 'none',
  add column if not exists event_slug   text;

comment on column public.calendar_dates.want_house is
  'The member''s ask: do you want the house at this one. Theirs to set.';
comment on column public.calendar_dates.house_status is
  'The desk''s answer. none = not asked or not answered, on_list = the house is
   coming, shot = it happened and event_slug points at the dump. DESK ONLY,
   pinned for everybody else by guard_calendar_date().';
comment on column public.calendar_dates.event_slug is
  'The /events/<slug>/ folder the frames landed in. Desk only. This is the
   column that closes the loop: it is what turns a date that has passed into a
   reason to come back and look.';

alter table public.calendar_dates
  drop constraint if exists calendar_house_status_known,
  add  constraint calendar_house_status_known
       check (house_status in ('none','on_list','shot'));

-- ⛔ This value becomes a URL PATH on the front page and on somebody's own
-- page. It is validated here for the same reason 020 put the https rule on
-- link: the database enforces the shape, not the page.
alter table public.calendar_dates
  drop constraint if exists calendar_event_slug_sane,
  add  constraint calendar_event_slug_sane
       check (event_slug is null or event_slug ~ '^[a-z0-9][a-z0-9-]{2,80}$');

-- 'shot' with nothing to point at is a promise with no frames behind it, which
-- is worse on this page than no promise at all.
alter table public.calendar_dates
  drop constraint if exists calendar_shot_has_a_dump,
  add  constraint calendar_shot_has_a_dump
       check (house_status <> 'shot' or event_slug is not null);

create index if not exists calendar_dates_asking_idx
  on public.calendar_dates (on_date) where want_house;


-- ============================================================================
-- SECTION 2. The guard.
--
-- ⛔ 020's function is carried VERBATIM and the new block is appended. A
--    create-or-replace is a whole-body replace: anything not retyped is
--    deleted. That is the 005 lesson and it applies to functions as hard as it
--    applies to RETURNS TABLE.
--
-- house_status and event_slug get exactly the treatment published already gets:
-- a member editing their own row keeps whatever state the desk left it in, and
-- a member creating a row cannot open at anything but the defaults.
-- ============================================================================
create or replace function public.guard_calendar_date()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_by := coalesce(auth.uid(), new.submitted_by);
    new.created_at   := now();
    -- a brand new date is never already on the list and never already shot,
    -- whoever is asking
    if not public.is_admin() then
      new.house_status := 'none';
      new.event_slug   := null;
    end if;
  else
    new.id           := old.id;
    new.submitted_by := old.submitted_by;
    new.created_at   := old.created_at;
    -- only the desk may flip published; a member editing their own row keeps
    -- whatever state the desk left it in
    if not public.is_admin() then
      new.published    := old.published;
      new.house_status := old.house_status;
      new.event_slug   := old.event_slug;
    end if;
  end if;
  new.title := btrim(replace(replace(new.title, chr(8212), ','), chr(8211), ','));
  if new.note is not null then
    new.note := btrim(replace(replace(new.note, chr(8212), ','), chr(8211), ','));
    if new.note = '' then new.note := null; end if;
  end if;
  if new.city  is not null and btrim(new.city)  = '' then new.city  := null; end if;
  if new.venue is not null and btrim(new.venue) = '' then new.venue := null; end if;
  if new.link  is not null and btrim(new.link)  = '' then new.link  := null; end if;
  if new.event_slug is not null and btrim(new.event_slug) = '' then new.event_slug := null; end if;
  return new;
end $$;

drop trigger if exists calendar_dates_guard on public.calendar_dates;
create trigger calendar_dates_guard before insert or update on public.calendar_dates
  for each row execute function public.guard_calendar_date();


-- ============================================================================
-- SECTION 3. The read surface.
--
-- ⛔ calendar_dates is granted at the TABLE, not per column, so these three new
--    columns are already readable and 019's trap does not apply here. The
--    verify reads the view AS ANON anyway, because 018's verify said true six
--    times by checking the SHAPE of a view it never once tried to read.
-- ============================================================================
drop view if exists public.calendar;
create view public.calendar
with (security_invoker = on) as
  select c.id, c.title, c.kind, c.on_date, c.start_time,
         c.city, c.venue, c.link, c.note, c.created_at,
         c.want_house, c.house_status, c.event_slug,
         p.card_slug    as by,
         p.display_name as by_name
    from public.calendar_dates c
    join public.profiles p on p.id = c.submitted_by
   where c.published and p.approved;

grant select on public.calendar to anon, authenticated;

comment on view public.calendar is
  'Public run of dates. security_invoker, so the profiles RLS decides whose
   dates an anonymous reader sees. The client restates ORDER BY: a view ORDER BY
   is not guaranteed to survive LIMIT. want_house is public on purpose: a date
   the house is coming to should read as one on everybody''s screen, not only
   on the member''s own.';


-- ============================================================================
-- SECTION 4. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
--
-- ⛔ THIS ASSERTS THE REFUSALS, not just the happy path. 021's lesson: on
--    anything shaped like a permission, prove the thing that must NOT work.
--    The SQL editor runs with auth.uid() null, so is_admin() is false in here
--    and these updates take the exact branch a logged in member takes.
-- ============================================================================
-- ⛔ THE TEMP TABLE IS CREATED BEFORE ANY BRANCH AND CARRIES NO "on commit
--    drop". A verify that can vanish between the do-block and the SELECT is a
--    verify that reports "relation does not exist" instead of an answer, and
--    Supabase only ever shows you the LAST statement.
drop table if exists _m022;
create temp table _m022 (
  insert_defaults_clean boolean not null default false,
  insert_slug_clean     boolean not null default false,
  pins_status           boolean not null default false,
  pins_slug             boolean not null default false,
  anon_reads            boolean not null default false
);
insert into _m022 default values;

do $$
declare
  who uuid;
  rid uuid;
  st  text;
  es  text;
begin
  select id into who from public.profiles where card_slug is not null limit 1;
  if who is null then
    -- Nothing to hang a test row on. Say so out loud rather than reporting a
    -- pass nobody earned.
    raise notice '022: no card holder on this database, refusal test could not run';
    return;
  end if;

  -- THE INSERT BRANCH. A member creating a date cannot open it already shot.
  insert into public.calendar_dates (submitted_by, title, on_date, published,
                                     house_status, event_slug)
       values (who, 'MIGRATION 022 SELF TEST', date '2031-01-01', false,
               'shot', '2031-01-01-not-a-real-night')
    returning id, house_status, event_slug into rid, st, es;
  update _m022 set insert_defaults_clean = (st = 'none'),
                   insert_slug_clean     = (es is null);

  -- THE UPDATE BRANCH. A member editing their own date cannot answer for the
  -- desk. This is the one that matters: it is the difference between a member
  -- asking for the house and a member announcing the house was there.
  update public.calendar_dates
     set house_status = 'shot', event_slug = '2031-01-01-not-a-real-night'
   where id = rid;
  select house_status, event_slug into st, es
    from public.calendar_dates where id = rid;
  update _m022 set pins_status = (st = 'none'), pins_slug = (es is null);

  delete from public.calendar_dates where id = rid;
end $$;

-- ⛔ THE 019 CHECK, DONE PROPERLY. has_table_privilege only asks whether anon is
-- ALLOWED to read the view. 018 passed every check it wrote and still cost the
-- site its whole cards view, because a view reads with the CALLER's privileges
-- and nobody had tried being the caller. This actually becomes anon and reads.
-- The nested block is its own subtransaction, so a failed read (or a refused
-- role switch) rolls the SET ROLE back on its own and cannot strand this
-- session as anon.
do $$
declare n int; ok boolean := false; err text;
begin
  begin
    set local role anon;
    select count(*) into n from public.calendar;
    ok := true;
  exception when others then
    err := sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  -- ⛔ WRITE THE ANSWER DOWN ONLY AFTER RESET ROLE. The first cut of this check
  --    did `update _m022 ...` while still wearing anon, and anon has no
  --    privileges on a temp table postgres created, so the SELECT it was
  --    testing passed and the bookkeeping threw 42501 and the column reported
  --    FALSE on a database where anon could read the view perfectly. A verify
  --    that lies in the SAFE direction still costs a session.
  update _m022 set anon_reads = ok;
  if not ok then
    raise notice '022: reading public.calendar AS ANON failed: %', err;
  end if;
end $$;

select
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='calendar_dates'
             and column_name='want_house')                            as want_house_added,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='calendar_dates'
             and column_name='house_status')                          as house_status_added,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='calendar_dates'
             and column_name='event_slug')                            as event_slug_added,
  exists (select 1 from pg_constraint
           where conname='calendar_house_status_known')               as status_check_on,
  exists (select 1 from pg_constraint
           where conname='calendar_event_slug_sane')                  as slug_check_on,
  exists (select 1 from pg_constraint
           where conname='calendar_shot_has_a_dump')                  as shot_needs_a_dump,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='calendar'
      and column_name in ('want_house','house_status','event_slug')) = 3
                                                                      as view_carries_all_three,
  has_table_privilege('anon','public.calendar','select')              as anon_may_read_the_view,
  (select anon_reads from _m022)                                      as anon_ACTUALLY_reads_it,
  (select insert_defaults_clean from _m022)                           as refuses_insert_as_shot,
  (select insert_slug_clean     from _m022)                           as refuses_insert_slug,
  (select pins_status           from _m022)                           as refuses_member_status,
  (select pins_slug             from _m022)                           as refuses_member_slug;
