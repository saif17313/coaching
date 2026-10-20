import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const report={time:new Date().toISOString(),checks:[]};let page,original,testPage;
const pass=name=>{report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
async function api(path,method='GET',body){return page.evaluate(async({path,method,body})=>{const response=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};},{path,method,body});}
async function saveDraft(){await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft changes saved and confirmed. Publish separately when you are ready.',{exact:true}).waitFor();}
try{
 const sessions=await verificationSessions(browser);page=sessions.teacher;await page.setViewportSize({width:1440,height:1080});await page.reload();
 await page.locator('.portal-nav-link').filter({hasText:'Settings'}).click();await page.getByLabel('Display name',{exact:true}).waitFor();
 const before=await api('/api/v1/teacher/account-profile');assert.equal(before.status,200);original=before.body.data;
 await page.getByLabel('About you',{exact:true}).fill(original.bio+'\nDEMO reversible profile verification');
 await page.getByRole('button',{name:'Save Teacher profile',exact:true}).click();await page.getByText('Profile saved and confirmed from your account.',{exact:true}).waitFor();
 assert.equal((await api('/api/v1/teacher/account-profile')).body.data.bio,original.bio+'\nDEMO reversible profile verification');pass('Teacher settings UI saves and independently reads own profile');
 await page.getByLabel('About you',{exact:true}).fill(original.bio);await page.getByRole('button',{name:'Save Teacher profile',exact:true}).click();
 await page.waitForFunction(async original=>(await(await fetch('/api/v1/teacher/account-profile')).json()).data.bio===original,original.bio);
 pass('Teacher profile content restored after reversible test');original=null;
 assert.equal(await sessions.student.evaluate(async()=>(await fetch('/api/v1/teacher/account-profile')).status),403);pass('Student denied Teacher account endpoint');
 await page.screenshot({path:'docs/evidence/2026-10-21/premium/settings-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Website Admin',exact:true}).click();await page.locator('.premium-cms-new-page summary').click();
 const slug='demo-premium-'+Date.now().toString(36),title='DEMO premium workflow';
 await page.getByLabel('Slug',{exact:true}).fill(slug);await page.getByLabel('Title',{exact:true}).fill(title);
 const created=page.waitForResponse(r=>r.url().endsWith('/pages/create')&&r.request().method()==='POST');await page.getByRole('button',{name:'Create draft page',exact:true}).click();
 const receipt=await created;assert.equal(receipt.status(),201);testPage={id:(await receipt.json()).data.id,slug};report.fixture=testPage;
 const root='/api/v1/teacher/website/pages/'+testPage.id;
 await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.getByRole('button',{name:'+ Add section',exact:true}).click();
 await page.getByLabel('Heading',{exact:true}).fill('DEMO premium first section');await page.getByLabel('Description / paragraph',{exact:true}).fill('DEMO saved through the premium draft control.');
 await saveDraft();let draft=(await api(root)).body.data;assert.equal(draft.sections[0].heading,'DEMO premium first section');assert.equal((await api('/api/v1/public/site-pages/'+slug)).status,404);pass('Premium Save Draft persists a section while public API remains private');
 await page.getByRole('button',{name:'+ Add section',exact:true}).click();await page.getByLabel('Heading',{exact:true}).fill('DEMO premium second section');await saveDraft();
 draft=(await api(root)).body.data;assert.equal(draft.sections.length,2);
 await page.getByRole('button',{name:'Move section DEMO premium second section up',exact:true}).click();
 await page.waitForFunction(async root=>(await(await fetch(root)).json()).data.sections.find(s=>s.heading==='DEMO premium second section').order===0,root);pass('Section reorder persists through guarded API');
 await page.locator('.studio-section-select').filter({hasText:'DEMO premium first section'}).click();await page.getByLabel('Show this section publicly after publishing',{exact:true}).uncheck();await saveDraft();
 draft=(await api(root)).body.data;assert.equal(draft.sections.find(s=>s.heading==='DEMO premium first section').visible,false);pass('Section visibility persists in saved draft');
 await page.reload();await page.getByRole('button',{name:'Website Admin',exact:true}).click();await page.locator('.studio-page-entry').filter({hasText:title}).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();
 assert.equal((await api(root)).body.data.sections.length,2);pass('Draft survives full editor reload');
 await page.evaluate(()=>{window.confirm=()=>true;});
 const published=page.waitForResponse(r=>r.url().endsWith(testPage.id+'/publish')&&r.request().method()==='POST');await page.getByRole('button',{name:/^Publish page/}).click();assert.equal((await published).status(),200);
 const publicData=(await api('/api/v1/public/site-pages/'+slug)).body.data;assert.equal(publicData.sections.length,1);assert.equal(publicData.sections[0].heading,'DEMO premium second section');
 const publicPage=await page.context().newPage();await publicPage.goto('http://localhost:3000/site/'+slug);await publicPage.getByRole('heading',{name:'DEMO premium second section',exact:true}).waitFor();assert.equal(await publicPage.getByRole('heading',{name:'DEMO premium first section',exact:true}).count(),0);await publicPage.close();pass('Publish independently confirmed through public API and rendered HTML');
 report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;report.pageState=page?{url:page.url(),headings:await page.locator('h1,h2,h3').allTextContents()}:null;if(page&&await page.locator('.portal-shell').count())await page.screenshot({path:'docs/evidence/2026-10-21/premium/write-failure.png',fullPage:true});process.exitCode=1;console.error(error.message);}
finally{
 try{if(original){const current=(await api('/api/v1/teacher/account-profile')).body.data;const restored=await api('/api/v1/teacher/account-profile','PATCH',{expectedUpdatedAt:current.updatedAt,data:{displayName:original.displayName,bio:original.bio,phone:original.phone,avatarMediaId:original.avatarMediaId}});assert.equal(restored.status,200);}if(testPage){const root='/api/v1/teacher/website/pages/'+testPage.id,current=(await api(root)).body.data;assert.equal((await api(root+'/archive','POST',{expectedRevision:current.draftRevision})).status,200);assert.equal((await api('/api/v1/public/site-pages/'+testPage.slug)).status,404);report.cleanup='DEMO page archived; public API 404';}if(page)await page.reload();}catch(error){report.cleanupFailure=error.message;report.status='Fail';process.exitCode=1;}
 writeFileSync('docs/evidence/2026-10-21/premium/writes.json',JSON.stringify(report,null,2)+'\n');await browser.close();
}
