import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifySupabaseUser, AuthUnavailableError } from '../src/server/http/supabase-read-auth.mjs';

const token = 'ey.test.token';
const userId = 'b89f9334-e6f5-4b4d-8a66-15a07f8a2918';
const local = 'http://127.0.0.1:54321';
const optin = 'allow-loopback-54321';
async function withConfig(mode,flag,run) {
  const oldMode = process.env.NODE_ENV;
  const oldFlag = process.env.COACHING_LOCAL_SUPABASE_TESTING;
  try {
    if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
    if (flag === undefined) delete process.env.COACHING_LOCAL_SUPABASE_TESTING;
    else process.env.COACHING_LOCAL_SUPABASE_TESTING = flag;
    return await run();
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldMode;
    if (oldFlag === undefined) delete process.env.COACHING_LOCAL_SUPABASE_TESTING;
    else process.env.COACHING_LOCAL_SUPABASE_TESTING = oldFlag;
  }
}
function fakeFetch(expectedUrl,record) {
  return async (url, init) => {
    record.calls += 1;
    assert.equal(String(url), expectedUrl);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    return Response.json({id:userId,app_metadata:{role:'teacher'}});
  };
}

test('local Auth /user only works with BOTH explicit development mode and exact loopback opt-in', async () => {
  const r={calls:0};
  const fetchImpl=fakeFetch(`${local}/auth/v1/user`,r);
  await withConfig('development',optin,async () => {
    assert.deepEqual(await verifySupabaseUser(token,{projectUrl:local,anonKey:'publishable',fetchImpl}),{id:userId});
  });
  assert.equal(r.calls,1);
  for (const [mode,flag] of [['production',optin],['test',optin],['development',undefined],[undefined,optin],['development','true']]) {
    await withConfig(mode,flag,async () => {
      await assert.rejects(()=>verifySupabaseUser(token,{projectUrl:local,anonKey:'publishable',fetchImpl}),AuthUnavailableError);
    });
  }
  assert.equal(r.calls,1);
});

test('local origin rejects SSRF variants even with opt-in', async () => {
  let calls=0;
  await withConfig('development',optin,async()=>{
    for (const origin of [
      'http://localhost:54321', 'http://127.0.0.2:54321', 'http://127.0.0.1:54322',
      'https://127.0.0.1:54321','http://[::1]:54321','http://127.0.0.1:54321/api',
      'http://127.0.0.1:54321/?test=1','http://127.0.0.1:54321/#x',
      'http://admin:pass@127.0.0.1:54321','http://127.0.0.1.evil.test:54321',
      'http://169.254.169.254:54321','http://127.0.0.1:54321.evil.test',
    ]) {
      await assert.rejects(()=>verifySupabaseUser(token,{projectUrl:origin,anonKey:'publishable',fetchImpl:async()=>{calls++}}),AuthUnavailableError,origin);
    }
  });
  assert.equal(calls,0);
});

test('hosted HTTPS Supabase origin stays accepted without local opt-in', async()=>{
  const r={calls:0};
  await withConfig('production',undefined,async()=>{
    assert.deepEqual(await verifySupabaseUser(token,{
      projectUrl:'https://abcd.supabase.co',anonKey:'publishable',
      fetchImpl:fakeFetch('https://abcd.supabase.co/auth/v1/user',r),
    }),{id:userId});
  });
  assert.equal(r.calls,1);
});

test('REST and mutation adapter have the same strict local gate and existing mutation enable switch',async()=>{
  const root=path.resolve(import.meta.dirname,'../src/server');
  const [rest,mutation]=await Promise.all([
    readFile(path.join(root,'supabase/rest.ts'),'utf8'),
    readFile(path.join(root,'http/production-mutation-adapter.ts'),'utf8'),
  ]);
  for (const source of [rest,mutation]) {
    assert.match(source,/COACHING_LOCAL_SUPABASE_TESTING/);
    assert.match(source,/allow-loopback-54321/);
    assert.match(source,/127\.0\.0\.1/);
    assert.match(source,/NODE_ENV/);
    assert.match(source,/54321/);
    assert.match(source,/\.supabase/);
  }
  assert.match(mutation,/COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification'/);
  assert.doesNotMatch(rest,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(mutation,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
});
