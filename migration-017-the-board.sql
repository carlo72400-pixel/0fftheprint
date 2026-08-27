-- ============================================================================
-- 0FF THE PRINT, MIGRATION 017: THE LAST GIT-ONLY SECTION
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this drops and
--    recreates a constraint). CONFIRM IT. Cancelling runs nothing AND reports
--    nothing, which is how a whole day got lost once already.
--
-- WHAT THIS IS FOR.
--
-- /board/ went up and it maps every surface of the homepage. Everything on it
-- is warm except one rail: THIS IS US, the curator cards, which live in
-- content/creators.json. site_overrides' CHECK allowed work, slate, roster,
-- site and rotation, so 'creators' was refused at the database and the tiles
-- had to say "laptop only" out loud.
--
-- Nothing else needed SQL. The nested site fields (mic_check.vibe,
-- social.instagram), the latest-drop strip and the numbered releases were all
-- already legal rows in this table: 'site' takes any item_key and 'slate' takes
-- any item_key, they were just never READ. The page and bake.py read them now.
--
-- ⛔ NO TABLE IS CREATED. NO POLICY IS CHANGED. NO DATA IS TOUCHED. This is one
--    CHECK constraint, widened by exactly one value.
-- ============================================================================


-- ============================================================================
-- SECTION 1. Let the overlay cover the curator cards.
-- ============================================================================
-- ⛔ DO NOT GUESS THE OLD CONSTRAINT'S NAME. 014 declared its check INLINE on
-- the column so Postgres auto-named it, and 016 added a named one beside it. A
-- `drop constraint if exists <guess>` that misses is a SILENT no-op: the old
-- constraint survives, the new one is added next to it, a row has to satisfy
-- BOTH, and 'creators' stays rejected while a naive verify still says success.
-- Find every check that mentions `section` and drop it by definition.
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace ns on ns.oid = cls.relnamespace
     where ns.nspname = 'public'
       and cls.relname = 'site_overrides'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%section%'
  loop
    execute format('alter table public.site_overrides drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.site_overrides
  add constraint site_overrides_section_allowed
    check (section in ('work','slate','roster','site','rotation','creators'));


-- ============================================================================
-- SECTION 2. Verify. Both rows must say true.
--
-- The first proves 'creators' is accepted by EVERY surviving check on the
-- table, not merely by the one just added. The second proves the five sections
-- that already worked still work, so this cannot have narrowed anything.
-- ============================================================================
select 'creators accepted by every check' as object,
       not exists (
         select 1
           from pg_constraint con
           join pg_class cls on cls.oid = con.conrelid
           join pg_namespace ns on ns.oid = cls.relnamespace
          where ns.nspname = 'public'
            and cls.relname = 'site_overrides'
            and con.contype = 'c'
            and pg_get_constraintdef(con.oid) ilike '%section%'
            and pg_get_constraintdef(con.oid) not ilike '%creators%'
       ) as ok;

select 'the five older sections still accepted' as object,
       bool_and(pg_get_constraintdef(con.oid) ilike '%work%'
            and pg_get_constraintdef(con.oid) ilike '%slate%'
            and pg_get_constraintdef(con.oid) ilike '%roster%'
            and pg_get_constraintdef(con.oid) ilike '%site%'
            and pg_get_constraintdef(con.oid) ilike '%rotation%') as ok
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
 where ns.nspname = 'public'
   and cls.relname = 'site_overrides'
   and con.contype = 'c'
   and pg_get_constraintdef(con.oid) ilike '%section%';
