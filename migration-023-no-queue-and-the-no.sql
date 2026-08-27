-- ============================================================================
-- 0FF THE PRINT, MIGRATION 023: NO QUEUE, AND THE NO
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-27
--
-- Paste the whole file into the SQL editor and Run. Safe to re-run.
-- ⛔ A "potentially destructive query" prompt WILL appear (this drops and
--    recreates two RPCs and three triggers). CONFIRM IT by clicking "Run
--    query". Cancelling runs nothing AND reports nothing.
--
-- ⛔ VERIFY IS ONE ROW AT THE BOTTOM AND EVERY COLUMN MUST SAY true.
--
-- TWO THINGS, BOTH HIS CALL.
--
-- 1. Videos and member stories stop waiting for a tap. They go up on add, the
--    way posts (002) and calendar dates (020) already do, and the desk pulls a
--    bad one instead of blessing every good one.
--
-- 2. The desk can say NO at the door. Until now the only states were "waiting"
--    and "in", so somebody the desk did not want sat in the queue forever and
--    got re-read every single time the board was opened. There is now a third
--    state and it is final unless the desk undoes it.
--
-- ⛔ CHANGING THE COLUMN DEFAULT IS NOT ENOUGH AND THAT IS THE WHOLE TRAP HERE.
--    Every one of these tables has a BEFORE INSERT trigger that assigns
--    `new.published := false` outright, so the default never gets consulted.
--    The guards have to be rewritten, and a create-or-replace is a whole body
--    replace, so each one below is the CURRENT body carried verbatim with one
--    line changed. That is the 005 lesson and it applies to functions.
-- ============================================================================


-- ============================================================================
-- SECTION 1. NO QUEUE: videos and member stories publish on add.
--
-- ⛔ WHAT IS DELIBERATELY NOT IN HERE:
--    * word_entries stays on the queue. It is the closest thing this site has
--      to a comment section and the footer says "No comments" in as many
--      words. Its unique index also allows exactly one unpublished entry per
--      story per author, which is a real rate limit that publish-on-add would
--      quietly delete.
--    * rotation_tracks stays on the queue. The house music grid is six curated
--      seeds, not a feed, and he asked for videos and stories.
--    * `featured` stays the desk's tap. Being ON the reel and being at the
--      FRONT of the reel are different powers and only the first one moves.
--    * `baked` stays the laptop's mark. Nothing about publishing writes git.
-- ============================================================================

alter table public.featured_videos alter column published set default true;
alter table public.member_stories  alter column published set default true;

-- ---- videos: 014's guard, carried verbatim, one line changed --------------
create or replace function public.guard_featured_video_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title := replace(new.title, chr(8212), ',');
  if not public.privileged_caller() then
    new.submitted_by := auth.uid();
    new.published    := true;    -- 023: on add. the desk pulls, it does not bless.
    new.featured     := false;   -- still the desk's tap
    new.created_at   := now();
  end if;
  return new;
end $$;
drop trigger if exists featured_videos_guard_insert on public.featured_videos;
create trigger featured_videos_guard_insert before insert on public.featured_videos
  for each row execute function public.guard_featured_video_insert();

-- ---- member stories: 010's guard, carried verbatim, one line changed ------
create or replace function public.guard_member_story_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title   := replace(new.title,   chr(8212), ',');
  new.dek     := replace(new.dek,     chr(8212), ',');
  new.body_md := replace(new.body_md, chr(8212), ',');
  if not public.privileged_caller() then
    new.author_id  := auth.uid();
    new.published  := true;      -- 023: on add
    new.baked      := false;     -- still the laptop's mark
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists member_stories_guard_insert on public.member_stories;
create trigger member_stories_guard_insert before insert on public.member_stories
  for each row execute function public.guard_member_story_insert();

-- ⚠️ member_stories_one_pending is a unique index on (author_id) WHERE NOT
-- published. Nothing lands unpublished any more, so it stops constraining
-- anything. It is left in place rather than dropped: it costs nothing, and it
-- starts working again the moment the desk pulls something back.

comment on function public.guard_member_story_insert is
  '023: stories publish on add. The desk pulls. Editing a live story is still
   governed by guard_member_story_update, which pins published to the desk.';


-- ============================================================================
-- SECTION 2. THE NO.
--
-- Three states now: waiting (not approved, not denied), in (approved), refused
-- (denied). A refused row is KEPT ON PURPOSE. Deleting it would drop the person
-- back into the queue the next time they signed up, which is the exact problem
-- this is here to solve.
-- ============================================================================
alter table public.profiles
  add column if not exists denied    boolean not null default false,
  add column if not exists denied_at timestamptz;

comment on column public.profiles.denied is
  'The desk looked and said no. Distinct from "not looked at yet", which is
   approved=false and denied=false. Never set by the person it is about.';

-- Denied and approved are mutually exclusive by construction, not by habit.
alter table public.profiles
  drop constraint if exists profiles_not_both_states,
  add  constraint profiles_not_both_states check (not (approved and denied));

