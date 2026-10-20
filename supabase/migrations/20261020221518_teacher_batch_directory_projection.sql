-- Bounded read-only aggregation for the premium batch screen; no data mutations.
create function public.coaching_teacher_batch_directory(p_search text default '',p_status text default '',p_class text default '',p_session text default '',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null or not public.current_user_is_teacher() then raise exception 'FORBIDDEN';end if;
 if p_search is null or char_length(p_search)>100 or p_status is null or p_status not in ('','open','upcoming','archived') or p_class is null or char_length(p_class)>80 or p_session is null or char_length(p_session)>80 or p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'INVALID_FILTER';end if;
 with source as (
  select b.*,case when b.is_archived then 'archived' when b.starts_on>(now() at time zone 'Asia/Dhaka')::date then 'upcoming' else 'open' end as state,
   (select count(*)::integer from public.enrollments e where e.batch_id=b.id and e.status='active') as enrolled,
   (select count(*)::integer from public.enrollments e where e.batch_id=b.id and e.status='pending') as pending,
   coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'dayOfWeek',r.day_of_week,'startMinute',r.start_minute,'endMinute',r.end_minute,'room',r.room,'subject',s.title) order by r.day_of_week,r.start_minute)
    from public.routine_slots r join public.academic_subjects s on s.id=r.subject_id where r.batch_id=b.id and r.status='active'),'[]'::jsonb) as routine,
   coalesce((select jsonb_agg(s.title order by s.title) from public.academic_subjects s where s.batch_id=b.id),'[]'::jsonb) as subjects,
   coalesce((select jsonb_agg(c.class_name order by c.class_name) from (select distinct d.class_name from public.enrollments e join public.student_details d on d.student_id=e.student_id where e.batch_id=b.id and e.status='active' and d.class_name<>'') c),'[]'::jsonb) as classes,
   coalesce((select jsonb_agg(c.academic_session order by c.academic_session) from (select distinct d.academic_session from public.enrollments e join public.student_details d on d.student_id=e.student_id where e.batch_id=b.id and e.status='active' and d.academic_session<>'') c),'[]'::jsonb) as sessions
  from public.batches b
 ), filtered as (select * from source where (p_search='' or position(lower(p_search) in lower(name||' '||code))>0) and (p_status='' or state=p_status) and (p_class='' or classes?p_class) and (p_session='' or sessions?p_session)),
 selected as (select * from filtered order by is_archived,created_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('batches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'capacity',b.capacity,'isArchived',b.is_archived,'startsOn',b.starts_on,'endsOn',b.ends_on,'status',b.state,'enrolled',b.enrolled,'pending',b.pending,'availableSeats',greatest(0,b.capacity-b.enrolled),'subjects',b.subjects,'routine',b.routine,'classes',b.classes,'sessions',b.sessions)) from selected b),'[]'::jsonb),
  'total',(select count(*) from filtered),'limit',p_limit,'offset',p_offset,
  'classes',coalesce((select jsonb_agg(c.value order by c.value) from (select distinct jsonb_array_elements_text(classes) as value from source) c),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(c.value order by c.value) from (select distinct jsonb_array_elements_text(sessions) as value from source) c),'[]'::jsonb),
  'metrics',jsonb_build_object('activeBatches',(select count(*) from source where state='open'),'activeEnrollments',(select coalesce(sum(enrolled),0) from source where not is_archived),'availableSeats',(select coalesce(sum(greatest(0,capacity-enrolled)),0) from source where not is_archived),
   'upcomingStarts',(select count(*) from source where state='upcoming' and starts_on<=(now() at time zone 'Asia/Dhaka')::date+30))) into result;
 return result;
end;$$;
revoke all on function public.coaching_teacher_batch_directory(text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.coaching_teacher_batch_directory(text,text,text,text,integer,integer) to authenticated;
