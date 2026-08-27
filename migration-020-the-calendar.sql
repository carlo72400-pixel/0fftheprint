-- ============================================================================
-- 0FF THE PRINT, MIGRATION 020: THE CALENDAR
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-27
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this drops and
--    recreates a view, policies and a trigger). CONFIRM IT by clicking
--    "Run query" in the modal. Cancelling runs nothing AND reports nothing.
--
-- ⛔ VERIFY IS ONE ROW AT THE BOTTOM AND EVERY COLUMN MUST SAY true.
--
-- WHAT THIS IS FOR.
--
-- 0TP-006 THE FALL RUN is a hand-written story listing every Texas date between
-- now and Halloween, and it ends with the line "If your show belongs on this
-- list and is not, the DMs are open." That is a submission form being run by
-- hand in a DM. This is the form.
--
-- ⛔ NAMED calendar_dates, NOT events. The site already means something else by
--    "events": /events/ is the photo drops, events.json is the nights he shot.
--    A second meaning on the same word would be a bug generator forever.
--
-- PUBLISHED DEFAULTS TRUE, his call. Same rule as posts: a card holder's date
-- goes straight up and the desk pulls it if it is wrong. Every other member
-- surface that touches the front page defaults false; this one is deliberately
-- on the posts side of that line, because a show announced three days out is
-- worthless behind an approval queue.
-- ============================================================================


-- ============================================================================
-- SECTION 1. The table.
-- ============================================================================
create table if not exists public.calendar_dates (
  id           uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  kind         text not null default 'show',
  on_date      date not null,
  start_time   time,
  city         text,
  venue        text,
  link         text,
  note         text,
  published    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.calendar_dates
  drop constraint if exists calendar_title_sane,
  add  constraint calendar_title_sane
       check (char_length(title) between 1 and 90 and title !~ '[\n\r]');

alter table public.calendar_dates
  drop constraint if exists calendar_kind_known,
  add  constraint calendar_kind_known
       check (kind in ('show','drop','release','booth','festival','other'));

alter table public.calendar_dates
  drop constraint if exists calendar_text_sane,
  add  constraint calendar_text_sane
       check ((city  is null or char_length(city)  <= 60)
          and (venue is null or char_length(venue) <= 80)
          and (note  is null or char_length(note)  <= 240));

-- ⛔ THE LINK. 007 says never a free-form URL, and it says it because safeUrl()
-- accepted a protocol-relative '//evil.example' and painted it as a same-tab
-- link. That hole is closed HERE instead of in the page: https and a real
-- hostname or nothing. A calendar without a ticket link is a worse calendar, so
-- this is allowed where a profile link is not, but the scheme is not negotiable
-- and the database is the thing enforcing it.
alter table public.calendar_dates
  drop constraint if exists calendar_link_https,
  add  constraint calendar_link_https
       check (link is null or
              (link ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/|\?|$)'
               and char_length(link) <= 300
               and link !~ '[\s"''<>]'));

-- A date far outside a plausible run is a typo, not an event.
alter table public.calendar_dates
  drop constraint if exists calendar_date_plausible,
  add  constraint calendar_date_plausible
       check (on_date between date '2020-01-01' and date '2100-01-01');

create index if not exists calendar_dates_on_date_idx on public.calendar_dates (on_date);
create index if not exists calendar_dates_author_idx  on public.calendar_dates (submitted_by);


-- ============================================================================
-- SECTION 2. The guard. Same shape as the other member tables: pin what is not
-- theirs to give, and strip em-dashes because the house does not print them.
-- ============================================================================
create or replace function public.guard_calendar_date()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_by := coalesce(auth.uid(), new.submitted_by);
    new.created_at   := now();
  else
    new.id           := old.id;
    new.submitted_by := old.submitted_by;
    new.created_at   := old.created_at;
    -- only the desk may flip published; a member editing their own row keeps
    -- whatever state the desk left it in
    if not public.is_admin() then
      new.published := old.published;
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
  return new;
