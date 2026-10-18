/** Student Portal academics. Deny unknown queries, verify identity before RLS-scoped reads. */
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const defs=Object.freeze({
 subjects:{param:'batchId',table:'academic_subjects',field:'batch_id',columns:'id,batch_id,code,title,created_at',order:'created_at.asc',many:true},
 syllabus:{param:'subjectId',table:'syllabus_units',field:'subject_id',columns:'id,subject_id,title,position,created_at',order:'position.asc',many:true},
 routine:{param:'batchId',table:'routine_slots',field:'batch_id',columns:'id,batch_id,subject_id,day_of_week,start_minute,end_minute,room,status',order:'day_of_week.asc',many:true},
 assignments:{param:'batchId',table:'academic_assignments',field:'batch_id',columns:'id,batch_id,subject_id,title,release_at,due_at,max_points,status,grades_published',order:'due_at.asc',many:true},
 assignment:{param:'assignmentId',table:'academic_assignments',field:'id',columns:'id,batch_id,subject_id,title,instructions,release_at,due_at,max_points,allow_resubmit,status,grades_published',many:false},
 exams:{param:'batchId',table:'exams',field:'batch_id',columns:'id,batch_id,subject_id,title,scheduled_at,max_marks,status',order:'scheduled_at.asc',many:true},
 exam:{param:'examId',table:'exams',field:'id',columns:'id,batch_id,subject_id,title,scheduled_at,max_marks,status',many:false},
});
export const studentAcademicKinds=Object.freeze(Object.keys(defs));
const isId=v=>typeof v==='string'&&ID.test(v);
const problem=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const json=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const exact=(x,fields)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===fields.length&&fields.every(k=>Object.hasOwn(x,k));
const integer=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const text=(x,a,b)=>typeof x==='string'&&x.trim().length>=a&&x.length<=b&&!/[\x00-\x1f\x7f]/.test(x);
const date=x=>typeof x==='string'&&x.length>=20&&x.length<=40&&Number.isFinite(Date.parse(x));
function clean(x,fields){if(!exact(x,fields.split(',')))problem(502,'UPSTREAM_DATA_INVALID');return x;}
function project(kind,x,now){
 const conf=defs[kind];clean(x,conf.columns);
 if(!isId(x.id))problem(502,'UPSTREAM_DATA_INVALID');
 if(kind==='subjects'||kind==='syllabus'){
  if(!isId(kind==='subjects'?x.batch_id:x.subject_id)||!text(x.title,2,kind==='subjects'?120:160)||!date(x.created_at))problem(502,'UPSTREAM_DATA_INVALID');
  if(kind==='subjects'){
   if(!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(x.code))problem(502,'UPSTREAM_DATA_INVALID');
   return {id:x.id,batchId:x.batch_id,code:x.code,title:x.title,createdAt:x.created_at};
  }
  if(!integer(x.position,1,10000))problem(502,'UPSTREAM_DATA_INVALID');
  return {id:x.id,subjectId:x.subject_id,title:x.title,position:x.position,createdAt:x.created_at};
 }
 if(kind==='routine'){
  if(!isId(x.batch_id)||!isId(x.subject_id)||x.status!=='active'||!integer(x.day_of_week,0,6)||!integer(x.start_minute,0,1439)||!integer(x.end_minute,1,1440)||x.end_minute<=x.start_minute||!text(x.room,0,100))problem(502,'UPSTREAM_DATA_INVALID');
  return {id:x.id,batchId:x.batch_id,subjectId:x.subject_id,dayOfWeek:x.day_of_week,startMinute:x.start_minute,endMinute:x.end_minute,room:x.room};
 }
 if(kind==='assignments'||kind==='assignment'){
  if(!isId(x.batch_id)||!isId(x.subject_id)||!text(x.title,2,160)||!date(x.release_at)||!date(x.due_at)||Date.parse(x.release_at)>now||Date.parse(x.due_at)<=Date.parse(x.release_at)||!integer(x.max_points,1,1000)||!['published','closed'].includes(x.status)||typeof x.grades_published!=='boolean')problem(502,'UPSTREAM_DATA_INVALID');
  const item={id:x.id,batchId:x.batch_id,subjectId:x.subject_id,title:x.title,releaseAt:x.release_at,dueAt:x.due_at,maxPoints:x.max_points,status:x.status,gradesPublished:x.grades_published};
  if(kind==='assignment'){
   if(!text(x.instructions,2,20000)||typeof x.allow_resubmit!=='boolean')problem(502,'UPSTREAM_DATA_INVALID');
   return {...item,instructions:x.instructions,allowResubmit:x.allow_resubmit};
  }
  return item;
 }
 if(!isId(x.batch_id)||!isId(x.subject_id)||!text(x.title,2,120)||!date(x.scheduled_at)||!integer(x.max_marks,1,10000)||x.status!=='published')problem(502,'UPSTREAM_DATA_INVALID');
 return {id:x.id,batchId:x.batch_id,subjectId:x.subject_id,title:x.title,scheduledAt:x.scheduled_at,maxMarks:x.max_marks};
}
function paging(req,kind){
 const params=new URL(req.url).searchParams,many=defs[kind].many;
 for(const key of params.keys())if(!many||!['limit','offset'].includes(key)||params.getAll(key).length!==1)problem(400,'INVALID_QUERY');
 if(!many)return null;
 const limit=params.get('limit')??'20',offset=params.get('offset')??'0';
 if(!/^[1-9][0-9]*$/.test(limit)||!/^(0|[1-9][0-9]*)$/.test(offset)||!integer(Number(limit),1,40)||!integer(Number(offset),0,10000))problem(400,'INVALID_QUERY');
 return {limit:Number(limit),offset:Number(offset)};
}
const bearer=req=>{const m=/^Bearer ([^\s,]+)$/.exec(req.headers.get('authorization')??'');if(!m||m[1].length>8192||!JWT.test(m[1]))problem(401,'UNAUTHORIZED');return m[1];};
const rows=(x,max)=>{if(!Array.isArray(x)||x.length>max)problem(502,'UPSTREAM_DATA_INVALID');return x;};
async function activeMember(read,actor,batchId){
 if(!isId(batchId))problem(400,'INVALID_RESOURCE_ID');
 const found=rows(await read('enrollments',{select:'id,student_id,batch_id,status',student_id:`eq.${actor.userId}`,batch_id:`eq.${batchId}`,status:'eq.active',limit:'2'}),2);
 if(found.length===0)problem(404,'NOT_FOUND');
 if(found.length!==1)problem(502,'UPSTREAM_DATA_INVALID');
 const row=clean(found[0],'id,student_id,batch_id,status');
 if(!isId(row.id)||row.student_id!==actor.userId||row.batch_id!==batchId||row.status!=='active')problem(502,'UPSTREAM_DATA_INVALID');
}
/** Production port uses the very same JWT for ALL reads. */
export function createStudentAcademicEndpoint(kind,{verify,readRows,now=()=>Date.now()}={}){
 if(!Object.hasOwn(defs,kind)||typeof verify!=='function'||typeof readRows!=='function'||typeof now!=='function')throw Error('INVALID_STUDENT_ACADEMIC_PORT');
 const cfg=defs[kind];
 return async function GET(req,context={}){
  try{
   if(!(req instanceof Request)||req.method!=='GET')problem(405,'METHOD_NOT_ALLOWED');
   const pg=paging(req,kind),contextParams=await context?.params,target=contextParams?.[cfg.param];
   if(!isId(target))problem(400,'INVALID_RESOURCE_ID');
   const token=bearer(req),actor=await verify(token);
   if(!actor||actor.verified!==true||!isId(actor.userId)||actor.accessToken!==token||actor.accountStatus!=='active')problem(401,'UNAUTHORIZED');
   if(actor.role!=='student')problem(403,'FORBIDDEN');
   const read=(table,params)=>readRows(table,token,params);
   const timestamp=now();if(!Number.isFinite(timestamp)||timestamp<0)problem(503,'SERVICE_UNAVAILABLE');
   let batchId=target;
   if(kind==='syllabus'){
    const parent=rows(await read('academic_subjects',{select:defs.subjects.columns,id:`eq.${target}`,limit:'2'}),2);
    if(parent.length===0)problem(404,'NOT_FOUND');
    if(parent.length!==1)problem(502,'UPSTREAM_DATA_INVALID');
    const subject=project('subjects',parent[0],timestamp);if(subject.id!==target)problem(502,'UPSTREAM_DATA_INVALID');
    batchId=subject.batchId;
   }else if(kind==='assignment'||kind==='exam'){
    const found=rows(await read(cfg.table,{select:cfg.columns,id:`eq.${target}`,limit:'2'}),2);
    if(found.length===0)problem(404,'NOT_FOUND');
    if(found.length!==1)problem(502,'UPSTREAM_DATA_INVALID');
    const item=project(kind,found[0],timestamp);
    if(item.id!==target)problem(502,'UPSTREAM_DATA_INVALID');
    await activeMember(read,actor,item.batchId);
    return json(200,{success:true,data:item});
   }
   await activeMember(read,actor,batchId);
   const args={select:cfg.columns,[cfg.field]:`eq.${target}`,limit:String(pg.limit),offset:String(pg.offset),order:cfg.order};
   if(kind==='routine')args.status='eq.active';
   if(kind==='exams')args.status='eq.published';
   if(kind==='assignments')args.status='in.(published,closed)';
   const data=rows(await read(cfg.table,args),pg.limit).map(r=>project(kind,r,timestamp));
   if(new Set(data.map(r=>r.id)).size!==data.length||data.some(r=>(kind==='syllabus'?r.subjectId:r.batchId)!==target))problem(502,'UPSTREAM_DATA_INVALID');
   return json(200,{success:true,data:{items:data,pagination:pg}});
  }catch(e){
   if(e&&[400,401,403,404,405,502].includes(e.status)&&typeof e.code==='string')return json(e.status,{success:false,error:{code:e.code}});
   return json(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});
  }
 };
}
