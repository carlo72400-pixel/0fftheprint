-- ============================================================
-- 053 · ONE TIMELINE, MEMBERS ONLY (11/12, his call: "just 1 timeline", "merge", then "Yes, do it")
-- ============================================================
-- The Take and The Roll are one members' timeline now (take/). Until this file, a post behind the door had to carry a
-- photo ("A post on the Roll needs a photo", 045), so words alone posted from The Take went up in the open.
-- From here on:
--   * a post by anybody who is not the desk goes behind the door, whatever the page sent, words alone included;
--   * only members of the Crypt can post (a login that is not in the Crypt is told so);
--   * the desk's own posts stay public unless the desk flags them (house news, the pinned rules);
--   * a post that is already up keeps the side of the door it is on (only the SQL editor moves one), and nothing here
--     touches a row: every post made before this file stays exactly where it was.
-- No data changes: the one thing taken off is the table's own rule that a post behind the door must have a photo
-- (constraint posts_roll_has_photo, 045). Safe to run twice.
begin;

alter table public.posts drop constraint if exists posts_roll_has_photo;

create or replace function public.guard_post_roll()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if tg_op = 'INSERT' then
    -- 053: one timeline, members only. The page's own flag no longer decides for a member; the desk still chooses.
    if not public.privileged_caller() then
      new.members_only := true;
    elsif new.members_only is null then
      new.members_only := false;
    end if;
    if new.members_only and not public.privileged_caller() and not coalesce(public.is_wall_member(), false) then
      raise exception 'The Take is for members of the Crypt.' using errcode = '42501';
    end if;
  else
    if not public.direct_sql_caller() then
      new.members_only := old.members_only;
    end if;
  end if;
  if new.members_only and new.pinned then
    raise exception 'The pin is for the desk''s public posts. A members only post does not pin.' using errcode = '55000';
  end if;
  return new;
end $fn$;
revoke execute on function public.guard_post_roll() from public, anon, authenticated;

commit;

select pg_get_functiondef('public.guard_post_roll()'::regprocedure) like '%053: one timeline%' as the_new_rule_is_in,
       exists (select 1 from pg_trigger where tgname = 'trg_posts_roll_guard' and not tgisinternal) as the_trigger_is_still_on,
       not exists (select 1 from pg_constraint where conname = 'posts_roll_has_photo') as the_photo_rule_is_off;
