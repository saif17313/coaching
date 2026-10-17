import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const container='supabase_db_coaching';
if(process.env.MUSA_LOCAL_TEACHER_QA!==container)throw Error('Local-only QA opt-in missing');
if(process.env.DOCKER_HOST&&!/^(npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker host refused');
const t=randomUUID(),s=randomUUID(),b=randomUUID(),op1=randomUUID(),op2=randomUUID();
const code=`MC${randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`;
const sql=`
BEGIN;
INSERT INTO auth.users(id) VALUES ('${t}'::uuid),('${s}'::uuid);
UPDATE public.profiles SET role='teacher'::public.app_role,account_status='active'::public.account_status WHERE id='${t}'::uuid;
UPDATE public.profiles SET account_status='active'::public.account_status WHERE id='${s}'::uuid;
INSERT INTO public.batches(id,code,name,capacity) VALUES ('${b}'::uuid,'${code}','Teacher QA Batch',2);
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','${t}',true);
DO $qa$
DECLARE a jsonb; e jsonb; msg text; id uuid;
BEGIN
 a:=public.coaching_update_student_profile('${s}'::uuid,' Test Student ','${op1}'::uuid);
 IF a->>'fullName'<>'Test Student' OR a->>'id'<>'${s}' THEN RAISE EXCEPTION 'PROFILE_BAD_RESPONSE'; END IF;
 IF public.coaching_update_student_profile('${s}'::uuid,'Test Student','${op1}'::uuid)<>a THEN RAISE EXCEPTION 'PROFILE_REPLAY_FAILED'; END IF;
 BEGIN
  PERFORM public.coaching_update_student_profile('${s}'::uuid,'Different Name','${op1}'::uuid);
  RAISE EXCEPTION 'EXPECTED_CONFLICT_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
 END;
 e:=public.coaching_request_enrollment('${s}'::uuid,'${b}'::uuid,'${op2}'::uuid);
 IF e->>'status'<>'pending' OR e->>'studentId'<>'${s}' THEN RAISE EXCEPTION 'ENROLLMENT_BAD_RESPONSE'; END IF;
 IF public.coaching_request_enrollment('${s}'::uuid,'${b}'::uuid,'${op2}'::uuid)<>e THEN RAISE EXCEPTION 'ENROLLMENT_REPLAY_FAILED'; END IF;
 BEGIN
  PERFORM public.coaching_request_enrollment('${s}'::uuid,'${b}'::uuid,gen_random_uuid());
  RAISE EXCEPTION 'EXPECTED_DUPLICATE_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'ENROLLMENT_ALREADY_EXISTS' THEN RAISE; END IF;
 END;
END;
$qa$;
SELECT pg_catalog.set_config('request.jwt.claim.sub','${s}',true);
DO $deny$
DECLARE msg text;
BEGIN
 BEGIN
  PERFORM public.coaching_update_student_profile('${s}'::uuid,'Hacked Name',gen_random_uuid());
  RAISE EXCEPTION 'EXPECTED_FORBIDDEN_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'FORBIDDEN' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE public.profiles SET full_name='Direct Write' WHERE id='${s}'::uuid;
  RAISE EXCEPTION 'EXPECTED_DIRECT_WRITE_DENIAL_MISSING';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$deny$;
RESET ROLE;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.audit_logs WHERE actor_id='${t}'::uuid)<>2 THEN RAISE EXCEPTION 'AUDIT_COUNT_BAD'; END IF;
 IF (SELECT count(*) FROM public.coaching_mutation_receipts WHERE actor_id='${t}'::uuid)<>2 THEN RAISE EXCEPTION 'RECEIPTS_COUNT_BAD'; END IF;
 IF (SELECT count(*) FROM public.enrollments WHERE student_id='${s}'::uuid AND batch_id='${b}'::uuid AND status='pending')<>1 THEN RAISE EXCEPTION 'ENROLLMENT_COUNT_BAD'; END IF;
 IF (SELECT full_name FROM public.profiles WHERE id='${s}'::uuid)<>'Test Student' THEN RAISE EXCEPTION 'PROFILE_WRITE_MISSING'; END IF;
END;
$check$;
ROLLBACK;
`;
const args=['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'];
const result=spawnSync('docker',args,{input:sql,encoding:'utf8',timeout:45000,maxBuffer:1024*1024,windowsHide:true});
if(result.error||result.status!==0){console.error('[FAIL] Local teacher RPC QA:',result.error?.message??result.stderr?.slice(-2500));process.exit(1);}
console.log('[PASS] Local SQL transaction: teacher profile edit, audit, idempotency, enrollment request, uniqueness and student-denial');
console.log('[PASS] Transaction rolled back; no QA fixture persists');
