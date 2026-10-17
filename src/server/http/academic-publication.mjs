/** Protected teacher publication commands: no direct client DML. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const isId=x=>typeof x==='string'&&UUID.test(x);
const deny=(status,code)=>{const err=new Error(code);err.status=status;err.code=code;throw err;};
const out=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
function tokenFrom(req){const m=/^Bearer ([^\s,]+)$/.exec(req.headers.get('authorization')??'');if(!m||m[1].length>8192||!JWT.test(m[1]))deny(401,'UNAUTHORIZED');return m[1];}
function strictActor(actor,token,role){if(!actor||actor.verified!==true||!isId(actor.userId)||actor.accessToken!==token||actor.accountStatus!=='active'||actor.role!==role)deny(403,'FORBIDDEN');}
export function teacherPublishEndpoint(kind,{verify,execute}={}){
 if(!['assignment','exam','results'].includes(kind)||typeof verify!=='function'||typeof execute!=='function')throw Error('INVALID_PUBLICATION_PORT');
 return async function POST(req,ctx={}){
  try{
   if(!(req instanceof Request)||req.method!=='POST')deny(405,'METHOD_NOT_ALLOWED');
   if(new URL(req.url).search)deny(400,'INVALID_QUERY');
   const token=tokenFrom(req),op=req.headers.get('idempotency-key');if(!isId(op))deny(400,'INVALID_IDEMPOTENCY_KEY');
   const mime=req.headers.get('content-type');if(mime!==null&&!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(mime))deny(415,'UNSUPPORTED_MEDIA_TYPE');
   const length=req.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>4))deny(413,'BODY_TOO_LARGE');
   // Explicitly refuse any data-bearing request; publication accepts no editable fields.
   const body=await req.text();if(body.length>4||body.trim()!=='')deny(400,'UNEXPECTED_BODY');
   const target=(await ctx.params)?.[kind==='assignment'?'assignmentId':'examId'];if(!isId(target))deny(400,'INVALID_RESOURCE_ID');
   strictActor(await verify(token),token,'teacher');
   const data=await execute(kind,{token,operationId:op,target});
   const cols=kind==='results'?['examId','status','publishedCount']:['id','status'];
   if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==cols.length||Object.keys(data).some(k=>!cols.includes(k))||data.status!=='published'||(kind==='results'?(data.examId!==target||!Number.isSafeInteger(data.publishedCount)||data.publishedCount<1||data.publishedCount>1000000):(data.id!==target)))deny(502,'UPSTREAM_DATA_INVALID');
   return out(200,{success:true,data});
  }catch(e){if(e?.code&&[400,401,403,405,413,415,502].includes(e.status))return out(e.status,{success:false,error:{code:e.code}});return out(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}
 };
}
export function studentPublishedResultsEndpoint({verify,read}={}){
 if(typeof verify!=='function'||typeof read!=='function')throw Error('INVALID_STUDENT_RESULTS_PORT');
 return async function GET(req){
  try{
   if(!(req instanceof Request)||req.method!=='GET')deny(405,'METHOD_NOT_ALLOWED');
   const query=new URL(req.url).searchParams;
   for(const k of query.keys())if(!['limit','offset'].includes(k)||query.getAll(k).length!==1)deny(400,'INVALID_QUERY');
   const limit=query.get('limit')??'20',offset=query.get('offset')??'0';
   if(!/^[1-9]\d*$/.test(limit)||!/^(0|[1-9]\d*)$/.test(offset)||Number(limit)>50||Number(offset)>10000)deny(400,'INVALID_QUERY');
   const token=tokenFrom(req);strictActor(await verify(token),token,'student');
   const data=await read({token,limit:Number(limit),offset:Number(offset)});
   if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==3||Object.keys(data).some(k=>!['items','limit','offset'].includes(k))||data.limit!==Number(limit)||data.offset!==Number(offset)||!Array.isArray(data.items)||data.items.length>Number(limit))deny(502,'UPSTREAM_DATA_INVALID');
   const ids=new Set();
   for(const v of data.items){
    const fields=['id','examId','batchId','examTitle','scheduledAt','marks','maxMarks','rank','status'];
    if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fields.length||Object.keys(v).some(k=>!fields.includes(k))||!isId(v.id)||!isId(v.examId)||!isId(v.batchId)||typeof v.examTitle!=='string'||v.examTitle.trim().length<2||v.examTitle.length>120||typeof v.scheduledAt!=='string'||!Number.isFinite(Date.parse(v.scheduledAt))||typeof v.marks!=='number'||!Number.isFinite(v.marks)||v.marks<0||!Number.isSafeInteger(v.maxMarks)||v.maxMarks<1||v.maxMarks>10000||v.marks>v.maxMarks||!Number.isSafeInteger(v.rank)||v.rank<1||v.rank>1000000||v.status!=='published'||ids.has(v.id))deny(502,'UPSTREAM_DATA_INVALID');
    ids.add(v.id);
   }
   return out(200,{success:true,data});
  }catch(e){if(e?.code&&[400,401,403,405,502].includes(e.status))return out(e.status,{success:false,error:{code:e.code}});return out(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}
 };
}
