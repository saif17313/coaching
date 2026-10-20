/** Part O client request contract. Browser cookie is injected only by the existing Next proxy. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES=['pending','active','disabled','rejected'];
const ENROLLMENT_STATUSES=['pending','active','rejected','cancelled'];
const readRoots={students:'/api/v1/teacher/students/directory',batches:'/api/v1/teacher/batches',enrollments:'/api/v1/teacher/enrollments'};
const schemas={
 createBatch:{method:'POST',path:()=>'/api/v1/teacher/batch-commands',fields:['code','name','capacity']},
 updateBatch:{method:'PATCH',path:id=>`/api/v1/teacher/batch-commands/${id}`,fields:['name','capacity','isArchived']},
 renameStudent:{method:'PATCH',path:id=>`/api/v1/teacher/students/${id}/profile`,fields:['fullName']},
 changeStudentStatus:{method:'PATCH',path:id=>`/api/v1/teacher/students/${id}/status`,fields:['status']},
 requestEnrollment:{method:'POST',path:()=>'/api/v1/teacher/enrollment-requests',fields:['studentId','batchId']},
 decideEnrollment:{method:'POST',path:id=>`/api/v1/teacher/enrollments/${id}/decision`,fields:['decision']},
};
const validId=x=>typeof x==='string'&&UUID.test(x);
function exactKeys(value,fields,exact=false){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const keys=Object.keys(value);
 return keys.length>0&&(!exact||keys.length===fields.length)&&keys.every(k=>fields.includes(k))&&(!exact||fields.every(k=>keys.includes(k)));
}
function validate(kind,input){
 const schema=schemas[kind];if(!schema||!exactKeys(input,schema.fields,kind!=='updateBatch'))throw Error('Invalid form fields.');
 const name=v=>typeof v==='string'&&v.trim().length>=2&&v.trim().length<=120&&!/[\x00-\x1f\x7f]/.test(v);
 const cap=v=>Number.isSafeInteger(v)&&v>=1&&v<=100000;
 if(kind==='createBatch'&&(!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(input.code)||!name(input.name)||!cap(input.capacity)))throw Error('Use a valid batch code, name and capacity.');
 if(kind==='updateBatch'&&(('name'in input&&!name(input.name))||('capacity'in input&&!cap(input.capacity))||('isArchived'in input&&typeof input.isArchived!=='boolean')))throw Error('Invalid batch update.');
 if(kind==='renameStudent'&&(typeof input.fullName!=='string'||input.fullName.trim().length<2||input.fullName.trim().length>160||/[\x00-\x1f\x7f]/.test(input.fullName)))throw Error('Enter a valid student name.');
 if(kind==='changeStudentStatus'&&!['active','disabled','rejected'].includes(input.status))throw Error('Invalid account status.');
 if(kind==='requestEnrollment'&&(!validId(input.studentId)||!validId(input.batchId)))throw Error('Choose a student and batch.');
 if(kind==='decideEnrollment'&&!['approve','reject','cancel'].includes(input.decision))throw Error('Invalid enrollment decision.');
 return kind==='createBatch'||kind==='updateBatch'?{...input,...(typeof input.name==='string'?{name:input.name.trim()}: {})}:kind==='renameStudent'?{fullName:input.fullName.trim()}:input;
}
function queryString(scope,offset,filter){
 if(!Object.hasOwn(readRoots,scope)||!Number.isSafeInteger(offset)||offset<0||offset>10000||offset%20)throw Error('Invalid list pagination.');
 const params=new URLSearchParams({limit:'20',offset:String(offset)});
 if(filter!==undefined&&filter!==''){
  if(scope==='batches'||!(scope==='students'?STATUSES:ENROLLMENT_STATUSES).includes(filter))throw Error('Invalid status filter.');
  params.set(scope==='students'?'accountStatus':'status',filter);
 }
 return `${readRoots[scope]}?${params}`;
}
function message(result,status){
 const code=result?.error?.code;
 if(status===401)return 'Your session expired. Sign in again.';
 if(status===403)return 'Permission denied. Check teacher account and CSRF origin.';
 if(status===503)return code==='MUTATIONS_DISABLED'?'This server is read-only. The reviewed write session must be enabled before saving.':'The service is temporarily unavailable. Your changes could not be confirmed; reload before retrying.';
 if(typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,80}$/.test(code))return code.toLowerCase().replaceAll('_',' ');
 return `Operation failed (HTTP ${status}).`;
}
async function transport(path,init,fetchImpl){
 const response=await fetchImpl(path,{...init,cache:'no-store',credentials:'same-origin'});
 const type=response.headers.get('content-type')||'';
 let json=null;
 if(type.includes('application/json')){try{json=await response.json();}catch{throw Error('Invalid server response.');}}
 if(!response.ok)throw Error(message(json,response.status));
 if(!json||json.success!==true||!Object.hasOwn(json,'data'))throw Error('Unexpected server response.');
 return json.data;
}
export function readTeacherList(scope,{offset=0,filter=''}={},fetchImpl=globalThis.fetch){
 return transport(queryString(scope,offset,filter),{method:'GET'},fetchImpl);
}
export function teacherCommand(kind,{id=null,input},fetchImpl=globalThis.fetch,uuid=globalThis.crypto?.randomUUID?.bind(globalThis.crypto)){
 const schema=schemas[kind];if(!schema)throw Error('Unknown teacher action.');
 if(schema.path.length===1&&!validId(id))throw Error('Invalid target ID.');
 const data=validate(kind,input);
 if(typeof uuid!=='function')throw Error('Secure request ID unavailable.');
 const key=uuid();if(!validId(key))throw Error('Invalid request ID.');
 return transport(schema.path(id),{method:schema.method,headers:{'Content-Type':'application/json','Idempotency-Key':key,'x-musa-ui':'1'},body:JSON.stringify(data)},fetchImpl);
}
export function normalizeTeacherList(scope,data){
 let items;
 if(scope==='students')items=data?.students;
 else if(scope==='batches')items=Array.isArray(data)?data:data?.items;
 else if(scope==='enrollments')items=Array.isArray(data)?data:data?.items;
 else throw Error('Unsupported management list.');
 if(!Array.isArray(items)||items.length>20)throw Error('Unexpected list response.');
 const mapped=items.map(row=>{
  if(!row||typeof row!=='object'||!validId(row.id))throw Error('Unexpected list record.');
  if(scope==='students'){
   if(typeof row.fullName!=='string'||!STATUSES.includes(row.accountStatus))throw Error('Invalid student record.');
   return {id:row.id,name:row.fullName,status:row.accountStatus};
  }
  if(scope==='batches'){
   const code=row.code,name=row.name,capacity=row.capacity,archived=row.is_archived??row.isArchived;
   if(typeof code!=='string'||typeof name!=='string'||!Number.isSafeInteger(capacity)||capacity<1||typeof archived!=='boolean')throw Error('Invalid batch record.');
   return {id:row.id,code,name,capacity,archived};
  }
  const studentId=row.student_id??row.studentId,batchId=row.batch_id??row.batchId;
  if(!validId(studentId)||!validId(batchId)||!ENROLLMENT_STATUSES.includes(row.status))throw Error('Invalid enrollment record.');
  return {id:row.id,studentId,batchId,status:row.status};
 });
 if(new Set(mapped.map(x=>x.id)).size!==mapped.length)throw Error('Duplicate list records.');
 return mapped;
}
