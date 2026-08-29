-- ============================================================================
-- 0FF THE PRINT, MIGRATION 025: WHOSE NIGHT IT IS
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-28
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this drops and
--    recreates the calendar view and the calendar guard trigger). CONFIRM IT
--    by clicking "Run query". Cancelling runs nothing AND reports nothing.
--
-- ⛔ THIS FILE WRITES NO CREDITS. It adds the column, the key, the pin and the
--    view. Every existing row comes out of it with credited_to NULL, which is
--    the correct default: a night with no credit belongs to whoever put it up.
--    ⛔ THE ONLY WAY TO SET ONE IS THE BOARD: /board/ > THE RUN > open a date >
--    "Whose night is it". There is deliberately no backfill here, because 024
--    names exactly one member against one date (Sinik, Y2K THIS WAY, Sept 4)
--    and the five shot nights are the house's own. Crediting those to somebody
--    would be worse than leaving them.
-- ⛔ ORDER: 024 then 025 reads better, but nothing here depends on it. 024
--    writes no credited_to in either order.
--
-- ⛔ VERIFY IS ONE ROW AT THE BOTTOM AND EVERY COLUMN MUST SAY true.
--
-- WHAT THIS IS FOR.
--
-- 022 credits a night to `by`, which is `profiles.card_slug` off
-- `submitted_by`. That is exactly right for the documented path: a member puts
-- their own date up, the house shoots it, the frames come back on their page,
-- and cardback.js already renders that rail. Nothing there is broken.
--
-- What is MISSING is a way to credit a night the HOUSE typed in, and today
-- that is the only kind there is. Every row on the calendar was entered by
-- vamppsych. So after 024 runs, five 'shot' credits land on the desk's own
-- page and the other eight member pages stay empty, which is the opposite of
-- what /seats/ promises.
--
-- ⛔ THIS DOES NOT BEND THE POSTING RULE, IT HONOURS IT. 024's header says it
--    plainly: Sinik did not put his own night up, so his name does not go in
--    the `by` column saying he did. `by` still means "who submitted this".
--    `credit` is a SECOND, separate claim: whose night it is. The desk makes
--    it, the desk owns it, and it never pretends to be the member's own words.
-- ============================================================================


-- ============================================================================
-- SECTION 1. The column.
--
-- ⛔ A uuid POINTING AT profiles, NOT a card_slug string. Three reasons, and
--    the first one is the one that would have cost a session:
--
--    1. A real foreign key needs a plain unique index on the referenced
--       column. profiles' only uniqueness on card_slug is
--       `unique (public.slugify(card_slug)) where card_slug is not null`
--       (002 line 150), which is both an EXPRESSION index and a PARTIAL one.
--       Postgres will not hang a foreign key on either. Storing the slug would
--       have meant no referential integrity at all, or a second unique index
--       added to profiles just to prop this up.
--    2. Retire a member and `on delete set null` cleans the credit up by
--       itself. A stored slug would dangle and the view would quietly print a
--       name for somebody who is gone.
--    3. The desk can rename a slug. A uuid re-resolves through the join; a
--       stored slug would rot the moment it changed.
--
--    The VIEW still hands the client a slug, so nothing downstream has to know
--    any of this.
-- ============================================================================
alter table public.calendar_dates
  add column if not exists credited_to uuid;

-- ⛔ THE FOREIGN KEY IS ADDED SEPARATELY, ON PURPOSE. `add column if not
--    exists ... references ...` skips the ENTIRE clause when the column is
--    already there, so if this file ever half-runs, or somebody adds the
--    column by hand first, a re-run reports success and leaves the table with
--    NO foreign key at all. Named, dropped and re-added is the only shape that
--    converges on the same state whatever it started from.
alter table public.calendar_dates
  drop constraint if exists calendar_credited_to_profile;
alter table public.calendar_dates
  add  constraint calendar_credited_to_profile
       foreign key (credited_to) references public.profiles(id) on delete set null;

