-- Read-only deployment verification. Review actual outputs; do not assume PASS merely from rows.
select column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name='account_status';
select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public'
  and tablename in ('profiles','batches','enrollments','batch_contents','announcements','notifications','monthly_dues','payments','payment_adjustments','academic_subjects','syllabus_units','routine_slots','academic_assignments','coaching_mutation_receipts')
order by tablename,policyname;
select routine_name,routine_type,security_type
from information_schema.routines where routine_schema='public' and routine_name like 'coaching_%' order by routine_name;
select has_table_privilege('authenticated','public.batches','INSERT') as client_batch_insert,
       has_table_privilege('authenticated','public.batches','UPDATE') as client_batch_update,
       has_table_privilege('authenticated','public.coaching_mutation_receipts','SELECT') as client_receipts_select,
       has_table_privilege('authenticated','public.coaching_mutation_receipts','INSERT') as client_receipts_insert;
-- Expected for all above privilege checks: false.
