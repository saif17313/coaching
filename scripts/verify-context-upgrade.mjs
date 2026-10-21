/** Authorized DEV fixture verification. Credentials remain in local browser memory. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://localhost:9333');
const report={time:new Date().toISOString(),checks:[]};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
let teacher,student,fixture,originalDetails;
const studentId='e6b148e2-dfe4-4f3a-8b35-6046e2fa57de';
async function api(page,path,method='GET',body){return page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};},{path,method,body});}
try{
 ({teacher,student}=await verificationSessions(browser));
 await teacher.setViewportSize({width:1440,height:1080});
 await teacher.getByRole('button',{name:'Website Admin',exact:true}).click();
 const nav=teacher.locator('.context-cms-nav');
 await nav.getByRole('button',{name:'Home',exact:true}).waitFor({timeout:60000});
 await nav.getByRole('button',{name:'Home',exact:true}).click();
 assert.ok(await teacher.locator('.cms-section-cards>li').count()>=11);
 pass('Home structure resolves all composed roles and custom sections');
 if(await nav.getByRole('button',{name:'Expand Home',exact:true}).count())await nav.getByRole('button',{name:'Expand Home',exact:true}).click();
 if(await nav.getByRole('button',{name:'Expand Build a stronger foundation.Learn with direction.Testing...',exact:true}).count())await nav.getByRole('button',{name:'Expand Build a stronger foundation.Learn with direction.Testing...',exact:true}).click();
 const homeBranch=nav.locator(':scope>ul>li').filter({has:teacher.getByRole('button',{name:'Home',exact:true})});if(await homeBranch.getByRole('button',{name:'Expand Introduction',exact:true}).count())await homeBranch.getByRole('button',{name:'Expand Introduction',exact:true}).first().click();
 await homeBranch.getByRole('button',{name:'Heading',exact:true}).first().click();
 assert.equal(await teacher.locator('.cms-focused-fields input').count(),1);
 const field=teacher.locator('.cms-focused-fields input');const initial=await field.inputValue();
 await field.fill(initial+' Unsaved verification');
 assert.equal(await teacher.getByRole('button',{name:'Save draft',exact:true}).isEnabled(),true);
 await teacher.getByRole('button',{name:'Reset edits',exact:true}).click();
 await teacher.waitForFunction(()=>!document.querySelector('.cms-save-state')?.classList.contains('dirty'));
 pass('Nested headline opens only its own field; unsaved preview resets without a write');
 await teacher.getByRole('button',{name:'Website overview',exact:true}).click();
 await teacher.getByText('Add a page',{exact:true}).click();
 const slug='demo-context-'+Date.now().toString(36),title='DEMO contextual verification';
 await teacher.getByLabel('Page title',{exact:true}).fill(title);await teacher.getByLabel('Page URL slug',{exact:true}).fill(slug);
 const create=teacher.waitForResponse(r=>r.url().endsWith('/pages/create')&&r.request().method()==='POST');
 await teacher.getByRole('button',{name:'Create draft page',exact:true}).click();
 const created=await create;assert.equal(created.status(),201);fixture={id:(await created.json()).data.id,slug};
 const root='/api/v1/teacher/website/pages/'+fixture.id;
 await teacher.getByRole('button',{name:'Structure',exact:true}).click();
 await teacher.getByText('Add section',{exact:true}).click();
 await teacher.getByLabel('Section type',{exact:true}).selectOption('cards');
 await teacher.getByLabel('Section blueprint',{exact:true}).selectOption('HOME_YOUTUBE_CLASSES');
 await teacher.getByLabel('Heading',{exact:true}).fill('Verification video classes');
 await teacher.getByRole('button',{name:'Add section to draft',exact:true}).click();
 await teacher.getByText('Section added to the private draft.',{exact:true}).waitFor();
 await teacher.locator('.cms-section-main').first().click();
 await teacher.getByRole('button',{name:'Add Classes',exact:true}).click();
 await teacher.getByLabel('Verification video classes Classes 1 Title',{exact:true}).fill('Verification lesson');
 await teacher.getByLabel('Verification video classes Classes 1 YouTube URL',{exact:true}).fill('https://youtu.be/dQw4w9WgXcQ');
 await teacher.getByLabel('Verification video classes Classes 1 Title',{exact:true}).focus();
 await teacher.getByRole('button',{name:'Save draft',exact:true}).click();
 await teacher.getByText('Draft changes saved and confirmed. Publish separately when you are ready.',{exact:true}).waitFor();
 let draft=(await api(teacher,root)).body.data;
 assert.equal(draft.sections[0].content.classes[0].url,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal((await api(teacher,'/api/v1/public/site-pages/'+slug)).status,404);
 pass('Typed video URL normalizes and persists as a private draft');
 const preview=teacher.frameLocator('iframe[title="Actual website draft preview"]');
 await preview.locator('img[src*="i.ytimg.com/vi/dQw4w9WgXcQ/"]').waitFor();
 assert.equal(await preview.locator('iframe[src*="youtube"]').count(),0);
 teacher.once('dialog',dialog=>dialog.accept());await teacher.getByRole('button',{name:'Publish page',exact:true}).click();
 await teacher.getByText('Published revision confirmed through the public API. Visitors receive the published content.',{exact:true}).waitFor();
 const published=await api(teacher,'/api/v1/public/site-pages/'+slug);assert.equal(published.body.data.revision,draft.draftRevision);
 const publicPage=await teacher.context().newPage();await publicPage.goto('http://localhost:3000/site/'+slug);
 await publicPage.locator('img[src*="i.ytimg.com/vi/dQw4w9WgXcQ/"]').waitFor();await publicPage.close();
 pass('Correct thumbnail appears in preview and published HTML; iframe requires Play');
 const workflow='/api/v1/teacher/students/'+studentId+'/workflow';
 const before=await api(teacher,workflow);assert.equal(before.status,200);originalDetails=before.body.data.details;
 const saved=await api(teacher,workflow,'POST',{action:'details.save',data:{...originalDetails,privateNotes:originalDetails.privateNotes+'\nDEMO reversible workflow verification',expectedRevision:before.body.data.revision}});assert.equal(saved.status,200);
 const own=await api(student,'/api/v1/student/admission-workflow');assert.equal(own.status,200);assert.equal(Object.hasOwn(own.body.data.details,'privateNotes'),false);
 assert.equal((await api(student,workflow)).status,403);
 assert.equal((await api(student,'/api/v1/teacher/management-summary')).status,403);
 const identity=await api(teacher,'/api/v1/teacher/students/identity','POST',{email:'effytech10@gmail.com'});assert.equal(identity.body.data.studentId,studentId);assert.equal(identity.body.data.state,'existing');
 pass('Existing Auth identity reused; Student cannot read Teacher notes or management endpoints');
 const charge=own.body.data.charges.find(c=>BigInt(c.outstandingMinor)>0n);assert.ok(charge);
 const reference='DEMO-NO-MONEY-'+Date.now();
 const claim=await api(student,'/api/v1/student/admission-workflow','POST',{action:'payment.submit',data:{dueId:charge.id,amountMinor:'1',method:'bank',reference,paidOn:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka'}).format(new Date())}});assert.equal(claim.status,200);
 assert.deepEqual(claim.body.data.summary,own.body.data.summary);
 const pending=claim.body.data.claims.find(c=>c.reference===reference);assert.equal(pending.status,'pending');
 const rejected=await api(teacher,workflow,'POST',{action:'payment.review',data:{claimId:pending.id,decision:'reject',reason:'DEMO verification only; no collection occurred'}});assert.equal(rejected.status,200);
 assert.deepEqual(rejected.body.data.summary,before.body.data.summary);assert.equal(rejected.body.data.claims.find(c=>c.id===pending.id).status,'rejected');
 pass('One-paisa DEMO report stays outside collections and is rejected without changing the ledger');
 report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;if(teacher)await teacher.screenshot({path:'docs/evidence/2026-10-21/context-upgrade-failure.png'});}
finally{
 try{
  if(originalDetails){const root='/api/v1/teacher/students/'+studentId+'/workflow',current=(await api(teacher,root)).body.data;assert.equal((await api(teacher,root,'POST',{action:'details.save',data:{...originalDetails,expectedRevision:current.revision}})).status,200);report.profileCleanup='Original application fields restored';}
  if(fixture){const root='/api/v1/teacher/website/pages/'+fixture.id,current=(await api(teacher,root)).body.data;assert.equal((await api(teacher,root+'/archive','POST',{expectedRevision:current.draftRevision})).status,200);assert.equal((await api(teacher,'/api/v1/public/site-pages/'+fixture.slug)).status,404);report.cmsCleanup='Isolated DEMO page archived';}
 }catch(error){report.cleanupFailure=error.message;process.exitCode=1;report.status='Fail';}
 writeFileSync('docs/evidence/2026-10-21/context-upgrade.json',JSON.stringify(report,null,2)+'\n');await browser.close();
}
