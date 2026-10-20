import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
let page;for(const candidate of browser.contexts()[0].pages())if(await candidate.evaluate(async()=>{try{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role==='teacher';}catch{return false;}})){page=candidate;break;}
if(!page)throw Error('Sign in as Teacher in the verification browser.');
const report={time:new Date().toISOString(),checks:[],mediaId:JSON.parse(readFileSync('docs/evidence/2026-10-20/logo-browser.json')).mediaId},root='/api/v1/teacher/website';
const api=(path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():null};},{path,method,body});
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
let original;
try{
 original=(await api(root+'/settings')).body.data;check('settings start with no unpublished changes',original.revision,original.publishedRevision);
 check('verified DEMO logo is available in Teacher library',(await api(root+'/media')).body.data.items.some(m=>m.id===report.mediaId&&m.status==='ready'),true);
 await page.reload();await page.getByRole('button',{name:'Website Admin',exact:true}).click();await page.getByRole('button',{name:'Global settings',exact:true}).click();
 await page.getByLabel('Website logo',{exact:true}).selectOption(report.mediaId);
 let response=page.waitForResponse(r=>r.url().endsWith('/settings/draft')&&r.request().method()==='PUT');await page.getByRole('button',{name:'Save draft',exact:true}).click();check('logo draft saved through real form',(await response).status(),200);
 let draft=(await api(root+'/settings')).body.data;check('logo draft read-back',draft.settings.logoMediaId,report.mediaId);
 check('draft logo does not change public identity',(await api('/api/v1/public/site-settings')).body.data.settings.logoMediaId,original.settings.logoMediaId);
 check('draft logo bytes remain private',(await api('/api/v1/public/media/'+report.mediaId)).status,404);
 check('draft logo cannot be archived',(await api(root+'/media/'+report.mediaId+'/archive','POST',{})).status,409);
 await page.evaluate(()=>{window.confirm=()=>true;});response=page.waitForResponse(r=>r.url().endsWith('/settings/publish')&&r.request().method()==='POST');await page.getByRole('button',{name:'Publish settings',exact:true}).click();check('logo settings publish through UI',(await response).status(),200);
 check('published logo ID exposed',(await api('/api/v1/public/site-settings')).body.data.settings.logoMediaId,report.mediaId);
 check('published logo bytes delivered',(await api('/api/v1/public/media/'+report.mediaId)).status,200);
 const publicPage=await browser.contexts()[0].newPage();await publicPage.goto('http://localhost:3000/');check('public header uses published logo',await publicPage.locator('.tale-brand img').getAttribute('src'),'/api/v1/public/media/'+report.mediaId);await publicPage.close();
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{
 if(original){const current=(await api(root+'/settings')).body?.data;if(current?.settings.logoMediaId===report.mediaId){const restored=await api(root+'/settings/draft','PUT',{expectedRevision:current.revision,settings:original.settings});if(restored.status===200){const published=await api(root+'/settings/publish','POST',{expectedRevision:restored.body.data.revision});report.restored=published.status===200;}}}
 if(report.restored){report.cleanup={publicMediaStatus:(await api('/api/v1/public/media/'+report.mediaId)).status,archiveStatus:(await api(root+'/media/'+report.mediaId+'/archive','POST',{})).status};}
 writeFileSync('docs/evidence/2026-10-20/logo-browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();
}
