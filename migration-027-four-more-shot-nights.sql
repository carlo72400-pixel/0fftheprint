-- ============================================================================
-- migration-027-four-more-shot-nights.sql
-- The Calendar: the four nights shot Sept 16 to 19 as SHOT rows pointing at
-- their galleries. Sadboyz Club missed migration-026 by two days; the bar hop,
-- Third Friday and BAPTISM galleries went live 2026-09-19.
--
-- Same shape as migration-024 and -026. Run it in the Supabase SQL editor as
-- ONE paste, AFTER migration-026.
-- ⛔ The editor's "destructive operations" modal fires on the ALTER TABLE
--    lines: CONFIRM it, or nothing runs and nothing reports.
-- ⛔ Section 3 puts the guard back. Do not skip it.
--
-- Facts, each off the delivered set and the live gallery pages:
--   Sadboyz Club, In Heavy Rotation night, Wav Room, Sept 16. 59 frames, two
--   grades. /events/2026-09-16-sadboyz-club/
--   Bar hop, Sept 17: Club 212 on the River Walk was dead, so the night moved
--   to the 212 rooftop, then Bar House at 820 N Alamo, then a blue-LED room at
--   2:49 am. 39 frames, two grades, two cameras. /events/2026-09-17-bar-hop/
--   Third Friday Night Market, Zen Haus, 119 Heiman St, HISTORIC ST. PAUL
--   SQUARE (not La Villita), third Friday monthly, free entry, 7pm.
--   50 frames, two grades. /events/2026-09-18-zen-haus/
--   BAPTISM, goth rave at The Deco, 1906 Fredericksburg Rd, 9pm to 2am, 21+,
--   $10 presale / $15 door, dress code nuns, priests, angels, demons or
--   fetish. 60 frames, two grades. /events/2026-09-18-baptism/
-- ============================================================================


-- ============================================================================
-- SECTION 1. The guard comes off. guard_calendar_date() pins house_status to
-- 'none' and event_slug to null for anyone who is not is_admin(), and in the
-- SQL editor auth.uid() is NULL, so the shot rows would silently land wrong.
-- ============================================================================
alter table public.calendar_dates disable trigger calendar_dates_guard;


-- ============================================================================
-- SECTION 2. The rows. Keyed on (title, on_date) so a re-run adds nothing.
-- ============================================================================
with house as (
  select id from public.profiles where card_slug = 'vamppsych'
),
run (title, kind, on_date, start_time, city, venue, note, house_status, event_slug) as (
  values
    ('Sadboyz Club',              'show', date '2026-09-16', time '22:00',
     'San Antonio', 'Wav Room',
     'In Heavy Rotation night. Fifty nine frames in two grades.',
     'shot', '2026-09-16-sadboyz-club'),
    ('Bar hop',                   'show', date '2026-09-17', time '22:00',
     'San Antonio', 'Bar House',
     'Club 212 was dead, so the night moved: the 212 rooftop, Bar House on North Alamo, one more room at ten to three.',
     'shot', '2026-09-17-bar-hop'),
    ('Third Friday Night Market', 'show', date '2026-09-18', time '19:00',
     'San Antonio', 'Zen Haus',
     'Historic St. Paul Square, free entry, third Friday of the month. Printed twice, once on colour infrared.',
     'shot', '2026-09-18-zen-haus'),
    ('BAPTISM',                   'show', date '2026-09-18', time '21:00',
     'San Antonio', 'The Deco',
     'A goth rave in a room lit almost entirely red. Dress code nuns, priests, angels, demons. Printed as a silver plate with three inks.',
     'shot', '2026-09-18-baptism')
)
insert into public.calendar_dates
  (submitted_by, title, kind, on_date, start_time, city, venue, note,
   published, want_house, house_status, event_slug)
select h.id, r.title, r.kind, r.on_date, r.start_time, r.city, r.venue, r.note,
       true, false, r.house_status, r.event_slug
  from run r cross join house h
 where not exists (select 1 from public.calendar_dates c
                    where c.title = r.title and c.on_date = r.on_date);

-- Re-run repair: a shot row that exists but lost its exchange state gets it back.
with run (title, on_date, house_status, event_slug) as (
  values
    ('Sadboyz Club',              date '2026-09-16', 'shot', '2026-09-16-sadboyz-club'),
    ('Bar hop',                   date '2026-09-17', 'shot', '2026-09-17-bar-hop'),
    ('Third Friday Night Market', date '2026-09-18', 'shot', '2026-09-18-zen-haus'),
    ('BAPTISM',                   date '2026-09-18', 'shot', '2026-09-18-baptism')
)
update public.calendar_dates c
   set house_status = r.house_status,
       event_slug   = r.event_slug,
       published    = true
  from run r
 where c.title = r.title and c.on_date = r.on_date
   and (c.house_status is distinct from r.house_status
     or c.event_slug   is distinct from r.event_slug
     or c.published    is distinct from true);


-- ============================================================================
-- SECTION 3. The guard goes back on. Do not skip this line.
-- ============================================================================
alter table public.calendar_dates enable trigger calendar_dates_guard;


-- ============================================================================
-- SECTION 4. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
-- ============================================================================
select
  (select count(*) from public.calendar_dates
    where event_slug in ('2026-09-16-sadboyz-club', '2026-09-17-bar-hop',
                         '2026-09-18-zen-haus', '2026-09-18-baptism')
      and house_status = 'shot' and published) = 4           as four_shot_rows,
  (select count(*) from public.calendar_dates
    where house_status = 'shot' and event_slug is not null) >= 9 as nine_or_more_shot,
  (select count(*) from pg_trigger
    where tgname = 'calendar_dates_guard' and tgenabled <> 'D') = 1 as guard_back_on;
