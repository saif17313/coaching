-- 016: narrow student-owned published-only projection; no exam_results table grants.
create function public.coaching_get_my_published_exam_results(p_limit integer default 20,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid:=(select auth.uid());v_data jsonb;
begin
 if v_actor is null or not exists(
   select 1 from public.profiles p where p.id=v_actor
   and p.role='student'::public.app_role and p.account_status='active'::public.account_status
 ) then raise exception 'FORBIDDEN'; end if;
 if p_limit is null or p_limit<1 or p_limit>50 or p_offset is null or p_offset<0 or p_offset>10000 then raise exception 'INVALID_PAGINATION'; end if;
 select coalesce(pg_catalog.jsonb_agg(q.item order by q.scheduled_at desc,q.exam_id desc),'[]'::jsonb)
 into v_data from (
   select er.exam_id,x.scheduled_at,
     pg_catalog.jsonb_build_object('id',er.id,'examId',er.exam_id,'batchId',x.batch_id,
       'examTitle',x.title,'scheduledAt',x.scheduled_at,'marks',er.marks,
       'maxMarks',x.max_marks,'rank',er.rank,'status','published') as item
   from public.exam_results er
   join public.exams x on x.id=er.exam_id and x.status='published'
   join public.enrollments e on e.batch_id=x.batch_id and e.student_id=v_actor and e.status='active'
   where er.student_id=v_actor and er.result_status='published' and er.rank is not null and er.marks is not null
   order by x.scheduled_at desc,er.exam_id desc
   limit p_limit offset p_offset
 ) q;
 return pg_catalog.jsonb_build_object('items',v_data,'limit',p_limit,'offset',p_offset);
end;
$$;
revoke all on function public.coaching_get_my_published_exam_results(integer,integer) from public,anon,authenticated;
grant execute on function public.coaching_get_my_published_exam_results(integer,integer) to authenticated;
