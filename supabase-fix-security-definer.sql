-- ============================================================
-- supabase-fix-security-definer.sql
-- Remediates the Supabase Security Advisor finding:
--   public.rls_auto_enable() is a SECURITY DEFINER function
--   callable by anon + authenticated via /rest/v1/rpc.
-- A SECURITY DEFINER fn runs with its owner's (superuser) rights;
-- exposing it over the REST API is the risk. It's an internal
-- helper (auto-enables RLS on new tables via an event trigger),
-- so no client role needs EXECUTE.
-- Run in the Supabase SQL editor (prod). NOT tracked by the app
-- schema — this file exists so the DB change lives in git.
-- ============================================================

-- 1) INSPECT first — understand what it is before changing it.
--    Look at `definition` (event trigger? what does it ALTER?).
select p.prosecdef                               as security_definer,
       pg_get_userbyid(p.proowner)               as owner,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid)                 as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rls_auto_enable';

-- 2a) FIX (recommended) — close the API door, keep any event-trigger
--     use working (event triggers fire regardless of EXECUTE grants).
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
notify pgrst, 'reload schema';   -- drop it from the exposed API now

-- 2b) FIX (alternative) — if the inspect shows nothing references it,
--     remove it entirely instead of 2a:
-- drop function public.rls_auto_enable();

-- 3) VERIFY — expect no rows for anon/authenticated/PUBLIC.
select grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public' and routine_name = 'rls_auto_enable';
