/** Part R Teacher Academic Studio: browser-only contract. Auth stays in HttpOnly cookie. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=x=>typeof x==='string'&&UUID.test(x);
const scopes={
 subjects:id=>`/api/v1/teacher/batches/${id}/subjects`,
 syllabus:id=>`/api/v1/teacher/subjects/${id}/syllabus`,
 routine:id=>`/api/v1/teacher/batches/${id}/routine`,
 assignments:id=>`/api/v1/teacher/batches/${id}/assignments`,
 exams:id=>`/api/v1/teacher/batches/${id}/exams`,
 results:id=>`/api/v1/teacher/exams/${id}/results`
};
const commands={
 subject:{url:id=>`/api/v1/teacher/batches/${id}/subjects/create`,keys:['code','title']},
 syllabus:{url:id=>`/api/v1/teacher/subjects/${id}/syllabus/add`,keys:['title','position']},
 routine:{url:id=>`/api/v1/teacher/batches/${id}/routine-slots`,keys:['subjectId','dayOfWeek','startMinute','endMinute','room']},
 assignment:{url:id=>`/api/v1/teacher/batches/${id}/assignment-drafts`,keys:['subjectId','title','instructions','releaseAt','dueAt','maxPoints','allowResubmit']},
 exam:{url:id=>`/api/v1/teacher/batches/${id}/exam-drafts`,keys:['subjectId','title','scheduledAt','maxMarks']},
 result:{url:id=>`/api/v1/teacher/exams/${id}/results/draft`,keys:['studentId','marks']}
};
const publishing={assignment:id=>`/api/v1/teacher/assignments/${id}/publish`,exam:id=>`/api/v1/teacher/exams/${id}/publish`,results:id=>`/api/v1/teacher/exams/${id}/results/publish`};
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,min,max,ml=false)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max&&!(ml?/\x00|[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)&&!Number.isNaN(Date.parse(v));
function valid(kind,data){
 const k=commands[kind]?.keys;
 if(!k||!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==k.length||k.some(key=>!Object.hasOwn(data,key)))throw Error('Please complete every required field.');
 if(kind==='subject'&&(!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(data.code)||!text(data.title,2,120)))throw Error('Enter a valid uppercase subject code and title.');
 if(kind==='syllabus'&&(!text(data.title,2,160)||!int(data.position,1,10000)))throw Error('Enter a valid syllabus title and position.');
 if(kind==='routine'&&(!ID(data.subjectId)||!int(data.dayOfWeek,0,6)||!int(data.startMinute,0,1439)||!int(data.endMinute,1,1440)||data.endMinute<=data.startMinute||!text(data.room,0,100)))throw Error('Choose a subject, valid weekday and non-overlapping start/end times.');
 if(kind==='assignment'&&(!ID(data.subjectId)||!text(data.title,2,160)||!text(data.instructions,2,20000,true)||!date(data.releaseAt)||!date(data.dueAt)||Date.parse(data.dueAt)<=Date.parse(data.releaseAt)||!int(data.maxPoints,1,1000)||typeof data.allowResubmit!=='boolean'))throw Error('Check the assignment subject, instructions, dates and marks.');
 if(kind==='exam'&&(!ID(data.subjectId)||!text(data.title,2,120)||!date(data.scheduledAt)||!int(data.maxMarks,1,10000)))throw Error('Check the exam title, subject, scheduled date and marks.');
 if(kind==='result'&&(!ID(data.studentId)||typeof data.marks!=='number'||!Number.isFinite(data.marks)||data.marks<0||data.marks>10000||Math.abs(Math.round(data.marks*100)-data.marks*100)>1e-7))throw Error('Choose a student and enter a valid score (up to 2 decimals).');
 return data;
}
function safeMessage(json,status){
 const c=json?.error?.code;
 if(status===401)return 'Session expired. Please sign in again.';
 if(status===403)return 'This operation is not authorized.';
 if(status===503)return c==='MUTATIONS_DISABLED'?'This server is read-only. The reviewed write session must be enabled before saving.':'The service is temporarily unavailable. Your changes could not be confirmed; reload before retrying.';
 if(typeof c==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(c))return c.replaceAll('_',' ').toLowerCase();
 return `Request failed (HTTP ${status}).`;
}
async function transport(url,init,fetchImpl){
 const res=await fetchImpl(url,{...init,credentials:'same-origin',cache:'no-store'});
 let data=null;
 if((res.headers.get('content-type')||'').includes('application/json')){try{data=await res.json();}catch{throw Error('Unexpected response format.');}}
 if(!res.ok)throw Error(safeMessage(data,res.status));
 if(!data||data.success!==true||!Object.hasOwn(data,'data'))throw Error('Unexpected API response.');
 return data.data;
}
function receipt(uuid){if(typeof uuid!=='function')throw Error('Secure operation ID unavailable.');const id=uuid();if(!ID(id))throw Error('Invalid operation ID.');return id;}
export function academicList(scope,target,{offset=0,limit=20}={},fetchImpl=globalThis.fetch){
 if(!Object.hasOwn(scopes,scope)||!ID(target)||!int(limit,1,50)||!int(offset,0,10000))throw Error('Invalid academic filter.');
 return transport(`${scopes[scope](target)}?limit=${limit}&offset=${offset}`,{method:'GET'},fetchImpl).then(data=>{
  if(!data||!Array.isArray(data.items)||data.items.length>limit||!data.pagination||data.pagination.limit!==limit||data.pagination.offset!==offset)throw Error('Unexpected academic list.');
  const ids=new Set();for(const row of data.items){if(!row||!ID(row.id)||ids.has(row.id))throw Error('Invalid academic record.');ids.add(row.id);}
  return data;
 });
}
export function academicCommand(kind,target,input,fetchImpl=globalThis.fetch,uuid=()=>globalThis.crypto.randomUUID()){
 if(!Object.hasOwn(commands,kind)||!ID(target))throw Error('Invalid academic target.');
 const data=valid(kind,input),key=receipt(uuid);
 return transport(commands[kind].url(target),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'x-musa-ui':'1'},body:JSON.stringify(data)},fetchImpl);
}
export function academicPublish(kind,target,fetchImpl=globalThis.fetch,uuid=()=>globalThis.crypto.randomUUID()){
 if(!Object.hasOwn(publishing,kind)||!ID(target))throw Error('Invalid publication target.');
 const key=receipt(uuid);
 // Deliberately no content-type or body: the publication contract only accepts an empty request.
 return transport(publishing[kind](target),{method:'POST',headers:{'Idempotency-Key':key,'x-musa-ui':'1'}},fetchImpl);
}
export function activeBatchRoster(batchId,{offset=0}={},fetchImpl=globalThis.fetch){
 if(!ID(batchId)||!int(offset,0,10000))throw Error('Invalid batch roster.');
 return transport(`/api/v1/teacher/batches/${batchId}/roster?limit=20&offset=${offset}&status=active`,{method:'GET'},fetchImpl).then(data=>{
  if(!data||!Array.isArray(data.entries)||data.entries.length>20)throw Error('Unexpected roster.');
  const seen=new Set();return data.entries.map(entry=>{
   const student=entry?.student,enrollment=entry?.enrollment;
   if(!ID(student?.id)||!ID(enrollment?.id)||enrollment.studentId!==student.id||enrollment.batchId!==batchId||enrollment.status!=='active'||seen.has(student.id))throw Error('Invalid roster entry.');
   seen.add(student.id);return {id:student.id,name:student.fullName||student.id.slice(0,8)};
  });
 });
}
export const academicModes=Object.freeze(Object.keys(scopes));
