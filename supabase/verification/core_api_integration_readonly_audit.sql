-- READ-ONLY DIAGNOSTIC ONLY. Run manually after all migrations are applied.
-- Never assume PASS without a real Supabase execution and authenticated role isolation test.
with required_relations(rel) as (values
  ('profiles'),('batches'),('enrollments'),('batch_contents'),('announcements'),
  ('notifications'),('monthly_dues'),('payments'),('payment_adjustments'),
  ('academic_subjects'),('syllabus_units'),('routine_slots'),
  ('academic_assignments'),('assignment_submissions'),('exams'),('exam_results'),
  ('coaching_mutation_receipts')
)
select rel as relation_name,
       to_regclass('public.'||rel) is not null as exists,
       coalesce((select c.relrowsecurity from pg_catalog.pg_class c
                 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relname=rel),false) as rls_enabled
from required_relations order by rel;

with expected(function_signature) as (values
 ('public.current_user_is_teacher()'),
 ('public.coaching_current_user_is_active()'),
 ('public.coaching_change_student_status(uuid,text,uuid)'),
 ('public.coaching_decide_enrollment(uuid,text,uuid)'),
 ('public.coaching_create_batch(text,text,integer,uuid)'),
 ('public.coaching_update_batch(uuid,text,integer,boolean,uuid)')
)
select function_signature,to_regprocedure(function_signature) is not null as exists
from expected order by function_signature;

-- Baseline RLS/privilege snapshot, not a substitute for negative-user integration tests.
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_catalog.pg_policies
where schemaname='public' and tablename in ('profiles','batches','enrollments')
order by tablename,policyname;

select table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and grantee in ('anon','authenticated')
  and table_name in ('profiles','batches','enrollments','coaching_mutation_receipts')
order by table_name,grantee,privilege_type;
