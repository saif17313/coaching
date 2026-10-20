import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatedNames,baselineSql,makeProofSql,parseBaseline,isClear,assertProofOutput,LOCAL_API} from '../scripts/local-partq-rollback-core.mjs';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const cfg=validatedNames('abcdef123456',ids);
test('Q2 proof identifiers require random UUIDv4 and exact nonce',()=>{
 assert.equal(cfg.batchCode,'QG_ABCDEF123456');assert.equal(cfg.slug,'qgate-abcdef123456');
 assert.throws(()=>validatedNames('abc',ids));assert.throws(()=>validatedNames('abcdef123456',[ids[0],ids[0],ids[2],ids[3]]));
 assert.throws(()=>makeProofSql({...cfg,batchCode:"a');delete from auth.users;--"}));
});
test('Q2 SQL uses one explicit transaction, authenticated role and rollback, never commit or drop',()=>{
 const sql=makeProofSql(cfg);
 assert.match(sql,/BEGIN;\nSET LOCAL statement_timeout/);assert.match(sql,/SET LOCAL ROLE authenticated/);
 assert.match(sql,/current_user <> 'authenticated'/);assert.match(sql,/request.jwt.claim.sub/);
 assert.match(sql,/coaching_create_batch/);assert.match(sql,/coaching_update_batch/);assert.match(sql,/coaching_cms_write/);
 assert.match(sql,/IDEMPOTENCY_REPLAY_FAILED|replay_ok/);assert.match(sql,/UNAUTHORIZED_ACTOR_ACCEPTED/);
 assert.match(sql,/AUDIT_MISSING/);assert.match(sql,/^ROLLBACK;$/m);
 assert.doesNotMatch(sql,/\b(?:COMMIT|TRUNCATE|DROP|ALTER|GRANT|REVOKE|DELETE|INSERT\s+INTO\s+auth\.)\b/i);
 assert.equal((sql.match(/^ROLLBACK;$/gm)||[]).length,1);
 assert.match(sql,/\\gset/g);
});
test('Q2 independent baseline query is strict read-only and exact probe scoped',()=>{
 const sql=baselineSql(cfg);assert.match(sql,/BEGIN READ ONLY/);assert.match(sql,/ROLLBACK;/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|COMMIT|DROP|TRUNCATE)\b/i);
 assert.match(sql,/QG_ABCDEF123456/);assert.match(sql,/qgate-abcdef123456/);
});
test('Q2 baseline parsers reject missing/poisoned/remaining rows',()=>{
 assert.deepEqual(parseBaseline('{"batches":0,"pages":0,"receipts":0,"audit":0}'),{batches:0,pages:0,receipts:0,audit:0});
 assert.equal(isClear(parseBaseline('{"batches":0,"pages":0,"receipts":0,"audit":0}')),true);
 assert.equal(isClear(parseBaseline('{"batches":0,"pages":1,"receipts":0,"audit":0}')),false);
 for(const s of ['foo','{}','{"batches":-1,"pages":0,"receipts":0,"audit":0}','{"batches":"0","pages":0,"receipts":0,"audit":0}'])assert.throws(()=>parseBaseline(s));
});
test('Q2 proof output must certify both in-transaction and rollback marker',()=>{
 assert.equal(assertProofOutput('[TX PROOF] passed\n[TX ROLLBACK] explicitly'),true);
 assert.throws(()=>assertProofOutput('[TX PROOF] only'));
});
test('Q2 executable stays local and defaults OFF; no hosted Supabase or mutation flag use',()=>{
 const src=readFileSync(new URL('../scripts/local-partq-transaction-proof.mjs',import.meta.url),'utf8');
 const script=readFileSync(new URL('../RUN_MUSA_PARTQ_TX_ROLLBACK.ps1',import.meta.url),'utf8');
 assert.equal(LOCAL_API,'http://127.0.0.1:54321');
 assert.match(src,/MUSA_PARTQ_TX_PROOF/);assert.match(src,/EXPECTED_DOCKER_HOST/);assert.match(src,/supabase_db_coaching/);
 assert.match(src,/finally\s*\{/);assert.match(src,/Independent post-transaction inspection/);assert.match(src,/zero batch\/page\/receipt\/audit residue/);
 assert.match(script,/RunRollbackProof/);assert.match(script,/LOCAL_ROLLBACK_ONLY/);
 assert.doesNotMatch(src+script,/enabled-after-db-verification|supabase\.co|service.role|db reset|db push|git push/i);
});
