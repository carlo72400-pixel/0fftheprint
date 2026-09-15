-- ============================================================================
-- migration-026-the-week-of-september-14.sql
-- The Calendar: the four nights shot Sept 1 to 13 as SHOT rows pointing at
-- their galleries, Brainrot (which never got a row), and the dates coming:
-- Young Thug's Texas run and the 3|OAK after parties, J. Cole's remaining
-- Texas dates.
--
-- Same shape as migration-024. Run it in the Supabase SQL editor as ONE paste.
-- ⛔ The editor's "destructive operations" modal fires on the ALTER TABLE
--    lines: CONFIRM it, or nothing runs and nothing reports.
-- ⛔ Section 3 puts the guard back. Do not skip it.
--
-- Facts, each read off a live page on 2026-09-14:
--   Young Thug, The New Generation Tour: Houston 9/27 713 Music Hall, Irving
--   9/29 The Pavilion at Toyota Music Factory, Austin 9/30 Moody Amphitheater
--   at Waterloo Park (doors 6:30, show 7:00, NAV special guest) — jambase,
--   do512, moodyamphitheater.com.
--   3|OAK, 517 Live Oak St: DJ Pee Wee official after party 9/23 10pm,
--   Young Thug official tour after party 9/30 (Lil Jay x Migo World, tixplug),
--   2 Chainz "20+ Years of Carter" after party 10/17 10pm, Latto 11/6 9pm 18+
--   — bar3oak.com/events + the promoter's flyer.
--   J. Cole, The Fall-Off World Tour: Houston 9/16 + 9/17 Toyota Center,
--   Dallas 9/19 + 9/20 American Airlines Center — 0TP-017.
-- ⛔ No ticket links: none were verified as stable, and a dead URL on a public
--    calendar is worse than none.
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
    -- shot, galleries live
    ('Mike Dimes, B.I.L.L.Y release party',   'show', date '2026-09-01', null::time,
     'San Antonio', 'Slackers',
     'The night before the album dropped. Sixty moments in two grades.',
     'shot', '2026-09-01-billy-release-party'),
    ('Brainrot',                              'show', date '2026-09-11', null::time,
     'Austin', 'New Guild Co-op',
     'A house show and a fundraiser. The first night this desk shot outside San Antonio.',
     'shot', '2026-09-11-brainrot'),
    ('Lucha Night',                           'show', date '2026-09-12', time '20:30',
     'San Antonio', 'El Luchador Bar',
     'An outdoor ring under string lights. Bull Madrid, a red mask, an accordion.',
     'shot', '2026-09-12-lucha-night'),
    ('MIGX',                                  'show', date '2026-09-12', time '22:00',
     'San Antonio', 'Mi Vaquita',
     'Everyone in black under the biggest LED wall in the city. Five grades.',
     'shot', '2026-09-12-migx'),
    ('Burlesque Night',                       'show', date '2026-09-13', time '17:00',
     'San Antonio', 'Rah Rah Room',
     'Vendor market at five, red velvet at seven. Four grades.',
     'shot', '2026-09-13-burlesque-night'),
    -- coming
    ('J. Cole, The Fall-Off World Tour',      'show', date '2026-09-16', null::time,
     'Houston', 'Toyota Center', 'First of two Houston nights.',          'none', null::text),
    ('J. Cole, The Fall-Off World Tour',      'show', date '2026-09-17', null::time,
     'Houston', 'Toyota Center', 'Second Houston night.',                 'none', null::text),
    ('J. Cole, The Fall-Off World Tour',      'show', date '2026-09-19', null::time,
     'Dallas', 'American Airlines Center', 'First of two Dallas nights.', 'none', null::text),
    ('J. Cole, The Fall-Off World Tour',      'show', date '2026-09-20', null::time,
     'Dallas', 'American Airlines Center', 'Last Texas date of the run.', 'none', null::text),
    ('DJ Pee Wee after party',                'show', date '2026-09-23', time '22:00',
     'San Antonio', '3|OAK', 'The Romantic Tour official after party. 517 Live Oak St.',
     'none', null::text),
    ('Young Thug, The New Generation Tour',   'show', date '2026-09-27', null::time,
     'Houston', '713 Music Hall', 'NAV opens. First Texas date.',         'none', null::text),
    ('Young Thug, The New Generation Tour',   'show', date '2026-09-29', null::time,
     'Irving', 'The Pavilion at Toyota Music Factory', 'NAV opens.',      'none', null::text),
    ('Young Thug, The New Generation Tour',   'show', date '2026-09-30', time '19:00',
     'Austin', 'Moody Amphitheater at Waterloo Park',
     'Doors 6:30. NAV, then the YSL bench: Tezzus, diamond*, 1300SAINT, Iyrus, Yume, Biggs Money, Lil Unky. No San Antonio arena date.',
     'none', null::text),
    ('Young Thug official tour after party',  'show', date '2026-09-30', null::time,
     'San Antonio', '3|OAK',
     'Lil Jay x Migo World. The promoter says Thug performs. 517 Live Oak St. This is the San Antonio date.',
     'none', null::text),
    ('2 Chainz after party',                  'show', date '2026-10-17', time '22:00',
     'San Antonio', '3|OAK', 'The official 20+ Years of Carter after party, Halloween costume contest attached.',
     'none', null::text),
    ('Latto',                                 'show', date '2026-11-06', time '21:00',
     'San Antonio', '3|OAK', 'Live at 3|OAK. 18 and up.',                 'none', null::text)
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
    ('Mike Dimes, B.I.L.L.Y release party', date '2026-09-01', 'shot', '2026-09-01-billy-release-party'),
    ('Brainrot',                            date '2026-09-11', 'shot', '2026-09-11-brainrot'),
    ('Lucha Night',                         date '2026-09-12', 'shot', '2026-09-12-lucha-night'),
    ('MIGX',                                date '2026-09-12', 'shot', '2026-09-12-migx'),
    ('Burlesque Night',                     date '2026-09-13', 'shot', '2026-09-13-burlesque-night')
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
    where event_slug in ('2026-09-01-billy-release-party', '2026-09-11-brainrot',
                         '2026-09-12-lucha-night', '2026-09-12-migx',
                         '2026-09-13-burlesque-night')
      and house_status = 'shot' and published) = 5          as five_shot_rows,
  (select count(*) from public.calendar_dates
    where on_date between date '2026-09-16' and date '2026-11-06'
      and venue in ('Toyota Center', 'American Airlines Center', '3|OAK',
                    '713 Music Hall', 'The Pavilion at Toyota Music Factory',
                    'Moody Amphitheater at Waterloo Park')) = 11 as eleven_coming,
  (select count(*) from pg_trigger
    where tgname = 'calendar_dates_guard' and tgenabled <> 'D') = 1 as guard_back_on;
