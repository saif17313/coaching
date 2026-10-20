import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),require=createRequire(import.meta.url),{default:AxeBuilder}=require(process.env.EDUCENTRE_AXE_MODULE);
const tb=await chromium.connectOverCDP('http://127.0.0.1:9333'),sb=await chromium.connectOverCDP('http://127.0.0.1:9334');
async function find(b,role){for(const p of b.contexts().flatMap(c=>c.pages()))if(p.url().startsWith('http://localhost:3000')&&await p.evaluate(async role=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role===role;},role))return p;throw Error(role+' session required');}
const teacher=await find(tb,'teacher'),student=await find(sb,'student');
const report={time:new Date().toISOString(),checks:[],viewports:[]},check=(name,a,b)=>{assert.deepEqual(a,b,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
try{
 for(const [role,page] of [['teacher',teacher],['student',student]])for(const [label,width,height]of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]){
  await page.setViewportSize({width,height});check(`${role} ${label} no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();report.viewports.push({role,label,width,height,violations:result.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  await page.screenshot({path:`docs/evidence/2026-10-20/${role}-portal-${label}.png`,fullPage:true});
 }
 report.status=report.viewports.some(x=>x.violations.length)?'Partial':'Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/portal-accessibility-browser.json',JSON.stringify(report,null,2)+'\n');await tb.close();await sb.close();}
