import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),{default:AxeBuilder}=createRequire(import.meta.url)(process.env.EDUCENTRE_AXE_MODULE),browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const report={time:new Date().toISOString(),scope:'Local optimized production build; not a hosted deployment',checks:[]};
try{
 const {teacher,student}=await verificationSessions(browser);
 for(const [role,page,paths] of [['teacher',teacher,['/api/v1/teacher/students/directory','/api/v1/teacher/batches/directory','/api/v1/teacher/account-profile','/api/v1/teacher/management-summary','/api/v1/teacher/students/e6b148e2-dfe4-4f3a-8b35-6046e2fa57de/workflow']],['student',student,['/api/v1/student/dashboard','/api/v1/student/admission-profile','/api/v1/student/admission-workflow']]])for(const path of paths){const status=await page.evaluate(async path=>(await fetch(path)).status,path);assert.equal(status,200,path);report.checks.push({role,path,status});}
 await teacher.goto('http://localhost:3000/portal');await teacher.setViewportSize({width:1440,height:1080});await teacher.locator('.portal-nav-scroll').getByRole('button',{name:'Audit log',exact:true}).click();await teacher.locator('.portal-table tbody tr').first().waitFor();await teacher.setViewportSize({width:390,height:844});
 const table=teacher.getByRole('region',{name:'Scrollable records',exact:true});await table.waitFor();assert.equal(await teacher.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await table.evaluate(node=>node.scrollWidth>node.clientWidth),true);await table.focus();await teacher.keyboard.press('ArrowRight');
 const axe=await new AxeBuilder({page:teacher}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();report.auditViolations=axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));assert.equal(axe.violations.length,0);
 await teacher.screenshot({path:'docs/evidence/2026-10-21/context-production-mobile.png',fullPage:true});report.checks.push({name:'Production mobile audit table readable, keyboard scrollable, no page overflow, zero Axe violations',status:'Pass'});
 const response=await teacher.request.get('http://localhost:3000/');assert.equal(response.status(),200);report.checks.push({name:'Public website renders in optimized runtime',status:'Pass'});report.status='Pass';console.log('PASS local optimized build: Teacher/Student data, public HTML and mobile audit table');
}catch(error){report.status='Fail';report.failure=error.message;process.exitCode=1;console.error(error.message);}
finally{writeFileSync('docs/evidence/2026-10-21/context-production-build-smoke.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
