import {RpcError} from './rpc-errors.mjs';
/* Framework-free HTTP command boundary; requires a verified Auth user, DB role and active account. */
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ROUTES=Object.freeze({
  'student-status':{method:'PATCH',id:'studentId'},
  'enrollment-decision':{method:'POST',id:'enrollmentId'},
  'batch-create':{method:'POST',id:null},
  'batch-update':{method:'PATCH',id:'batchId'},
});
export class MutationBoundaryError extends Error {
  constructor(status,code){super(code);this.status=status;this.code=code;}
}
const deny=(status,code)=>{throw new MutationBoundaryError(status,code);};
const exactObject=(value,keys,min=1)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))deny(400,'INVALID_BODY');
  const names=Object.keys(value);
  if(names.length<min||names.some(k=>!keys.includes(k)))deny(400,'INVALID_BODY');
};
const isId=value=>typeof value==='string'&&ID.test(value);
const validName=value=>typeof value==='string'&&value.trim().length>=2&&value.trim().length<=120;
const validCode=value=>typeof value==='string'&&/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(value);
const validCapacity=value=>Number.isSafeInteger(value)&&value>=1&&value<=100000;
function validate(kind,input){
  if(kind==='student-status'){
    exactObject(input,['status']);
    if(!['active','disabled','rejected'].includes(input.status))deny(400,'INVALID_STATUS');
    return {status:input.status};
  }
  if(kind==='enrollment-decision'){
    exactObject(input,['decision']);
    if(!['approve','reject','cancel'].includes(input.decision))deny(400,'INVALID_DECISION');
    return {decision:input.decision};
  }
  if(kind==='batch-create'){
    exactObject(input,['code','name','capacity'],3);
    if(!validCode(input.code)||!validName(input.name)||!validCapacity(input.capacity))deny(400,'INVALID_BATCH');
    return {code:input.code,name:input.name.trim(),capacity:input.capacity};
  }
  exactObject(input,['name','capacity','isArchived']);
  if(('name' in input&&!validName(input.name))||('capacity' in input&&!validCapacity(input.capacity))||('isArchived' in input&&typeof input.isArchived!=='boolean'))deny(400,'INVALID_BATCH_PATCH');
  const out={...input};if(out.name)out.name=out.name.trim();return out;
}
const respond=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
async function readLimitedJson(request){
  const ct=request.headers.get('content-type')??'';
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(ct))deny(415,'UNSUPPORTED_MEDIA_TYPE');
  const size=request.headers.get('content-length');
  if(size!==null&&(!/^\d+$/.test(size)||Number(size)>4096))deny(413,'BODY_TOO_LARGE');
  if(!request.body)deny(400,'INVALID_BODY');
  const reader=request.body.getReader();let total=0;const chunks=[];
  try{
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>4096)deny(413,'BODY_TOO_LARGE');chunks.push(value);}
  } finally {reader.releaseLock();}
  let parsed;try{const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{deny(400,'INVALID_JSON');}
  return parsed;
}
function bearer(req){
  const raw=req.headers.get('authorization');const match=raw&&/^Bearer ([^\s,]+)$/.exec(raw);
  if(!match||match[1].length>8192||!TOKEN.test(match[1]))deny(401,'UNAUTHORIZED');
  return match[1];
}
function operationId(req){
  const key=req.headers.get('idempotency-key');
  if(!isId(key))deny(400,'INVALID_IDEMPOTENCY_KEY');
  return key;
}
function assertResult(kind,result,target,input){
  const keys=kind==='batch-create'||kind==='batch-update'?['id','code','name','capacity','isArchived']:['id','status'];
  if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).length!==keys.length||Object.keys(result).some(k=>!keys.includes(k))||!isId(result.id))deny(502,'UPSTREAM_DATA_INVALID');
  if(target&&target!==result.id)deny(502,'UPSTREAM_DATA_INVALID');
  if(kind==='student-status'&&result.status!==input.status)deny(502,'UPSTREAM_DATA_INVALID');
  if(kind==='enrollment-decision'&&result.status!==({approve:'active',reject:'rejected',cancel:'cancelled'})[input.decision])deny(502,'UPSTREAM_DATA_INVALID');
  if(kind.startsWith('batch-')&&(!validCode(result.code)||!validName(result.name)||!validCapacity(result.capacity)||typeof result.isArchived!=='boolean'))deny(502,'UPSTREAM_DATA_INVALID');
  return result;
}
export function createProtectedMutationEndpoint(kind,{verify,execute}={}){
  if(!Object.hasOwn(ROUTES,kind)||typeof verify!=='function'||typeof execute!=='function')throw Error('Invalid mutation gateway dependencies');
  const scope=ROUTES[kind];
  return async function MUTATE(req,ctx={}){
    try{
      if(!(req instanceof Request)||req.method!==scope.method)deny(405,'METHOD_NOT_ALLOWED');
      if(new URL(req.url).search)deny(400,'INVALID_QUERY');
      const token=bearer(req), opId=operationId(req);
      const data=validate(kind,await readLimitedJson(req));
      let params={};
      if(scope.id){params=await ctx?.params;if(!params||typeof params!=='object'||!isId(params[scope.id]))deny(400,'INVALID_RESOURCE_ID');}
      const actor=await verify(token);
      if(!actor||actor.verified!==true||!isId(actor.userId)||actor.accessToken!==token||actor.role!=='teacher'||actor.accountStatus!=='active')deny(403,'FORBIDDEN');
      const target=scope.id?params[scope.id]:null;
      const result=await execute(kind,{actor:Object.freeze({id:actor.userId,role:'teacher',verified:true}),token,operationId:opId,target,input:Object.freeze(data)});
      return respond(kind==='batch-create'?201:200,{success:true,data:assertResult(kind,result,target,data)});
    }catch(error){if(error instanceof RpcError)return respond(error.status,{success:false,error:{code:error.code}});
      if(error instanceof MutationBoundaryError)return respond(error.status,{success:false,error:{code:error.code}});
      return respond(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});
    }
  };
}
