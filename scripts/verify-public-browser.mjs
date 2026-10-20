import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const {default:AxeBuilder}=require(process.env.EDUCENTRE_AXE_MODULE);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const report={time:new Date().toISOString(),checks:[],viewports:[],errors:[]};
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
let page;
try{
 page=await browser.contexts()[0].newPage();page.on('pageerror',e=>report.errors.push(e.message));
 for(const [label,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.goto('http://localhost:3000/',{waitUntil:'networkidle'});
  check(`${label} public page has main heading`,await page.locator('h1').count(),1);
  check(`${label} no horizontal page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  report.viewports.push({label,width,height,violations:results.violations.map(x=>({id:x.id,impact:x.impact,description:x.description,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  await page.screenshot({path:`docs/evidence/2026-10-20/public-${label}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://localhost:3000/',{waitUntil:'networkidle'});
 await page.locator('.tale-scientific-scene canvas').waitFor({state:'attached',timeout:15000});
 check('Three.js renders real GPU canvas',await page.locator('.tale-scientific-scene canvas').count(),1);
 const model=page.locator('.tale-scientific-scene');await model.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
 check('molecular scene keyboard focus',await model.evaluate(el=>el===document.activeElement),true);
 const carousel=page.getByRole('region',{name:'Published courses and batches'});
 if(await carousel.count()){
  const before=await carousel.locator('.tale-carousel-controls span').innerText();await carousel.getByRole('button',{name:'Next batch',exact:true}).click();
  check('course carousel advances',await carousel.locator('.tale-carousel-controls span').innerText()!==before,true);
  await carousel.getByRole('button',{name:'Pause automatic rotation',exact:true}).click();
  check('course autoplay pause control is explicit',await carousel.getByRole('button',{name:'Resume automatic rotation',exact:true}).getAttribute('aria-pressed'),'true');
  await carousel.locator('.tale-carousel-card.is-current').getByRole('button').click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  check('course dialog receives keyboard focus',await dialog.evaluate(el=>el.contains(document.activeElement)),true);
  for(let i=0;i<5;i++)await page.keyboard.press('Tab');
  check('course dialog contains tab focus',await dialog.evaluate(el=>el.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');check('Escape closes course details',await dialog.count(),0);
  await carousel.locator('.tale-carousel-stage').scrollIntoViewIfNeeded();
  const box=await carousel.locator('.tale-carousel-stage').boundingBox(),touch=await page.context().newCDPSession(page);
  const prior=await carousel.locator('.tale-carousel-controls span').innerText();
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.6,y:box.y+box.height*.4}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.3,y:box.y+box.height*.4}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('native touch swipe advances course carousel',await carousel.locator('.tale-carousel-controls span').innerText()!==prior,true);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload({waitUntil:'networkidle'});
 check('reduced motion omits GPU scene',await page.locator('.tale-scientific-scene canvas').count(),0);
 await page.goto('http://localhost:3000/portal/accept-invite#access_token=invalid.invalid.invalid&refresh_token=invalid',{waitUntil:'networkidle'});
 check('invitation fragment erased from address bar',new URL(page.url()).hash,'');
 check('invitation form survives React Strict Mode',await page.getByLabel('New password',{exact:true}).count(),1);
 check('no uncaught public JavaScript errors',report.errors,[]);
 report.status=report.viewports.some(x=>x.violations.length)?'Partial':'Pass';
 try{await page.goto('https://www.shifatstales.com/',{waitUntil:'domcontentloaded',timeout:30000});await page.screenshot({path:'docs/evidence/2026-10-20/reference-live.png',fullPage:true});report.reference={status:'Captured',title:await page.title()};}catch(e){report.reference={status:'Unavailable',reason:e.message.split('\n')[0]};}
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/public-browser.json',JSON.stringify(report,null,2)+'\n');if(page)await page.close();await browser.close();}
