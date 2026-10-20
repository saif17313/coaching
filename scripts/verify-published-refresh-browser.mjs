import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333');let teacher;
for(const p of browser.contexts().flatMap(c=>c.pages()))if(p.url().startsWith('http://localhost:3000')&&await p.evaluate(async()=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role==='teacher';})){teacher=p;break;}
if(!teacher)throw Error('Teacher sign-in required.');
const page=JSON.parse(readFileSync('docs/evidence/2026-10-20/cms-browser.json')).testPage,report={time:new Date().toISOString(),checks:[]};
const api=(path,method='GET',body)=>teacher.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};},{path,method,body});
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
let publicPage;
try{
 const root='/api/v1/teacher/website/pages/'+page.id,draft=(await api(root)).body.data,hero=draft.sections.find(x=>x.sectionKey==='HOME_HERO'),headline='DEMO live publication refresh';
 publicPage=await browser.contexts()[0].newPage();await publicPage.goto('http://localhost:3000/site/'+page.slug,{waitUntil:'networkidle'});await publicPage.bringToFront();
 const before=(await api('/api/v1/public/site-pages/'+page.slug)).body.data.revision;
 const saved=await api(root+'/sections/'+hero.id+'/fields','PUT',{sectionKey:'HOME_HERO',content:{...hero.content,headline},itemId:null,expectedRevision:draft.draftRevision});check('save isolated refresh draft',saved.status,200);
 check('public revision unchanged before publish',(await api('/api/v1/public/site-pages/'+page.slug)).body.data.revision,before);
 check('open public page does not render unpublished heading',await publicPage.getByRole('heading',{name:headline,exact:true}).count(),0);
 check('publish refresh draft',(await api(root+'/publish','POST',{expectedRevision:saved.body.data.revision})).status,200);
 await publicPage.evaluate(()=>window.dispatchEvent(new Event('focus')));await publicPage.getByRole('heading',{name:headline,exact:true}).waitFor({timeout:45000});check('already-open public page refreshes after publication',true,true);
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/published-refresh-browser.json',JSON.stringify(report,null,2)+'\n');if(publicPage)await publicPage.close();await browser.close();}
