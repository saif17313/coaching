import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const tb=await chromium.connectOverCDP('http://127.0.0.1:9333'),sb=await chromium.connectOverCDP('http://127.0.0.1:9334');
async function find(b,role){for(const p of b.contexts().flatMap(c=>c.pages()))if(p.url().startsWith('http://localhost:3000')&&await p.evaluate(async role=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role===role;},role))return p;throw Error(role+' session required');}
const teacher=await find(tb,'teacher'),student=await find(sb,'student');
const anonContext=await tb.newContext(),anon=await anonContext.newPage();await anon.goto('http://localhost:3000/');
const academic=JSON.parse(readFileSync('docs/evidence/2026-10-20/student-browser.json')).records,finance=JSON.parse(readFileSync('docs/evidence/2026-10-20/finance-browser.json')).records;
const media=JSON.parse(readFileSync('docs/evidence/2026-10-20/cms-media-browser.json')),activation=JSON.parse(readFileSync('docs/evidence/2026-10-20/student-activation-browser.json'));
const bindings={...academic,...finance,pageId:media.testPage.id,slug:'home',sectionId:media.sectionId,itemId:media.itemId,mediaId:media.mediaId,enrollmentId:activation.enrollmentId,examId:JSON.parse(readFileSync('docs/evidence/2026-10-20/exam-results-browser.json')).records.examId};
bindings.materialId=JSON.parse(readFileSync('docs/evidence/2026-10-20/materials-download-browser.json')).records.materialId;
const notification=await student.evaluate(async()=>{const r=await fetch('/api/v1/student/notifications');return (await r.json()).data?.items?.[0]?.id;});bindings.notificationId=notification;
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(join(dir,x.name)):[join(dir,x.name)]);}
const routes=files('src/app/api/v1').filter(f=>f.endsWith('route.ts')&&/export\s+(?:async\s+function|function|const)\s+GET\b/.test(readFileSync(f,'utf8'))).map(f=>'/api/v1/'+relative('src/app/api/v1',f).replaceAll('\\','/').replace(/\/route\.ts$/,''));
const previous=process.env.EDUCENTRE_RESUME_READ_AUDIT==='1'?JSON.parse(readFileSync('docs/evidence/2026-10-20/read-permissions-browser.json')):null;
const report={time:new Date().toISOString(),project:'rkpwqgwceekuvlizfpeb',definition:'Actual GET requests with real Teacher and Student sessions, plus a fresh anonymous context. Results are HTTP evidence, not certification of every business workflow.',routes:[]};
async function get(page,path){return page.evaluate(async path=>{try{const r=await fetch(path,{cache:'no-store'});const type=r.headers.get('content-type');let value;if(type?.includes('json'))value=await r.json();else await r.arrayBuffer();return {status:r.status,code:value?.error?.code??null,itemCount:Array.isArray(value?.data?.items)?value.data.items.length:null};}catch{return {status:null,code:'NETWORK_UNAVAILABLE'};}},path);}
try{
 for(const template of routes){
  const prior=previous?.routes.find(x=>x.template===template);
  if(prior?.status==='Pass'&&prior.teacher?.status!==401){report.routes.push(prior);continue;}
  let unresolved=false;let path=template.replace(/\[([^\]]+)\]/g,(_,key)=>{if(!bindings[key]){unresolved=true;return 'missing';}return bindings[key];});
  if(unresolved){report.routes.push({template,status:'Not Tested',reason:'No authorized test record for route parameter'});continue;}
  if(/\/cashflow(?:\/export)?$|\/expenses(?:\/export)?$/.test(path))path+='?period=2026-10';
  else if(/\/finance-report$/.test(path))path+='?billPeriod=2026-10';
  else if(/\/billing(?:\/export)?$/.test(path))path+='?billPeriod=2026-10';
  else if(path.endsWith('/calendar'))path+='?from=2026-10-01&to=2026-10-31';
  const [t,s,a]=await Promise.all([get(teacher,path),get(student,path),get(anon,path)]);
  const boundary=template.startsWith('/api/v1/teacher/')?'teacher':template.startsWith('/api/v1/student/')?'student':'public';
  const isolated=boundary==='public'?true:a.status!==200&&(boundary==='teacher'?s.status!==200:t.status!==200);
  const owner=boundary==='teacher'?t:boundary==='student'?s:a;
  const intentionallyArchivedMedia=template==='/api/v1/public/media/[mediaId]'&&a.status===404;
  const intentionallyArchivedMaterial=/\/materials\/\[materialId\]\/file$/.test(template)&&owner.status===404;
  const status=!isolated?'Fail':owner.status===200||intentionallyArchivedMedia||intentionallyArchivedMaterial?'Pass':[400,404].includes(owner.status)?'Partial':'Fail';
  report.routes.push({template,path,boundary,teacher:t,student:s,anonymous:a,roleIsolation:isolated,status,...(intentionallyArchivedMedia?{expected:'Archived test image must return 404'}:{}),...(intentionallyArchivedMaterial?{expected:'Archived DEMO PDF must return 404; published Student download is separately verified'}:{}),...(prior?{previousAttempt:{teacher:prior.teacher,student:prior.student,anonymous:prior.anonymous}}:{})});
  console.log(`${status} ${template} T:${t.status} S:${s.status} A:${a.status}`);
 }
 report.status=report.routes.some(x=>x.status==='Fail')?'Fail':report.routes.some(x=>x.status!=='Pass')?'Partial':'Pass';
}finally{writeFileSync('docs/evidence/2026-10-20/read-permissions-browser.json',JSON.stringify(report,null,2)+'\n');await anonContext.close();await tb.close();await sb.close();}
