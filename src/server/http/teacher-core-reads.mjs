/** Teacher core management read endpoints. No DB writes or elevated credentials. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const KINDS=['batch-roster','batch-occupancy','enrollment-detail','student-directory'];
const STATUSES=['pending','active','rejected','cancelled'];
const ACCOUNT=['pending','active','disabled','rejected'];
const isId=x=>typeof x==='string'&&UUID.test(x);
const deny=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const safeText=(x,min,max)=>typeof x==='string'&&x.length<=max&&x.trim().length>=min&&!/[\x00-\x1f\x7f]/.test(x);
const timestamp=x=>typeof x==='string'&&x.length>=20&&x.length<=40&&Number.isFinite(Date.parse(x));
function profile(x){
 if(!exact(x,['id','role','full_name','account_status','created_at'])||!isId(x.id)||x.role!=='student'||!safeText(x.full_name,0,160)||!ACCOUNT.includes(x.account_status)||!timestamp(x.created_at))deny(502,'UPSTREAM_DATA_INVALID');
 return {id:x.id,fullName:x.full_name,accountStatus:x.account_status,createdAt:x.created_at};
}
function batch(x){
 if(!exact(x,['id','code','name','capacity','is_archived'])||!isId(x.id)||!safeText(x.code,2,32)||!(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/).test(x.code)||!safeText(x.name,1,160)||!Number.isSafeInteger(x.capacity)||x.capacity<1||typeof x.is_archived!=='boolean')deny(502,'UPSTREAM_DATA_INVALID');
 return {id:x.id,code:x.code,name:x.name,capacity:x.capacity,isArchived:x.is_archived};
}
function enrollment(x){
 if(!exact(x,['id','student_id','batch_id','status','requested_at','decided_at'])||!isId(x.id)||!isId(x.student_id)||!isId(x.batch_id)||!STATUSES.includes(x.status)||!timestamp(x.requested_at)||(x.status==='pending'?x.decided_at!==null:!timestamp(x.decided_at)))deny(502,'UPSTREAM_DATA_INVALID');
 return {id:x.id,studentId:x.student_id,batchId:x.batch_id,status:x.status,requestedAt:x.requested_at,decidedAt:x.decided_at};
}
function rows(value,max){if(!Array.isArray(value)||value.length>max)deny(502,'UPSTREAM_DATA_INVALID');return value;}
function unique(arr){if(new Set(arr.map(x=>x.id)).size!==arr.length)deny(502,'UPSTREAM_DATA_INVALID');return arr;}
function query(req,kind){
 const params=new URL(req.url).searchParams;
 const allowed=kind==='batch-roster'?['limit','offset','status']:kind==='student-directory'?['limit','offset','accountStatus']:[];
 for(const k of params.keys())if(!allowed.includes(k)||params.getAll(k).length!==1)deny(400,'INVALID_QUERY');
 const l=params.get('limit')??'20',o=params.get('offset')??'0';
 if(!/^[1-9]\d*$/.test(l)||!/^(0|[1-9]\d*)$/.test(o)||Number(l)>25||Number(o)>10000||!Number.isSafeInteger(Number(l))||!Number.isSafeInteger(Number(o)))deny(400,'INVALID_QUERY');
 const status=params.get('status'),accountStatus=params.get('accountStatus');
 if(status!==null&&!STATUSES.includes(status))deny(400,'INVALID_QUERY');
 if(accountStatus!==null&&!ACCOUNT.includes(accountStatus))deny(400,'INVALID_QUERY');
 return {limit:Number(l),offset:Number(o),status,accountStatus};
}
function bearer(req){
 const raw=req.headers.get('authorization'),m=raw&&/^Bearer ([^\s,]+)$/.exec(raw);
 if(!m||m[1].length>8192||!JWT.test(m[1]))deny(401,'UNAUTHORIZED');return m[1];
}
async function identity(verify,token){
 const actor=await verify(token);
 if(!actor||actor.verified!==true||!isId(actor.userId)||actor.accessToken!==token||actor.accountStatus!=='active')deny(401,'UNAUTHORIZED');
 if(actor.role!=='teacher')deny(403,'FORBIDDEN');
}
async function one(read,table,query,validator,target){
 const found=rows(await read(table,{...query,limit:'2'}),2);
 if(found.length===0)deny(404,'NOT_FOUND');
 if(found.length!==1)deny(502,'UPSTREAM_DATA_INVALID');
 const data=validator(found[0]);if(data.id!==target)deny(502,'UPSTREAM_DATA_INVALID');return data;
}
export function createTeacherCoreReadEndpoint(kind,{verify,readRows,countBatch}={}){
 if(!KINDS.includes(kind)||typeof verify!=='function'||typeof readRows!=='function'||(kind==='batch-occupancy'&&typeof countBatch!=='function'))throw Error('INVALID_TEACHER_CORE_PORT');
 return async function GET(req,ctx={}){
  try{
   if(!(req instanceof Request)||req.method!=='GET')deny(405,'METHOD_NOT_ALLOWED');
   const page=query(req,kind);
   const field=kind==='enrollment-detail'?'enrollmentId':kind==='student-directory'?null:'batchId';
   const target=field?(await ctx.params)?.[field]:null;
   if(field&&!isId(target))deny(400,'INVALID_RESOURCE_ID');
   const token=bearer(req);
   await identity(verify,token);
   const read=(table,query)=>readRows(table,token,query);
   let data;
   if(kind==='student-directory'){
    const filter={select:'id,role,full_name,account_status,created_at',role:'eq.student',limit:String(page.limit),offset:String(page.offset),order:'created_at.desc'};
    if(page.accountStatus)filter.account_status=`eq.${page.accountStatus}`;
    const list=unique(rows(await read('profiles',filter),page.limit).map(profile));
    if(page.accountStatus&&list.some(p=>p.accountStatus!==page.accountStatus))deny(502,'UPSTREAM_DATA_INVALID');
    data={students:list,pagination:{limit:page.limit,offset:page.offset,accountStatus:page.accountStatus}};
   }else if(kind==='enrollment-detail'){
    const e=await one(read,'enrollments',{select:'id,student_id,batch_id,status,requested_at,decided_at',id:`eq.${target}`},enrollment,target);
    const [s,b]=await Promise.all([
     one(read,'profiles',{select:'id,role,full_name,account_status,created_at',id:`eq.${e.studentId}`,role:'eq.student'},profile,e.studentId),
     one(read,'batches',{select:'id,code,name,capacity,is_archived',id:`eq.${e.batchId}`},batch,e.batchId)
    ]);
    data={enrollment:e,student:s,batch:b};
   }else{
    const b=await one(read,'batches',{select:'id,code,name,capacity,is_archived',id:`eq.${target}`},batch,target);
    if(kind==='batch-occupancy'){
     const [active,pending]=await Promise.all([countBatch(token,target,'active'),countBatch(token,target,'pending')]);
     if(!Number.isSafeInteger(active)||!Number.isSafeInteger(pending)||active<0||pending<0||active>b.capacity)deny(502,'UPSTREAM_DATA_INVALID');
     data={batch:b,active,pending,availableSeats:b.capacity-active,isAtCapacity:active===b.capacity};
    }else{
     const filter={select:'id,student_id,batch_id,status,requested_at,decided_at',batch_id:`eq.${target}`,limit:String(page.limit),offset:String(page.offset),order:'requested_at.desc'};
     if(page.status)filter.status=`eq.${page.status}`;
     const enrollments=unique(rows(await read('enrollments',filter),page.limit).map(enrollment));
     if(enrollments.some(e=>e.batchId!==target||(page.status&&e.status!==page.status)))deny(502,'UPSTREAM_DATA_INVALID');
     let students=[];
     if(enrollments.length){
      const ids=[...new Set(enrollments.map(e=>e.studentId))];
      students=unique(rows(await read('profiles',{select:'id,role,full_name,account_status,created_at',id:`in.(${ids.join(',')})`,role:'eq.student',limit:String(ids.length)}),ids.length).map(profile));
      if(students.length!==ids.length||students.some(s=>!ids.includes(s.id)))deny(502,'UPSTREAM_DATA_INVALID');
     }
     const byId=new Map(students.map(s=>[s.id,s]));
     data={batch:b,entries:enrollments.map(e=>({enrollment:e,student:byId.get(e.studentId)})),pagination:{limit:page.limit,offset:page.offset,status:page.status}};
    }
   }
   return reply(200,{success:true,data});
  }catch(error){
   if(error?.code&&[400,401,403,404,405,502].includes(error.status))return reply(error.status,{success:false,error:{code:error.code}});
   return reply(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});
  }
 };
}
