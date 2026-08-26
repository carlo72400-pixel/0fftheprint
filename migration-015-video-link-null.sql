-- ============================================================================
-- 0FF THE PRINT, MIGRATION 015: A NULL card_slug KILLED THE TIKTOK TILE
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this drops and
--    recreates a view). CONFIRM IT. Cancelling runs nothing and reports
--    nothing, which is how 008-013 looked "run" for a whole day.
--
-- THE BUG. 014 built the tiktok link as:
--     'https://www.tiktok.com/@' || p.card_slug || '/video/' || v.vid
-- card_slug is NULLABLE (schema.sql:14) and the desk's Approve button does not
-- require one, so a member can be approved, hold no card, submit a tiktok, and
-- get published. NULL anywhere in a || chain makes the WHOLE expression NULL,
-- so `link` came back null and the public tile rendered href="#". Dead.
--
-- It was invisible from the desk because the desk rebuilt the link in JS with a
-- `|| 'x'` fallback, so his preview worked while the live site did not. That
-- fallback is now gone too, and the desk badges the row instead.
--
-- THE FIX. concat_ws never returns NULL for a missing piece, and coalesce gives
-- the handle a placeholder. TikTok resolves a video by its ID, so the username
-- segment only has to be present, not correct.
--
-- ⛔ RETURN TYPE IS UNCHANGED: same columns, same order, same types. The view is
--    dropped and recreated rather than CREATE OR REPLACE only because 014's
--    body differs; nothing downstream needs to change.
-- ============================================================================

drop view if exists public.videos;
create view public.videos
with (security_invoker = on) as
  select v.id,
         v.provider,
         v.vid,
         v.title,
         case v.provider
           when 'youtube'   then 'https://www.youtube.com/watch?v=' || v.vid
           -- coalesce so a card-less member still gets a working link
           when 'tiktok'    then 'https://www.tiktok.com/@' || coalesce(nullif(p.card_slug, ''), 'video') || '/video/' || v.vid
           when 'instagram' then 'https://www.instagram.com/reel/' || v.vid || '/'
         end as link,
         coalesce(
           v.cover_url,
           case when v.provider = 'youtube'
                then 'https://i.ytimg.com/vi/' || v.vid || '/hqdefault.jpg' end
         ) as cover,
         v.featured,
         p.card_slug as by,
         p.display_name as by_name,
         v.created_at
    from public.featured_videos v
    join public.profiles p on p.id = v.submitted_by
   where v.published;

grant select on public.videos to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY. One grid. `no null links` is the whole point of this migration.
-- ============================================================================
select 'videos view exists' as object, (to_regclass('public.videos') is not null)::text as ok
union all select 'link is never null',
       (not exists (select 1 from public.videos where link is null))::text
union all select 'column count still 10',
       (( select count(*) from information_schema.columns
           where table_schema='public' and table_name='videos') = 10)::text;
