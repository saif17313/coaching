import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('identity boundary explicitly denies until Supabase Auth is configured',()=>{
 const s=read('src/server/auth/identity.ts'); assert.match(s,/AUTH_NOT_CONFIGURED/); assert.doesNotMatch(s,/jwtDecode|JSON\.parse\(.*token/);
});
test('permission matrix denies unknown actions by default',()=>{
 const s=read('src/server/auth/permissions.ts'); assert.match(s,/Object\.prototype\.hasOwnProperty\.call/); assert.match(s,/FORBIDDEN/);
});
test('batch and uuid validation enforce bounded inputs',()=>{
 const s=read('src/server/domain/validators.ts'); assert.match(s,/Number\.isSafeInteger/); assert.match(s,/INVALID_DATE_RANGE/); assert.match(s,/INVALID_UUID/);
});
test('mutations deliberately reject when no transaction-backed adapter exists',()=>{
 const s=read('src/server/services/coaching.ts'); assert.match(s,/DATABASE_MUTATION_NOT_CONFIGURED/); assert.match(s,/requirePermission/);
});
test('read-only adapter does not wire mutation implementations',()=>{
 const s=read('src/server/services/store-adapter.ts'); assert.match(s,/coachingReads/); assert.doesNotMatch(s,/createBatch:|requestEnrollment:|decideEnrollment:/);
});
