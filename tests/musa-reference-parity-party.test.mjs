import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validStudentOnboard,validSignupResult} from '../src/server/student-onboard.mjs';
const source=(p)=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('Teacher can switch directly between Teacher Portal and Website Admin under same session',()=>{
 const portal=source('src/components/portal/PortalClient.tsx');
 assert.match(portal,/portal-workspace-switch/);assert.match(portal,/user\.role==='teacher'/);
 assert.match(portal,/changeTab\('overview'\)/);assert.match(portal,/changeTab\('website'\)/);
});
test('Shifat Tales homepage section order is implemented against published CMS pages',()=>{
 const home=source('src/components/website/SitePresentation.tsx');
 const seq=['tale-home-hero','tale-trust-strip','kind="courses"','kind="why"','tale-mentor','tale-top-students','tale-video-showcase','kind="reviews"','kind="news"','kind="gallery"'];
 let last=-1;for(const item of seq){const index=home.indexOf(item,last+1);assert.ok(index>last,`${item} must appear after preceding section`);last=index;}
 const server=source('src/app/page.tsx');assert.match(server,/publicPage\(slug\)/);assert.match(server,/related=\{related\}/);
});
test('Public homepage uses CMS-sourced media and never copies Shifat teacher imagery',()=>{
 const home=source('src/components/website/SitePresentation.tsx');
 assert.match(home,/public\/media\/\$\{item\.mediaId\}/);assert.match(home,/siteTitle/);
 assert.doesNotMatch(home,/sir_photo|shifat_sir|Md\. Zia/);
});
test('Only active signed teacher can initiate account signup; global mutation gate remains OFF by default',()=>{
 const api=source('src/app/api/v1/teacher/students/onboard/route.ts');
 assert.match(api,/allowedBrowserMutation/);assert.match(api,/verifyActiveActor/);
 assert.match(api,/actor\.role!=='teacher'/);assert.match(api,/enabled-after-db-verification/);
 assert.match(api,/safeSupabaseAuthConfig/);assert.match(api,/\/auth\/v1\/signup/);
 assert.doesNotMatch(api,/service_role|SUPABASE_SERVICE_ROLE/);
});
test('Student account fields require exact allowlist and strong temporary password',()=>{
 const good={email:'student@example.org',fullName:'Demo Student',initialPassword:'OneStrongPassword#2026'};
 assert.equal(validStudentOnboard(good),true);
 for(const candidate of [ {...good,role:'teacher'}, {...good,initialPassword:'abc'}, {...good,email:'bad'}, {...good,fullName:' '}, {...good,initialPassword:'no-upper-case123#'}])assert.equal(validStudentOnboard(candidate),false);
});
test('Signup response does not mistake an obfuscated existing account for a newly created student',()=>{
 const email='student@example.org'; const user={id:'7e39237d-f081-4257-8358-95937b49d51a',email,identities:[{id:'x'}]};
 assert.equal(validSignupResult({user},email),true);
 assert.equal(validSignupResult(user,email),true);
 assert.equal(validSignupResult({user:{...user,identities:[]}},email),false);
 assert.equal(validSignupResult({user:{...user,email:'other@example.org'}},email),false);
});
