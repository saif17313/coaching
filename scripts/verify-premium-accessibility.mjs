import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const require=createRequire(import.meta.url),{default:AxeBuilder}=require(process.env.EDUCENTRE_AXE_MODULE);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const report={time:new Date().toISOString(),surfaces:[],keyboard:[]};
try{
 const sessions=await verificationSessions(browser);
 for(const role of ['teacher','student']){
  const page=sessions[role];await page.setViewportSize({width:1440,height:1080});await page.reload();
  await page.locator('.portal-nav-link').first().waitFor();
  const labels=await page.locator('.portal-nav-link').allTextContents();
  for(const label of labels){
   if(role==='teacher'&&await page.locator('.context-cms,.musa-cms-sidebar-nav').count())await page.getByRole('button',{name:'Teacher Portal',exact:true}).click();
   await page.locator('.portal-nav-link').filter({hasText:label.trim()}).click();
   await page.waitForTimeout(1600);
   for(const [viewport,width,height] of [['desktop',1440,1080],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    const violations=result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
    report.surfaces.push({role,label:label.trim(),viewport,overflow,violations});
    console.log(role+' '+label.trim()+' '+viewport+': '+violations.length+' violations; overflow='+overflow);
   }
   await page.setViewportSize({width:1440,height:1080});
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('.portal-sidebar'))),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.portal-sidebar').getAttribute('inert'),'');
  await page.waitForTimeout(250);
  report.keyboard.push({role,mobileMenuTrap:'Pass',escape:'Pass'});
  await page.screenshot({path:`docs/evidence/2026-10-21/context-${role}-mobile.png`,fullPage:true});
  await page.setViewportSize({width:1440,height:1080});
 }
 report.status=report.surfaces.some(s=>s.overflow||s.violations.length)?'Fail':'Pass';
 if(report.status==='Fail')process.exitCode=1;
}catch(error){report.status='Fail';report.failure=error.message;process.exitCode=1;console.error(error.message);}
finally{writeFileSync('docs/evidence/2026-10-21/context-accessibility.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
