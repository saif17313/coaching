/** Part T student experience contracts. Trust the server's signed cookie / JWT gateway, not browser claims. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=x=>typeof x==='string'&&UUID.test(x);
const num=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const period=x=>typeof x==='string'&&/^(20\d{2})-(0[1-9]|1[0-2])$/.test(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const specs=Object.freeze({
 dashboard:{path:()=>'/api/v1/student/dashboard',shape:'object'},
 batches:{path:()=>'/api/v1/student/batches',shape:'array',paged:true},
 subjects:{path:x=>`/api/v1/student/batches/${x}/subjects`,shape:'list',target:true,paged:true},
 syllabus:{path:x=>`/api/v1/student/subjects/${x}/syllabus`,shape:'list',target:true,paged:true},
 routine:{path:x=>`/api/v1/student/batches/${x}/routine`,shape:'list',target:true,paged:true},
 assignments:{path:x=>`/api/v1/student/batches/${x}/assignments`,shape:'list',target:true,paged:true},
 assignment:{path:x=>`/api/v1/student/assignments/${x}`,shape:'object',target:true},
 ownSubmission:{path:x=>`/api/v1/student/assignments/${x}/submission`,shape:'nullable',target:true},
 exams:{path:x=>`/api/v1/student/batches/${x}/exams`,shape:'list',target:true,paged:true},
 exam:{path:x=>`/api/v1/student/exams/${x}`,shape:'object',target:true},
 materials:{path:x=>`/api/v1/student/batches/${x}/materials`,shape:'list',target:true,paged:true},
 announcements:{path:x=>`/api/v1/student/batches/${x}/announcements`,shape:'list',target:true,paged:true},
 notifications:{path:()=>'/api/v1/student/notifications',shape:'list',paged:true},
 unread:{path:()=>'/api/v1/student/notifications/unread-count',shape:'object'},
 results:{path:()=>'/api/v1/student/results',shape:'list',paged:true},
 progress:{path:()=>'/api/v1/student/progress',shape:'object'},
 billing:{path:()=>'/api/v1/student/billing',shape:'object',period:true},
 dues:{path:()=>'/api/v1/student/dues',shape:'list',paged:true},
 payments:{path:()=>'/api/v1/student/payments',shape:'list',paged:true},
 profile:{path:()=>'/api/v1/student/profile',shape:'object'},
 calendar:{path:()=>'/api/v1/student/calendar',shape:'list',calendar:true},
});
function problem(response,status){
 const code=response?.error?.code;
 if(status===401)return 'Session expired. Sign in again.';
 if(status===403)return 'This account cannot access the requested record.';
 if(status===404)return 'The record is unavailable for your account.';
 if(status===503)return code==='MUTATIONS_DISABLED'?'This server is read-only. The reviewed write session must be enabled before saving.':'The service is temporarily unavailable. Your changes could not be confirmed; reload before retrying.';
 return typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(code)?code.replaceAll('_',' ').toLowerCase():`Request failed (HTTP ${status}).`;
}
async function transfer(url,init,fetchImpl){
 const res=await fetchImpl(url,{...init,credentials:'same-origin',cache:'no-store'});
 let body=null;
 if((res.headers.get('content-type')||'').includes('application/json')){try{body=await res.json();}catch{throw Error('Invalid server response.');}}
 if(!res.ok)throw Error(problem(body,res.status));
 if(!body||body.success!==true||!Object.hasOwn(body,'data'))throw Error('Unexpected response from the student service.');
 return body.data;
}
export function studentRead(kind,target='',{offset=0,limit=20,billPeriod,from,to}={},fetchImpl=globalThis.fetch){
 const spec=specs[kind];
 if(!spec||spec.target&&!id(target)||!num(offset,0,10000)||!num(limit,1,20))throw Error('Invalid student request.');
 if(spec.period&&!period(billPeriod))throw Error('Choose a valid billing month.');
 if(spec.calendar&&(!date(from)||!date(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>31))throw Error('Choose a date range of 32 days or less.');
 let url=spec.path(target);
 if(spec.paged)url+=`?limit=${limit}&offset=${offset}`;
 if(spec.period)url+=`?billPeriod=${encodeURIComponent(billPeriod)}`;
 if(spec.calendar)url+=`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
 return transfer(url,{method:'GET'},fetchImpl).then(data=>{
  if(spec.shape==='nullable'&&data===null)return null;
  if(spec.shape==='array'){
   if(!Array.isArray(data)||data.length>limit||data.some(row=>!row||!id(row.id)||typeof row.is_archived!=='boolean'||!id(row.enrollment_id)))throw Error('Unexpected batch membership data.');
   const unique=new Set(data.map(r=>r.id));if(unique.size!==data.length)throw Error('Duplicated batch membership.');
   return data;
  }
  if(spec.shape==='list'){
   if(!data||!Array.isArray(data.items)||data.items.length>(spec.paged?limit:100))throw Error('Unexpected student list.');
   const seen=new Set();for(const row of data.items){if(!row||!id(row.id)||seen.has(row.id))throw Error('Unexpected student record.');seen.add(row.id);
    if(spec.target&&['subjects','routine','assignments','exams','materials','announcements'].includes(kind)&&row.batchId!==target)throw Error('Student record belongs to another batch.');
    if(kind==='syllabus'&&row.subjectId!==target)throw Error('Syllabus record belongs to another subject.');
   }
   if(spec.paged&&data.pagination&&(data.pagination.limit!==limit||data.pagination.offset!==offset))throw Error('Unexpected list pagination.');
   if(kind==='results'&&(data.limit!==limit||data.offset!==offset))throw Error('Unexpected results pagination.');
   return data;
  }
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Unexpected student record.');
  if(spec.target&&['assignment','exam'].includes(kind)&&data.id!==target)throw Error('Record identity mismatch.');
  if(kind==='ownSubmission'&&(data.assignmentId!==target||!id(data.id)||!id(data.studentId)))throw Error('Invalid submission ownership.');
  return data;
 });
}
export function studentCommand(kind,target,body,fetchImpl=globalThis.fetch,uuid=()=>globalThis.crypto.randomUUID()){
 if(!['submit','notificationRead','profile'].includes(kind))throw Error('Unknown student command.');
 if(kind!=='profile'&&!id(target))throw Error('Invalid command target.');
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid command data.');
 let url,method='POST',data;
 if(kind==='submit'){
  if(Object.keys(body).length!==1||!Object.hasOwn(body,'answerText')||typeof body.answerText!=='string'||body.answerText.trim().length<1||body.answerText.trim().length>20000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.answerText))throw Error('Answer must contain 1–20,000 characters.');
  data={answerText:body.answerText.trim()};url=`/api/v1/student/assignments/${target}/submit`;
 }else if(kind==='notificationRead'){
  if(Object.keys(body).length!==0)throw Error('Mark-as-read does not accept editable fields.');data={};url=`/api/v1/student/notifications/${target}/read`;
 }else{
  if(Object.keys(body).length!==1||!Object.hasOwn(body,'fullName')||typeof body.fullName!=='string'||body.fullName.trim().length<2||body.fullName.trim().length>160||/[\x00-\x1f\x7f]/.test(body.fullName))throw Error('Enter your full name (2–160 characters).');
  data={fullName:body.fullName.trim()};url='/api/v1/student/profile/update';method='PATCH';
 }
 const operation=uuid();if(!id(operation))throw Error('Secure operation ID unavailable.');
 return transfer(url,{method,headers:{'x-musa-ui':'1','Idempotency-Key':operation,'Content-Type':'application/json'},body:JSON.stringify(data)},fetchImpl).then(result=>{
  if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Unexpected operation confirmation.');
  if(kind==='submit'&&(result.assignmentId!==target||!id(result.id)||typeof result.resubmitted!=='boolean'))throw Error('Submission identity mismatch.');
  if(kind==='notificationRead'&&result.id!==target)throw Error('Notification identity mismatch.');
  if(kind==='profile'&&result.fullName!==data.fullName)throw Error('Profile confirmation mismatch.');
  return result;
 });
}
export function studentBillingCsv(periodValue){if(!period(periodValue))throw Error('Invalid billing month.');return `/api/v1/student/billing/export?billPeriod=${encodeURIComponent(periodValue)}`;}
export const studentModes=Object.freeze(Object.keys(specs));
