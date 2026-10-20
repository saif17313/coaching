import {RpcError} from './rpc-errors.mjs';
/** Student assignment and notification workflows; no direct student submission-table read. */
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const kinds=Object.freeze({
 submit:{method:'POST',role:'student',param:'assignmentId',fields:['answerText'],out:['id','assignmentId','studentId','submittedAt','resubmitted']},
 ownSubmission:{method:'GET',role:'student',param:'assignmentId'},
 submissionList:{method:'GET',role:'teacher',param:'assignmentId'},
 grade:{method:'POST',role:'teacher',param:'submissionId',fields:['points','feedback'],out:['id','assignmentId','gradeStatus','points']},
 gradePublish:{method:'POST',role:'teacher',param:'assignmentId',fields:[],out:['assignmentId','publishedCount','gradesPublished']},
 notificationRead:{method:'POST',role:'student',param:'notificationId',fields:[],out:['id','recipientId','readAt']},
 unreadCount:{method:'GET',role:'student'},
});
export const studentWorkflowKinds=Object.freeze(Object.keys(kinds));
const uuid=x=>typeof x==='string'&&ID.test(x);
const fail=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const send=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(x)&&Number.isFinite(Date.parse(x));
const bearer=req=>{const m=/^Bearer ([^\s,]+)$/.exec(req.headers.get('authorization')??'');if(!m||m[1].length>8192||!JWT.test(m[1]))fail(401,'UNAUTHORIZED');return m[1];};
async function body(req){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))fail(415,'UNSUPPORTED_MEDIA_TYPE');
 if(req.headers.has('content-length')&&(!/^\d+$/.test(req.headers.get('content-length'))||Number(req.headers.get('content-length'))>25000))fail(413,'BODY_TOO_LARGE');
 if(!req.body)fail(400,'INVALID_BODY');
 const reader=req.body.getReader();let size=0,parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>25000)fail(413,'BODY_TOO_LARGE');parts.push(value);}}finally{reader.releaseLock();}
 const buf=new Uint8Array(size);let i=0;for(const x of parts){buf.set(x,i);i+=x.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf));}catch{fail(400,'INVALID_JSON');}
}
function validateInput(kind,data){
 const cfg=kinds[kind];if(!exact(data,cfg.fields))fail(400,'INVALID_BODY');
 if(kind==='submit'){
  const s=data.answerText;
  if(typeof s!=='string'||s.trim().length<1||s.trim().length>20000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))fail(400,'INVALID_ANSWER');
  return {answerText:s.trim()};
 }
 if(kind==='grade'){
  if(!Number.isSafeInteger(data.points)||data.points<0||data.points>1000||typeof data.feedback!=='string'||data.feedback.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data.feedback))fail(400,'INVALID_GRADE');
  return {points:data.points,feedback:data.feedback.trim()};
 }
 return {};
}
function project(kind,v,target,actor){
 if(kind==='unreadCount'){
  if(!exact(v,['unreadCount'])||!Number.isSafeInteger(v.unreadCount)||v.unreadCount<0||v.unreadCount>1e8)fail(502,'UPSTREAM_DATA_INVALID');return v;
 }
 if(kind==='ownSubmission'){
  if(v===null)return null;
  if(!exact(v,['id','assignmentId','studentId','submittedAt','gradePublished','points','feedback'])||!uuid(v.id)||v.assignmentId!==target||v.studentId!==actor.userId||!iso(v.submittedAt)||typeof v.gradePublished!=='boolean'||(v.gradePublished?(!Number.isSafeInteger(v.points)||v.points<0||v.points>1000||typeof v.feedback!=='string'||v.feedback.length>2000):(v.points!==null||v.feedback!==null)))fail(502,'UPSTREAM_DATA_INVALID');return v;
 }
 if(kind==='submissionList'){
  if(!exact(v,['items'])||!Array.isArray(v.items)||v.items.length>50)fail(502,'UPSTREAM_DATA_INVALID');
  const ids=new Set();for(const item of v.items){if(!exact(item,['id','assignmentId','studentId','submittedAt','gradeStatus','points','feedback','answerText'])||!uuid(item.id)||item.assignmentId!==target||typeof item.answerText!=='string'||item.answerText.length>20000||!uuid(item.studentId)||!iso(item.submittedAt)||!['ungraded','draft','published'].includes(item.gradeStatus)||(item.gradeStatus==='ungraded'?(item.points!==null||item.feedback!==null):(!Number.isSafeInteger(item.points)||item.points<0||item.points>1000||typeof item.feedback!=='string'||item.feedback.length>2000))||ids.has(item.id))fail(502,'UPSTREAM_DATA_INVALID');ids.add(item.id);}
  return v;
 }
 const keys=kinds[kind].out;
 if(!exact(v,keys))fail(502,'UPSTREAM_DATA_INVALID');
 if(kind==='submit'&&(!uuid(v.id)||v.assignmentId!==target||v.studentId!==actor.userId||!iso(v.submittedAt)||typeof v.resubmitted!=='boolean'))fail(502,'UPSTREAM_DATA_INVALID');
 if(kind==='grade'&&(!uuid(v.id)||v.id!==target||!uuid(v.assignmentId)||v.gradeStatus!=='draft'||!Number.isSafeInteger(v.points)||v.points<0||v.points>1000))fail(502,'UPSTREAM_DATA_INVALID');
 if(kind==='gradePublish'&&(v.assignmentId!==target||!Number.isSafeInteger(v.publishedCount)||v.publishedCount<1||v.publishedCount>100000||v.gradesPublished!==true))fail(502,'UPSTREAM_DATA_INVALID');
 if(kind==='notificationRead'&&(v.id!==target||v.recipientId!==actor.userId||!iso(v.readAt)))fail(502,'UPSTREAM_DATA_INVALID');
 return v;
}
export function createStudentWorkflow(kind,{verify,execute}={}){
 const cfg=kinds[kind];if(!cfg||typeof verify!=='function'||typeof execute!=='function')throw Error('INVALID_WORKFLOW_PORT');
 return async function endpoint(req,ctx={}){
  try{
   if(!(req instanceof Request)||req.method!==cfg.method)fail(405,'METHOD_NOT_ALLOWED');
   if(new URL(req.url).search)fail(400,'INVALID_QUERY');
   const target=cfg.param?(await ctx.params)?.[cfg.param]:null;
   if(cfg.param&&!uuid(target))fail(400,'INVALID_RESOURCE_ID');
   const token=bearer(req),operationId=cfg.method==='POST'?req.headers.get('idempotency-key'):null;
   if(cfg.method==='POST'&&!uuid(operationId))fail(400,'INVALID_OPERATION_ID');
   const data=cfg.method==='POST'?validateInput(kind,await body(req)):{};
   const actor=await verify(token);
   if(!actor||actor.verified!==true||!uuid(actor.userId)||actor.role!==cfg.role||actor.accountStatus!=='active'||actor.accessToken!==token)fail(403,'FORBIDDEN');
   const raw=await execute(kind,{token,actorId:actor.userId,operationId,target,data:Object.freeze(data)});
   return send(200,{success:true,data:project(kind,raw,target,actor)});
  }catch(e){if(e instanceof RpcError)return send(e.status,{success:false,error:{code:e.code}});if(e&&[400,401,403,404,405,413,415,502].includes(e.status)&&e.code)return send(e.status,{success:false,error:{code:e.code}});return send(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}
 };
}
