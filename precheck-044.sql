-- ============================================================
-- PRECHECK FOR 044 · read only. Paste this first and read every row before pasting 043, 044 and 045.
-- ============================================================
-- It changes nothing (one SELECT). It shows the names 044 and 045 will touch:
--   1. card holders banned in the Crypt, who go dark on the whole site the moment 044 runs
--   2. revoked card holders who get their card back while staying hidden (an unban brings it all back)
--   3. pulled posts by people who are not banned (restore any one from their Members page after the push)
--   4. his four nights on the Run right now
--   5. photo posts since the Roll opened (10/11 11:21 AM Central) that are public
-- A section with nobody in it says so. If anything here surprises you, stop and ask before pasting 044.
-- ============================================================
with
dark as (
  select coalesce(nullif(btrim(x.display_name), ''), 'Member') as who, x.card_slug as detail
    from public.profiles x join public.wall_people w on w.user_id = x.id
   where x.approved and w.banned and not x.is_admin
),
revoked as (
  select coalesce(nullif(btrim(x.display_name), ''), 'Member') as who, x.card_slug as detail
    from public.profiles x join public.wall_people w on w.user_id = x.id
   where w.banned and not x.approved and not x.is_admin and not x.denied and x.card_slug is not null
),
pulled as (
  select coalesce(nullif(btrim(x.display_name), ''), 'Member') as who,
         count(*) || ' pulled, newest ' || to_char(max(p.pulled_at) at time zone 'America/Chicago', 'Mon DD HH12:MI AM') as detail
    from public.posts p join public.profiles x on x.id = p.author_id
   where p.pull_batch is not null and not p.published
     and not exists (select 1 from public.wall_people w where w.user_id = p.author_id and w.banned)
   group by x.id, x.display_name
),
nights (d, pat, label) as (values
  (date '2026-10-13', 'grey day|suicideboy', '10/13 Grey Day'),
  (date '2026-10-17', 'chainz',              '10/17 2 Chainz'),
  (date '2026-10-24', 'sick new world',      '10/24 Sick New World'),
  (date '2026-11-06', 'latto',               '11/06 Latto')
),
run as (
  select g.label as who,
         coalesce((select string_agg(c.title || ': ' || case when c.published then 'published' else 'hidden' end
                                     || case when p.approved then '' else ', added by somebody without a card' end, '; ')
                     from public.calendar_dates c join public.profiles p on p.id = c.submitted_by
                    where c.on_date = g.d and c.title ~* g.pat), 'not on the Run') as detail
    from nights g
),
roll as (
  select 'post ' || p.id as who, coalesce(nullif(btrim(x.display_name), ''), 'Member') as detail
    from public.posts p join public.profiles x on x.id = p.author_id
   where p.image_url is not null and p.published
     and p.created_at >= timestamptz '2026-10-11 11:21:00 America/Chicago'
)
select 1 as n, 'Card holders banned in the Crypt, who go dark on the site the moment 044 runs' as what, who, detail from dark
union all select 1, 'Card holders banned in the Crypt, who go dark on the site the moment 044 runs', 'nobody', null where not exists (select 1 from dark)
union all select 2, 'Revoked card holders who get their card back hidden (unban brings it all back)', who, detail from revoked
union all select 2, 'Revoked card holders who get their card back hidden (unban brings it all back)', 'nobody', null where not exists (select 1 from revoked)
union all select 3, 'Pulled posts by people who are not banned (restore any one from their Members page after the push)', who, detail from pulled
union all select 3, 'Pulled posts by people who are not banned (restore any one from their Members page after the push)', 'nobody', null where not exists (select 1 from pulled)
union all select 4, 'His four nights on the Run right now', who, detail from run
union all select 5, 'Photo posts since the Roll opened (10/11 11:21 AM Central) that are public', who, detail from roll
union all select 5, 'Photo posts since the Roll opened (10/11 11:21 AM Central) that are public', 'none', null where not exists (select 1 from roll)
order by 1, 3;
