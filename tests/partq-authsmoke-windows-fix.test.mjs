import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {localCliCommand,inspectStatusEnv} from '../scripts/local-partq-core.mjs';

test('Windows Node 24 runs fixed Supabase CLI through cmd.exe, never directly spawns npx.cmd',()=>{
 const target=localCliCommand('win32');
 assert.equal(target.bin,'cmd.exe');
 assert.deepEqual(target.args,['/d','/s','/c','npx.cmd --no-install supabase status --output env']);
 const code=readFileSync(new URL('../scripts/local-partq-readiness.mjs',import.meta.url),'utf8');
 assert.match(code,/localCliCommand\(process\.platform\)/);
 assert.doesNotMatch(code,/cmd\('npx\.cmd'/);
});
test('non-Windows CLI stays argument-structured, unsupported platforms fail closed',()=>{
 for (const platform of ['linux','darwin']){
  const target=localCliCommand(platform);
  assert.equal(target.bin,'npx');
  assert.deepEqual(target.args,['--no-install','supabase','status','--output','env']);
 }
 assert.throws(()=>localCliCommand('unknown'));
});
test('Auth status must remain localhost and publishable-key only; unsafe cloud URL rejected',()=>{
 assert.deepEqual(inspectStatusEnv('API_URL=http://127.0.0.1:54321\nANON_KEY=test-key'),{api:'http://127.0.0.1:54321',key:'test-key'});
 assert.throws(()=>inspectStatusEnv('API_URL=https://example.supabase.co\nANON_KEY=test-key'))
});
