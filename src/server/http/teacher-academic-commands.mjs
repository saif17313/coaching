/** Teacher academic transaction boundary; the database RPC performs the authoritative write. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const id=x=>typeof x==='string'&&UUID.test(x);
const deny=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const exact=(v,fields)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&Object.keys(v).every(k=>fields.includes(k));
const text=(v,min,max,multiline=false)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max&&!(multiline?/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(v);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const utc=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x))?new Date(x).toISOString():null;
const response=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
function bearer(request){const auth=request.headers.get('authorization'),m=auth&&/^Bearer ([^\s,]+)$/.exec(auth);if(!m||m[1].length>8192||!JWT.test(m[1]))deny(401,'UNAUTHORIZED');return m[1];}
async function json(request){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))deny(415,'UNSUPPORTED_MEDIA_TYPE');
 const length=request.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>32768))deny(413,'BODY_TOO_LARGE');
 if(!request.body)deny(400,'INVALID_BODY');
 const reader=request.body.getReader(),chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>32768)deny(413,'BODY_TOO_LARGE');chunks.push(value);}}finally{reader.releaseLock();}
 try{const bytes=new Uint8Array(total);let cursor=0;for(const part of chunks){bytes.set(part,cursor);cursor+=part.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{deny(400,'INVALID_JSON');}
}
const schema={
 'subject-create':{target:'batchId',fields:['code','title'],out:['id','batchId','code','title']},
 'syllabus-add':{target:'subjectId',fields:['title','position'],out:['id','subjectId','title','position']},
 'routine-create':{target:'batchId',fields:['subjectId','dayOfWeek','startMinute','endMinute','room'],out:['id','batchId','subjectId','dayOfWeek','startMinute','endMinute','room','status']},
 'assignment-draft':{target:'batchId',fields:['subjectId','title','instructions','releaseAt','dueAt','maxPoints','allowResubmit'],out:['id','batchId','subjectId','title','status']},
 'exam-draft':{target:'batchId',fields:['subjectId','title','scheduledAt','maxMarks'],out:['id','batchId','subjectId','title','status']},
 'result-draft':{target:'examId',fields:['studentId','marks'],out:['id','examId','studentId','marks','resultStatus']}
};
function validate(kind,body){
 const s=schema[kind];if(!s||!exact(body,s.fields))deny(400,'INVALID_COMMAND');
 if(kind==='subject-create'){
  if(!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(body.code??'')||!text(body.title,2,120))deny(400,'INVALID_COMMAND');return {code:body.code,title:body.title.trim()};
 }
 if(kind==='syllabus-add'){
  if(!text(body.title,2,160)||!integer(body.position,1,10000))deny(400,'INVALID_COMMAND');return {title:body.title.trim(),position:body.position};
 }
 if(kind==='routine-create'){
  if(!id(body.subjectId)||!integer(body.dayOfWeek,0,6)||!integer(body.startMinute,0,1439)||!integer(body.endMinute,1,1440)||body.endMinute<=body.startMinute||typeof body.room!=='string'||body.room.length>100||/[\x00-\x1f\x7f]/.test(body.room))deny(400,'INVALID_COMMAND');
  return {...body,room:body.room.trim()};
 }
 if(kind==='assignment-draft'){
  const release=utc(body.releaseAt),due=utc(body.dueAt);
  if(!id(body.subjectId)||!text(body.title,2,160)||!text(body.instructions,2,20000,true)||!release||!due||Date.parse(due)<=Date.parse(release)||!integer(body.maxPoints,1,1000)||typeof body.allowResubmit!=='boolean')deny(400,'INVALID_COMMAND');
  return {...body,title:body.title.trim(),instructions:body.instructions.trim(),releaseAt:release,dueAt:due};
 }
 if(kind==='exam-draft'){
  const when=utc(body.scheduledAt);
  if(!id(body.subjectId)||!text(body.title,2,120)||!when||!integer(body.maxMarks,1,10000))deny(400,'INVALID_COMMAND');
  return {...body,title:body.title.trim(),scheduledAt:when};
 }
 if(!id(body.studentId)||typeof body.marks!=='number'||!Number.isFinite(body.marks)||body.marks<0||body.marks>10000||Math.abs(body.marks*100-Math.round(body.marks*100))>1e-7)deny(400,'INVALID_COMMAND');
 return {studentId:body.studentId,marks:Math.round(body.marks*100)/100};
}
function validateResult(kind,v,target,data){
 const s=schema[kind];if(!exact(v,s.out)||!id(v.id))deny(502,'UPSTREAM_DATA_INVALID');
 if(kind==='subject-create'&&(v.batchId!==target||v.code!==data.code||v.title!==data.title))deny(502,'UPSTREAM_DATA_INVALID');
 if(kind==='syllabus-add'&&(v.subjectId!==target||v.title!==data.title||v.position!==data.position))deny(502,'UPSTREAM_DATA_INVALID');
 if(kind==='routine-create'&&(v.batchId!==target||v.subjectId!==data.subjectId||v.dayOfWeek!==data.dayOfWeek||v.startMinute!==data.startMinute||v.endMinute!==data.endMinute||v.room!==data.room||v.status!=='active'))deny(502,'UPSTREAM_DATA_INVALID');
 if((kind==='assignment-draft'||kind==='exam-draft')&&(v.batchId!==target||v.subjectId!==data.subjectId||v.title!==data.title||v.status!=='draft'))deny(502,'UPSTREAM_DATA_INVALID');
 if(kind==='result-draft'&&(v.examId!==target||v.studentId!==data.studentId||typeof v.marks!=='number'||v.marks!==data.marks||v.resultStatus!=='draft'))deny(502,'UPSTREAM_DATA_INVALID');
 return v;
}
export function createAcademicCommand(kind,{verify,execute}={}){
 if(!schema[kind]||typeof verify!=='function'||typeof execute!=='function')throw Error('INVALID_PORT');
 return async function POST(request,ctx={}){
  try{
   if(!(request instanceof Request)||request.method!=='POST')deny(405,'METHOD_NOT_ALLOWED');
   if(new URL(request.url).search)deny(400,'INVALID_QUERY');
   const token=bearer(request),op=request.headers.get('idempotency-key');if(!id(op))deny(400,'INVALID_IDEMPOTENCY_KEY');
   const data=validate(kind,await json(request));
   const target=(await ctx.params)?.[schema[kind].target];if(!id(target))deny(400,'INVALID_RESOURCE_ID');
   const actor=await verify(token);if(!actor||actor.verified!==true||!id(actor.userId)||actor.role!=='teacher'||actor.accountStatus!=='active'||actor.accessToken!==token)deny(403,'FORBIDDEN');
   const result=await execute(kind,{token,operationId:op,target,data:Object.freeze(data),actorId:actor.userId});
   return response(201,{success:true,data:validateResult(kind,result,target,data)});
  }catch(e){if([400,401,403,405,413,415,502].includes(e?.status)&&e?.code)return response(e.status,{success:false,error:{code:e.code}});return response(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}
 };
}
