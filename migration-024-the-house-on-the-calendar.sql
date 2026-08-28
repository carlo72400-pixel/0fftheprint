-- ============================================================================
-- 0FF THE PRINT, MIGRATION 024: THE HOUSE ON ITS OWN CALENDAR
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-28
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this disables and
--    re-enables the calendar guard trigger). CONFIRM IT by clicking
--    "Run query". Cancelling runs nothing AND reports nothing.
--
-- ⛔ VERIFY IS ONE ROW AT THE BOTTOM AND EVERY COLUMN MUST SAY true.
--
-- WHAT THIS IS FOR.
--
-- 022 built THE EXCHANGE and shipped it empty. Every one of the eight rows on
-- /dates/ today is a national tour somebody else is throwing, and every one of
-- them says house_status = 'none'. The page promises "put your date up and the
-- house shoots it" while showing zero evidence the house has ever shot
-- anything. Meanwhile /events/ holds FIVE graded dumps from five real nights
-- and nothing on the calendar points at any of them.
--
-- The loop was never missing a feature. dates.js already renders a 'shot' row
-- as a link to ../events/<slug>/, and it already has a past-dates toggle. It
-- was missing the six rows below.
--
-- ⛔ ALL SIX GO UP AS THE HOUSE (submitted_by = vamppsych). Sinik did not put
--    his own night up, so his name does not go in the by column saying he did.
--    post.py's rule holds here: do not post for people.
-- ============================================================================


-- ============================================================================
-- SECTION 1. ⛔ THE TRAP, AND WHY THE TRIGGER COMES OFF.
--
-- guard_calendar_date() pins house_status to 'none' and event_slug to null on
-- INSERT for anyone who is not is_admin(). is_admin() reads auth.uid(), and in
-- the SQL editor auth.uid() is NULL, so it returns false. A plain insert of
-- these rows would therefore land all five shot nights as 'none' with no slug,
-- the calendar_shot_has_a_dump check would pass because the status is no longer
-- 'shot', and the whole thing would report SUCCESS while writing the wrong
-- data. Silent, and invisible until somebody looks at the page.
--
-- Same fix 003 used on the posts guard: take the trigger off, write, put it
-- back. Nothing the guard does is needed here, the text below carries no
-- em-dashes and no blank-string fields.
-- ============================================================================
alter table public.calendar_dates disable trigger calendar_dates_guard;


-- ============================================================================
-- SECTION 2. The six rows.
--
-- Five nights already shot, each pointing at the folder its frames are in, and
-- one date still to come. Keyed on (title, on_date) so a re-run adds nothing
-- and instead corrects any row that drifted.
-- ============================================================================
with house as (
  select id from public.profiles where card_slug = 'vamppsych'
),
run (title, kind, on_date, start_time, city, venue, note, house_status, event_slug) as (
  values
    ('Blade Rave',                  'show', date '2026-08-14', null::time,
     'San Antonio', 'Paper Tiger',  null::text,               'shot',   '2026-08-14-blade-rave'),
    ('The Mix',                     'show', date '2026-08-16', null::time,
     'San Antonio', 'The Mix',      null::text,               'shot',   '2026-08-16-the-mix'),
    ('Third Friday Night Market',   'show', date '2026-08-21', null::time,
     'San Antonio', 'Zen Haus',     null::text,               'shot',   '2026-08-21-zen-haus'),
    ('The Showcase',                'show', date '2026-08-23', null::time,
     'San Antonio', 'The Mix',      null::text,               'shot',   '2026-08-23-the-showcase'),
    ('Resident Evil vs Silent Hill','show', date '2026-08-25', null::time,
     'San Antonio', 'The Mix',      null::text,               'shot',   '2026-08-25-the-mix'),
    -- ⛔ The only unshot row, and the only one carrying a claim about a person.
    -- house_status stays 'none' until Gianni says he is going. Section 4 flips
    -- it in one line.
    ('Y2K THIS WAY',                'show', date '2026-09-04', time '18:30',
     'San Antonio', null::text,
     'Sinik on the bill. Doors 6:30, 12832 Nacogdoches Rd.',  'none',   null::text)
)
insert into public.calendar_dates
  (submitted_by, title, kind, on_date, start_time, city, venue, note,
   published, want_house, house_status, event_slug)
select h.id, r.title, r.kind, r.on_date, r.start_time, r.city, r.venue, r.note,
       true, false, r.house_status, r.event_slug
  from run r cross join house h
 where not exists (select 1 from public.calendar_dates c
                    where c.title = r.title and c.on_date = r.on_date);

-- Re-run repair: a row that exists but lost its exchange state gets it back.
with run (title, on_date, house_status, event_slug) as (
  values
    ('Blade Rave',                  date '2026-08-14', 'shot', '2026-08-14-blade-rave'),
    ('The Mix',                     date '2026-08-16', 'shot', '2026-08-16-the-mix'),
    ('Third Friday Night Market',   date '2026-08-21', 'shot', '2026-08-21-zen-haus'),
    ('The Showcase',                date '2026-08-23', 'shot', '2026-08-23-the-showcase'),
    ('Resident Evil vs Silent Hill',date '2026-08-25', 'shot', '2026-08-25-the-mix')
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
-- SECTION 4. ⛔ NOT RUN. Paste this ONE line separately when Gianni confirms he
-- is going to Y2K THIS WAY, and the Sept 4 row starts saying "the house is
-- coming" on the front page. It needs the trigger off the same way:
--
--   alter table public.calendar_dates disable trigger calendar_dates_guard;
--   update public.calendar_dates set house_status = 'on_list'
--    where title = 'Y2K THIS WAY' and on_date = date '2026-09-04';
--   alter table public.calendar_dates enable trigger calendar_dates_guard;
-- ============================================================================


-- ============================================================================
-- SECTION 5. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
--
-- ⛔ shot_rows_kept_state is the one that matters. If the trigger had been left
--    on it would read false while everything else read true.
-- ⛔ all_six_in_the_view runs as postgres, so it proves the rows clear the
--    view's published + profile-approved join, NOT that anon's RLS lets them
--    through. The page itself is the anon check: open /dates/ signed out.
-- ============================================================================
select
  (select count(*) from public.calendar_dates
    where on_date in (date '2026-08-14', date '2026-08-16', date '2026-08-21',
                      date '2026-08-23', date '2026-08-25', date '2026-09-04')) = 6
                                                                as six_rows_in,
  (select count(*) from public.calendar_dates
    where house_status = 'shot' and event_slug is not null)      = 5
                                                                as shot_rows_kept_state,
  (select count(*) from public.calendar_dates
    where title = 'Y2K THIS WAY' and house_status = 'none')      = 1
                                                                as sept4_unclaimed,
  (select count(*) from public.calendar
    where on_date in (date '2026-08-14', date '2026-08-16', date '2026-08-21',
                      date '2026-08-23', date '2026-08-25', date '2026-09-04')) = 6
                                                                as all_six_in_the_view,
  (select count(*) from public.calendar_dates c
     join public.profiles p on p.id = c.submitted_by
    where c.on_date >= date '2026-08-14' and p.card_slug = 'vamppsych') >= 6
                                                                as by_the_house,
  (select tgenabled from pg_trigger
    where tgrelid = 'public.calendar_dates'::regclass
      and tgname  = 'calendar_dates_guard') = 'O'               as guard_back_on;
