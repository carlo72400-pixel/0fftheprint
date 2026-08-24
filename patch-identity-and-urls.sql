-- 0FF THE PRINT — security patch, 2026-08-20. Safe to re-run.
-- Two holes found by audit and confirmed against the live policy set.

-- ============================================================
-- 1. card_slug is the identity key, and it was member-writable.
--    The policy is NAMED "own display name" but it permits UPDATE on every
--    column of your own row. guard_profile_privileges() pinned approved and
--    is_admin only, so an approved member could set card_slug = 'vamppsych'
--    and their posts would render with another member's name, avatar and seat,
--    because the timeline resolves all of that from card_slug.
--    The desk assigns the card. A member does not get to pick which card they are.
-- ============================================================
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() is NULL in the SQL editor, and that path must stay open or the
  -- first admin can never be seeded. Only guard real, logged-in callers.
  if auth.uid() is not null and not public.is_admin() then
    new.approved  := old.approved;
    new.is_admin  := old.is_admin;
    new.card_slug := old.card_slug;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ============================================================
-- 2. image_url was bare text with no constraint, and it lands in an <a href>
--    on a page anonymous strangers load. "javascript:..." is not touched by
--    HTML escaping and stays a live href. The page-side fix shipped already;
--    this is the half that holds even if someone writes to PostgREST directly.
--    Only our own storage bucket, nothing else.
-- ============================================================
alter table public.posts drop constraint if exists posts_image_url_is_ours;
alter table public.posts add constraint posts_image_url_is_ours
  check (
    image_url is null
    or image_url like 'https://frqpvcpyglhmerwpvosl.supabase.co/storage/v1/object/public/posts/%'
  );

-- ============================================================
-- verify
-- ============================================================
select 'guard pins card_slug' as check,
       position('card_slug' in pg_get_functiondef(
         'public.guard_profile_privileges()'::regprocedure)) > 0 as ok
union all
select 'image_url constrained',
       exists (select 1 from pg_constraint where conname = 'posts_image_url_is_ours');
