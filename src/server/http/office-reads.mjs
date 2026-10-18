/** Shifat's Tales page/section parity: Resources, Finance, Notifications, Audit, Reports. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const id=x=>typeof x==='string'&&UUID.test(x);
const amount=x=>Number.isSafeInteger(x)&&x>=-100000000000&&x<=100000000000;
const stamp=x=>typeof x==='string'&&x.length>=20&&x.length<=40&&Number.isFinite(Date.parse(x));
const optionalStamp=x=>x===null||stamp(x);
const str=(x,min,max)=>typeof x==='string'&&x.length<=max&&x.trim().length>=min&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x);
const period=x=>typeof x==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const deny=(status,code)=>{const error=new Error(code);error.status=status;error.code=code;throw error;};
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const send=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const TABLES={
 materials:{table:'batch_contents',cols:'id,batch_id,upload_id,title,description,status,release_at,created_at,updated_at',sort:'created_at.desc',statuses:['draft','published','archived'],scope:'batch',role:'teacher'},
 announcements:{table:'announcements',cols:'id,batch_id,title,body,status,visible_from,created_at,updated_at',sort:'created_at.desc',statuses:['draft','published','archived'],scope:'batch',role:'teacher'},
 feePlans:{table:'fee_plans',cols:'id,batch_id,bill_period,amount_minor,currency,due_on,label,created_at',sort:'created_at.desc',scope:'batch',role:'teacher'},
 batchDues:{table:'monthly_dues',cols:'id,fee_plan_id,student_id,batch_id,bill_period,amount_minor,currency,created_at',sort:'created_at.desc',scope:'batch',role:'teacher'},
 studentDuesTeacher:{table:'monthly_dues',cols:'id,fee_plan_id,student_id,batch_id,bill_period,amount_minor,currency,created_at',sort:'created_at.desc',scope:'student',role:'teacher'},
 studentPaymentsTeacher:{table:'payments',cols:'id,due_id,student_id,amount_minor,currency,method,reference,created_at',sort:'created_at.desc',scope:'student',role:'teacher'},
 duePayments:{table:'payments',cols:'id,due_id,student_id,amount_minor,currency,method,reference,created_at',sort:'created_at.desc',scope:'due',role:'teacher'},
 dueAdjustments:{table:'payment_adjustments',cols:'id,due_id,payment_id,kind,amount_minor,reason,created_at',sort:'created_at.desc',scope:'due',role:'teacher'},
 myDues:{table:'monthly_dues',cols:'id,fee_plan_id,student_id,batch_id,bill_period,amount_minor,currency,created_at',sort:'created_at.desc',scope:'self',role:'student'},
 myPayments:{table:'payments',cols:'id,due_id,student_id,amount_minor,currency,method,reference,created_at',sort:'created_at.desc',scope:'self',role:'student'},
 teacherNotifications:{table:'notifications',cols:'id,recipient_id,title,body,read_at,created_at',sort:'created_at.desc',scope:'notice',role:'teacher'},
 myNotifications:{table:'notifications',cols:'id,recipient_id,title,body,read_at,created_at',sort:'created_at.desc',scope:'notice',role:'student'},
 audit:{table:'audit_logs',cols:'id,actor_id,action,entity_id,occurred_at',sort:'occurred_at.desc',scope:'audit',role:'teacher'},
 studentMaterials:{table:'batch_contents',cols:'id,batch_id,upload_id,title,description,status,release_at,created_at,updated_at',sort:'created_at.desc',scope:'studentBatch',role:'student'},
 studentAnnouncements:{table:'announcements',cols:'id,batch_id,title,body,status,visible_from,created_at,updated_at',sort:'created_at.desc',scope:'studentBatch',role:'student'},
};
function convert(table,r){
 const cols=TABLES[table]?.cols??(table==='payments'?'id,due_id,student_id,amount_minor,currency,method,reference,created_at':table==='payment_adjustments'?'id,due_id,payment_id,kind,amount_minor,reason,created_at':'id,fee_plan_id,student_id,batch_id,bill_period,amount_minor,currency,created_at');
 if(!exact(r,cols.split(',')))deny(502,'UPSTREAM_DATA_INVALID');
 if(!id(r.id)&&!(table==='audit'&&(Number.isSafeInteger(r.id)&&r.id>=1||typeof r.id==='string'&&/^\d{1,18}$/.test(r.id))))deny(502,'UPSTREAM_DATA_INVALID');
 const keys=Object.keys(r);
 for(const k of keys){
  const v=r[k];
  if(['batch_id','student_id','fee_plan_id','due_id','actor_id','entity_id','recipient_id','upload_id'].includes(k)&&!id(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='payment_id'&&v!==null&&!id(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(['created_at','updated_at','occurred_at'].includes(k)&&!stamp(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(['release_at','visible_from','read_at'].includes(k)&&!optionalStamp(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(['amount_minor'].includes(k)&&!amount(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='currency'&&v!=='BDT')deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='bill_period'&&!period(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='due_on'&&(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v))))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='status'&&!['draft','published','archived'].includes(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='kind'&&!['waiver','refund','correction'].includes(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='kind'&&v==='waiver'&&r.payment_id!==null)deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='kind'&&v!=='waiver'&&!id(r.payment_id))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='amount_minor'&&r.kind&&(!Number.isSafeInteger(v)||v===0||(r.kind!=='correction'&&v<0)))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='method'&&!['cash','bank','mobile_banking'].includes(v))deny(502,'UPSTREAM_DATA_INVALID');
  if(['title','label','action'].includes(k)&&!str(v,2,k==='action'?120:160))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='label'&&!str(v,2,120))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='body'&&!str(v,2,10000))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='description'&&!str(v,0,2000))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='reference'&&!str(v,0,120))deny(502,'UPSTREAM_DATA_INVALID');
  if(k==='reason'&&!str(v,5,500))deny(502,'UPSTREAM_DATA_INVALID');
 }
 return Object.fromEntries(keys.map(k=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),r[k]]));
}
function bearer(req){const raw=req.headers.get('authorization')??'',m=/^Bearer ([^\s,]+)$/.exec(raw);if(!m||m[1].length>8192||!JWT.test(m[1]))deny(401,'UNAUTHORIZED');return m[1];}
async function actor(verify,token,role){const v=await verify(token);if(!v||v.verified!==true||!id(v.userId)||v.accessToken!==token||v.accountStatus!=='active')deny(401,'UNAUTHORIZED');if(v.role!==role)deny(403,'FORBIDDEN');return v.userId;}
function paging(req,kind){const qp=new URL(req.url).searchParams,scope=TABLES[kind]?.scope;
 const allowed=['limit','offset'];if(['materials','announcements'].includes(kind))allowed.push('status');if(['feePlans','batchDues','studentDuesTeacher','myDues'].includes(kind))allowed.push('billPeriod');if(scope==='audit')allowed.push('actorId');
 for(const k of qp.keys())if(!allowed.includes(k)||qp.getAll(k).length!==1)deny(400,'INVALID_QUERY');
 const l=qp.get('limit')??'20',o=qp.get('offset')??'0',st=qp.get('status'),p=qp.get('billPeriod'),a=qp.get('actorId');
 if(!/^[1-9]\d*$/.test(l)||!/^(0|[1-9]\d*)$/.test(o)||!Number.isSafeInteger(+l)||!Number.isSafeInteger(+o)||+l>50||+o>10000||(st!==null&&!TABLES[kind].statuses?.includes(st))||(p!==null&&!period(p))||(a!==null&&!id(a)))deny(400,'INVALID_QUERY');
 return {limit:+l,offset:+o,status:st,billPeriod:p,actorId:a};
}
const batchCols='id,code,name,capacity,is_archived';
const studentCols='id,role,full_name,account_status';
const dueCols=TABLES.batchDues.cols;
const enrollmentCols='id,student_id,batch_id,status';
async function single(read,table,cols,idValue,extra={}){const result=await read(table,{select:cols,id:`eq.${idValue}`,limit:'2',...extra});if(!Array.isArray(result)||result.length>2)deny(502,'UPSTREAM_DATA_INVALID');if(!result.length)deny(404,'NOT_FOUND');if(result.length!==1||!exact(result[0],cols.split(','))||result[0].id!==idValue)deny(502,'UPSTREAM_DATA_INVALID');return result[0];}
async function parent(read,scope,target,userId){
 if(scope==='batch'||scope==='studentBatch'){
  const b=await single(read,'batches',batchCols,target);
  if(!str(b.code,2,32)||!str(b.name,1,160)||!Number.isSafeInteger(b.capacity)||b.capacity<1||typeof b.is_archived!=='boolean')deny(502,'UPSTREAM_DATA_INVALID');
  if(scope==='studentBatch'){
   const list=await read('enrollments',{select:enrollmentCols,batch_id:`eq.${target}`,student_id:`eq.${userId}`,status:'eq.active',limit:'2'});
   if(!Array.isArray(list)||list.length>2)deny(502,'UPSTREAM_DATA_INVALID');
   if(list.length!==1||!exact(list[0],enrollmentCols.split(','))||!id(list[0].id)||list[0].student_id!==userId||list[0].batch_id!==target||list[0].status!=='active')deny(403,'FORBIDDEN');
  }
  return {batch:{id:b.id,code:b.code,name:b.name,capacity:b.capacity,isArchived:b.is_archived}};
 }
 if(scope==='student'){
  const s=await single(read,'profiles',studentCols,target,{role:'eq.student'});
  if(s.role!=='student'||!str(s.full_name,0,160)||!['pending','active','disabled','rejected'].includes(s.account_status))deny(502,'UPSTREAM_DATA_INVALID');
  return {student:{id:s.id,fullName:s.full_name,accountStatus:s.account_status}};
 }
 if(scope==='due'){
  const d=convert('batchDues',await single(read,'monthly_dues',dueCols,target));return {due:d};
 }
 return {};
}
function matches(kind,row,target,userId,page,due){
 const scope=TABLES[kind].scope;
 if((scope==='batch'||scope==='studentBatch')&&row.batchId!==target)deny(502,'UPSTREAM_DATA_INVALID');
 if(scope==='student'&&row.studentId!==target)deny(502,'UPSTREAM_DATA_INVALID');
 if(['self','notice'].includes(scope)&&row.studentId!==undefined&&row.studentId!==userId)deny(502,'UPSTREAM_DATA_INVALID');
 if(scope==='notice'&&row.recipientId!==userId)deny(502,'UPSTREAM_DATA_INVALID');
 if(scope==='due'&&(row.dueId!==target||(kind==='duePayments'&&row.studentId!==due.studentId)))deny(502,'UPSTREAM_DATA_INVALID');
 if(scope==='audit'&&page.actorId&&row.actorId!==page.actorId)deny(502,'UPSTREAM_DATA_INVALID');
 if(page.status&&row.status!==page.status)deny(502,'UPSTREAM_DATA_INVALID');
 if(page.billPeriod&&row.billPeriod!==page.billPeriod)deny(502,'UPSTREAM_DATA_INVALID');
 if(scope==='studentBatch'&&(row.status!=='published'||row.releaseAt&&Date.parse(row.releaseAt)>Date.now()||row.visibleFrom&&Date.parse(row.visibleFrom)>Date.now()))deny(502,'UPSTREAM_DATA_INVALID');
}
export function createOfficeReadEndpoint(kind,{verify,readRows}={}){
 if(!TABLES[kind]||typeof verify!=='function'||typeof readRows!=='function')throw Error('INVALID_OFFICE_PORT');
 const cfg=TABLES[kind];
 return async function GET(req,ctx={}){
  try{
   if(!(req instanceof Request)||req.method!=='GET')deny(405,'METHOD_NOT_ALLOWED');
   const page=paging(req,kind),field=cfg.scope==='batch'||cfg.scope==='studentBatch'?'batchId':cfg.scope==='student'?'studentId':cfg.scope==='due'?'dueId':null;
   const target=field?(await ctx.params)?.[field]:null;if(field&&!id(target))deny(400,'INVALID_RESOURCE_ID');
   const token=bearer(req),userId=await actor(verify,token,cfg.role);
   const read=(table,q)=>readRows(table,token,q);
   const context=await parent(read,cfg.scope,target,userId);
   let column=cfg.scope==='batch'||cfg.scope==='studentBatch'?'batch_id':cfg.scope==='student'||cfg.scope==='self'?'student_id':cfg.scope==='due'?'due_id':cfg.scope==='notice'?'recipient_id':null;
   const filter={select:cfg.cols,limit:String(page.limit),offset:String(page.offset),order:cfg.sort};
   if(column)filter[column]=`eq.${['self','notice'].includes(cfg.scope)?userId:target}`;
   if(page.status)filter.status=`eq.${page.status}`;
   if(page.billPeriod)filter.bill_period=`eq.${page.billPeriod}`;
   if(page.actorId)filter.actor_id=`eq.${page.actorId}`;
   if(cfg.scope==='studentBatch')filter.status='eq.published';
   const raw=await read(cfg.table,filter);
   if(!Array.isArray(raw)||raw.length>page.limit)deny(502,'UPSTREAM_DATA_INVALID');
   const items=raw.map(x=>convert(kind,x));if(cfg.scope==='studentBatch')for(const item of items)delete item.uploadId;if(new Set(items.map(x=>x.id)).size!==items.length)deny(502,'UPSTREAM_DATA_INVALID');
   for(const item of items)matches(kind,item,target,userId,page,context.due);
   return send(200,{success:true,data:{...context,items,pagination:page}});
  }catch(e){if(e?.code&&[400,401,403,404,405,502].includes(e.status))return send(e.status,{success:false,error:{code:e.code}});return send(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}
 };
}
export function createFinanceReportEndpoint({verify,readRows}={}){
 if(typeof verify!=='function'||typeof readRows!=='function')throw Error('INVALID_REPORT_PORT');
 return async function GET(req,ctx={}){
  try{
   if(!(req instanceof Request)||req.method!=='GET')deny(405,'METHOD_NOT_ALLOWED');
   const qp=new URL(req.url).searchParams;for(const key of qp.keys())if(key!=='billPeriod'||qp.getAll(key).length!==1)deny(400,'INVALID_QUERY');
   const p=qp.get('billPeriod');if(!period(p))deny(400,'INVALID_QUERY');
   const batchId=(await ctx.params)?.batchId;if(!id(batchId))deny(400,'INVALID_RESOURCE_ID');
   const token=bearer(req),userId=await actor(verify,token,'teacher');
   const read=(table,q)=>readRows(table,token,q);
   const meta=await parent(read,'batch',batchId,userId);
   const dues=await read('monthly_dues',{select:dueCols,batch_id:`eq.${batchId}`,bill_period:`eq.${p}`,order:'created_at.asc',limit:'101'});
   if(!Array.isArray(dues)||dues.length>100)deny(422,'REPORT_LIMIT_EXCEEDED');
   const validated=dues.map(x=>convert('batchDues',x));if(new Set(validated.map(d=>d.id)).size!==validated.length||validated.some(d=>d.batchId!==batchId||d.billPeriod!==p))deny(502,'UPSTREAM_DATA_INVALID');
   let payments=[],adjustments=[];
   if(validated.length){
    const ids=validated.map(d=>d.id),set=new Set(ids),q=`in.(${ids.join(',')})`;
    [payments,adjustments]=await Promise.all([read('payments',{select:TABLES.studentPaymentsTeacher.cols,due_id:q,limit:'2001'}),read('payment_adjustments',{select:TABLES.dueAdjustments.cols,due_id:q,limit:'2001'})]);
    if(!Array.isArray(payments)||!Array.isArray(adjustments)||payments.length>2000||adjustments.length>2000)deny(422,'REPORT_LIMIT_EXCEEDED');
    const byDue=new Map(validated.map(d=>[d.id,d]));
    payments=payments.map(x=>convert('studentPaymentsTeacher',x));adjustments=adjustments.map(x=>convert('dueAdjustments',x));
    if(new Set(payments.map(x=>x.id)).size!==payments.length||new Set(adjustments.map(x=>x.id)).size!==adjustments.length||payments.some(v=>!set.has(v.dueId)||v.studentId!==byDue.get(v.dueId)?.studentId)||adjustments.some(v=>!set.has(v.dueId)))deny(502,'UPSTREAM_DATA_INVALID');
   }
   const sum=arr=>{let n=0n;for(const x of arr)n+=BigInt(x.amountMinor);return n.toString();};
   const parts={cash:payments,waivers:adjustments.filter(a=>a.kind==='waiver'),refunds:adjustments.filter(a=>a.kind==='refund'),corrections:adjustments.filter(a=>a.kind==='correction')};
   const data={batch:meta.batch,billPeriod:p,dueCount:validated.length,paymentCount:payments.length,adjustmentCount:adjustments.length,totalsMinor:{billed:sum(validated),payments:sum(parts.cash),waivers:sum(parts.waivers),refunds:sum(parts.refunds),corrections:sum(parts.corrections)},currency:'BDT',complete:true};
   return send(200,{success:true,data});
  }catch(e){if(e?.code&&[400,401,403,404,405,422,502].includes(e.status))return send(e.status,{success:false,error:{code:e.code}});return send(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}
 };
}
