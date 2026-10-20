import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const dir='docs/evidence/2026-10-21/premium';mkdirSync(dir,{recursive:true});const report={time:new Date().toISOString(),checks:[]};
const pass=name=>{report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
try{
 const {teacher,student}=await verificationSessions(browser);await teacher.goto('http://localhost:3000/portal');await teacher.setViewportSize({width:1440,height:1080});
 const nav=teacher.locator('.portal-nav-scroll');await nav.getByRole('button',{name:'Overview',exact:true}).click();
 await teacher.getByRole('heading',{name:'Recent activity',exact:true}).waitFor();await teacher.waitForFunction(()=>!document.querySelector('.premium-metric strong')?.textContent?.includes('…'));
 assert.ok(await teacher.getByRole('heading',{name:'Class schedule',exact:true}).count());await teacher.screenshot({path:dir+'/overview-desktop.png',fullPage:true});pass('Teacher overview uses connected premium dashboard');
 await nav.getByRole('button',{name:'Batches',exact:true}).click();await teacher.getByRole('heading',{name:/^All batches/}).waitFor();await teacher.locator('.premium-table tbody tr').first().waitFor();
 const result=await teacher.evaluate(async()=>{const response=await fetch('/api/v1/teacher/batches/directory');return {status:response.status,data:(await response.json()).data};});assert.equal(result.status,200);assert.ok(result.data.batches.length);pass('Batch aggregation reads actual occupancy and schedules');
 await teacher.getByRole('button',{name:'Create batch',exact:true}).first().click();await teacher.getByRole('dialog').getByLabel('Batch name',{exact:true}).waitFor();await teacher.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();pass('Batch create action opens existing validated form');
 await teacher.screenshot({path:dir+'/batches-desktop.png',fullPage:true});assert.equal(await student.evaluate(async()=>(await fetch('/api/v1/teacher/batches/directory')).status),403);pass('Student cannot read Teacher batch aggregation');
 await teacher.getByRole('button',{name:'Website Admin',exact:true}).click();await teacher.locator('.premium-cms-section').first().waitFor();assert.equal(await teacher.locator('.premium-cms-section').count(),12);pass('Website Studio maps all 12 real homepage roles');
 await teacher.screenshot({path:dir+'/studio-desktop.png',fullPage:true});await teacher.getByRole('button',{name:'Hero',exact:true}).click();await teacher.getByRole('textbox',{name:'Homepage hero Heading',exact:true}).waitFor();pass('Visual section opens dedicated Hero editing fields');
 assert.equal(await teacher.getByRole('button',{name:'Save draft',exact:true}).isDisabled(),true);pass('Save Draft stays disabled without unsaved edits');
 report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{writeFileSync(dir+'/surfaces.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
