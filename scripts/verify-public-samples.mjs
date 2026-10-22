import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const origin=process.env.EDUCENTRE_VERIFY_ORIGIN??'https://educentre-iota.vercel.app';
assert.ok(['https://educentre-iota.vercel.app','http://localhost:3000'].includes(origin));
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
const report={origin,checkedAt:new Date().toISOString(),pages:[],status:'Pending'};
try{
 const seed=JSON.parse(await (await import('node:fs/promises')).readFile('docs/evidence/2026-10-22/public-sample-seed.json','utf8'));
 for(const row of seed.pages){const path=row.slug==='home'?'/':'/site/'+row.slug;await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('h1').waitFor();
  const response=await page.request.get(origin+'/api/v1/public/site-pages/'+row.slug);assert.equal(response.status(),200);const payload=(await response.json()).data,items=payload.sections.flatMap(s=>s.items).filter(i=>i.title.startsWith('[SAMPLE] '));assert.equal(items.length,row.sampleCards);assert.ok(items.every(i=>i.mediaId&&i.description.startsWith('Illustrative sample')));
  for(const width of [375,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Overflow '+path);assert.ok(await page.locator('.tale-card, .tale-info-rows article, .tale-carousel-card').count()>0,'No content cards '+path);}
  if(['gallery','news-events','reviews','results'].includes(row.slug)){const images=page.locator('.tale-card-media img');assert.equal(await images.count(),row.sampleCards);for(const image of await images.all()){await image.scrollIntoViewIfNeeded();await image.evaluate(img=>img.decode());assert.ok(await image.evaluate(img=>img.naturalWidth>0));}await page.screenshot({path:'docs/evidence/2026-10-22/sample-'+row.slug+'.png',fullPage:true});}
  if(row.slug==='results')await page.getByRole('heading',{name:'Sample success stories',exact:true}).waitFor();report.pages.push({slug:row.slug,sampleCards:row.sampleCards,status:'Pass'});console.log('PASS '+row.slug);
 }
 report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;process.exitCode=1;console.error(error.message);}finally{writeFileSync('docs/evidence/2026-10-22/public-samples-'+(origin.includes('localhost')?'local':'live')+'.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
