-- ============================================================
-- 051 · THE VAULT (11/12, his call: "when I log into my account ... on 0ff the print, I should be able to see it")
-- ============================================================
-- The RELIQUARY comics came off the site 11/12 and come back one Friday at a time (Drive: reliquary/manhwa/_release/).
-- Until its Friday, a comic sits on the site ENCRYPTED (reliquary/vault/, AES-256-GCM): anybody can download the files,
-- nobody can read them. The one key lives in this table and only the desk gets it back, so the /reliquary/ shelf and the
-- reader at /reliquary/read/ open the comics for him and for nobody else. They only ask when a saved login is on the phone.
--   S1. vault_keys: one row per vault (name, key). RLS on, no policies, no grants: nobody reads the table directly.
--   S2. vault_key(name): the key, for the desk only (is_admin()); anybody else logged in gets null; strangers can't call it.
--   S3. The verify row (every column should say true).
-- ⛔ The key itself is NOT in this file (the repo is public). It goes in once, after this runs, as its own insert.
-- ⛔ One transaction. Nothing is dropped, no row is deleted. Safe to run twice.
-- ⛔ If the editor asks to confirm a "destructive" query, it is the revoke lines (they keep strangers off the key).
-- ============================================================

begin;

-- S1 ---------------------------------------------------------
create table if not exists public.vault_keys (
  name text primary key check (name ~ '^[a-z0-9-]{1,40}$'),
  k    text not null check (length(k) between 40 and 200),
  made timestamptz not null default now()
);
alter table public.vault_keys enable row level security;
revoke all on table public.vault_keys from public, anon, authenticated;

-- S2 ---------------------------------------------------------
create or replace function public.vault_key(p_name text)
returns text language sql stable security definer
set search_path = public, pg_temp as $fn$
  select v.k from public.vault_keys v where v.name = p_name and public.is_admin();
$fn$;
revoke all on function public.vault_key(text) from public, anon;
grant execute on function public.vault_key(text) to authenticated;

commit;

-- S3 · verify: every column should say true ------------------
select
  (select c.relrowsecurity from pg_class c where c.oid = 'public.vault_keys'::regclass)        as rls_is_on,
  not has_table_privilege('anon', 'public.vault_keys', 'select')
    and not has_table_privilege('authenticated', 'public.vault_keys', 'select')               as nobody_reads_the_table,
  has_function_privilege('authenticated', 'public.vault_key(text)', 'execute')
    and not has_function_privilege('anon', 'public.vault_key(text)', 'execute')               as only_logins_ask,
  public.vault_key('reliquary') is null                                                       as the_editor_gets_no_key;
