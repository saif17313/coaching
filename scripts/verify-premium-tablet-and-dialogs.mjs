import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),{default:AxeBuilder}=createRequire(import.meta.url)(process.env.EDUCENTRE_AXE_MODULE),browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const report={time:new Date().toISOString(),checks:[]};
async function scan(page,label){await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' overflow');const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();const violations=result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));report.checks.push({label,violations});console.log(label+': '+violations.length+' violations');}
try{
 const {teacher,student}=await verificationSessions(browser);await teacher.setViewportSize({width:820,height:1180});await teacher.reload();
 async function navigate(page,label){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.portal-nav-link').getByText(label,{exact:true}).click();}
 for(const label of ['Overview','Students','Batches']){await navigate(teacher,label);await scan(teacher,'Teacher '+label+' tablet');if(label==='Batches'){
  const create=teacher.getByRole('button',{name:'Create batch',exact:true}).first();await create.click();const dialog=teacher.locator('.portal-screen-slot>.portal-screen').last();await dialog.waitFor();assert.equal(await teacher.evaluate(()=>Boolean(document.activeElement?.closest('.portal-screen'))),true);await scan(teacher,'Batch screen tablet');await dialog.locator('.portal-screen-back').click();await dialog.waitFor({state:'hidden'});await teacher.waitForTimeout(150);assert.equal(await create.evaluate(node=>document.activeElement===node),true);report.dialogFocus='In-portal screen: focus moves into it, Back closes it and focus returns to the opener';
 }}
 await teacher.getByRole('button',{name:'Website Admin',exact:true}).click();await teacher.locator('.studio-page-entry').filter({hasText:/Home/}).first().click();
 for(const label of ['Pages & sections','Media library','Global settings']){await teacher.getByRole('button',{name:label,exact:true}).click();await scan(teacher,'CMS '+label+' tablet');await teacher.setViewportSize({width:390,height:844});await scan(teacher,'CMS '+label+' mobile');await teacher.setViewportSize({width:820,height:1180});}
 await teacher.getByRole('button',{name:'Pages & sections',exact:true}).click();await teacher.setViewportSize({width:1440,height:1080});await teacher.screenshot({path:'docs/evidence/2026-10-21/premium/studio-desktop.png',fullPage:true});
 await student.setViewportSize({width:820,height:1180});await student.reload();for(const label of ['My dashboard','Billing statement','My profile']){await navigate(student,label);await scan(student,'Student '+label+' tablet');}
 await student.screenshot({path:'docs/evidence/2026-10-21/premium/student-tablet.png',fullPage:true});
 report.status=report.checks.some(c=>c.violations.length)?'Fail':'Pass';if(report.status==='Fail')process.exitCode=1;
}catch(error){report.status='Fail';report.failure=error.message;process.exitCode=1;console.error(error.message);}
finally{writeFileSync('docs/evidence/2026-10-21/premium/tablet-dialogs.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
