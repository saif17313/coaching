/** Part Q2 local-only database transaction proof. All SQL writes are inside BEGIN/ROLLBACK. */
const HEX12=/^[a-f0-9]{12}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const EXPECTED_DOCKER_HOST=/^(?:npipe:\/\/|unix:\/\/)/;
export const LOCAL_API='http://127.0.0.1:54321';
export function validatedNames(nonce,ids){
 if(!HEX12.test(nonce)||!Array.isArray(ids)||ids.length!==4||!ids.every(x=>UUID.test(x))||new Set(ids).size!==4)throw Error('Invalid locally generated probe identifiers');
 return {batchCode:`QG_${nonce.toUpperCase()}`,slug:`qgate-${nonce}`,batchOp:ids[0],updateOp:ids[1],cmsOp:ids[2],cmsId:ids[3]};
}
export function baselineSql({batchCode,slug,batchOp,updateOp,cmsOp,cmsId}){
 if(!/^QG_[A-F0-9]{12}$/.test(batchCode)||!/^qgate-[a-f0-9]{12}$/.test(slug)||![batchOp,updateOp,cmsOp,cmsId].every(x=>UUID.test(x)))throw Error('Invalid proof baseline parameters');
 return `BEGIN READ ONLY;
 SELECT jsonb_build_object('batches',(SELECT count(*) FROM public.batches WHERE code='${batchCode}'),'pages',(SELECT count(*) FROM public.site_pages WHERE slug='${slug}'),'receipts',(SELECT count(*) FROM public.coaching_mutation_receipts WHERE operation_id IN ('${batchOp}'::uuid,'${updateOp}'::uuid,'${cmsOp}'::uuid)),'audit',(SELECT count(*) FROM public.audit_logs WHERE action IN ('batch.created','batch.updated') AND details->>'code'='${batchCode}'))::text;
 ROLLBACK;`;
}
export function makeProofSql({batchCode,slug,batchOp,updateOp,cmsOp,cmsId}){
 baselineSql({batchCode,slug,batchOp,updateOp,cmsOp,cmsId});
 return `\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '10000ms';
SET LOCAL lock_timeout = '3000ms';
-- Resolve the exact existing teacher from local Auth and local trusted profiles.
SELECT u.id::text AS teacher_id FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE lower(u.email)='teacher1@example.com' AND p.role='teacher' AND p.account_status='active' \\gset
-- The following uses a PostgreSQL-simulated role/claims context. This is NOT a JWT transport.
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub', :'teacher_id', true);
SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
DO $qrole$ BEGIN IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'ROLE_PROOF_FAILED'; END IF; END $qrole$;
SELECT (public.coaching_create_batch('${batchCode}','Local Q2 Rollback Proof',3,'${batchOp}'::uuid)->>'id')::uuid AS created_batch_id \\gset
SELECT (public.coaching_create_batch('${batchCode}','Local Q2 Rollback Proof',3,'${batchOp}'::uuid)->>'id')::uuid=:'created_batch_id'::uuid AS replay_ok \\gset
SELECT CASE WHEN :'replay_ok'='t' THEN 1 ELSE 1/0 END;
SELECT public.coaching_update_batch(:'created_batch_id'::uuid,'Local Q2 Updated',5,NULL,'${updateOp}'::uuid);
SELECT public.coaching_cms_write('page.create','${cmsId}'::uuid,NULL,NULL,
 jsonb_build_object('slug','${slug}','title','Local Q2 Proof','seoTitle','Local Q2 Proof','seoDescription','Rollback-only transaction'),
 '${cmsOp}'::uuid);
-- A fabricated account has no teacher privilege. A failed RPC is caught in a savepoint subtransaction.
SELECT pg_catalog.set_config('request.jwt.claim.sub', pg_catalog.gen_random_uuid()::text,true);
DO $qdeny$ DECLARE v_denied boolean:=false; BEGIN
 BEGIN
  PERFORM public.coaching_create_batch('QG_DENYFAKE','Must never create',2,pg_catalog.gen_random_uuid());
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'FORBIDDEN' THEN v_denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'UNAUTHORIZED_ACTOR_ACCEPTED'; END IF;
END $qdeny$;
RESET ROLE;
DO $qassert$ BEGIN
 IF (SELECT count(*) FROM public.batches WHERE code='${batchCode}')<>1 THEN RAISE EXCEPTION 'BATCH_WRITE_MISSING'; END IF;
 IF (SELECT name FROM public.batches WHERE code='${batchCode}')<>'Local Q2 Updated' THEN RAISE EXCEPTION 'BATCH_UPDATE_MISSING'; END IF;
 IF (SELECT count(*) FROM public.site_pages WHERE slug='${slug}')<>1 THEN RAISE EXCEPTION 'CMS_WRITE_MISSING'; END IF;
 IF (SELECT count(*) FROM public.coaching_mutation_receipts WHERE operation_id IN ('${batchOp}'::uuid,'${updateOp}'::uuid,'${cmsOp}'::uuid))<>3 THEN RAISE EXCEPTION 'IDEMPOTENCY_RECEIPT_MISSING'; END IF;
 IF (SELECT count(*) FROM public.audit_logs WHERE actor_id=(SELECT id FROM auth.users WHERE lower(email)='teacher1@example.com') AND action IN ('batch.created','batch.updated'))<2 THEN RAISE EXCEPTION 'AUDIT_MISSING'; END IF;
END $qassert$;
\\echo [TX PROOF] teacher batch-create / idempotent replay / update / CMS create / forbidden actor / audit / receipts passed INSIDE transaction.
ROLLBACK;
\\echo [TX ROLLBACK] PostgreSQL transaction explicitly rolled back. Post-transaction verification required.
`;
}
export function parseBaseline(value){
 const line=value.split(/\r?\n/).map(s=>s.trim()).find(s=>s.startsWith('{')&&s.endsWith('}'));
 if(!line)throw Error('Missing PostgreSQL baseline JSON');
 let d;try{d=JSON.parse(line);}catch{throw Error('Invalid PostgreSQL baseline JSON');}
 const names=['batches','pages','receipts','audit'];
 if(!d||Object.keys(d).length!==names.length||!names.every(k=>Number.isSafeInteger(d[k])&&d[k]>=0))throw Error('Unexpected baseline counters');
 return d;
}
export function isClear(b){return Object.values(b).every(x=>x===0);}
export function assertProofOutput(output){
 if(!output.includes('[TX PROOF]')||!output.includes('[TX ROLLBACK]'))throw Error('Transaction proof lacked explicit ROLLBACK');
 return true;
}
