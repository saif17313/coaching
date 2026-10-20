import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {downloadMaterial} from './material-download-helper.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),tb=await chromium.connectOverCDP('http://127.0.0.1:9333'),sb=await chromium.connectOverCDP('http://127.0.0.1:9334');
async function find(b,role){for(const p of b.contexts().flatMap(c=>c.pages()))if(p.url().startsWith('http://localhost:3000')&&await p.evaluate(async role=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role===role;},role))return p;throw Error(role+' session required');}
const report={time:new Date().toISOString(),project:'rkpwqgwceekuvlizfpeb',records:JSON.parse(readFileSync('docs/evidence/2026-10-20/materials-browser.json')).records,checks:[]};
const check=(name,a,b)=>{assert.deepEqual(a,b,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
try{
 const teacher=await find(tb,'teacher'),student=await find(sb,'student'),{batchId,materialId}=report.records,path=`/api/v1/student/materials/${materialId}/file`;
 await student.goto('http://localhost:3000/portal');await student.locator('.portal-sidebar').getByRole('button',{name:'Materials',exact:true}).click();await student.locator('.portal-toolbar select').selectOption(batchId);const link=student.locator(`a[href="${path}"]`);await link.waitFor();
 const expected=await student.evaluate(async path=>{const r=await fetch(path);return {status:r.status,bytes:Array.from(new Uint8Array(await r.arrayBuffer()))};},path);check('Published PDF is authorized for enrolled Student',expected.status,200);const bytes=await downloadMaterial(student,link);check('Student UI saves exact verified PDF',createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(Buffer.from(expected.bytes)).digest('hex'));
 await student.screenshot({path:'docs/evidence/2026-10-20/materials-student.png',fullPage:true});
 // Retire only this audit's labeled, nonfinancial PDF fixtures; retain files and audit history.
 const root=`/api/v1/teacher/batches/${batchId}/materials`;const rows=await teacher.evaluate(async path=>(await (await fetch(path)).json()).data.items,root);
 for(const row of rows.filter(row=>row.status!=='archived'&&/^DEMO (?:PDF UI |private learning material)/.test(row.title))){const result=await teacher.evaluate(async({path,row})=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({action:'archive',materialId:row.id,uploadId:null,title:null,description:null,releaseAt:null,expectedUpdatedAt:row.updatedAt})});return r.status;},{path:root+'/write',row});check('Archive labeled DEMO PDF '+row.id,result,201);}
 check('Archived PDF access revoked',await student.evaluate(async path=>(await fetch(path)).status,path),404);await teacher.screenshot({path:'docs/evidence/2026-10-20/materials-teacher.png',fullPage:true});report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}finally{writeFileSync('docs/evidence/2026-10-20/materials-download-browser.json',JSON.stringify(report,null,2)+'\n');await sb.close();await tb.close();}