comment on column public.calendar_dates.credited_to is
  'Whose night it is, as opposed to who typed it in. DESK ONLY, pinned for
   everybody else by guard_calendar_date(). Null means the night belongs to
   whoever submitted it, which is the normal case and the one 022 was built
   for. Set this only when the house entered a date on somebody else''s behalf.';

-- The member-page reads filter on it, so it gets its own index. Partial,
-- because the overwhelming majority of rows will never carry one.
create index if not exists calendar_dates_credited_idx
  on public.calendar_dates (credited_to) where credited_to is not null;


-- ============================================================================
-- SECTION 2. The guard.
--
-- ⛔ 022's function is carried VERBATIM and the new lines are appended. A
--    create-or-replace is a WHOLE BODY replace: anything not retyped is
--    deleted. That is the 005 lesson, 022 restated it, and it applies just as
--    hard the third time.
--
-- credited_to gets exactly the treatment house_status and event_slug already
-- get. A member creating a date cannot open it already credited to somebody,
-- and a member editing their own date keeps whatever the desk left.
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
      new.credited_to  := null;
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
      -- ⛔⛔ THE PIN CANNOT BE UNCONDITIONAL, BECAUSE IT WOULD DEFEAT THIS
      --    COLUMN'S OWN FOREIGN KEY. `on delete set null` is not an internal
      --    operation: Postgres implements it as RI_FKey_setnull_del, an AFTER
      --    DELETE trigger on profiles that runs a PLAIN UPDATE against this
      --    table. That update fires this BEFORE trigger. auth.uid() reads a
      --    request GUC, not the session user, so it is NULL for a dashboard,
      --    SQL editor or service-role delete, is_admin() is therefore false,
      --    and an unconditional pin writes the doomed uuid straight back. The
      --    referencing side does not catch it either: the FK check is skipped
      --    when the key value is unchanged, which after the pin it is. The
      --    delete then commits with a credit pointing at a profile that is
      --    gone, and the NEXT run of this file fails validating the constraint
      --    it just tried to re-add. A file that says "safe to re-run" at the
      --    top would have stopped being so, because of a row its own trigger
      --    stranded.
      -- So: let a clearing through when what it is clearing is already gone.
      -- A member cannot use this to strip a live credit, because for a live
      -- credit the profile still exists and the pin still bites.
      if not (new.credited_to is null
              and old.credited_to is not null
              and not exists (select 1 from public.profiles
                               where id = old.credited_to)) then
        new.credited_to := old.credited_to;
      end if;
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
-- ⛔ A LEFT join, and the approved test lives IN THE JOIN, not in the WHERE.
--    Putting `cp.approved` in the WHERE clause would turn this into an inner
--    join and DELETE every uncredited date from the public calendar. As
--    written, a credit pointing at an unapproved profile simply reads null and
--    the date still shows.
--
-- ⛔ The client filters on `credit`, the SLUG, exactly the way it already
--    filters on `by`. The uuid never leaves the database.
-- ============================================================================
drop view if exists public.calendar;
create view public.calendar
with (security_invoker = on) as
  select c.id, c.title, c.kind, c.on_date, c.start_time,
         c.city, c.venue, c.link, c.note, c.created_at,
         c.want_house, c.house_status, c.event_slug,
         p.card_slug     as by,
         p.display_name  as by_name,
         cp.card_slug    as credit,
         cp.display_name as credit_name
    from public.calendar_dates c
    join public.profiles p on p.id = c.submitted_by
    left join public.profiles cp on cp.id = c.credited_to and cp.approved
   where c.published and p.approved;

grant select on public.calendar to anon, authenticated;

comment on view public.calendar is
  'Public run of dates. security_invoker, so the profiles RLS decides whose
   dates an anonymous reader sees. The client restates ORDER BY: a view ORDER BY
   is not guaranteed to survive LIMIT. want_house is public on purpose: a date
   the house is coming to should read as one on everybody''s screen, not only
   on the member''s own. `by` is who submitted it and `credit` is whose night it
   is; they are different questions and 025 stopped forcing one answer to serve
   both.';


