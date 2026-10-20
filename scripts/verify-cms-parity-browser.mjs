/** Read-only verification of unsaved preview; uses the manually authenticated browser. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+(process.env.EDUCENTRE_CDP_PORT??'9333'));
const report={time:new Date().toISOString(),checks:[]};
const directory='docs/evidence/2026-10-21';mkdirSync(directory,{recursive:true});
let page;
try{
 for(const candidate of browser.contexts().flatMap(context=>context.pages())){
  if(candidate.url().startsWith('http://localhost:3000')&&await candidate.evaluate(async()=>{const response=await fetch('/api/portal/auth/session');return response.ok&&(await response.json()).data?.role==='teacher';})){page=candidate;break;}
 }
 assert.ok(page,'Existing authenticated Teacher tab required');
 await page.goto('http://localhost:3000/portal?cmsPage=home&cmsSection=833cade6-4f88-4b67-8a7b-d7160ac0f2c8&cmsForm=HOME_HERO&cmsSurface=home');
 const session=await page.evaluate(async()=>{const r=await fetch('/api/portal/auth/session');const j=await r.json();return {status:r.status,role:j.data?.role};});
 assert.equal(session.status,200,'Teacher session available');assert.equal(session.role,'teacher');
 await page.getByRole('heading',{name:'Website Studio',exact:true}).waitFor();
 const field=page.getByRole('textbox',{name:'Homepage hero Heading',exact:true});await field.waitFor({timeout:30000});
 const published=await page.evaluate(async()=>await(await fetch('/api/v1/public/site-pages/home')).json());
 const original=published.data.sections.find(s=>s.kind==='hero').heading;
 await field.fill('DEMO unsaved parity preview');
 const canvas=page.frameLocator('iframe[title="Actual website draft preview"]');
 await canvas.getByRole('heading',{name:'DEMO unsaved parity preview',exact:true}).waitFor({timeout:30000});
 report.checks.push('Unsaved grouped Hero field renders through actual homepage presentation');
 assert.equal(await page.getByRole('button',{name:'Publish page ↗',exact:true}).isDisabled(),true);
 report.checks.push('Unsaved content cannot publish');
 const after=await page.evaluate(async()=>await(await fetch('/api/v1/public/site-pages/home')).json());
 assert.equal(after.data.sections.find(s=>s.kind==='hero').heading,original);
 report.checks.push('Published homepage unchanged by unsaved preview');
 await page.getByRole('button',{name:'Reload preview',exact:true}).click();
 await canvas.getByRole('heading',{name:'DEMO unsaved parity preview',exact:true}).waitFor({timeout:30000});
 report.checks.push('Reloaded iframe receives the latest unsaved draft');
 await page.getByLabel('Preview viewport',{exact:true}).selectOption('1440');
 assert.equal(await page.locator('iframe').evaluate(node=>node.style.width),'1440px');
 report.checks.push('Desktop viewport uses 1440px presentation');
 await page.screenshot({path:directory+'/cms-shared-preview.png',fullPage:true});
 await page.getByRole('button',{name:'Classroom benefits',exact:true}).click();
 await page.getByLabel('Heading',{exact:true}).filter({visible:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('input[value="What matters in the classroom"]'));
 report.checks.push('Classroom benefits opens the actual shared About cards');
 await page.getByRole('button',{name:'Courses',exact:true}).click();
 await page.getByRole('heading',{name:'Course catalog',exact:true}).waitFor();
 report.checks.push('Shared Courses opens catalog fields rather than homepage selection fields');
 report.status='Pass';console.log(JSON.stringify(report));
}catch(error){report.status='Fail';report.failure=error.message;process.exitCode=1;console.error(error.message);}
finally{writeFileSync(directory+'/cms-parity-browser.json',JSON.stringify(report,null,2)+'\n');if(page)await page.goto('http://localhost:3000/portal');await browser.close();}
