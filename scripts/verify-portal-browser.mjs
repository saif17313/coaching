import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),require=createRequire(import.meta.url),{default:AxeBuilder}=require(process.env.EDUCENTRE_AXE_MODULE);
const tb=await chromium.connectOverCDP('http://127.0.0.1:9333'),sb=await chromium.connectOverCDP('http://127.0.0.1:9334');
async function find(b,role){for(const p of b.contexts().flatMap(c=>c.pages()))if(p.url().startsWith('http://localhost:3000')&&await p.evaluate(async role=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role===role;},role))return p;throw Error(role+' session required');}
const teacher=await find(tb,'teacher'),student=await find(sb,'student'),{batchId}=JSON.parse(readFileSync('docs/evidence/2026-10-20/academic-browser.json')).records;
const report={time:new Date().toISOString(),checks:[],viewports:[]},check=(name,a,b)=>{assert.deepEqual(a,b,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
const api=(page,path)=>page.evaluate(async path=>{const r=await fetch(path,{cache:'no-store'});return {status:r.status,body:await r.json()};},path);
try{
 await teacher.setViewportSize({width:1440,height:1000});await teacher.getByRole('button',{name:'Teacher Portal',exact:true}).click();await teacher.locator('.portal-sidebar').getByRole('button',{name:'Announcements',exact:true}).click();await teacher.locator('.portal-toolbar select').selectOption(batchId);
 await teacher.getByRole('button',{name:'Create announcement',exact:true}).click();await teacher.getByLabel('Announcement title',{exact:true}).fill('DEMO editable notice');await teacher.getByLabel('Announcement body',{exact:true}).fill('DEMO first paragraph.\nDEMO second paragraph.');
 let response=teacher.waitForResponse(r=>r.url().endsWith('/announcements/create')&&r.request().method()==='POST');await teacher.getByRole('button',{name:'Save announcement draft',exact:true}).click();let result=await response;check('Teacher creates announcement through dedicated editor',result.status(),201);report.announcementId=(await result.json()).data.id;
 let row=teacher.locator('.academic-card').filter({hasText:'DEMO editable notice'});await row.getByRole('button',{name:'Edit draft',exact:true}).click();await teacher.getByLabel('Announcement title',{exact:true}).fill('DEMO reviewed notice');
 response=teacher.waitForResponse(r=>r.url().endsWith('/announcements/'+report.announcementId+'/edit'));await teacher.getByRole('button',{name:'Save announcement draft',exact:true}).click();check('Teacher updates announcement draft through editor',(await response).status(),201);
 check('Student cannot read edited draft',(await api(student,`/api/v1/student/batches/${batchId}/announcements`)).body.data.items.some(x=>x.id===report.announcementId),false);
 row=teacher.locator('.academic-card').filter({hasText:'DEMO reviewed notice'});await teacher.evaluate(()=>{window.confirm=()=>true;});response=teacher.waitForResponse(r=>r.url().endsWith('/announcements/'+report.announcementId+'/publish'));await row.getByRole('button',{name:'Publish announcement',exact:true}).click();check('Teacher publishes announcement from editor',(await response).status(),201);
 const visible=(await api(student,`/api/v1/student/batches/${batchId}/announcements`)).body.data.items.find(x=>x.id===report.announcementId);check('Student reads exact multiline published notice',visible.body,'DEMO first paragraph.\nDEMO second paragraph.');
 response=teacher.waitForResponse(r=>r.url().endsWith('/notifications/dispatch'));await row.getByRole('button',{name:'Notify enrolled Students',exact:true}).click();check('Teacher dispatches notification from notice UI',(await response).status(),201);
 response=teacher.waitForResponse(r=>r.url().endsWith('/announcements/'+report.announcementId+'/archive'));await row.getByRole('button',{name:'Archive announcement',exact:true}).click();check('Teacher archives notice through editor',(await response).status(),201);
 check('archived announcement disappears from Student read',(await api(student,`/api/v1/student/batches/${batchId}/announcements`)).body.data.items.some(x=>x.id===report.announcementId),false);
 await student.locator('.portal-sidebar').getByRole('button',{name:'My profile',exact:true}).click();await student.getByLabel('Full name',{exact:true}).waitFor();
 const original=(await api(student,'/api/v1/student/profile')).body.data.fullName;
 for(const name of ['DEMO Audit Student Reviewed',original]){await student.getByLabel('Full name',{exact:true}).fill(name);response=student.waitForResponse(r=>r.url().endsWith('/student/profile/update')&&r.request().method()==='PATCH');await student.getByRole('button',{name:/Save profile/}).click();check('Student saves profile '+(name===original?'restoration':'edit'),(await response).status(),200);check('Student profile independent read-back '+name,(await api(student,'/api/v1/student/profile')).body.data.fullName,name);}
 for(const [role,page] of [['teacher',teacher],['student',student]])for(const [label,width,height]of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]){
  await page.setViewportSize({width,height});check(`${role} ${label} no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();report.viewports.push({role,label,width,height,violations:result.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  await page.screenshot({path:`docs/evidence/2026-10-20/${role}-portal-${label}.png`,fullPage:true});
 }
 report.status=report.viewports.some(x=>x.violations.length)?'Partial':'Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/portal-browser.json',JSON.stringify(report,null,2)+'\n');await tb.close();await sb.close();}
