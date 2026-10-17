import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('backend-only adapter and read-only methods', () => {
  const rest = read('src/server/supabase/rest.ts');
  assert.match(rest, /import "server-only"/);
  assert.match(rest, /method: "GET"/);
  assert.match(rest, /cache: "no-store"/);
  assert.match(rest, /Authorization: `Bearer \${accessToken}`/);
  assert.doesNotMatch(rest, /SERVICE_ROLE|service_role/);
});
test('typed interfaces and bounded repositories', () => {
  const schema = read('src/server/supabase/types.ts');
  const repo = read('src/server/supabase/repository.ts');
  for (const entity of ['Profile', 'Batch', 'Enrollment']) assert.match(schema, new RegExp(`type ${entity} =`));
  assert.match(repo, /isUuid/);
  assert.match(repo, /limit: "100"/);
});
test('read only database security checklist present', () => {
  const sql = read('supabase/verification/phase1_verify.sql');
  for (const part of ['relrowsecurity','anon','authenticated','auth_user_student_profile']) assert.ok(sql.includes(part));
});
