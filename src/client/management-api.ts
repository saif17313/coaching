/** Browser helpers for the Teacher management API and Student academic reads. */
const ERRORS:Record<string,string>={
 SESSION_IN_FUTURE:'A class can only be marked completed on or after its date.',INVALID_SESSION_TRANSITION:'The class already has that status.',INVALID_SESSION:'Check the class date and times (the end must be after the start).',
 INVALID_LIFECYCLE_TRANSITION:'That status change is not allowed from the current status.',LIFECYCLE_REASON_REQUIRED:'Add a short reason for this status change.',LIFECYCLE_UNCHANGED:'The Student already has this status.',
 BATCH_CODE_EXISTS:'Another batch already uses this code.',BATCH_CODE_IMMUTABLE:'The batch code is locked once Students have enrolled.',CAPACITY_BELOW_ACTIVE:'Capacity cannot be lower than the number of active Students.',
 BATCH_NOT_BILLABLE:'Only open or running batches can be billed.',NO_FEE_RULE:'Set a monthly fee for this batch before billing.',FEE_RULE_EXISTS_FOR_PERIOD:'A fee change already starts in that month.',
 BATCH_UNAVAILABLE:'This batch is archived or cancelled.',STUDENT_NOT_ENROLLED:'The Student is not enrolled in this batch.',CONCESSION_OVERLAP:'An active concession already covers part of that period.',
 EXAM_NOT_EDITABLE:'Results are already published, so exam details are locked.',EXAM_NOT_HELD:'Attendance and marks can be recorded after the exam time.',EXAM_NOT_SCHEDULED:'Schedule (publish) the exam before recording results.',
 MARKS_EXCEED_MAX:'Marks cannot exceed the total marks.',RESULT_ALREADY_PUBLISHED:'This result is already published.',RESULT_SET_NOT_READY:'Record every result as a draft before publishing.',
 SYLLABUS_DEPTH_EXCEEDED:'Topics cannot contain further topics.',COMPLETION_IN_FUTURE:'Completion date cannot be in the future.',STUDENT_LIFECYCLE_NOT_ACTIVE:'This Student is not active, so new enrollments are blocked.',
 ADMISSION_CLOSED:'Admission is closed for this batch.',BATCH_NOT_ACCEPTING:'This batch is not accepting enrollments.',WRITE_SERVICE_UNAVAILABLE:'Saving is temporarily unavailable.',PAYMENT_EXCEEDS_BALANCE:'The payment is larger than the outstanding balance.',
 UNAUTHORIZED:'Your session has expired. Please sign in again.',FORBIDDEN:'This account does not have access.',
};
export const friendlyError=(code:string)=>ERRORS[code]??code.replaceAll('_',' ').toLowerCase();

async function parse(response:Response){
 const body=await response.json().catch(()=>null) as {success?:boolean;data?:unknown;error?:{code?:string}}|null;
 if(!response.ok||!body?.success)throw new Error(friendlyError(body?.error?.code??`HTTP_${response.status}`));
 return body.data;
}
export async function managementRead<T=unknown>(action:string,params:Record<string,string|number|undefined|null>={},role:'teacher'|'student'='teacher',signal?:AbortSignal):Promise<T>{
 const query=new URLSearchParams();for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')query.set(key,String(value));
 const base=role==='teacher'?'/api/v1/teacher/management/':'/api/v1/student/academic/';
 return parse(await fetch(base+action+(query.size?'?'+query:''),{cache:'no-store',credentials:'same-origin',signal})) as Promise<T>;
}
export async function managementCommand<T=unknown>(action:string,body:unknown,operationId:string=crypto.randomUUID()):Promise<T>{
 return parse(await fetch('/api/v1/teacher/management/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':operationId},body:JSON.stringify(body)})) as Promise<T>;
}
export async function uploadImage(file:File,alt:string):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG or WEBP image.');
 if(file.size>5*1024*1024)throw new Error('Images must be 5 MB or smaller.');
 const response=await fetch('/api/v1/teacher/website/media/upload',{method:'POST',headers:{'Content-Type':file.type,'x-musa-ui':'1','Idempotency-Key':crypto.randomUUID(),'x-media-id':crypto.randomUUID(),'x-media-alt':alt},body:file});
 const data=await parse(response) as {id?:unknown};if(typeof data?.id!=='string')throw new Error('Upload was not confirmed.');return data.id;
}

/** Integer paisa as a BDT string, e.g. "250000" -> "2,500" or "2,500.50". */
export function taka(minor:string|number|bigint|null|undefined){
 if(minor===null||minor===undefined||minor==='')return '—';
 const value=BigInt(minor),negative=value<0n,abs=negative?-value:value,whole=(abs/100n).toLocaleString('en-US'),paisa=abs%100n;
 return (negative?'-':'')+'৳'+whole+(paisa?'.'+paisa.toString().padStart(2,'0'):'');
}
/** "2,500.5" -> 250050 (integer paisa) or null when not a valid positive amount. */
export function toMinor(text:string):number|null{
 const clean=text.replaceAll(',','').trim();if(!/^\d{1,9}(\.\d{1,2})?$/.test(clean))return null;
 const [whole,fraction='']=clean.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export const currentPeriod=()=>new Date(Date.now()+6*3600000).toISOString().slice(0,7);
export const periodLabel=(period:string)=>{const [y,m]=period.split('-').map(Number);return new Date(Date.UTC(y,m-1,1)).toLocaleString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});};
export const DAY_LABELS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
/** Bangladesh week order (Saturday first) for day pickers and schedule text. */
export const WEEK_ORDER=[6,0,1,2,3,4,5];
export const clock=(minute:number|null|undefined)=>minute===null||minute===undefined?'':`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export const minuteOf=(value:string)=>{const m=/^(\d{2}):(\d{2})$/.exec(value);return m?Number(m[1])*60+Number(m[2]):null;};
export function scheduleText(days:number[]|undefined,start:number|null|undefined,end:number|null|undefined){
 const dayText=[...(days??[])].sort((a,b)=>WEEK_ORDER.indexOf(a)-WEEK_ORDER.indexOf(b)).map(day=>DAY_LABELS[day]).join(', ');const time=start!==null&&start!==undefined?`${clock(start)}–${clock(end)}`:'';
 return [dayText,time].filter(Boolean).join(' · ')||'Schedule not set';
}
