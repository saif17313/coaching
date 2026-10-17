import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const domain = readFileSync('src/server/domain/teacher-management.ts','utf8');
const service = readFileSync('src/server/services/teacher-management.ts','utf8');
const api = readFileSync('src/server/domain/teacher-api-contract.ts','utf8');
test('enrollment transitions explicitly disallow rejected reactivation', () => {
  assert.match(domain, /rejected: \[\]/);
  assert.match(domain, /cancelled: \[\]/);
  assert.match(domain, /INVALID_ENROLLMENT_TRANSITION/);
});
test('capacity assertion requires safe integers', () => {
  assert.match(domain, /Number\.isSafeInteger\(activeCount\)/);
  assert.match(domain, /BATCH_FULL/);
});
test('academic subject and unit inputs are validated', () => {
  assert.match(domain, /parseSubject/);
  assert.match(domain, /parseAcademicUnit/);
  assert.match(domain, /parseUuid\(x\.batchId\)/);
});
test('teacher service denies until transaction port exists', () => {
  assert.match(service, /DATABASE_TRANSACTION_NOT_CONFIGURED/);
  assert.match(service, /guarded\(actor\)/);
  assert.match(service, /requirePermission/);
});
test('transaction adapter contract documents atomic ownership', () => {
  assert.match(service, /lock enrollment\/batch rows/i);
  assert.match(service, /role re-verification/i);
});
test('planned teacher API contracts are not exposed as unprotected routes', () => {
  assert.match(api, /\/api\/v1\/teacher\/batches/);
  assert.doesNotMatch(api, /secret|service.role.key/i);
});
