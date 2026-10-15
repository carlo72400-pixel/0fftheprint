-- THE SHOT LIST (10/15, DRAFT, NOT RUN): the @ people leave on /shot/ after the QR at a night.
-- Run through the DB test kit first (reference_otp_dbtest), the click is HIS. Numbering: give it the next free
-- migration number when it goes in (046 was the site taps).
-- What it does: a stranger (anon) can leave one handle per day with no login; the desk reads them per day.
create table if not exists public.shot_list (
  id bigint generated always as identity primary key,
  ig text not null check (ig ~ '^[A-Za-z0-9._]{1,30}$'),
  day date not null,
  slug text check (slug is null or slug ~ '^[a-z0-9-]{1,80}$'),
  created_at timestamptz not null default now(),
  unique (ig, day)
);
alter table public.shot_list enable row level security;
-- no direct reads or writes from any API role; the two functions below are the only doors
revoke all on public.shot_list from anon, authenticated;

create or replace function public.shot_list_add(p_ig text, p_day date, p_slug text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_ig text := regexp_replace(coalesce(p_ig, ''), '^@', '');
begin
  if v_ig !~ '^[A-Za-z0-9._]{1,30}$' then return 'bad'; end if;
  if p_day is null or p_day > current_date + 1 or p_day < current_date - 60 then return 'bad'; end if;
  insert into public.shot_list (ig, day, slug) values (lower(v_ig), p_day, p_slug)
  on conflict (ig, day) do update set slug = coalesce(excluded.slug, shot_list.slug);
  return 'in';
end $$;
grant execute on function public.shot_list_add(text, date, text) to anon, authenticated;

-- the desk reads a day's list (is_admin per my_profile); everyone else gets nothing
create or replace function public.shot_list_day(p_day date)
returns table (ig text, slug text, created_at timestamptz) language sql security definer set search_path = public as $$
  select s.ig, s.slug, s.created_at from public.shot_list s
  where s.day = p_day and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  order by s.created_at;
$$;
grant execute on function public.shot_list_day(date) to authenticated;
