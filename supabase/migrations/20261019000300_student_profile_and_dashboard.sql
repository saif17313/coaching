-- Student self-service and app dashboard. LOCAL ONLY until separately authorized for cloud.
-- No direct profile mutation grants; never trust user-supplied actor identifiers.
create function public.coaching_student_profile() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());r record;
begin
 select id,full_name,created_at into r from public.profiles where id=a and role='student'::public.app_role and account_status='active';
 if not found then raise exception 'FORBIDDEN'; end if;
 return pg_catalog.jsonb_build_object('id',r.id,'fullName',r.full_name,'joinedAt',pg_catalog.to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end;$$;
revoke all on function public.coaching_student_profile() from public,anon,authenticated;
grant execute on function public.coaching_student_profile() to authenticated;

create function public.coaching_student_update_own_profile(p_full_name text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_old text;v_name text:=pg_catalog.btrim(p_full_name);v_prior record;v_payload jsonb;v_result jsonb;
begin
 if a is null or not exists(select 1 from public.profiles where id=a and role='student'::public.app_role and account_status='active') then raise exception 'FORBIDDEN'; end if;
 if p_operation_id is null or p_full_name is null or pg_catalog.char_length(v_name) not between 2 and 160 or v_name ~ '[[:cntrl:]]' then raise exception 'INVALID_PROFILE'; end if;
 v_payload:=pg_catalog.jsonb_build_object('fullName',v_name);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(a::text),pg_catalog.hashtext(p_operation_id::text));
 select operation_type,payload,result into v_prior from public.coaching_mutation_receipts where actor_id=a and operation_id=p_operation_id for update;
 if found then
  if v_prior.operation_type<>'student.profile.self' or v_prior.payload<>v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_prior.result;
 end if;
 select full_name into v_old from public.profiles where id=a and role='student'::public.app_role and account_status='active' for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 update public.profiles set full_name=v_name,updated_at=pg_catalog.now() where id=a;
 v_result:=pg_catalog.jsonb_build_object('id',a,'fullName',v_name);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(a,'student.profile.self',a,pg_catalog.jsonb_build_object('changed',v_old is distinct from v_name));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(a,p_operation_id,'student.profile.self',v_payload,v_result);
 return v_result;
end;$$;
revoke all on function public.coaching_student_update_own_profile(text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_student_update_own_profile(text,uuid) to authenticated;

create function public.coaching_student_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(select auth.uid());v_name text;v_data jsonb;v_upcoming jsonb;v_outstanding numeric;v_active bigint;v_assign bigint;v_coming_assign bigint;v_coming_exam bigint;v_result bigint;v_unread bigint;v_unpaid bigint;
begin
 select full_name into v_name from public.profiles where id=a and role='student'::public.app_role and account_status='active';
 if not found then raise exception 'FORBIDDEN'; end if;
 select count(*) into v_active from public.enrollments e join public.batches b on b.id=e.batch_id where e.student_id=a and e.status='active' and not b.is_archived;
 select count(*) into v_assign from public.academic_assignments x where x.status in ('published','closed') and x.release_at<=pg_catalog.now() and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 select count(*) into v_coming_assign from public.academic_assignments x where x.status in ('published','closed') and x.release_at<=pg_catalog.now() and x.due_at>pg_catalog.now() and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 select count(*) into v_coming_exam from public.exams x where x.status='published' and x.scheduled_at>pg_catalog.now() and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 select count(*) into v_result from public.exam_results r join public.exams x on x.id=r.exam_id where r.student_id=a and r.result_status='published' and x.status='published' and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active');
 select count(*) into v_unread from public.notifications where recipient_id=a and read_at is null;
 with balances as (
  select d.id,(d.amount_minor::numeric
       - coalesce((select sum(p.amount_minor) from public.payments p where p.due_id=d.id),0)
       - coalesce((select sum(j.amount_minor) from public.payment_adjustments j where j.due_id=d.id and j.kind='waiver'),0)
       + coalesce((select sum(j.amount_minor) from public.payment_adjustments j where j.due_id=d.id and j.kind='refund'),0)
       - coalesce((select sum(j.amount_minor) from public.payment_adjustments j where j.due_id=d.id and j.kind='correction'),0)) as balance
  from public.monthly_dues d where d.student_id=a
 )select coalesce(sum(greatest(0,balance)),0),count(*) filter(where balance>0) into v_outstanding,v_unpaid from balances;

 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',s.id,'batchId',s.batch_id,'kind',s.kind,'title',s.title,'at',pg_catalog.to_char(s.at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by s.at),'[]'::jsonb)
 into v_upcoming from (
  select id,batch_id,'assignment'::text as kind,title,due_at as at from public.academic_assignments x where x.status in ('published','closed') and x.release_at<=pg_catalog.now() and x.due_at>pg_catalog.now() and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active')
  union all select id,batch_id,'exam'::text,title,scheduled_at from public.exams x where x.status='published' and x.scheduled_at>pg_catalog.now() and exists(select 1 from public.enrollments e where e.student_id=a and e.batch_id=x.batch_id and e.status='active')
  order by at,id limit 10
 )s;
 return pg_catalog.jsonb_build_object('studentId',a,'fullName',v_name,'counts',pg_catalog.jsonb_build_object('activeBatches',v_active,'assignments',v_assign,'upcomingAssignments',v_coming_assign,'upcomingExams',v_coming_exam,'publishedResults',v_result,'unreadNotifications',v_unread,'unpaidDues',v_unpaid), 'outstandingMinor',v_outstanding::text,'currency','BDT','upcoming',v_upcoming);
end;$$;
revoke all on function public.coaching_student_dashboard() from public,anon,authenticated;
grant execute on function public.coaching_student_dashboard() to authenticated;
