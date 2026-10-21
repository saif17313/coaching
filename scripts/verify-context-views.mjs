import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const require=createRequire(import.meta.url),{default:AxeBuilder}=require(process.env.EDUCENTRE_AXE_MODULE);
const b=await chromium.connectOverCDP('http://localhost:9333');
const report={time:new Date().toISOString(),scans:[],checks:[]};
const owned=[];
async function scan(page,name,width){await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);const {violations}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();report.scans.push({name,width,overflow,violations:violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});console.log(name,width,'violations='+violations.length,'overflow='+overflow);}
try{
 const sessions=await verificationSessions(b),teacher=await sessions.teacher.context().newPage();owned.push(teacher);
 await teacher.goto('http://localhost:3000/portal');await teacher.getByRole('button',{name:'Teacher Portal',exact:true}).click();
 await teacher.locator('.portal-nav-scroll').getByRole('button',{name:'Students',exact:true}).click();
 await teacher.getByRole('button',{name:'View profile for DEMO Audit Student',exact:true}).click();
 await teacher.getByRole('button',{name:'Application & finances',exact:true}).click();await teacher.getByLabel('Private Teacher notes',{exact:true}).waitFor();
 for(const width of [1440,820,390])await scan(teacher,'Teacher application review',width);
 await teacher.getByRole('button',{name:'Fees & payments',exact:true}).click();await teacher.getByRole('heading',{name:'Student financial statement',exact:true}).waitFor();
 for(const width of [1440,390])await scan(teacher,'Teacher Student ledger',width);
 await teacher.getByText('Assign admission / tuition charge',{exact:true}).click();
 const select=teacher.getByLabel('Admission charge batch',{exact:true});await select.selectOption({index:1});
 await teacher.waitForFunction(()=>document.querySelector('[aria-label="Reviewed fee plan"]')?.options.length>1);
 report.checks.push('Existing reviewed fee plans load from the chosen batch');
 await teacher.setViewportSize({width:1440,height:1000});await teacher.getByRole('button',{name:'Website Admin',exact:true}).click();
 const nav=teacher.locator('.context-cms-nav');await nav.getByRole('button',{name:'Home',exact:true}).waitFor({timeout:60000});await nav.getByRole('button',{name:'Home',exact:true}).click();
 for(const width of [1440,820,390])await scan(teacher,'Focused CMS structure',width);
 await teacher.getByRole('button',{name:'Preview',exact:true}).click();await scan(teacher,'CMS mobile preview',390);
 await teacher.setViewportSize({width:1440,height:1000});await teacher.screenshot({path:'docs/evidence/2026-10-21/context-studio-desktop.png'});
 const anonymous=await b.newContext(),publicPage=await anonymous.newPage();owned.push(publicPage);
 const errors=[];publicPage.on('pageerror',error=>errors.push(error.message));
 for(const slug of ['home','about','courses','gallery','results','reviews','news-events','materials','contact','academic-calendar','class-routine','projects']){
  const response=await publicPage.goto('http://localhost:3000/'+(slug==='home'?'':'site/'+slug));assert.equal(response.status(),200);
  assert.ok(await publicPage.locator('h1').count()>=1);
  const text=await publicPage.locator('main').innerText();assert.doesNotMatch(text,/DEMO PREVIEW|Testing\.\.\.|PLACEHOLDER|DEMO REVIEW|DEMO RESULT/);
  for(const width of [1440,390])await scan(publicPage,'Public '+slug,width);
 }
 assert.deepEqual(errors,[]);await publicPage.goto('http://localhost:3000/');await publicPage.screenshot({path:'docs/evidence/2026-10-21/public-upgrade-mobile.png',fullPage:true});
 report.checks.push('All 12 public routes render without development labels or uncaught browser errors');
 report.status=report.scans.some(s=>s.overflow||s.violations.length)?'Fail':'Pass';if(report.status==='Fail')process.exitCode=1;
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{for(const page of owned)await page.close();writeFileSync('docs/evidence/2026-10-21/context-views.json',JSON.stringify(report,null,2)+'\n');await b.close();}
