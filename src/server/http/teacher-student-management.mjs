/** Teacher Admin student management read projection. JWT/role verified; RLS enforced by user bearer. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const isUuid=x=>typeof x==='string'&&UUID.test(x);
const fail=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const respond=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const timestamp=x=>typeof x==='string'&&x.length>=20&&x.length<=40&&Number.isFinite(Date.parse(x));
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(key=>keys.includes(key));
function checkProfile(x,id){
 if(!exact(x,['id','role','full_name','account_status','created_at'])||x.id!==id||x.role!=='student'||typeof x.full_name!=='string'||x.full_name.length>160||!['pending','active','disabled','rejected'].includes(x.account_status)||!timestamp(x.created_at))fail(502,'UPSTREAM_DATA_INVALID');
 return {id:x.id,role:x.role,full_name:x.full_name,account_status:x.account_status,created_at:x.created_at};
}
function checkEnrollment(x,id){
 if(!exact(x,['id','student_id','batch_id','status','requested_at','decided_at'])||!isUuid(x.id)||x.student_id!==id||!isUuid(x.batch_id)||!['pending','active','rejected','cancelled'].includes(x.status)||!timestamp(x.requested_at)||(x.status==='pending'?x.decided_at!==null:!timestamp(x.decided_at)))fail(502,'UPSTREAM_DATA_INVALID');
 return {...x};
}
function paging(url){
 const params=new URL(url).searchParams;
 for(const key of params.keys())if(!['limit','offset'].includes(key)||params.getAll(key).length!==1)fail(400,'INVALID_QUERY');
 const l=params.get('limit')??'20',o=params.get('offset')??'0';
 if(!/^[1-9]\d*$/.test(l)||!/^(0|[1-9]\d*)$/.test(o)||Number(l)>30||Number(o)>10000||!Number.isSafeInteger(Number(l))||!Number.isSafeInteger(Number(o)))fail(400,'INVALID_QUERY');
 return {limit:Number(l),offset:Number(o)};
}
function bearer(req){
 const s=req.headers.get('authorization'),m=s&&/^Bearer ([^\s,]+)$/.exec(s);
 if(!m||m[1].length>8192||!TOKEN.test(m[1]))fail(401,'UNAUTHORIZED');
 return m[1];
}
export function createTeacherStudentManagementEndpoint({verify,readRows}={}){
 if(typeof verify!=='function'||typeof readRows!=='function')throw Error('INVALID_MANAGEMENT_PORT');
 return async function GET(req,ctx={}){
  try{
   if(!(req instanceof Request)||req.method!=='GET')fail(405,'METHOD_NOT_ALLOWED');
   const page=paging(req.url);
   const studentId=(await ctx?.params)?.studentId;
   if(!isUuid(studentId))fail(400,'INVALID_RESOURCE_ID');
   const token=bearer(req);
   const actor=await verify(token);
   if(!actor||actor.verified!==true||!isUuid(actor.userId)||actor.accessToken!==token||actor.accountStatus!=='active')fail(401,'UNAUTHORIZED');
   if(actor.role!=='teacher')fail(403,'FORBIDDEN');
   const p=await readRows('profiles',token,{select:'id,role,full_name,account_status,created_at',id:`eq.${studentId}`,role:'eq.student',limit:'2'});
   if(!Array.isArray(p)||p.length>2)fail(502,'UPSTREAM_DATA_INVALID');
   if(p.length===0)fail(404,'NOT_FOUND');
   if(p.length!==1)fail(502,'UPSTREAM_DATA_INVALID');
   const profile=checkProfile(p[0],studentId);
   const raw=await readRows('enrollments',token,{select:'id,student_id,batch_id,status,requested_at,decided_at',student_id:`eq.${studentId}`,limit:String(page.limit),offset:String(page.offset),order:'requested_at.desc'});
   if(!Array.isArray(raw)||raw.length>page.limit)fail(502,'UPSTREAM_DATA_INVALID');
   const seen=new Set(),enrollments=raw.map(x=>{
    const e=checkEnrollment(x,studentId);
    if(seen.has(e.id))fail(502,'UPSTREAM_DATA_INVALID');
    seen.add(e.id);return e;
   });
   return respond(200,{success:true,data:{profile,enrollments,pagination:page}});
  }catch(error){
   if(error?.code&&[400,401,403,404,405,502].includes(error.status))return respond(error.status,{success:false,error:{code:error.code}});
   return respond(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});
  }
 };
}