end $$;

drop trigger if exists calendar_dates_guard on public.calendar_dates;
create trigger calendar_dates_guard before insert or update on public.calendar_dates
  for each row execute function public.guard_calendar_date();


-- ============================================================================
-- SECTION 3. RLS.
-- ============================================================================
alter table public.calendar_dates enable row level security;

drop policy if exists "published dates are public" on public.calendar_dates;
create policy "published dates are public" on public.calendar_dates
  for select using (
    published and exists (select 1 from public.profiles p
                          where p.id = submitted_by and p.approved)
  );

drop policy if exists "author reads own dates" on public.calendar_dates;
create policy "author reads own dates" on public.calendar_dates
  for select using (submitted_by = auth.uid());

drop policy if exists "admin reads all dates" on public.calendar_dates;
create policy "admin reads all dates" on public.calendar_dates
  for select using (public.is_admin());

drop policy if exists "approved member adds a date" on public.calendar_dates;
create policy "approved member adds a date" on public.calendar_dates
  for insert with check (submitted_by = auth.uid() and public.is_approved());

drop policy if exists "author edits own date" on public.calendar_dates;
create policy "author edits own date" on public.calendar_dates
  for update using (submitted_by = auth.uid()) with check (submitted_by = auth.uid());

drop policy if exists "author deletes own date" on public.calendar_dates;
create policy "author deletes own date" on public.calendar_dates
  for delete using (submitted_by = auth.uid());

drop policy if exists "admin runs the calendar" on public.calendar_dates;
create policy "admin runs the calendar" on public.calendar_dates
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.calendar_dates to authenticated;
grant select on public.calendar_dates to anon;


-- ============================================================================
-- SECTION 4. The read surface.
--
-- ⛔ security_invoker, and the profiles columns it reads (display_name,
--    card_slug) were granted to anon back in 002. 019 exists because a view
--    gained a column nobody had been granted and anon lost the WHOLE view, so
--    the verify below reads this one AS anon rather than describing it.
-- ============================================================================
drop view if exists public.calendar;
create view public.calendar
with (security_invoker = on) as
  select c.id, c.title, c.kind, c.on_date, c.start_time,
         c.city, c.venue, c.link, c.note, c.created_at,
         p.card_slug    as by,
         p.display_name as by_name
    from public.calendar_dates c
    join public.profiles p on p.id = c.submitted_by
   where c.published and p.approved;

grant select on public.calendar to anon, authenticated;

comment on view public.calendar is
  'Public run of dates. security_invoker, so the profiles RLS decides whose
   dates an anonymous reader sees. The client restates ORDER BY: a view ORDER BY
   is not guaranteed to survive LIMIT.';


-- ============================================================================
-- SECTION 5. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
-- ============================================================================
select
  to_regclass('public.calendar_dates') is not null                    as table_exists,
  (select count(*) from pg_constraint con
     join pg_class cls on cls.oid=con.conrelid
    where cls.relname='calendar_dates' and con.contype='c'
      and con.conname in ('calendar_title_sane','calendar_kind_known',
                          'calendar_text_sane','calendar_link_https',
                          'calendar_date_plausible')) = 5              as caps_on,
  exists (select 1 from pg_trigger where tgrelid='public.calendar_dates'::regclass
            and tgname='calendar_dates_guard')                        as guard_on,
  (select relrowsecurity from pg_class where oid='public.calendar_dates'::regclass) as rls_on,
  (select count(*) from pg_policies where tablename='calendar_dates') >= 7 as policies_on,
  to_regclass('public.calendar') is not null                          as view_exists,
  has_table_privilege('anon','public.calendar','select')              as anon_reads_view,
  has_column_privilege('anon','public.profiles','display_name','select')
    and has_column_privilege('anon','public.profiles','card_slug','select') as anon_has_cols,
  (select count(*) from public.calendar) >= 0                         as view_actually_reads;
