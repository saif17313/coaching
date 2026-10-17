/* No Next.js import: the HTTP boundary is executable under node:test. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const scopes = Object.freeze({
  'student-me': { role:'student', table:'profiles', type:'one' },
  'student-enrollments': { role:'student', table:'enrollments', type:'many' },
  'teacher-students': { role:'teacher', table:'profiles', type:'many' },
  'teacher-batches': { role:'teacher', table:'batches', type:'many' },
});
export class BoundaryError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status,code) => {throw new BoundaryError(status,code);};
const noExtra=(row,keys)=>{
  if (!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).some(k=>!keys.includes(k))) fail(502,'UPSTREAM_DATA_INVALID');
};
const id = x => typeof x==='string' && uuid.test(x);
const name = x => typeof x==='string' && x.length <= 160;
const validProfile = (x,role) => {
  noExtra(x,['id','role','full_name']);
  if(!id(x.id)||x.role!==role||!name(x.full_name)) fail(502,'UPSTREAM_DATA_INVALID');
  return {id:x.id,role:x.role,full_name:x.full_name};
};
const validEnrollment = (x,student) => {
  noExtra(x,['id','student_id','batch_id','status','requested_at','decided_at']);
  if(!id(x.id)||x.student_id!==student||!id(x.batch_id)||!['pending','active','rejected','cancelled'].includes(x.status)||
     !timestamp(x.requested_at)||!(x.decided_at===null||timestamp(x.decided_at))) fail(502,'UPSTREAM_DATA_INVALID');
  return {id:x.id,student_id:x.student_id,batch_id:x.batch_id,status:x.status,requested_at:x.requested_at,decided_at:x.decided_at};
};
const timestamp=x=>typeof x==='string' && x.length<=40 && !Number.isNaN(Date.parse(x));
const validBatch=x=>{
  noExtra(x,['id','code','name','capacity','is_archived']);
  if(!id(x.id)||typeof x.code!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(x.code)||!name(x.name)||
     !Number.isSafeInteger(x.capacity)||x.capacity<1||typeof x.is_archived!=='boolean') fail(502,'UPSTREAM_DATA_INVALID');
  return {id:x.id,code:x.code,name:x.name,capacity:x.capacity,is_archived:x.is_archived};
};
function pagination(url, one) {
  const p = new URL(url).searchParams;
  for (const key of p.keys()) if(one||!['limit','offset'].includes(key)||p.getAll(key).length!==1) fail(400,'INVALID_QUERY');
  const rawLimit = p.get('limit') ?? '20', rawOffset=p.get('offset')??'0';
  if(!/^[1-9]\d*$/.test(rawLimit)||!/^(0|[1-9]\d*)$/.test(rawOffset))fail(400,'INVALID_QUERY');
  const limit=Number(rawLimit), offset=Number(rawOffset);
  if(!Number.isSafeInteger(limit)||limit>50||!Number.isSafeInteger(offset)||offset>10000)fail(400,'INVALID_QUERY');
  return {limit,offset};
}
function tokenFrom(headers){
  const value=headers.get('authorization');
  if(!value)fail(401,'UNAUTHORIZED');
  const m=/^Bearer ([^\s,]+)$/.exec(value);
  if(!m||m[1].length>8192||!jwt.test(m[1]))fail(401,'UNAUTHORIZED');
  return m[1];
}
const response=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
export function createProtectedReadEndpoint(kind,{verify,readRows}={}) {
  if(!Object.hasOwn(scopes,kind))throw new Error('Unsupported protected read scope');
  if(typeof verify!=='function'||typeof readRows!=='function')throw new Error('Invalid protected read dependencies');
  const scope=scopes[kind];
  return async function GET(request){
    try {
      if(!(request instanceof Request)||request.method!=='GET')fail(405,'METHOD_NOT_ALLOWED');
      const {limit,offset}=pagination(request.url,scope.type==='one');
      const token=tokenFrom(request.headers);
      const actor=await verify(token);
      if(!actor||actor.verified!==true||!id(actor.userId)||actor.accessToken!==token||!['student','teacher'].includes(actor.role))fail(401,'UNAUTHORIZED');
      if(actor.role!==scope.role)fail(403,'FORBIDDEN');
      let params;
      if(kind==='student-me')params={select:'id,role,full_name',id:`eq.${actor.userId}`,limit:'1'};
      else if(kind==='student-enrollments')params={select:'id,student_id,batch_id,status,requested_at,decided_at',student_id:`eq.${actor.userId}`,limit:String(limit),offset:String(offset),order:'requested_at.desc'};
      else if(kind==='teacher-students')params={select:'id,role,full_name',role:'eq.student',limit:String(limit),offset:String(offset),order:'created_at.desc'};
      else params={select:'id,code,name,capacity,is_archived',limit:String(limit),offset:String(offset),order:'created_at.desc'};
      const rows=await readRows(scope.table,token,params);
      if(!Array.isArray(rows)||rows.length>(scope.type==='one'?1:limit))fail(502,'UPSTREAM_DATA_INVALID');
      const seen=new Set();
      const data=rows.map(row=>{
        let mapped;
        if(kind==='student-me'){
          if(row.id!==actor.userId)fail(502,'UPSTREAM_DATA_INVALID');
          mapped=validProfile(row,'student');
        } else if(kind==='student-enrollments')mapped=validEnrollment(row,actor.userId);
        else if(kind==='teacher-students')mapped=validProfile(row,'student');
        else mapped=validBatch(row);
        if(seen.has(mapped.id))fail(502,'UPSTREAM_DATA_INVALID');
        seen.add(mapped.id);return mapped;
      });
      if(kind==='student-me' && data.length!==1)fail(403,'ACCOUNT_PROFILE_UNAVAILABLE');
      return response(200,{success:true,data:scope.type==='one'?data[0]:data});
    } catch(error){
      if(error instanceof BoundaryError)return response(error.status,{success:false,error:{code:error.code,message:error.code}});
      // Never expose stack traces, tokens, upstream response bodies or DB internals.
      return response(503,{success:false,error:{code:'SERVICE_UNAVAILABLE',message:'SERVICE_UNAVAILABLE'}});
    }
  };
}
