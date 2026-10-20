-- LOCAL-only fixtures, after admission verification, enclosed in BEGIN/ROLLBACK.
select gen_random_uuid() as batch_id,gen_random_uuid() as subject_id \gset
insert into public.batches(id,code,name,capacity,starts_on) values(:'batch_id','DEMO_'||substr(replace(:'batch_id','-',''),1,8),'DEMO Directory Batch',10,current_date+10);
insert into public.enrollments(student_id,batch_id,status,decided_at) values(:'student_id',:'batch_id','active',now());
update public.student_details set class_name='DEMO Grade',academic_session='DEMO Session' where student_id=:'student_id';
insert into public.academic_subjects(id,batch_id,code,title,created_by) values(:'subject_id',:'batch_id','DEMO_SUBJECT','DEMO Subject',:'teacher_id');
insert into public.routine_slots(batch_id,subject_id,day_of_week,start_minute,end_minute,room,created_by) values(:'batch_id',:'subject_id',3,600,630,'DEMO room',:'teacher_id');
select set_config('request.jwt.claim.sub',:'teacher_id',true);
set local role authenticated;
do $$declare r jsonb;b jsonb;begin
 r:=public.coaching_teacher_batch_directory('DEMO Directory Batch','upcoming','DEMO Grade','DEMO Session',20,0);b:=r->'batches'->0;
 if (r->>'total')::integer<>1 or (b->>'enrolled')::integer<>1 or (b->>'availableSeats')::integer<>9 or b->'routine'->0->>'subject'<>'DEMO Subject' then raise exception 'BATCH_DIRECTORY_JOIN_FAILED';end if;
 if jsonb_array_length(b->'routine')<>1 or not(b->'classes'?'DEMO Grade') or not(b->'sessions'?'DEMO Session') then raise exception 'BATCH_DIRECTORY_FIELDS_MISSING';end if;
 r:=public.coaching_teacher_batch_directory('DEMO Directory Batch','','Another Grade','',20,0);if (r->>'total')::integer<>0 then raise exception 'BATCH_DIRECTORY_FILTER_FAILED';end if;
 raise notice 'PASS batch occupancy, schedule, subject, class/session joins and genuine filters';
end;$$;
reset role;
select set_config('request.jwt.claim.sub',:'student_id',true);
set local role authenticated;
do $$begin begin perform public.coaching_teacher_batch_directory();raise exception 'BATCH_DIRECTORY_STUDENT_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;raise notice 'PASS Student batch directory access denied';end;$$;
reset role;
