\set ON_ERROR_STOP on
\pset pager off
\echo ===== MUSA SIR LOCAL AUTHORIZATION QA =====
\echo This test runs in a single transaction and always ROLLBACKs.
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 7 THEN
    RAISE EXCEPTION 'EXPECTED_SEVEN_LOCAL_MIGRATIONS';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) <> 28 THEN
    RAISE EXCEPTION 'EXPECTED_28_RLS_ENABLED_TABLES';
  END IF;
END
$$;
\echo [OK] Migration and RLS preflight

-- Values are random, local-only, and will be discarded by ROLLBACK.
SELECT pg_catalog.gen_random_uuid() AS student_id,
       pg_catalog.gen_random_uuid() AS teacher_active_id,
       pg_catalog.gen_random_uuid() AS teacher_pending_id,
       pg_catalog.gen_random_uuid() AS teacher_disabled_id,
       'QA' || upper(substr(md5(pg_catalog.gen_random_uuid()::text),1,14)) AS batch_code
\gset

-- Real auth.users INSERT invokes the real public.create_student_profile trigger.
INSERT INTO auth.users(id)
VALUES (:'student_id'::uuid), (:'teacher_active_id'::uuid),
       (:'teacher_pending_id'::uuid), (:'teacher_disabled_id'::uuid);

UPDATE public.profiles SET role='teacher'::public.app_role, account_status='active'::public.account_status,
       full_name='Local QA Active Teacher'
 WHERE id=:'teacher_active_id'::uuid;
UPDATE public.profiles SET role='teacher'::public.app_role, account_status='pending'::public.account_status,
       full_name='Local QA Pending Teacher'
 WHERE id=:'teacher_pending_id'::uuid;
UPDATE public.profiles SET role='teacher'::public.app_role, account_status='disabled'::public.account_status,
       full_name='Local QA Disabled Teacher'
 WHERE id=:'teacher_disabled_id'::uuid;
UPDATE public.profiles SET account_status='active'::public.account_status,
       full_name='Local QA Student'
 WHERE id=:'student_id'::uuid;

INSERT INTO public.batches (code,name,capacity)
VALUES (:'batch_code', 'Local QA Batch', 1)
RETURNING id AS batch_id
\gset
INSERT INTO public.enrollments (student_id,batch_id)
VALUES (:'student_id'::uuid, :'batch_id'::uuid)
RETURNING id AS enrollment_id
\gset

-- A request JWT sub is simulated, while the real authenticated database role
-- is used. This checks RLS/RPC SQL logic, NOT GoTrue token signature verification.
SELECT set_config('qa.student_id', :'student_id', true),
       set_config('qa.teacher_active_id', :'teacher_active_id', true),
       set_config('qa.teacher_pending_id', :'teacher_pending_id', true),
       set_config('qa.teacher_disabled_id', :'teacher_disabled_id', true),
       set_config('qa.batch_id', :'batch_id', true),
       set_config('qa.enrollment_id', :'enrollment_id', true);

\echo ===== TEST A: ACTIVE STUDENT =====
SELECT set_config('request.jwt.claim.sub', :'student_id', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_user uuid := current_setting('qa.student_id')::uuid;
  v_batch uuid := current_setting('qa.batch_id')::uuid;
  v_rows bigint;
BEGIN
  IF auth.uid() IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'JWT_CONTEXT_MISMATCH_STUDENT'; END IF;
  IF public.current_user_is_teacher() THEN RAISE EXCEPTION 'STUDENT_TREATED_AS_TEACHER'; END IF;
  IF NOT public.coaching_current_user_is_active() THEN RAISE EXCEPTION 'ACTIVE_STUDENT_NOT_ACTIVE'; END IF;
  IF (SELECT count(*) FROM public.profiles WHERE id=v_user)<>1 THEN
    RAISE EXCEPTION 'STUDENT_CANNOT_READ_OWN_PROFILE'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role='teacher'::public.app_role) THEN
    RAISE EXCEPTION 'STUDENT_CAN_READ_TEACHER_PROFILES'; END IF;
  IF (SELECT count(*) FROM public.enrollments WHERE student_id=v_user)<>1 THEN
    RAISE EXCEPTION 'ACTIVE_STUDENT_CANNOT_READ_OWN_ENROLLMENT'; END IF;

  BEGIN
    PERFORM public.coaching_create_batch('QAFORBID','Must fail',2,pg_catalog.gen_random_uuid());
    RAISE EXCEPTION 'STUDENT_RPC_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FORBIDDEN' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.enrollments(student_id,batch_id) VALUES (v_user,v_batch);
    RAISE EXCEPTION 'STUDENT_DIRECT_INSERT_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR position('row-level security' IN SQLERRM)=0 THEN RAISE; END IF;
  END;

  UPDATE public.profiles SET role='teacher'::public.app_role WHERE id=v_user;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows<>0 THEN RAISE EXCEPTION 'STUDENT_ESCALATED_PROFILE'; END IF;

  DELETE FROM public.enrollments WHERE student_id=v_user;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows<>0 THEN RAISE EXCEPTION 'STUDENT_DELETED_ENROLLMENT'; END IF;
END
$$;
RESET ROLE;
\echo [PASS] Active student isolation, write-denial, and teacher RPC denial

