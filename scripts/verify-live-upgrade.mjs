/** Production verification is restricted to the established origin and one isolated CMS fixture. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const origin='https://educentre-iota.vercel.app';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),browser=await chromium.connectOverCDP('http://localhost:9333');
const report={origin,time:new Date().toISOString(),checks:[],financialWrites:false};
let teacher,student,fixture;
async function api(page,path,method='GET',body){return page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};},{path,method,body});}
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
try{
 ({teacher,student}=await verificationSessions(browser,{origin}));await teacher.reload({waitUntil:'domcontentloaded',timeout:60000});await teacher.setViewportSize({width:1440,height:1000});
 const own=await api(student,'/api/v1/student/admission-workflow');assert.equal(own.status,200);assert.equal(Object.hasOwn(own.body.data.details,'privateNotes'),false);
 const current=await api(teacher,'/api/v1/teacher/students/'+own.body.data.id+'/workflow');assert.equal(current.status,200);assert.deepEqual(current.body.data.summary,own.body.data.summary);
 assert.equal(own.body.data.charges.reduce((sum,row)=>sum+BigInt(row.outstandingMinor),0n).toString(),own.body.data.summary.outstandingMinor);
 const management=await api(teacher,'/api/v1/teacher/management-summary');assert.equal(management.status,200);
 for(const key of ['payableMinor','collectedMinor','refundedMinor','outstandingMinor'])assert.equal(management.body.data.batches.reduce((sum,row)=>sum+BigInt(row[key]),0n).toString(),management.body.data.summary[key]);
 assert.equal((await api(student,'/api/v1/teacher/management-summary')).status,403);assert.equal((await api(student,'/api/v1/teacher/students/'+own.body.data.id+'/workflow')).status,403);
 pass('Live Teacher/Student statements reconcile; private notes and Teacher reports remain restricted');
 const readiness=await api(teacher,'/api/v1/teacher/website/write-status');assert.equal(readiness.body.data.writable,true);assert.equal(readiness.body.data.backend,'reachable');
 await teacher.getByRole('button',{name:'Website Admin',exact:true}).click();await teacher.locator('.context-cms').waitFor();
 const nav=teacher.locator('.context-cms-nav');await nav.getByRole('button',{name:'Home',exact:true}).waitFor({timeout:60000});await nav.getByRole('button',{name:'Home',exact:true}).click();assert.ok(await teacher.locator('.cms-section-cards>li').count()>=11);
 pass('Live contextual CMS loads real nested navigation and Home composition');
 await teacher.getByRole('button',{name:'Website overview',exact:true}).click();await teacher.getByText('Add a page',{exact:true}).click();
 const slug='demo-release-'+Date.now().toString(36);await teacher.getByLabel('Page title',{exact:true}).fill('DEMO isolated release verification');await teacher.getByLabel('Page URL slug',{exact:true}).fill(slug);
 const create=teacher.waitForResponse(r=>r.url().endsWith('/pages/create')&&r.request().method()==='POST');await teacher.getByRole('button',{name:'Create draft page',exact:true}).click();const response=await create;assert.equal(response.status(),201);fixture={id:(await response.json()).data.id,slug};
 const root='/api/v1/teacher/website/pages/'+fixture.id;await teacher.locator('.cms-context-bar small').filter({hasText:slug}).waitFor();await teacher.getByRole('button',{name:'Structure',exact:true}).click();await teacher.getByText('Add section',{exact:true}).click();await teacher.getByLabel('Section type',{exact:true}).selectOption('rich-text');await teacher.getByLabel('Heading',{exact:true}).fill('Release verification');await teacher.getByRole('button',{name:'Add section to draft',exact:true}).click();await teacher.getByText('Section added to the private draft.',{exact:true}).waitFor();await teacher.locator('.cms-section-main').first().click();
 await teacher.getByLabel('Release verification Section description',{exact:true}).fill('Temporary publication verification. This isolated page is archived after the check.');await teacher.getByRole('button',{name:'Save draft',exact:true}).click();await teacher.getByText('Draft changes saved and confirmed. Publish separately when you are ready.',{exact:true}).waitFor();
 assert.equal((await api(teacher,'/api/v1/public/site-pages/'+slug)).status,404);const draft=(await api(teacher,root)).body.data;
 teacher.once('dialog',dialog=>dialog.accept());await teacher.getByRole('button',{name:'Publish page',exact:true}).click();await teacher.getByText('Published revision confirmed through the public API. Visitors receive the published content.',{exact:true}).waitFor();const published=await api(teacher,'/api/v1/public/site-pages/'+slug);assert.equal(published.body.data.revision,draft.draftRevision);
 const publicPage=await browser.contexts()[0].newPage();await publicPage.goto(origin+'/site/'+slug,{waitUntil:'domcontentloaded',timeout:60000});await publicPage.getByRole('heading',{name:'Release verification',exact:true}).waitFor();await publicPage.close();
 pass('Live UI creates and saves a private draft, then publishes the exact revision confirmed in public HTML');
 await teacher.setViewportSize({width:390,height:844});assert.equal(await teacher.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await teacher.getByRole('button',{name:'Preview',exact:true}).click();await teacher.screenshot({path:'docs/evidence/2026-10-21/live-cms-mobile.png'});
 const publicPage2=await browser.contexts()[0].newPage();await publicPage2.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});await publicPage2.locator('h1').waitFor();assert.doesNotMatch(await publicPage2.locator('main').innerText(),/Testing\.\.\.|DEMO PREVIEW|PLACEHOLDER|DEMO RESULT|DEMO REVIEW/);await publicPage2.setViewportSize({width:1440,height:1000});await publicPage2.screenshot({path:'docs/evidence/2026-10-21/live-public-desktop.png',fullPage:true});await publicPage2.setViewportSize({width:390,height:844});assert.equal(await publicPage2.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await publicPage2.close();pass('Live public theme removes development labels and fits mobile width');
 report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{try{if(fixture){const root='/api/v1/teacher/website/pages/'+fixture.id,current=(await api(teacher,root)).body.data;assert.equal((await api(teacher,root+'/archive','POST',{expectedRevision:current.draftRevision})).status,200);assert.equal((await api(teacher,'/api/v1/public/site-pages/'+fixture.slug)).status,404);report.cleanup='Only the isolated release fixture was archived; public API confirms 404';}}catch(error){report.cleanupFailure=error.message;report.status='Fail';process.exitCode=1;}writeFileSync('docs/evidence/2026-10-21/live-upgrade.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
