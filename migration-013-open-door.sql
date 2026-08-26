-- ============================================================================
-- 0FF THE PRINT, MIGRATION 013: THE OPEN DOOR
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
--
-- New artists can knock: someone with NO card signs up at /join/ with their
-- Instagram, and the desk sees who is knocking before approving. The handle
-- is the vetting signal; approval and card-handing stay exactly as they are.
--
-- ⛔ public.feed IS NOT TOUCHED.
-- ============================================================================

-- 1. The column. A HANDLE, never a URL: the pages build the instagram.com
--    link themselves, so a member cannot supply a host anywhere (007 doctrine).
alter table public.profiles
  add column if not exists instagram text;

alter table public.profiles
  drop constraint if exists profiles_instagram_shape,
  add  constraint profiles_instagram_shape
       check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');

-- 2. Signup copies it out of the auth metadata, sanitized: strip a leading @,
--    keep only handle characters, cap at 30. Everything else about the
--    function is 002's, carried forward verbatim.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  want_name text;
  want_ig   text;
begin
  want_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  want_name := coalesce(want_name, split_part(new.email, '@', 1), 'NEW MEMBER');
  want_name := left(regexp_replace(want_name, '[[:cntrl:]]', '', 'g'), 40);
  if btrim(want_name) = '' then want_name := 'NEW MEMBER'; end if;

  want_ig := lower(btrim(new.raw_user_meta_data ->> 'instagram'));
  want_ig := regexp_replace(coalesce(want_ig, ''), '^@', '');
  want_ig := left(regexp_replace(want_ig, '[^a-z0-9._]', '', 'g'), 30);
  if want_ig = '' then want_ig := null; end if;

  insert into public.profiles (id, display_name, card_slug, requested_slug, approved, is_admin, instagram)
  values (
    new.id,
    btrim(want_name),
    null,
    public.slugify(nullif(btrim(new.raw_user_meta_data ->> 'card_slug'), '')),
    false,
    false,
    want_ig
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

-- 3. The desk sees it. desk_profiles() is security definer so no grant dance,
--    but a RETURNS TABLE signature cannot be replaced in place (the 005
--    lesson): drop first, carry EVERY existing column forward, append.
drop function if exists public.desk_profiles();
create function public.desk_profiles()
returns table (id uuid, display_name text, card_slug text, requested_slug text,
               approved boolean, is_admin boolean, created_at timestamptz,
               instagram text)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select p.id, p.display_name, p.card_slug, p.requested_slug,
         p.approved, p.is_admin, p.created_at, p.instagram
    from public.profiles p
   where public.is_admin()
   order by p.created_at desc;
$fn$;

revoke execute on function public.desk_profiles() from public, anon;
grant  execute on function public.desk_profiles() to authenticated;

-- ============================================================================
-- VERIFY.
-- ============================================================================
select 'instagram column' as check,
       count(*)::text as ok
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'instagram';

select 'desk_profiles returns instagram' as check,
       (position('instagram' in pg_get_function_result('public.desk_profiles()'::regprocedure)) > 0)::text as ok;