-- ============================================================================
-- SECTION 4. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
--
-- ⛔ THIS ASSERTS THE REFUSALS, not just the happy path. 021's lesson, restated
--    by 022: on anything shaped like a permission, prove the thing that must
--    NOT work. The SQL editor runs with auth.uid() null, so is_admin() is
--    false in here and these writes take the exact branch a logged in member
--    takes.
-- ⛔ THE TEMP TABLE IS CREATED BEFORE ANY BRANCH and carries no "on commit
--    drop", so it cannot vanish between the do-block and the SELECT.
-- ============================================================================
drop table if exists _m025;
create temp table _m025 (
  insert_credit_pinned boolean not null default false,
  insert_022_pins      boolean not null default false,
  update_credit_pinned boolean not null default false,
  update_022_pins      boolean not null default false,
  desk_can_credit      boolean not null default false,
  member_cannot_strip  boolean not null default false,
  view_wires_credit    boolean not null default false,
  anon_reads           boolean not null default false,
  ran                  boolean not null default false
);
insert into _m025 default values;

do $$
declare
  who uuid;
  other uuid;
  boss uuid;
  rid uuid;
  cr uuid;
  st text;
  es text;
  pb boolean;
  gotslug text;
  gotname text;
  wantslug text;
  wantname text;
begin
  -- ⛔ BOTH MUST BE APPROVED. The view joins `and cp.approved`, and its WHERE
  --    needs the submitter approved too, so picking on card_slug alone would
  --    make the positive test below fail on a CORRECT migration.
  select id into who from public.profiles
   where card_slug is not null and approved limit 1;
  -- Somebody to credit who is NOT the submitter, so a pass cannot come from
  -- the two columns happening to hold the same person.
  select id into other from public.profiles
   where card_slug is not null and approved and id <> who limit 1;
  -- ⛔ AND SOMEBODY WHO RUNS THE DESK. Without one, the only way to write a
  --    credit in here is to take the guard off, and a test that steps around
  --    the trigger cannot tell you the trigger lets the desk through.
  select id into boss from public.profiles where is_admin limit 1;
  if who is null or other is null or boss is null then
    raise notice '025: needs two approved card holders and one admin, nothing below ran';
    return;
  end if;
  select card_slug, display_name into wantslug, wantname
    from public.profiles where id = other;

  -- ------------------------------------------------------------------
  -- 1. THE INSERT BRANCH. A member creating a date cannot open it already
  --    credited, already shot, or already pointed at a dump.
  -- ⛔ event_slug IS SUPPLIED HERE ON PURPOSE. The first cut of this verify
  --    left it out, which made the event_slug pin untestable: it read null
  --    whether the pin existed or not.
  -- ------------------------------------------------------------------
  insert into public.calendar_dates (submitted_by, title, on_date, published,
                                     house_status, event_slug, credited_to)
       values (who, 'MIGRATION 025 SELF TEST', date '2031-02-02', true,
               'shot', '2031-02-02-not-a-real-night', other)
    returning id, credited_to, house_status, event_slug into rid, cr, st, es;
  update _m025 set insert_credit_pinned = (cr is null),
                   insert_022_pins      = (st = 'none' and es is null);

  -- ------------------------------------------------------------------
  -- 2. THE UPDATE BRANCH, and it asserts ALL of 022's pins, not one.
  -- ⛔ The previous cut moved only credited_to and read only credited_to back,
  --    so deleting `new.event_slug := old.event_slug` from the retyped guard
  --    would have changed nothing this verify could see and every column would
  --    still have printed true, while any member could relabel their own night
  --    at any /events/ folder. Section 2's whole warning is about a hand
  --    retype, so the verify has to watch the whole retype.
  -- ------------------------------------------------------------------
  update public.calendar_dates
     set credited_to  = other,
         published    = false,
         house_status = 'shot',
         event_slug   = '2031-02-02-not-a-real-night'
   where id = rid;
  select credited_to, published, house_status, event_slug
    into cr, pb, st, es
    from public.calendar_dates where id = rid;
  update _m025 set update_credit_pinned = (cr is null),
                   update_022_pins      = (pb and st = 'none' and es is null);

  -- ------------------------------------------------------------------
  -- 3. THE POSITIVE PATH. Everything above proves what must NOT work. Without
  --    this the whole feature could ship dead with a full row of trues: no
  --    statement in the file would ever store a credit, the foreign key would
  --    never be exercised by a write, and NOTHING would test that the view's
  --    join is wired to credited_to at all. A view joining cp on
  --    c.submitted_by, or with card_slug and display_name swapped, passes
  --    every other column in this file.
  -- ⛔⛔ THE GUARD STAYS ON. The first cut of this test disabled the trigger to
  --    get a credit written, which meant NO statement in this file ever took
  --    the admin branch of the function it just retyped. Hoist the whole pin
  --    out of `if not public.is_admin()` and every column below still prints
  --    true while the desk quietly loses the ability to credit anything.
  -- auth.uid() reads the request.jwt.claims GUC, not the session user, so the
  -- desk can be impersonated for two statements. `true` makes it transaction
  -- local, so it cannot leak out of this migration.
  -- ⛔ BOTH GUCs. Supabase has shipped two shapes of auth.uid() over the
  --    years, one reading the whole claims JSON and an older one reading
  --    request.jwt.claim.sub directly. Setting only one would leave auth.uid()
  --    null on the other, is_admin() false, the pin would fire, and this column
  --    would report a failure that is really just a missed impersonation. That
  --    fails in the safe direction, but it fails for the wrong reason, so set
  --    both. `true` makes them transaction local and they cannot leak out.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', boss)::text, true);
  perform set_config('request.jwt.claim.sub', boss::text, true);
  update public.calendar_dates set credited_to = other, published = true
   where id = rid;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  select credited_to into cr from public.calendar_dates where id = rid;
  -- ⛔ coalesce, because a failed write leaves cr NULL, `cr = other` is then
  --    NULL, and a NULL into a not-null column raises 23502 and kills the whole
  --    verify instead of printing a false. A verify that aborts tells the
  --    operator about its own bookkeeping rather than about the migration.
  update _m025 set desk_can_credit = coalesce(cr = other, false);

  -- ------------------------------------------------------------------
  -- 4. THE CLEARING ARM. The conditional pin added in Section 2 is the newest
  --    and subtlest line in this file, and until now nothing tested it. It has
  --    two arms: it must LET THROUGH the foreign key's own SET NULL write, and
  --    it must REFUSE a member clearing a credit that is still live. Drop the
  --    `and not exists (...)` leg and the second arm silently opens, with every
  --    other column in this verify still true.
  -- The claims are already cleared, so this is the member branch.
  -- ------------------------------------------------------------------
  update public.calendar_dates set credited_to = null where id = rid;
  select credited_to into cr from public.calendar_dates where id = rid;
  update _m025 set member_cannot_strip = coalesce(cr = other, false);

  -- Read it back through the PUBLIC VIEW, which is the only thing the site
  -- ever sees, and check both new columns carry the CREDITED member and not
  -- the submitter.
  select credit, credit_name into gotslug, gotname
    from public.calendar where id = rid;
  update _m025 set view_wires_credit =
                     coalesce(gotslug = wantslug and gotname = wantname, false),
                   ran = true;

  delete from public.calendar_dates where id = rid;
