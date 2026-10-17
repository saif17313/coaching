import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const expected='supabase_db_coaching';
if(process.env.MUSA_LOCAL_ACADEMIC_QA!==expected)throw Error('Local-only academic QA opt-in missing');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker host refused');
const [teacher,student,batch]=Array.from({length:3},randomUUID);
const op=Array.from({length:6},randomUUID);
const code='AC'+randomUUID().replaceAll('-','').slice(0,14).toUpperCase();
const sql=`BEGIN;
INSERT INTO auth.users(id) VALUES('${teacher}'::uuid),('${student}'::uuid);
UPDATE public.profiles SET role='teacher'::public.app_role,account_status='active'::public.account_status WHERE id='${teacher}'::uuid;
UPDATE public.profiles SET account_status='active'::public.account_status WHERE id='${student}'::uuid;
INSERT INTO public.batches(id,code,name,capacity) VALUES('${batch}'::uuid,'${code}','Academic QA Batch',3);
INSERT INTO public.enrollments(student_id,batch_id,status,decided_at) VALUES('${student}'::uuid,'${batch}'::uuid,'active',now());
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','${teacher}',true);
DO $academic$
DECLARE s jsonb;u jsonb;r jsonb;a jsonb;e jsonb;m jsonb; msg text;
BEGIN
 s:=public.coaching_create_subject('${batch}'::uuid,'SCI1','Science','${op[0]}'::uuid);
 IF s->>'code'<>'SCI1' OR s->>'batchId'<>'${batch}' THEN RAISE EXCEPTION 'SUBJECT_FAILED'; END IF;
 IF public.coaching_create_subject('${batch}'::uuid,'SCI1','Science','${op[0]}'::uuid)<>s THEN RAISE EXCEPTION 'IDEMPOTENT_SUBJECT_FAILED'; END IF;
 u:=public.coaching_add_syllabus_unit((s->>'id')::uuid,'Unit One',1,'${op[1]}'::uuid);
 IF u->>'position'<>'1' THEN RAISE EXCEPTION 'SYLLABUS_FAILED'; END IF;
 r:=public.coaching_create_routine_slot('${batch}'::uuid,(s->>'id')::uuid,1,540,600,'A-101','${op[2]}'::uuid);
 IF r->>'status'<>'active' THEN RAISE EXCEPTION 'ROUTINE_FAILED'; END IF;
 a:=public.coaching_create_assignment_draft('${batch}'::uuid,(s->>'id')::uuid,'Worksheet','Solve exercises',now()+interval '1 day',now()+interval '2 days',100,true,'${op[3]}'::uuid);
 IF a->>'status'<>'draft' THEN RAISE EXCEPTION 'ASSIGNMENT_FAILED'; END IF;
 e:=public.coaching_create_exam_draft('${batch}'::uuid,(s->>'id')::uuid,'Final Exam',now()+interval '3 days',100,'${op[4]}'::uuid);
 IF e->>'status'<>'draft' THEN RAISE EXCEPTION 'EXAM_FAILED'; END IF;
 m:=public.coaching_save_exam_result_draft((e->>'id')::uuid,'${student}'::uuid,65.25,'${op[5]}'::uuid);
 IF m->>'resultStatus'<>'draft' OR (m->>'marks')::numeric<>65.25 THEN RAISE EXCEPTION 'GRADING_FAILED'; END IF;
 IF public.coaching_save_exam_result_draft((e->>'id')::uuid,'${student}'::uuid,65.25,'${op[5]}'::uuid)<>m THEN RAISE EXCEPTION 'IDEMPOTENT_GRADE_FAILED'; END IF;
 BEGIN
  PERFORM public.coaching_create_subject('${batch}'::uuid,'SCI2','Different','${op[0]}'::uuid);
  RAISE EXCEPTION 'EXPECTED_IDEMPOTENCY_CONFLICT_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.coaching_create_routine_slot('${batch}'::uuid,(s->>'id')::uuid,1,580,610,'B-101',gen_random_uuid());
  RAISE EXCEPTION 'EXPECTED_OVERLAP_CONFLICT_MISSING';
 EXCEPTION WHEN exclusion_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.coaching_save_exam_result_draft((e->>'id')::uuid,'${student}'::uuid,150,gen_random_uuid());
  RAISE EXCEPTION 'EXPECTED_MARKS_REJECT_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'MARKS_EXCEED_MAX' THEN RAISE; END IF;
 END;
END;
$academic$;
SELECT pg_catalog.set_config('request.jwt.claim.sub','${student}',true);
DO $student$
DECLARE msg text;
BEGIN
 BEGIN
  PERFORM public.coaching_create_subject('${batch}'::uuid,'HACK1','Unauthorized',gen_random_uuid());
  RAISE EXCEPTION 'EXPECTED_FORBIDDEN_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'FORBIDDEN' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.academic_subjects(batch_id,code,title,created_by)
    VALUES('${batch}'::uuid,'HACK2','Forbidden','${student}'::uuid);
  RAISE EXCEPTION 'EXPECTED_TABLE_WRITE_DENIAL_MISSING';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$student$;
RESET ROLE;
DO $validate$
BEGIN
 IF (SELECT count(*) FROM public.audit_logs WHERE actor_id='${teacher}'::uuid)<>6 THEN RAISE EXCEPTION 'AUDIT_COUNT_WRONG'; END IF;
 IF (SELECT count(*) FROM public.coaching_mutation_receipts WHERE actor_id='${teacher}'::uuid)<>6 THEN RAISE EXCEPTION 'RECEIPT_COUNT_WRONG'; END IF;
 IF (SELECT count(*) FROM public.exam_results WHERE student_id='${student}'::uuid AND result_status='draft')<>1 THEN RAISE EXCEPTION 'GRADE_NOT_SAVED'; END IF;
END;
$validate$;
ROLLBACK;
`;
const result=spawnSync('docker',['exec','-i',expected,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],{input:sql,encoding:'utf8',timeout:45000,maxBuffer:1024*1024,windowsHide:true});
if(result.error||result.status!==0){console.error('[FAIL] Academic local PostgreSQL rollback-only QA:',result.error?.message??result.stderr?.slice(-2400));process.exit(1);}
console.log('[PASS] Six live local academic RPCs: teacher Auth, audit, receipts, idempotency, overlap, marks and direct-write denial');
console.log('[PASS] Full QA transaction ROLLBACK; no QA data persisted');
