import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const report={time:new Date().toISOString(),scope:'Archive this audit\'s exact CMS fixtures only; keep private objects and audit records',checks:[]};
try{
 let page;for(const p of browser.contexts().flatMap(c=>c.pages()))if(p.url().startsWith('http://localhost:3000')&&await p.evaluate(async()=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role==='teacher';})){page=p;break;}if(!page)throw Error('Teacher session required');
 const api=(path,body)=>page.evaluate(async({path,body})=>{const r=await fetch(path,{method:body?'POST':'GET',cache:'no-store',...(body?{headers:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};},{path,body});
 const pages=await api('/api/v1/teacher/website/pages');assert.equal(pages.status,200);
 for(const item of pages.body.data.items.filter(x=>/^demo-(?:audit|portfolio)-/.test(x.slug)&&/^DEMO (?:CMS audit|portfolio field verification)/.test(x.title)&&x.status!=='archived')){const root='/api/v1/teacher/website/pages/'+item.id,detail=await api(root);assert.equal(detail.status,200);const archived=await api(root+'/archive',{expectedRevision:detail.body.data.draftRevision});assert.equal(archived.status,200);assert.equal((await api('/api/v1/public/site-pages/'+item.slug)).status,404);report.checks.push({id:item.id,slug:item.slug,action:'archive',status:'Pass'});console.log('PASS archive '+item.slug);}
 const id='c14c4c88-ca6b-40f8-b0f7-98fe6f2b583b';const media=await api('/api/v1/teacher/website/media');assert.equal(media.status,200);const unused=media.body.data.items.find(x=>x.id===id);if(unused&&unused.status!=='archived'){const r=await api(`/api/v1/teacher/website/media/${id}/archive`,{});assert.equal(r.status,200);report.checks.push({id,action:'archive unused audit logo',status:'Pass'});}
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}finally{writeFileSync('docs/evidence/2026-10-20/cms-fixture-cleanup.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
