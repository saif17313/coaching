import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),require=createRequire(import.meta.url),{default:AxeBuilder}=require(process.env.EDUCENTRE_AXE_MODULE);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const report={time:new Date().toISOString(),viewports:[]};
try{
 for(const role of ['teacher','student']){
  let page;for(const candidate of browser.contexts().flatMap(context=>context.pages()))if(candidate.url().startsWith('http://localhost:3000')&&await candidate.evaluate(async role=>{const response=await fetch('/api/portal/auth/session');return response.ok&&(await response.json()).data?.role===role;},role)){page=candidate;break;}
  assert.ok(page,role+' session');
  const profile=page.getByRole('region',{name:role==='teacher'?'Student admission and full profile':'Your admission and profile',exact:true});await profile.getByRole('button',{name:'Reload profile',exact:true}).click();await profile.getByRole('button',{name:'Save profile',exact:true}).waitFor();
  if(role==='teacher'){
   await profile.getByRole('button',{name:'Assign another batch',exact:true}).click();
   const modal=page.getByRole('dialog');await modal.getByLabel('Active student',{exact:true}).waitFor();assert.equal(await modal.getByLabel('Active student',{exact:true}).inputValue(),'e6b148e2-dfe4-4f3a-8b35-6046e2fa57de');await modal.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  for(const [label,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]){
   await page.setViewportSize({width,height});await profile.scrollIntoViewIfNeeded();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,role+' '+label+' horizontal overflow');
   const results=await new AxeBuilder({page}).include('.admission-profile').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   report.viewports.push({role,label,overflow,violations:results.violations.map(value=>({id:value.id,impact:value.impact,nodes:value.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}))});
   await page.screenshot({path:`docs/evidence/2026-10-21/admission-${role}-${label}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});
 }
 report.status=report.viewports.some(view=>view.violations.length)?'Partial':'Pass';console.log(JSON.stringify(report));
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-21/admission-accessibility.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
