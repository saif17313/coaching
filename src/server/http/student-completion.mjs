import {RpcError} from './rpc-errors.mjs';
/** Student portal completion: signed JWT, strict DTOs, no direct finance table grants. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const period=/^\d{4}-(0[1-9]|1[0-2])$/;
const kinds={dashboard:['GET','coaching_student_dashboard'],profile:['GET','coaching_student_profile'],profileUpdate:['PATCH','coaching_student_update_own_profile'],billing:['GET','coaching_student_billing_statement'],billingCsv:['GET','coaching_student_billing_statement'],calendar:['GET','coaching_student_calendar'],progress:['GET','coaching_student_progress']};
export const studentCompletionKinds=Object.freeze(Object.keys(kinds));
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const id=x=>typeof x==='string'&&UUID.test(x);
const str=(x,a,b)=>typeof x==='string'&&x.length<=b&&x.trim().length>=a&&!/[\x00-\x1f\x7f]/.test(x);
const int=(x,max=100000000)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const money=x=>typeof x==='string'&&/^(?:0|[1-9]\d{0,17}|-[1-9]\d{0,17})$/.test(x);
const stamp=x=>typeof x==='string'&&x.length>=20&&x.length<=40&&Number.isFinite(Date.parse(x));
const date=x=>{if(typeof x!=='string'||!/^\d{4}-\d\d-\d\d$/.test(x))return false;const d=new Date(x+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;};
const fail=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const headers={'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
const result=(status,x)=>Response.json(x,{status,headers});
function validProfile(v,uid,patch=false){if(!exact(v,patch?['id','fullName']:['id','fullName','joinedAt'])||v.id!==uid||!str(v.fullName,patch?2:0,160)||(!patch&&!stamp(v.joinedAt)))fail(502,'UPSTREAM_DATA_INVALID');return v;}
function validBilling(v,uid,p){
 if(!exact(v,['studentId','billPeriod','currency','totalsMinor','items'])||v.studentId!==uid||v.billPeriod!==p||v.currency!=='BDT'||!exact(v.totalsMinor,['billed','paid','waived','refunded','corrections','outstanding'])||!Object.values(v.totalsMinor).every(money)||!Array.isArray(v.items)||v.items.length>100)fail(502,'UPSTREAM_DATA_INVALID');
 let totals=[0n,0n,0n,0n,0n,0n],seen=new Set();for(const r of v.items){if(!exact(r,['id','batchId','billPeriod','billedMinor','paidMinor','waivedMinor','refundedMinor','correctionsMinor','outstandingMinor'])||!id(r.id)||seen.has(r.id)||!id(r.batchId)||r.billPeriod!==p||!['billedMinor','paidMinor','waivedMinor','refundedMinor','correctionsMinor','outstandingMinor'].every(k=>money(r[k])))fail(502,'UPSTREAM_DATA_INVALID');seen.add(r.id);
 const nums=['billedMinor','paidMinor','waivedMinor','refundedMinor','correctionsMinor','outstandingMinor'].map(k=>BigInt(r[k]));if(nums.slice(0,4).some(n=>n<0n)||nums[5]<0n||nums[0]-nums[1]-nums[2]+nums[3]-nums[4]!==nums[5])fail(502,'UPSTREAM_DATA_INVALID');totals=totals.map((n,i)=>n+nums[i]);}
 const ks=['billed','paid','waived','refunded','corrections','outstanding'];if(ks.some((k,i)=>BigInt(v.totalsMinor[k])!==totals[i]))fail(502,'UPSTREAM_DATA_INVALID');return v;
}
function validDashboard(v,uid){
 if(!exact(v,['studentId','fullName','counts','outstandingMinor','currency','upcoming'])||v.studentId!==uid||!str(v.fullName,0,160)||v.currency!=='BDT'||!money(v.outstandingMinor)||BigInt(v.outstandingMinor)<0n||!exact(v.counts,['activeBatches','assignments','upcomingAssignments','upcomingExams','publishedResults','unreadNotifications','unpaidDues'])||!Object.values(v.counts).every(x=>int(x,10000000))||!Array.isArray(v.upcoming)||v.upcoming.length>10)fail(502,'UPSTREAM_DATA_INVALID');
 const seen=new Set();for(const x of v.upcoming){if(!exact(x,['id','batchId','kind','title','at'])||!id(x.id)||!id(x.batchId)||!['assignment','exam'].includes(x.kind)||!str(x.title,2,160)||!stamp(x.at)||seen.has(x.kind+':'+x.id))fail(502,'UPSTREAM_DATA_INVALID');seen.add(x.kind+':'+x.id);}return v;
}
function validCalendar(v,from,to){if(!exact(v,['from','to','items'])||v.from!==from||v.to!==to||!Array.isArray(v.items)||v.items.length>100)fail(502,'UPSTREAM_DATA_INVALID');const seen=new Set();for(const x of v.items){if(!exact(x,['id','batchId','kind','title','at'])||!id(x.id)||!id(x.batchId)||!['assignment','exam'].includes(x.kind)||!str(x.title,2,160)||!stamp(x.at)||seen.has(x.kind+x.id)||x.at.slice(0,10)<from||x.at.slice(0,10)>to)fail(502,'UPSTREAM_DATA_INVALID');seen.add(x.kind+x.id);}return v;}
function validProgress(v,uid){if(!exact(v,['studentId','publishedExamResults','gradedAssignments','earnedMarksX100','possibleMarksX100','earnedPoints','possiblePoints'])||v.studentId!==uid||!int(v.publishedExamResults)||!int(v.gradedAssignments)||!['earnedMarksX100','possibleMarksX100','earnedPoints','possiblePoints'].every(k=>money(v[k])&&BigInt(v[k])>=0n)||BigInt(v.earnedMarksX100)>BigInt(v.possibleMarksX100)||BigInt(v.earnedPoints)>BigInt(v.possiblePoints))fail(502,'UPSTREAM_DATA_INVALID');return v;}
function csv(v){const esc=x=>'"'+String(x).replaceAll('"','""').replace(/^[\s\uFEFF]*([=+@\-])/,"'$1")+'"';let rows=[['Due ID','Batch ID','Period','Billed (BDT minor)','Paid','Waived','Refunded','Corrections','Outstanding']];for(const x of v.items)rows.push([x.id,x.batchId,x.billPeriod,x.billedMinor,x.paidMinor,x.waivedMinor,x.refundedMinor,x.correctionsMinor,x.outstandingMinor]);return '\uFEFF'+rows.map(r=>r.map(esc).join(',')).join('\r\n')+'\r\n';}
async function parseBody(req){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))fail(415,'UNSUPPORTED_MEDIA_TYPE');
 const len=req.headers.get('content-length');if(len!==null&&(!/^\d+$/.test(len)||Number(len)>1024))fail(413,'BODY_TOO_LARGE');
 if(!req.body)fail(400,'INVALID_BODY');const reader=req.body.getReader();let size=0,parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024)fail(413,'BODY_TOO_LARGE');parts.push(value);}}finally{reader.releaseLock();}
 const buf=new Uint8Array(size);let off=0;for(const part of parts){buf.set(part,off);off+=part.length;}
 let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf));}catch{fail(400,'INVALID_BODY');}
 if(!exact(data,['fullName'])||!str(data.fullName,2,160))fail(400,'INVALID_PROFILE');return {fullName:data.fullName.trim()};
}
export function createStudentCompletionRoute(kind,{verify,call}={}){
 if(!Object.hasOwn(kinds,kind)||typeof verify!=='function'||typeof call!=='function')throw Error('INVALID_STUDENT_COMPLETION_PORT');
 return async function route(req){try{
  if(!(req instanceof Request)||req.method!==kinds[kind][0])fail(405,'METHOD_NOT_ALLOWED');const qp=new URL(req.url).searchParams;const wanted=kind==='billing'||kind==='billingCsv'?['billPeriod']:kind==='calendar'?['from','to']:[];
  if([...qp.keys()].some(k=>!wanted.includes(k)||qp.getAll(k).length!==1)||qp.size!==wanted.length)fail(400,'INVALID_QUERY');
  const p=qp.get('billPeriod'),from=qp.get('from'),to=qp.get('to');if((kind==='billing'||kind==='billingCsv')&&!period.test(p??''))fail(400,'INVALID_QUERY');
  if(kind==='calendar'){if(!date(from)||!date(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>31)fail(400,'INVALID_QUERY');}
  const raw=req.headers.get('authorization')??'',m=/^Bearer ([^\s,]+)$/.exec(raw);if(!m||m[1].length>8192||!JWT.test(m[1]))fail(401,'UNAUTHORIZED');const token=m[1];
  const key=kind==='profileUpdate'?req.headers.get('idempotency-key'):null;if(kind==='profileUpdate'&&!id(key))fail(400,'INVALID_OPERATION_ID');
  const body=kind==='profileUpdate'?await parseBody(req):{};
  const actor=await verify(token);if(!actor||actor.verified!==true||!id(actor.userId)||actor.accessToken!==token||actor.role!=='student'||actor.accountStatus!=='active')fail(403,'FORBIDDEN');
  const args=kind==='profileUpdate'?{p_full_name:body.fullName,p_operation_id:key}:kind==='billing'||kind==='billingCsv'?{p_bill_period:p}:kind==='calendar'?{p_from:from,p_to:to}:{};
  const rawData=await call(kinds[kind][1],token,args);
  let data=kind==='profile'||kind==='profileUpdate'?validProfile(rawData,actor.userId,kind==='profileUpdate'):kind==='dashboard'?validDashboard(rawData,actor.userId):kind==='billing'||kind==='billingCsv'?validBilling(rawData,actor.userId,p):kind==='calendar'?validCalendar(rawData,from,to):validProgress(rawData,actor.userId);
  if(kind==='billingCsv')return new Response(csv(data),{status:200,headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="student-billing.csv"'}});
  return result(200,{success:true,data});
 }catch(e){if(e instanceof RpcError)return result(e.status,{success:false,error:{code:e.code}});if(e&&[400,401,403,405,413,415,502].includes(e.status)&&e.code)return result(e.status,{success:false,error:{code:e.code}});return result(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}}
}
