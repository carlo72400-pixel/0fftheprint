-- ============================================================================
-- 0FF THE PRINT, MIGRATION 019: THE GRANT 018 FORGOT
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt may NOT appear here, since this
--    only adds grants. If one does, CONFIRM IT.
--
-- WHAT BROKE.
--
-- 018 widened public.cards with display_name, tagline, bio and accent. The view
-- is security_invoker = on, which is the whole reason a retired member's page
-- goes dark on its own: it reads with the CALLER's privileges, through the
-- caller's RLS. So the caller also needs the caller's COLUMN GRANTS, and
-- tagline and bio are brand new columns that nobody has been granted anything
-- on. anon did not lose two fields, it lost the ENTIRE VIEW:
--
--   {"code":"42501","message":"permission denied for table profiles"}
--
-- Every member card on the homepage reads that view. 018's own verify said true
-- six times and could not see this, because it checked the SHAPE of the view
-- and never once tried to READ it as anon.
--
-- 🔑 THE LESSON, WRITTEN DOWN: a migration that adds a column to a
--    security_invoker view is not finished when the column exists. Grant the
--    column, then verify by READING THE VIEW AS THE ROLE THAT WILL READ IT.
--    Structure passing is not the same as the page working.
-- ============================================================================


-- ============================================================================
-- SECTION 1. The two columns the readers were missing.
--
-- Same shape as 002's `grant select (id, display_name, card_slug, approved)`
-- and 005's `grant select (accent)`: column level, never the whole table, so
-- is_admin and requested_slug stay invisible to anon exactly as 002 intended.
-- ============================================================================
grant select (tagline, bio) on public.profiles to anon, authenticated;


-- ============================================================================
-- SECTION 2. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
--
-- ⛔ The last two do what 018 should have done: they READ, as anon, instead of
--    describing. has_column_privilege answers the question the page actually
--    asks, which is "can the visitor see this", not "does this exist".
-- ============================================================================
select
  has_column_privilege('anon','public.profiles','tagline','select')  as anon_reads_tagline,
  has_column_privilege('anon','public.profiles','bio','select')      as anon_reads_bio,
  has_column_privilege('anon','public.profiles','display_name','select') as anon_reads_name,
  has_column_privilege('anon','public.profiles','accent','select')   as anon_reads_accent,
  has_column_privilege('anon','public.profiles','card_photo','select') as anon_reads_photo,
  not has_column_privilege('anon','public.profiles','is_admin','select') as is_admin_still_hidden,
  has_table_privilege('anon','public.cards','select')                as anon_reads_the_view;
