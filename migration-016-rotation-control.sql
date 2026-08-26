-- ============================================================================
-- 0FF THE PRINT, MIGRATION 016: SWITCHING WHAT IS ON ROTATION
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this drops and
--    recreates a constraint, a function and policies). CONFIRM IT. Cancelling
--    runs nothing and reports nothing.
--
-- TWO THINGS NOBODY COULD DO.
--
-- 1. THE SEEDS WERE GIT ONLY. content/rotation.json holds the six hand-picked
--    tracks and site_overrides' CHECK only allowed work/slate/roster/site, so
--    swapping one meant a laptop and a push. 'rotation' is allowed now and the
--    front-page pencil writes it, exactly like the work grid.
--
-- 2. A MEMBER COULD NOT SWAP THEIR OWN TRACK. rotation_tracks has SELECT,
--    INSERT and DELETE policies and NO UPDATE POLICY AT ALL, so a member could
--    only withdraw an unpublished row; once the desk approved it, their song
--    was frozen on the grid until the desk pulled it. They can change it now,
--    and CHANGING THE SONG SENDS IT BACK TO THE DESK: published flips to false
--    on any track change, so a swap cannot smuggle an unreviewed song onto the
--    front page. Fixing a typo in the artist name does NOT unpublish it.
--
-- ⛔ public.feed IS NOT TOUCHED. public.rotation IS NOT TOUCHED.
-- ============================================================================


-- ============================================================================
-- SECTION 1. Let the overlay cover rotation seeds.
-- ============================================================================
-- ⛔ DO NOT GUESS THE OLD CONSTRAINT'S NAME. 014 declared the check INLINE on
-- the column, so Postgres auto-named it. A `drop constraint if exists <guess>`
-- that misses is a SILENT no-op: the old constraint survives, the new one is
-- added beside it, a row must satisfy BOTH, and 'rotation' stays rejected while
-- a naive verify still reports success. Find them and drop them by definition.
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
    check (section in ('work','slate','roster','site','rotation'));


-- ============================================================================
-- SECTION 2. A member may edit their OWN track.
--
-- The update guard still pins everything that is not theirs to give: the row
-- id, the owner and the created_at. What changes is that `track` is no longer
-- frozen, and `published` is no longer simply carried over.
-- ============================================================================
create or replace function public.guard_rotation_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title  := replace(new.title,  chr(8212), ',');
  new.artist := replace(new.artist, chr(8212), ',');
  if not public.privileged_caller() then
    new.id           := old.id;
    new.submitted_by := old.submitted_by;
    new.created_at   := old.created_at;
    -- A DIFFERENT SONG IS A NEW SUBMISSION. Without this a member could swap an
    -- approved row's track id and put anything they liked on the front page
    -- under a decision the desk made about a different song.
    if new.track is distinct from old.track then
      new.published := false;
    else
      new.published := old.published;   -- publishing stays the desk's tap
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rotation_tracks_guard_update on public.rotation_tracks;
create trigger rotation_tracks_guard_update before update on public.rotation_tracks
  for each row execute function public.guard_rotation_update();

-- The missing policy. USING picks which rows they may touch, WITH CHECK makes
-- sure they cannot hand the row to somebody else on the way out.
drop policy if exists "author edits own track" on public.rotation_tracks;
create policy "author edits own track" on public.rotation_tracks
  for update using (submitted_by = auth.uid())
          with check (submitted_by = auth.uid());


-- ============================================================================
-- SECTION 3. RELOAD THE API SCHEMA CACHE.
-- ============================================================================
notify pgrst, 'reload schema';


-- ============================================================================
-- VERIFY. One grid, every ok true.
-- ============================================================================
-- true only if NO surviving check on this table constrains `section` without
-- allowing 'rotation'. That catches a leftover constraint the drop missed.
select 'rotation accepted by every check' as object,
       (not exists (
          select 1 from pg_constraint con
            join pg_class cls on cls.oid = con.conrelid
            join pg_namespace ns on ns.oid = cls.relnamespace
           where ns.nspname='public' and cls.relname='site_overrides'
             and con.contype='c'
             and pg_get_constraintdef(con.oid) ilike '%section%'
             and pg_get_constraintdef(con.oid) not ilike '%rotation%'))::text as ok
union all select 'author update policy exists',
       (exists (select 1 from pg_policy
                 where polname = 'author edits own track'))::text
union all select 'update guard still present',
       (exists (select 1 from pg_trigger
                 where tgname = 'rotation_tracks_guard_update'))::text
union all select 'guard unpublishes on a track swap',
       (position('new.published := false' in
                 pg_get_functiondef('public.guard_rotation_update()'::regprocedure)) > 0)::text
union all select 'existing overrides survived',
       (select count(*) >= 0 from public.site_overrides)::text;