end $$;

-- ⛔ THE 019 CHECK, DONE PROPERLY. has_table_privilege only asks whether anon
-- is ALLOWED to read the view. This actually becomes anon and reads it, with
-- the new columns named explicitly, because 018 passed every check it wrote
-- and still cost the site a whole view. The nested block is its own
-- subtransaction, so a failed read cannot strand this session as anon.
do $$
declare n int; ok boolean := false; err text;
begin
  begin
    set local role anon;
    select count(*) into n from (select credit, credit_name from public.calendar) q;
    ok := true;
  exception when others then
    err := sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  -- ⛔ WRITE THE ANSWER DOWN ONLY AFTER RESET ROLE. 022 learned this: anon has
  --    no privileges on a temp table postgres created, so bookkeeping done
  --    while still wearing anon throws and the column reports FALSE on a
  --    database where the read worked perfectly.
  update _m025 set anon_reads = ok;
  if not ok then
    raise notice '025: reading credit off public.calendar AS ANON failed: %', err;
  end if;
end $$;

select
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='calendar_dates'
             and column_name='credited_to')                          as column_added,
  -- ⛔ BY NAME, AND BY COLUMN. The first cut of this check asked whether ANY
  --    foreign key on calendar_dates pointed at profiles(id), which
  --    submitted_by has done since 020. It read true on a database where
  --    025's key had never been added. A verify that passes without the thing
  --    it verifies is worse than no verify.
  exists (select 1 from pg_constraint con
            join pg_class cls on cls.oid = con.conrelid
           where cls.relname = 'calendar_dates'
             and con.contype = 'f'
             and con.conname = 'calendar_credited_to_profile'
             and con.conkey = array[(select attnum from pg_attribute
                                      where attrelid = 'public.calendar_dates'::regclass
                                        and attname  = 'credited_to')]) as fk_to_profiles,
  exists (select 1 from pg_index i
            join pg_class c on c.oid = i.indexrelid
           where c.relname='calendar_dates_credited_idx')            as index_on,
  -- ⛔ ALL SEVENTEEN, NOT JUST THE TWO NEW ONES. Section 3 DROPS the view and
  --    retypes its whole select list by hand, so fifteen columns that 020 and
  --    022 established are re-entered on this run and a fat finger drops one
  --    silently. 022 asserted its own three; this asserts the lot, because a
  --    calendar missing `note` or `venue` is a broken page nobody would trace
  --    back to a credit migration.
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='calendar'
      and column_name in ('id','title','kind','on_date','start_time','city',
                          'venue','link','note','created_at','want_house',
                          'house_status','event_slug','by','by_name',
                          'credit','credit_name')) = 17               as view_carries_all_17,
  -- ⛔ The uncredited dates must SURVIVE the new join. If the approved test had
  --    gone in the WHERE clause this reads 0 and the public calendar is empty.
  -- ⛔ EQUALS, not >=. A left join can lose rows (if the approved test slips
  --    into the WHERE) or DUPLICATE them (if it ever joins something that is
  --    not a primary key). >= would only catch the first.
  (select count(*) from public.calendar) =
  (select count(*) from public.calendar_dates c
     join public.profiles p on p.id = c.submitted_by
    where c.published and p.approved)                                as no_rows_lost,
  (select insert_credit_pinned from _m025)                           as member_cannot_open_credited,
  (select update_credit_pinned from _m025)                           as member_cannot_hand_out_credit,
  -- These two watch the WHOLE retyped guard, both branches, every pinned
  -- column. The old single check was named as if it did and did not.
  (select insert_022_pins      from _m025)                           as guard_022_intact_on_insert,
  (select update_022_pins      from _m025)                           as guard_022_intact_on_update,
  -- ⛔ THE TWO THAT PROVE THE FEATURE EXISTS AT ALL. Everything above this
  --    line proves what must NOT happen, and a migration that added nothing
  --    would pass all of it.
  (select desk_can_credit      from _m025)                           as desk_can_actually_credit,
  (select member_cannot_strip  from _m025)                           as member_cannot_strip_a_live_credit,
  (select view_wires_credit    from _m025)                           as view_credits_the_right_person,
  (select anon_reads           from _m025)                           as anon_reads_credit,
  (select ran                  from _m025)                           as the_tests_actually_ran;
