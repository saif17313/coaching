/** Teacher Academic Control: verified JWT, read-only, strict DTOs and bounded queries. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const KINDS={subjects:{id:'batchId',table:'academic_subjects',parent:'batch_id',status:null,order:'created_at.asc',cols:'id,batch_id,code,title,created_at'},syllabus:{id:'subjectId',table:'syllabus_units',parent:'subject_id',status:null,order:'position.asc',cols:'id,subject_id,title,position,created_at'},routine:{id:'batchId',table:'routine_slots',parent:'batch_id',status:['active','archived'],order:'day_of_week.asc',cols:'id,batch_id,subject_id,day_of_week,start_minute,end_minute,room,status'},assignments:{id:'batchId',table:'academic_assignments',parent:'batch_id',status:['draft','published','closed'],order:'created_at.desc',cols:'id,batch_id,subject_id,title,release_at,due_at,max_points,status,grades_published'},exams:{id:'batchId',table:'exams',parent:'batch_id',status:['draft','published','archived'],order:'scheduled_at.desc',cols:'id,batch_id,subject_id,title,scheduled_at,max_marks,status'},results:{id:'examId',table:'exam_results',parent:'exam_id',status:['draft','published'],order:'created_at.desc',cols:'id,exam_id,student_id,marks,result_status,rank'}};
const allowed=Object.freeze(Object.keys(KINDS));
const isId=x=>typeof x==='string'&&UUID.test(x);
const err=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const output=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const validText=(s,min,max)=>typeof s==='string'&&s.length<=max&&s.trim().length>=min&&!/[\x00-\x1f\x7f]/.test(s);
const date=s=>typeof s==='string'&&s.length>=20&&s.length<=40&&Number.isFinite(Date.parse(s));
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
function requireRow(x,cols){if(!exact(x,cols.split(',')))err(502,'UPSTREAM_DATA_INVALID');return x;}
function batch(x){requireRow(x,'id,code,name,capacity,is_archived');if(!isId(x.id)||!/^[a-z0-9][a-z0-9_-]{1,31}$/i.test(x.code)||!validText(x.name,1,160)||!integer(x.capacity,1,1000000)||typeof x.is_archived!=='boolean')err(502,'UPSTREAM_DATA_INVALID');return {id:x.id,code:x.code,name:x.name,capacity:x.capacity,isArchived:x.is_archived};}
function subject(x){requireRow(x,'id,batch_id,code,title,created_at');if(!isId(x.id)||!isId(x.batch_id)||!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(x.code)||!validText(x.title,2,120)||!date(x.created_at))err(502,'UPSTREAM_DATA_INVALID');return {id:x.id,batchId:x.batch_id,code:x.code,title:x.title,createdAt:x.created_at};}
function unit(x){requireRow(x,'id,subject_id,title,position,created_at');if(!isId(x.id)||!isId(x.subject_id)||!validText(x.title,2,160)||!integer(x.position,1,10000)||!date(x.created_at))err(502,'UPSTREAM_DATA_INVALID');return {id:x.id,subjectId:x.subject_id,title:x.title,position:x.position,createdAt:x.created_at};}
function routine(x){requireRow(x,'id,batch_id,subject_id,day_of_week,start_minute,end_minute,room,status');if(!isId(x.id)||!isId(x.batch_id)||!isId(x.subject_id)||!integer(x.day_of_week,0,6)||!integer(x.start_minute,0,1439)||!integer(x.end_minute,1,1440)||x.end_minute<=x.start_minute||!validText(x.room,0,100)||!['active','archived'].includes(x.status))err(502,'UPSTREAM_DATA_INVALID');return {id:x.id,batchId:x.batch_id,subjectId:x.subject_id,dayOfWeek:x.day_of_week,startMinute:x.start_minute,endMinute:x.end_minute,room:x.room,status:x.status};}
function assignment(x){requireRow(x,'id,batch_id,subject_id,title,release_at,due_at,max_points,status,grades_published');if(!isId(x.id)||!isId(x.batch_id)||!isId(x.subject_id)||!validText(x.title,2,160)||!date(x.release_at)||!date(x.due_at)||Date.parse(x.due_at)<=Date.parse(x.release_at)||!integer(x.max_points,1,1000)||!['draft','published','closed'].includes(x.status)||typeof x.grades_published!=='boolean')err(502,'UPSTREAM_DATA_INVALID');return {id:x.id,batchId:x.batch_id,subjectId:x.subject_id,title:x.title,releaseAt:x.release_at,dueAt:x.due_at,maxPoints:x.max_points,status:x.status,gradesPublished:x.grades_published};}
function exam(x){requireRow(x,'id,batch_id,subject_id,title,scheduled_at,max_marks,status');if(!isId(x.id)||!isId(x.batch_id)||!isId(x.subject_id)||!validText(x.title,2,120)||!date(x.scheduled_at)||!integer(x.max_marks,1,10000)||!['draft','published','archived'].includes(x.status))err(502,'UPSTREAM_DATA_INVALID');return {id:x.id,batchId:x.batch_id,subjectId:x.subject_id,title:x.title,scheduledAt:x.scheduled_at,maxMarks:x.max_marks,status:x.status};}
function result(x){requireRow(x,'id,exam_id,student_id,marks,result_status,rank');if(!isId(x.id)||!isId(x.exam_id)||!isId(x.student_id)||!['draft','published'].includes(x.result_status)||!(x.marks===null||(typeof x.marks==='number'&&Number.isFinite(x.marks)&&x.marks>=0&&x.marks<=10000))||!(x.rank===null||integer(x.rank,1,1000000))||(x.result_status==='published'&&(x.marks===null||x.rank===null)))err(502,'UPSTREAM_DATA_INVALID');return {id:x.id,examId:x.exam_id,studentId:x.student_id,marks:x.marks,status:x.result_status,rank:x.rank};}
const validators={subjects:subject,syllabus:unit,routine,assignments:assignment,exams:exam,results:result};
function params(req,kind){const qp=new URL(req.url).searchParams;const config=KINDS[kind];for(const name of qp.keys())if(!['limit','offset',...(config.status?['status']:[])].includes(name)||qp.getAll(name).length!==1)err(400,'INVALID_QUERY');const limit=qp.get('limit')??'20',offset=qp.get('offset')??'0',status=qp.get('status');if(!/^[1-9]\d*$/.test(limit)||!/^(0|[1-9]\d*)$/.test(offset)||!integer(Number(limit),1,50)||!integer(Number(offset),0,10000)||(status!==null&&(!config.status||!config.status.includes(status))))err(400,'INVALID_QUERY');return {limit:Number(limit),offset:Number(offset),status};}
function bearer(req){const m=/^Bearer ([^\s,]+)$/.exec(req.headers.get('authorization')??'');if(!m||m[1].length>8192||!TOKEN.test(m[1]))err(401,'UNAUTHORIZED');return m[1];}
async function identity(verify,token){const a=await verify(token);if(!a||a.verified!==true||!isId(a.userId)||a.accessToken!==token||a.accountStatus!=='active')err(401,'UNAUTHORIZED');if(a.role!=='teacher')err(403,'FORBIDDEN');}
async function fetchOne(read,table,target,cols,check){const found=await read(table,{select:cols,id:`eq.${target}`,limit:'2'});if(!Array.isArray(found)||found.length>2)err(502,'UPSTREAM_DATA_INVALID');if(found.length===0)err(404,'NOT_FOUND');if(found.length!==1)err(502,'UPSTREAM_DATA_INVALID');const value=check(found[0]);if(value.id!==target)err(502,'UPSTREAM_DATA_INVALID');return value;}
export function createTeacherAcademicEndpoint(kind,{verify,readRows}={}){
 if(!allowed.includes(kind)||typeof verify!=='function'||typeof readRows!=='function')throw Error('INVALID_ACADEMIC_READ_PORT');
 return async function GET(req,context={}){
  try{
   if(!(req instanceof Request)||req.method!=='GET')err(405,'METHOD_NOT_ALLOWED');
   const page=params(req,kind);const target=(await context.params)?.[KINDS[kind].id];if(!isId(target))err(400,'INVALID_RESOURCE_ID');const token=bearer(req);await identity(verify,token);
   const read=(table,query)=>readRows(table,token,query);
   let parent;
   if(kind==='syllabus')parent=await fetchOne(read,'academic_subjects',target,KINDS.subjects.cols,subject);
   else if(kind==='results')parent=await fetchOne(read,'exams',target,KINDS.exams.cols,exam);
   else parent=await fetchOne(read,'batches',target,'id,code,name,capacity,is_archived',batch);
   const config=KINDS[kind];const q={select:config.cols,[config.parent]:`eq.${target}`,limit:String(page.limit),offset:String(page.offset),order:config.order};
   if(page.status)q[kind==='results'?'result_status':'status']=`eq.${page.status}`;
   const raw=await read(config.table,q);if(!Array.isArray(raw)||raw.length>page.limit)err(502,'UPSTREAM_DATA_INVALID');
   const items=raw.map(validators[kind]);if(new Set(items.map(x=>x.id)).size!==items.length||items.some(x=>x[kind==='syllabus'?'subjectId':kind==='results'?'examId':'batchId']!==target))err(502,'UPSTREAM_DATA_INVALID');
   if(page.status&&items.some(x=>x.status!==page.status))err(502,'UPSTREAM_DATA_INVALID');
   if(kind==='results'&&items.some(x=>x.marks!==null&&x.marks>parent.maxMarks))err(502,'UPSTREAM_DATA_INVALID');
   return output(200,{success:true,data:{[kind==='syllabus'?'subject':kind==='results'?'exam':'batch']:parent,items,pagination:page}});
  }catch(e){if(e?.code&&[400,401,403,404,405,502].includes(e.status))return output(e.status,{success:false,error:{code:e.code}});return output(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}
 };
}
