-- Read-only SQL review after applying migration in an isolated test environment.
-- Does not create, mutate or grant anything.
select table_name, row_security_active
from (
  select c.relname as table_name, c.relrowsecurity as row_security_active
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in
  ('batch_contents','announcements','notification_dispatches','notifications','audit_logs')
) x order by table_name;

select tablename,policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public' and tablename in
  ('batch_contents','announcements','notification_dispatches','notifications','audit_logs')
order by tablename,policyname;

select table_name,privilege_type,grantee
from information_schema.role_table_grants
where table_schema='public' and table_name in
 ('batch_contents','announcements','notification_dispatches','notifications','audit_logs')
 and grantee in ('anon','authenticated')
order by table_name,grantee,privilege_type;
