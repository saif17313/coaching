import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowedBrowserMutation,validAccessToken,safeSupabaseAuthConfig,verifyLoginBody} from '../src/server/browser-session.mjs';
const base={method:'POST',origin:'https://coach.example',url:'https://coach.example/api/v1/student/profile/update',marker:'1',fetchSite:'same-origin'};
test('same-origin custom-header CSRF gate protects cookie mutations',()=>{
 assert.equal(allowedBrowserMutation(base),true);
 for(const bad of [{origin:null},{origin:'https://evil.example'},{origin:'http://coach.example'},{marker:null},{marker:'0'},{fetchSite:'cross-site'},{origin:'https://coach.example.evil'},{url:'https://coach.example.evil/api'}])assert.equal(allowedBrowserMutation({...base,...bad}),false);
 assert.equal(allowedBrowserMutation({...base,method:'GET'}),true);
});
test('cookie requires JWT syntax with bounds',()=>{
 assert.equal(validAccessToken('a'.repeat(16)+'.'+'b'.repeat(16)+'.'+'c'.repeat(16)),true);
 for(const bad of ['','x','bearer fake', 'a'.repeat(8193),'a.b.c\r\n'])assert.equal(validAccessToken(bad),false);
});
test('Supabase config fails closed for SSRF, credential injection and unapproved local',()=>{
 const env={SUPABASE_URL:'https://my-project.supabase.co/',SUPABASE_ANON_KEY:'publishable-key',NODE_ENV:'production'};
 assert.equal(safeSupabaseAuthConfig(env).root.hostname,'my-project.supabase.co');
 for(const u of ['http://example.com/','https://supabase.co/','https://evil.supabase.co.evil/','https://my-project.supabase.co/path','https://abc.supabase.co/?x=1','http://127.0.0.1:54321/'])assert.throws(()=>safeSupabaseAuthConfig({...env,SUPABASE_URL:u}));
 assert.equal(safeSupabaseAuthConfig({...env,SUPABASE_URL:'http://127.0.0.1:54321/',NODE_ENV:'development',COACHING_LOCAL_SUPABASE_TESTING:'allow-loopback-54321'}).root.hostname,'127.0.0.1');
});
test('login accepts only small exact credential body',()=>{
 assert.equal(verifyLoginBody({email:'a@b.com',password:'password'}),true);
 for(const bad of [{email:'a@b.com',password:'x',role:'teacher'},{email:'a@b.com',password:123},{email:'in valid',password:'x'},{email:'a@b.com',password:''}])assert.equal(verifyLoginBody(bad),false);
});
test('proxy injects only user cookie and leaves verified endpoint authorization intact',()=>{
 const src=readFileSync(new URL('../src/proxy.ts',import.meta.url),'utf8');
 assert.match(src,/headers\.set\('authorization'/);assert.match(src,/headers\.delete\('cookie'/);
 assert.match(src,/has\('authorization'\)/);assert.match(src,/CSRF_CHECK_FAILED/);
 assert.doesNotMatch(src,/service_role|SUPABASE_SERVICE_ROLE|localStorage|sessionStorage/);
});
test('no refresh token stored, mutation activation untouched and Auth role verified against DB',()=>{
 const s=readFileSync(new URL('../src/app/api/portal/auth/login/route.ts',import.meta.url),'utf8');
 assert.match(s,/verifyActiveActor\(token\)/);
 assert.doesNotMatch(s,/refresh_token|service.role|SERVICE_ROLE|enabled-after-db-verification/);
 const end=readFileSync(new URL('../src/app/api/portal/auth/logout/route.ts',import.meta.url),'utf8');assert.match(end,/maxAge:0/);
});