\echo ===== TEST B: PENDING TEACHER =====
SELECT set_config('request.jwt.claim.sub', :'teacher_pending_id', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.current_user_is_teacher() THEN RAISE EXCEPTION 'PENDING_TEACHER_AUTHORIZED'; END IF;
  IF public.coaching_current_user_is_active() THEN RAISE EXCEPTION 'PENDING_TEACHER_ACTIVE'; END IF;
  BEGIN
    PERFORM public.coaching_create_batch('QAPENDING','Must fail',2,pg_catalog.gen_random_uuid());
    RAISE EXCEPTION 'PENDING_TEACHER_RPC_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FORBIDDEN' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE;
\echo [PASS] Pending teacher denied

\echo ===== TEST C: DISABLED TEACHER =====
SELECT set_config('request.jwt.claim.sub', :'teacher_disabled_id', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.current_user_is_teacher() THEN RAISE EXCEPTION 'DISABLED_TEACHER_AUTHORIZED'; END IF;
  IF public.coaching_current_user_is_active() THEN RAISE EXCEPTION 'DISABLED_TEACHER_ACTIVE'; END IF;
  BEGIN
    PERFORM public.coaching_decide_enrollment(
      current_setting('qa.enrollment_id')::uuid, 'approve', pg_catalog.gen_random_uuid());
    RAISE EXCEPTION 'DISABLED_TEACHER_RPC_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FORBIDDEN' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE;
\echo [PASS] Disabled teacher denied

\echo ===== TEST D: ACTIVE TEACHER =====
SELECT set_config('request.jwt.claim.sub', :'teacher_active_id', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_op uuid := pg_catalog.gen_random_uuid();
  v_created jsonb;
  v_replay jsonb;
  v_enrollment uuid := current_setting('qa.enrollment_id')::uuid;
  v_student uuid := current_setting('qa.student_id')::uuid;
  v_batch uuid := current_setting('qa.batch_id')::uuid;
  v_code text := 'QA'||upper(substr(md5(pg_catalog.gen_random_uuid()::text),1,12));
BEGIN
  IF NOT public.current_user_is_teacher() THEN RAISE EXCEPTION 'ACTIVE_TEACHER_NOT_AUTHORIZED'; END IF;
  IF NOT public.coaching_current_user_is_active() THEN RAISE EXCEPTION 'ACTIVE_TEACHER_NOT_ACTIVE'; END IF;
  IF (SELECT count(*) FROM public.profiles WHERE id IN (
      current_setting('qa.student_id')::uuid,
      current_setting('qa.teacher_active_id')::uuid,
      current_setting('qa.teacher_pending_id')::uuid,
      current_setting('qa.teacher_disabled_id')::uuid))<>4 THEN
    RAISE EXCEPTION 'TEACHER_CANNOT_READ_ALL_FOUR_TEST_PROFILES'; END IF;

  v_created := public.coaching_create_batch(v_code, 'Local QA RPC Batch', 2, v_op);
  IF v_created->>'id' IS NULL THEN RAISE EXCEPTION 'TEACHER_BATCH_CREATE_FAILED'; END IF;
  v_replay := public.coaching_create_batch(v_code, 'Local QA RPC Batch', 2, v_op);
  IF v_created IS DISTINCT FROM v_replay THEN RAISE EXCEPTION 'IDEMPOTENCY_REPLAY_CHANGED_RESULT'; END IF;
  BEGIN
    PERFORM public.coaching_create_batch(v_code, 'Different Payload', 2, v_op);
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;

  PERFORM public.coaching_decide_enrollment(v_enrollment, 'approve', pg_catalog.gen_random_uuid());
  IF (SELECT status::text FROM public.enrollments WHERE id=v_enrollment)<>'active' THEN
    RAISE EXCEPTION 'ENROLLMENT_APPROVAL_FAILED'; END IF;
  PERFORM public.coaching_update_batch(v_batch, 'Updated Local QA Batch', NULL, NULL, pg_catalog.gen_random_uuid());
  IF (SELECT name FROM public.batches WHERE id=v_batch)<>'Updated Local QA Batch' THEN
    RAISE EXCEPTION 'BATCH_UPDATE_FAILED'; END IF;
  PERFORM public.coaching_change_student_status(v_student, 'disabled', pg_catalog.gen_random_uuid());
  IF (SELECT account_status::text FROM public.profiles WHERE id=v_student)<>'disabled' THEN
    RAISE EXCEPTION 'STUDENT_DISABLE_FAILED'; END IF;
END
$$;
RESET ROLE;
\echo [PASS] Active teacher RPCs, approval, idempotency, and student status transition

\echo ===== TEST E: DISABLED STUDENT =====
SELECT set_config('request.jwt.claim.sub', :'student_id', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.coaching_current_user_is_active() THEN RAISE EXCEPTION 'DISABLED_STUDENT_STILL_ACTIVE'; END IF;
  IF EXISTS (SELECT 1 FROM public.enrollments) THEN
    RAISE EXCEPTION 'DISABLED_STUDENT_CAN_READ_ENROLLMENTS'; END IF;
  IF (SELECT count(*) FROM public.profiles WHERE id=current_setting('qa.student_id')::uuid)<>1 THEN
    RAISE EXCEPTION 'DISABLED_STUDENT_CANNOT_READ_OWN_PROFILE'; END IF;
END
$$;
RESET ROLE;
\echo [PASS] Disabled student loses active-gated enrollment access

\echo ===== ROLLING BACK ALL TEST DATA =====
ROLLBACK;
\echo [PASS] All local QA fixtures rolled back. No persistent data changes.
