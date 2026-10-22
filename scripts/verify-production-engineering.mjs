import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {PDFDocument} from 'pdf-lib';
import {verificationSessions} from './verification-sessions.mjs';
const origin='https://educentre-iota.vercel.app';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://localhost:9333');
const report={origin,checkedAt:new Date().toISOString(),checks:[]};
async function api(page,path){return page.evaluate(async path=>{const r=await fetch(path,{cache:'no-store'});return {status:r.status,body:await r.json()};},path);}
try{
 const context=await browser.newContext(),page=await context.newPage();
 assert.equal((await context.request.get(origin+'/brand/symbol.svg')).status(),200,'Production domain has not activated the new build: brand asset is missing');
 for(const width of [375,768,1440,1920]){await page.setViewportSize({width,height:1000});const r=await page.goto(origin+'/site/about',{waitUntil:'domcontentloaded',timeout:60000});assert.equal(r.status(),200);await page.locator('h1').waitFor();const box=await page.locator('.tale-interior-hero').boundingBox();assert.ok(box.x<=1&&box.width>=width-1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 report.checks.push('Production About spans all four viewport widths without overflow');
 for(const path of ['/brand/symbol.svg','/icon.svg','/apple-icon.png','/manifest.webmanifest'])assert.equal((await context.request.get(origin+path)).status(),200);
 report.checks.push('Production brand and manifest assets served');await context.close();
 const {teacher,student}=await verificationSessions(browser,{origin});
 const t=await api(teacher,'/api/v1/teacher/demo-workspace'),s=await api(student,'/api/v1/student/demo-workspace');assert.equal(t.status,200);assert.equal(s.status,200);
 const ts=t.body.data.state,ss=s.body.data.state;assert.ok(ts.students.length>=50);assert.equal(ss.students.length,1);assert.deepEqual(ss.charges,ts.charges.filter(c=>c.studentId===ss.students[0].id));assert.ok(ss.receipts.length);
 report.counts={students:ts.students.length,batches:ts.batches.length,enrollments:ts.enrollments.length};report.checks.push('Authenticated production demo data and Student financial isolation match');
 for(const [role,page] of [['teacher',teacher],['student',student]]){const id=ss.receipts[0].snapshot.paymentId;const result=await page.evaluate(async path=>{const r=await fetch(path);return {status:r.status,bytes:[...new Uint8Array(await r.arrayBuffer())]};},'/api/v1/'+role+'/demo-workspace/receipts/'+id);assert.equal(result.status,200);const pdf=await PDFDocument.load(new Uint8Array(result.bytes));assert.match(pdf.getTitle(),/SAMPLE/);assert.ok(pdf.getPageCount());assert.ok(Math.abs(pdf.getPage(0).getWidth()-595.28)<2);}
 report.checks.push('Teacher and Student production PDF rendering includes packaged assets and A4 SAMPLE receipts');
 const foreign=ts.receipts.find(r=>r.snapshot.studentId!==ss.students[0].id);if(foreign){const r=await student.evaluate(async id=>(await fetch('/api/v1/student/demo-workspace/receipts/'+id)).status,foreign.snapshot.paymentId);assert.equal(r,404);}
 assert.equal((await api(student,'/api/v1/teacher/demo-workspace')).status,403);report.checks.push('Student foreign receipt and Teacher route access denied');
 report.status='Pass';console.log(JSON.stringify(report));
}catch(error){report.status='Fail';report.failure=error.message;process.exitCode=1;console.error(error.message);}finally{writeFileSync('docs/evidence/2026-10-22/production-engineering.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
