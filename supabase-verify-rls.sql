-- ============================================================
-- supabase-verify-rls.sql — public-launch security audit.
-- Run in the Supabase SQL editor (prod project). Every query
-- should come back CLEAN/empty except the inventory at the top.
-- ============================================================

-- 1) Inventory: every table in public, with RLS status + policy count.
--    EXPECT: rls_enabled = true and policy_count >= 1 for ALL rows.
select
  t.tablename,
  t.rowsecurity                                   as rls_enabled,
  count(p.policyname)                             as policy_count,
  coalesce(string_agg(p.policyname, ', '), '—')   as policies
from pg_tables t
left join pg_policies p
       on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.tablename;

-- 2) FAILURES ONLY — tables that would leak or lock out users.
--    EXPECT: zero rows. Any row here is a launch blocker.
select tablename,
       case
         when not rowsecurity then 'RLS DISABLED — world readable/writable via anon key'
         else 'RLS on but NO POLICY — all users locked out'
       end as problem
from pg_tables t
where schemaname = 'public'
  and (not rowsecurity
       or not exists (select 1 from pg_policies p
                      where p.schemaname = t.schemaname
                        and p.tablename  = t.tablename));

-- 3) Policies that don't scope by auth.uid() — worth eyeballing.
--    EXPECT: zero rows (every app policy uses auth.uid() = user_id).
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and (qual is null or qual not like '%auth.uid()%');

-- 4) Cross-user isolation smoke test (needs two confirmed accounts).
--    In the app: sign in as user A, note a transaction id. Then in
--    the SQL editor run as anon/authenticated-B via the API instead:
--      curl 'https://<project>.supabase.co/rest/v1/transactions?id=eq.<A-row-id>' \
--        -H "apikey: <anon-key>" -H "Authorization: Bearer <user-B-access-token>"
--    EXPECT: [] (empty array), never user A's row.
