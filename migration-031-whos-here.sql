-- ============================================================================
-- 0FF THE PRINT, migration 031: WHO'S HERE.
--
-- His ask (10/3): "how can people find their page?" then "yes add both" (a Who's
-- here row of faces on The Wall, most recently updated pages first, and a one-time
-- Make your page card).
--
-- One read-only function for the row. Same door as migration-030: members only,
-- only people whose space is open (Show me on The Wall), never yourself. It hands
-- back each face's skin, link color and mood so the row can ring every face in
-- that person's own color. Nothing new is stored. Safe to run again.
-- ============================================================================

create or replace function public.wall_here()
returns table (sid text, name text, pic text, kind text, skin text, hot text, mood_e text, updated timestamptz)
language sql stable security definer
set search_path = public, pg_temp as $fn$
  select public.wall_sid(x.id), coalesce(nullif(btrim(x.display_name), ''), 'Member'),
         case when s.user_id is null then x.card_photo else s.pic end,
         case when x.is_admin then 'desk' when x.approved then 'card' else 'member' end,
         s.skin, s.hot, s.mood_e, s.updated_at
    from public.profiles x left join public.wall_spaces s on s.user_id = x.id
   where public.is_wall_member() and x.id <> auth.uid() and public.wall_open(x.id)
   order by s.updated_at desc nulls last, x.is_admin desc, x.created_at desc
   limit 80;
$fn$;
revoke execute on function public.wall_here() from public, anon;
grant  execute on function public.wall_here() to authenticated;

-- Check it. One row, both true.
select (select count(*) from pg_proc where proname = 'wall_here' and pronamespace = 'public'::regnamespace) = 1 as here_ok,
       not has_function_privilege('anon', 'public.wall_here()', 'execute')                                   as anon_locked;
