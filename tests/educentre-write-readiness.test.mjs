import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cmsWriteReadiness,createWriteStatusRoute} from '../src/server/write-readiness.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('write status is OFF by default and never leaks credentials',()=>{
 const x=cmsWriteReadiness({SUPABASE_ANON_KEY:'sensitive',NODE_ENV:'development'});
 assert.equal(x.writable,false);assert.equal(x.runtime,'local-development');
 assert.equal(JSON.stringify(x).includes('sensitive'),false);
});
test('write status only accepts exact, explicit gate',()=>{
 assert.equal(cmsWriteReadiness({COACHING_ENABLE_MUTATION_APIS:'true'}).writable,false);
 assert.equal(cmsWriteReadiness({COACHING_ENABLE_MUTATION_APIS:'enabled-after-db-verification'}).writable,true);
});
test('write status is behind signed teacher and never grants permission',async()=>{
 const src=read('../src/app/api/v1/teacher/website/write-status/route.ts');
 assert.match(src,/verifyActiveActor/);assert.match(src,/createWriteStatusRoute/);
 assert.doesNotMatch(src,/export async function POST|service.role|apiKey:|COACHING_ENABLE_MUTATION_APIS\s*=/);
 let calls=0;
 const request=new Request('https://app.example/api/v1/teacher/website/write-status',{headers:{Authorization:'Bearer aaa.bbb.ccc'}});
 const route=createWriteStatusRoute({env:{COACHING_ENABLE_MUTATION_APIS:'enabled-after-db-verification'},verify:async()=>({verified:true,role:'student',accountStatus:'active'}),probe:async()=>{calls++;}});
 const response=await route(request);assert.equal(response.status,403);assert.equal(calls,0);assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('website editor transparently reports whether current server can write',()=>{
 const src=read('../src/components/portal/WebsiteAdminStudio.tsx');
 assert.match(src,/write-status/);assert.match(read('../src/components/portal/CmsContextWorkspace.tsx'),/studio-write-status/);
 assert.match(read('../src/components/portal/CmsContextWorkspace.tsx'),/RUN_EDUCENTRE_DEV_WRITES/);
});

test('public website automatically revalidates published revisions without privileged browser RPCs',()=>{
 const src=read('../src/components/website/PublishedRefresh.tsx');
 assert.match(src,/router\.refresh\(\)/);assert.match(src,/visibilityState/);
 assert.match(src,/\/api\/v1\/public\/site-pages/);
 assert.doesNotMatch(src,/supabase_auth|Authorization|POST|PATCH|DELETE|service_role/);
});

test('write readiness is cancellable and is not invoked synchronously from a React effect',()=>{
 const src=read('../src/components/portal/WebsiteAdminStudio.tsx');
 assert.match(src,/new AbortController\(\)/);
 assert.match(src,/Promise\.resolve\(\)\.then\(\(\)=>/);
 assert.match(src,/checkWriteStatus\(controller\.signal\)/);
 assert.match(src,/return\(\)=>controller\.abort\(\)/);
 assert.match(src,/if\(!signal\?\.aborted&&sequence===statusSequence\.current\)setWriteStatus\('unavailable'\)/);
 assert.doesNotMatch(src,/useEffect\(\(\)=>\{void checkWriteStatus\(\);\},\[checkWriteStatus\]\)/);
});

// Guard TypeScript's bundler-based resolution of the .mjs server helper.
test('write-readiness includes a typed .d.mts sibling for Next.js route import',()=>{
 const declaration=read('../src/server/write-readiness.d.mts');
 const route=read('../src/app/api/v1/teacher/website/write-status/route.ts');
 assert.match(route,/from ['"]@\/server\/write-readiness\.mjs['"]/);
 assert.match(declaration,/export function cmsWriteReadiness\(/);
 assert.match(declaration,/writable: boolean/);
 assert.match(declaration,/runtime: 'local-development' \| 'deployment'/);
 assert.match(declaration,/Readonly<Record<string, string \| undefined>>/);
});


test('deployed read-only status offers hosting configuration guidance, not local launcher',()=>{
 const hosted=cmsWriteReadiness({NODE_ENV:'production'});assert.equal(hosted.writable,false);assert.match(hosted.detail,/hosting environment/);assert.doesNotMatch(hosted.detail,/DEV write launcher/);
 const local=cmsWriteReadiness({NODE_ENV:'development'});assert.match(local.detail,/local DEV write launcher/);
 const editor=read('../src/components/portal/CmsContextWorkspace.tsx');assert.match(editor,/writeRuntime==='deployment'/);assert.match(editor,/COACHING_ENABLE_MUTATION_APIS=enabled-after-db-verification/);
});
