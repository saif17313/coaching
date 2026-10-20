import {RpcError} from './rpc-errors.mjs';
/** Protected Office writes: fail closed, one audited PostgreSQL RPC per call. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const id=v=>typeof v==='string'&&UUID.test(v);
const err=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===ks.length&&Object.keys(v).every(k=>ks.includes(k));
const str=(v,lo,hi,multi=false)=>typeof v==='string'&&v.trim().length>=lo&&v.trim().length<=hi&&!(multi?/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(v);
const minor=v=>Number.isSafeInteger(v)&&v>0&&v<=100000000000;
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const validTime=v=>v===null||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v)));
const response=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const spec={
 plan:{routeKey:'batchId',in:['period','amountMinor','dueOn','label'],out:['id','batchId','period','amountMinor','dueOn','label'],method:'POST'},
 dues:{routeKey:'planId',in:[],out:['planId','created'],method:'POST'},
 payment:{routeKey:'dueId',in:['studentId','amountMinor','method','reference'],out:['id','dueId','studentId','amountMinor','method'],method:'POST'},
 waiver:{routeKey:'dueId',in:['amountMinor','reason'],out:['id','dueId','paymentId','kind','amountMinor'],method:'POST'},
 refund:{routeKey:'paymentId',in:['amountMinor','reason'],out:['id','dueId','paymentId','kind','amountMinor'],method:'POST'},
 announcement:{routeKey:'batchId',in:['title','body','visibleFrom'],out:['id','batchId','title','status'],method:'POST'},
 publish:{routeKey:'announcementId',in:[],out:['id','status'],method:'POST'},
 notify:{routeKey:'batchId',in:['eventId','title','body'],out:['eventId','batchId','delivered'],method:'POST'},
};
function validate(kind,body){const s=spec[kind];if(!exact(body,s.in))err(400,'INVALID_COMMAND');
 if(kind==='plan'){
  if(typeof body.period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)||!minor(body.amountMinor)||!validDate(body.dueOn)||body.dueOn<body.period+'-01'||!str(body.label,2,120))err(400,'INVALID_COMMAND');return {...body,label:body.label.trim()};
 }
 if(kind==='payment'){
  if(!id(body.studentId)||!minor(body.amountMinor)||!['cash','bank','mobile_banking'].includes(body.method)||typeof body.reference!=='string'||body.reference.length>120||/[\x00-\x1f\x7f]/.test(body.reference))err(400,'INVALID_COMMAND');return {...body,reference:body.reference.trim()};
 }
 if(['waiver','refund'].includes(kind)){if(!minor(body.amountMinor)||!str(body.reason,5,500,true))err(400,'INVALID_COMMAND');return {...body,reason:body.reason.trim()};}
 if(kind==='announcement'){if(!str(body.title,2,160)||!str(body.body,2,10000,true)||!validTime(body.visibleFrom))err(400,'INVALID_COMMAND');return {...body,title:body.title.trim(),body:body.body.trim()};}
 if(kind==='notify'){if(!id(body.eventId)||!str(body.title,2,160)||!str(body.body,2,2000,true))err(400,'INVALID_COMMAND');return {...body,title:body.title.trim(),body:body.body.trim()};}
 return {};
}
function validateOutput(kind,target,input,v){const s=spec[kind];if(!exact(v,s.out))err(502,'UPSTREAM_DATA_INVALID');
 if(kind==='plan'&&(!id(v.id)||v.batchId!==target||v.period!==input.period||v.amountMinor!==input.amountMinor||v.dueOn!==input.dueOn||v.label!==input.label))err(502,'UPSTREAM_DATA_INVALID');
 if(kind==='dues'&&(v.planId!==target||!Number.isSafeInteger(v.created)||v.created<0||v.created>100000))err(502,'UPSTREAM_DATA_INVALID');
 if(kind==='payment'&&(!id(v.id)||v.dueId!==target||v.studentId!==input.studentId||v.amountMinor!==input.amountMinor||v.method!==input.method))err(502,'UPSTREAM_DATA_INVALID');
 if(kind==='waiver'&&(!id(v.id)||v.dueId!==target||v.paymentId!==null||v.kind!=='waiver'||v.amountMinor!==input.amountMinor))err(502,'UPSTREAM_DATA_INVALID');
 if(kind==='refund'&&(!id(v.id)||!id(v.dueId)||v.paymentId!==target||v.kind!=='refund'||v.amountMinor!==input.amountMinor))err(502,'UPSTREAM_DATA_INVALID');
 if(kind==='announcement'&&(!id(v.id)||v.batchId!==target||v.title!==input.title||v.status!=='draft'))err(502,'UPSTREAM_DATA_INVALID');
 if(kind==='publish'&&(v.id!==target||v.status!=='published'))err(502,'UPSTREAM_DATA_INVALID');
 if(kind==='notify'&&(v.eventId!==input.eventId||v.batchId!==target||!Number.isSafeInteger(v.delivered)||v.delivered<0||v.delivered>100000))err(502,'UPSTREAM_DATA_INVALID');
 return v;
}
async function bodyJson(req){if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))err(415,'UNSUPPORTED_MEDIA_TYPE');
 const len=req.headers.get('content-length');if(len!==null&&(!/^\d+$/.test(len)||Number(len)>16384))err(413,'BODY_TOO_LARGE');
 const reader=req.body?.getReader();if(!reader)err(400,'INVALID_BODY');const pieces=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>16384)err(413,'BODY_TOO_LARGE');pieces.push(r.value);}}finally{reader.releaseLock();}
 try{const all=new Uint8Array(size);let pos=0;for(const p of pieces){all.set(p,pos);pos+=p.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{err(400,'INVALID_JSON');}
}
export function createOfficeCommand(kind,{verify,execute}={}){
 if(!spec[kind]||typeof verify!=='function'||typeof execute!=='function')throw Error('INVALID_OFFICE_PORT');
 return async function POST(request,context={}){try{
  if(!(request instanceof Request)||request.method!=='POST')err(405,'METHOD_NOT_ALLOWED');
  if(new URL(request.url).search)err(400,'INVALID_QUERY');
  const match=/^Bearer ([^\s,]+)$/.exec(request.headers.get('authorization')??'');if(!match||match[1].length>8192||!JWT.test(match[1]))err(401,'UNAUTHORIZED');
  const token=match[1],op=request.headers.get('idempotency-key');if(!id(op))err(400,'INVALID_OPERATION_ID');
  const input=validate(kind,await bodyJson(request));const target=(await context.params)?.[spec[kind].routeKey];if(!id(target))err(400,'INVALID_RESOURCE_ID');
  const actor=await verify(token);if(!actor||actor.verified!==true||actor.role!=='teacher'||actor.accountStatus!=='active'||!id(actor.userId)||actor.accessToken!==token)err(403,'FORBIDDEN');
  const result=await execute(kind,{token,operationId:op,target,data:Object.freeze(input),actorId:actor.userId});
  return response(201,{success:true,data:validateOutput(kind,target,input,result)});
 }catch(e){if(e instanceof RpcError)return response(e.status,{success:false,error:{code:e.code}});if(e&&[400,401,403,405,413,415,502].includes(e.status)&&e.code)return response(e.status,{success:false,error:{code:e.code}});return response(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}};
}
