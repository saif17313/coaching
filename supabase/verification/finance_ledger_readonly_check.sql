-- Run ONLY after intentionally applying migrations to an isolated Supabase staging DB.
-- Do not run against production or before creating the Supabase project.
select tablename, rowsecurity
  from pg_tables where schemaname='public'
  and tablename in ('fee_plans','monthly_dues','financial_operations','payments','payment_adjustments')
  order by tablename;
select tablename,policyname,cmd,roles
  from pg_policies where schemaname='public'
  and tablename in ('fee_plans','monthly_dues','financial_operations','payments','payment_adjustments')
  order by tablename,policyname;
select grantee,table_name,privilege_type
  from information_schema.role_table_grants
  where table_schema='public'
  and table_name in ('fee_plans','monthly_dues','financial_operations','payments','payment_adjustments')
  order by table_name,grantee,privilege_type;