create index if not exists profiles_at_the_door_idx
  on public.profiles (created_at desc) where not approved and not denied;

-- ⛔ ITS OWN TRIGGER. 007's guard_profile_privileges is not to be rewritten,
--    which is the same reason 018 gave guard_profile_text() its own.
create or replace function public.guard_profile_door()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.privileged_caller() then
    -- nobody decides their own admission
    new.denied    := old.denied;
    new.denied_at := old.denied_at;
  else
    if new.denied and not old.denied then
      new.denied_at := now();
      new.approved  := false;      -- saying no takes the seat back in one move
    elsif old.denied and not new.denied then
      new.denied_at := null;       -- the desk changed its mind
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_door on public.profiles;
create trigger profiles_guard_door before update on public.profiles
  for each row execute function public.guard_profile_door();

grant update (denied, denied_at) on public.profiles to authenticated;


-- ============================================================================
-- SECTION 3. The two RPCs learn the third state.
--
-- ⛔ RETURNS TABLE means DROP FIRST and CARRY EVERY COLUMN. Appended at the
--    END so nothing that reads these positionally shifts under it. That is the
--    005 lesson and 013 already paid it once on desk_profiles.
-- ============================================================================
drop function if exists public.my_profile();
create function public.my_profile()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, accent public.accent,
               created_at timestamptz,
               card_frame public.card_frame, frame_grant public.card_frame,
               card_photo text, theme_track text, theme_start integer,
               link_platform text, link_handle text,
               -- 023, appended
               denied boolean)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.accent, p.created_at,
         p.card_frame, p.frame_grant, p.card_photo, p.theme_track,
         p.theme_start, p.link_platform, p.link_handle,
         p.denied
    from public.profiles p
   where p.id = auth.uid();
$fn$;
revoke execute on function public.my_profile() from public, anon;
grant  execute on function public.my_profile() to authenticated;

drop function if exists public.desk_profiles();
create function public.desk_profiles()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, created_at timestamptz,
               instagram text,
               -- 023, appended
               denied boolean, denied_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.created_at, p.instagram,
         p.denied, p.denied_at
    from public.profiles p
   where public.is_admin()
   order by p.created_at desc;
$fn$;
revoke execute on function public.desk_profiles() from public, anon;
grant  execute on function public.desk_profiles() to authenticated;


-- ============================================================================
-- SECTION 4. VERIFY. ONE ROW. EVERY COLUMN MUST SAY true.
--
-- ⛔ THE GUARD CHECKS READ THE FUNCTION SOURCE, they do not try the write.
--    privileged_caller() returns TRUE for a direct SQL caller on purpose (002
--    says removing that re-breaks admin seeding), so the SQL editor CANNOT
--    exercise the member branch of these triggers the way 022 could with
--    is_admin(). Migration 016 hit this first and verified by source. Same here.
-- ============================================================================
select
  (select column_default = 'true' from information_schema.columns
    where table_schema='public' and table_name='featured_videos'
      and column_name='published')                                  as videos_default_true,
  (select column_default = 'true' from information_schema.columns
    where table_schema='public' and table_name='member_stories'
      and column_name='published')                                  as stories_default_true,
  position('new.published    := true' in
    pg_get_functiondef('public.guard_featured_video_insert'::regproc)) > 0
                                                                    as videos_guard_publishes,
  position('new.published  := true' in
    pg_get_functiondef('public.guard_member_story_insert'::regproc)) > 0
                                                                    as stories_guard_publishes,
  -- featuring must NOT have come along for the ride
  position('new.featured     := false' in
    pg_get_functiondef('public.guard_featured_video_insert'::regproc)) > 0
                                                                    as featuring_still_the_desk,
  position('new.baked      := false' in
    pg_get_functiondef('public.guard_member_story_insert'::regproc)) > 0
                                                                    as baking_still_the_laptop,
  -- the queue that deliberately stayed a queue
  position('new.published  := false' in
    pg_get_functiondef('public.guard_word_entry_insert'::regproc)) > 0
                                                                    as word_entries_untouched,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='denied')                              as denied_added,
  exists (select 1 from pg_constraint
           where conname='profiles_not_both_states')                as states_exclusive,
  exists (select 1 from pg_trigger
           where tgname='profiles_guard_door')                      as door_guard_live,
  position('new.denied    := old.denied' in
    pg_get_functiondef('public.guard_profile_door'::regproc)) > 0   as members_cannot_self_admit,
  position('new.approved  := false' in
    pg_get_functiondef('public.guard_profile_door'::regproc)) > 0   as no_takes_the_seat_back,
  position('denied' in pg_get_function_result('public.my_profile()'::regprocedure)) > 0
                                                                    as my_profile_knows,
  position('denied' in pg_get_function_result('public.desk_profiles()'::regprocedure)) > 0
                                                                    as desk_profiles_knows,
  has_function_privilege('authenticated','public.my_profile()','execute')
                                                                    as my_profile_callable;
