/**
 * Teacher management reads and commands (student lifecycle, batch profile, billing, ledger, exams,
 * syllabus) and the Student academic reads. Pure parsing and error mapping: every action is an
 * allow-listed RPC with exact input keys, so routes never forward arbitrary parameters.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const CONTROL=/[\x00-\x1f\x7f]/;
export const isUuid=value=>typeof value==='string'&&UUID.test(value);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max,min=0)=>typeof value==='string'&&value.length<=max&&value.trim().length>=min&&!CONTROL.test(value);
const longText=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const int=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const oneOf=(value,list)=>typeof value==='string'&&list.includes(value);
const only=(value,keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key));
const fail=(status,code)=>{const error=new Error(code);error.status=status;error.code=code;throw error;};

function page(query,max){
 const limit=query.get('limit')??'20',offset=query.get('offset')??'0';
 if(!/^[1-9]\d{0,2}$/.test(limit)||Number(limit)>max||!/^(0|[1-9]\d{0,5})$/.test(offset)||Number(offset)>100000)fail(400,'INVALID_FILTER');
 return {p_limit:Number(limit),p_offset:Number(offset)};
}
function filter(query,key,check){const value=query.get(key)??'';if(!check(value))fail(400,'INVALID_FILTER');return value;}
const optionalUuid=(query,key)=>{const value=query.get(key)??'';if(value&&!isUuid(value))fail(400,'INVALID_FILTER');return value||null;};
const requiredUuid=(query,key)=>{const value=query.get(key)??'';if(!isUuid(value))fail(400,'INVALID_FILTER');return value;};
const search=value=>text(value,100);

export const TEACHER_READS={
 students:{rpc:'coaching_teacher_student_directory_v2',keys:['q','accountStatus','className','feeStatus','lifecycle','batchId','limit','offset'],args:q=>({
  p_search:filter(q,'q',search).trim(),p_status:filter(q,'accountStatus',v=>['','pending','active','disabled','rejected'].includes(v)),
  p_class:filter(q,'className',v=>text(v,80)),p_fee_status:filter(q,'feeStatus',v=>['','paid','pending'].includes(v)),
  p_lifecycle:filter(q,'lifecycle',v=>['','active','inactive','cancelled','completed'].includes(v)),p_batch_id:optionalUuid(q,'batchId'),...page(q,50)})},
 batches:{rpc:'coaching_teacher_batch_directory_v2',keys:['q','status','admission','level','limit','offset'],args:q=>({
  p_search:filter(q,'q',search).trim(),p_status:filter(q,'status',v=>['','draft','open','running','completed','archived','cancelled','current','upcoming'].includes(v)),
  p_admission:filter(q,'admission',v=>['','open','closed'].includes(v)),p_level:filter(q,'level',v=>text(v,80)),...page(q,50)})},
 'batch-profile':{rpc:'coaching_batch_profile',keys:['batchId'],args:q=>({p_batch_id:requiredUuid(q,'batchId')})},
 'payment-ledger':{rpc:'coaching_teacher_payment_ledger',keys:['period','batchId','status','method','q','studentId','limit','offset'],args:q=>({
  p_period:filter(q,'period',v=>v===''||/^\d{4}$/.test(v)||PERIOD.test(v)),p_batch_id:optionalUuid(q,'batchId'),
  p_status:filter(q,'status',v=>['','paid','partial','unpaid','waived','overdue','refunded'].includes(v)),
  p_method:filter(q,'method',v=>['','cash','bank','mobile_banking'].includes(v)),p_search:filter(q,'q',search).trim(),p_student_id:optionalUuid(q,'studentId'),...page(q,100)})},
 'student-lifecycle':{rpc:'coaching_student_lifecycle',keys:['studentId'],args:q=>({p_student_id:requiredUuid(q,'studentId')})},
 'exam-sheet':{rpc:'coaching_teacher_exam_sheet',keys:['examId'],args:q=>({p_exam_id:requiredUuid(q,'examId')})},
 syllabus:{rpc:'coaching_batch_syllabus_progress',keys:['batchId'],args:q=>({p_batch_id:requiredUuid(q,'batchId')})},
};

export const STUDENT_READS={
 'exam-history':{rpc:'coaching_student_exam_history',keys:[],args:()=>({})},
 syllabus:{rpc:'coaching_batch_syllabus_progress',keys:['batchId'],args:q=>({p_batch_id:requiredUuid(q,'batchId')})},
 'batch-profile':{rpc:'coaching_batch_profile',keys:['batchId'],args:q=>({p_batch_id:requiredUuid(q,'batchId')})},
};

export function parseRead(table,action,query){
 const entry=Object.hasOwn(table,action)?table[action]:null;if(!entry)fail(404,'UNKNOWN_ACTION');
 for(const key of query.keys())if(!entry.keys.includes(key)||query.getAll(key).length!==1)fail(400,'INVALID_FILTER');
 return {rpc:entry.rpc,args:entry.args(query)};
}

const BATCH_KEYS=['code','name','capacity','startsOn','endsOn','status','admissionOpen','coverMediaId','subject','academicLevel','academicSession','description','scheduleDays','classStartMinute','classEndMinute','monthlyFeeMinor','admissionFeeMinor','dueDay'];
function validBatchData(data,create){
 if(!only(data,BATCH_KEYS))return false;
 if(create&&(!text(data.code,32,2)||!text(data.name,160,1)||!int(data.capacity,1,100000)))return false;
 if('code' in data&&!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(data.code))return false;
 if('name' in data&&!text(data.name,160,1))return false;
 if('capacity' in data&&!int(data.capacity,1,100000))return false;
 for(const key of ['startsOn','endsOn'])if(key in data&&!(data[key]===''||DATE.test(data[key])))return false;
 if(data.startsOn&&data.endsOn&&data.startsOn>data.endsOn)return false;
 if('status' in data&&!oneOf(data.status,['draft','open','running','completed','archived','cancelled']))return false;
 if('admissionOpen' in data&&typeof data.admissionOpen!=='boolean')return false;
 if('coverMediaId' in data&&!(data.coverMediaId===''||isUuid(data.coverMediaId)))return false;
 for(const [key,max] of [['subject',120],['academicLevel',80],['academicSession',80]])if(key in data&&!text(data[key],max))return false;
 if('description' in data&&!longText(data.description,2000))return false;
 if('scheduleDays' in data&&!(Array.isArray(data.scheduleDays)&&data.scheduleDays.length<=7&&data.scheduleDays.every(day=>int(day,0,6))&&new Set(data.scheduleDays).size===data.scheduleDays.length))return false;
 const hasStart='classStartMinute' in data,hasEnd='classEndMinute' in data;
 if(hasStart!==hasEnd)return false;
 if(hasStart&&!((data.classStartMinute===null&&data.classEndMinute===null)||(int(data.classStartMinute,0,1439)&&int(data.classEndMinute,1,1440)&&data.classEndMinute>data.classStartMinute)))return false;
 if(!create&&['monthlyFeeMinor','admissionFeeMinor','dueDay'].some(key=>key in data))return false;
 if('monthlyFeeMinor' in data&&!int(data.monthlyFeeMinor,1,100000000000))return false;
 if('admissionFeeMinor' in data&&!int(data.admissionFeeMinor,0,100000000000))return false;
 if('dueDay' in data&&!int(data.dueDay,1,28))return false;
 return true;
}

export const TEACHER_COMMANDS={
 'student-lifecycle':{rpc:'coaching_set_student_lifecycle',valid:b=>only(b,['studentId','status','reason'])&&isUuid(b.studentId)&&oneOf(b.status,['active','inactive','cancelled','completed'])&&(b.reason===undefined||text(b.reason,500)),
  args:(b,op)=>({p_student_id:b.studentId,p_status:b.status,p_reason:(b.reason??'').trim(),p_operation_id:op})},
 'batch-write':{rpc:'coaching_batch_profile_write',valid:b=>only(b,['action','batchId','data'])&&oneOf(b.action,['create','update'])&&(b.action==='create'?b.batchId===undefined:isUuid(b.batchId))&&validBatchData(b.data,b.action==='create'),
  args:(b,op)=>({p_action:b.action,p_batch_id:b.batchId??null,p_data:b.data,p_operation_id:op})},
 'fee-rule':{rpc:'coaching_add_batch_fee_rule',valid:b=>only(b,['batchId','effectiveFrom','monthlyFeeMinor','admissionFeeMinor','dueDay','reason'])&&isUuid(b.batchId)&&PERIOD.test(b.effectiveFrom??'')&&int(b.monthlyFeeMinor,1,100000000000)&&int(b.admissionFeeMinor,0,100000000000)&&int(b.dueDay,1,28)&&text(b.reason,300,3),
  args:(b,op)=>({p_batch_id:b.batchId,p_effective_from:b.effectiveFrom,p_monthly_fee_minor:b.monthlyFeeMinor,p_admission_fee_minor:b.admissionFeeMinor,p_due_day:b.dueDay,p_reason:b.reason.trim(),p_operation_id:op})},
 concession:{rpc:'coaching_fee_concession_write',valid:b=>only(b,['action','concessionId','studentId','batchId','kind','value','startsPeriod','endsPeriod','reason'])&&(b.action==='revoke'?isUuid(b.concessionId)&&Object.keys(b).length===2
   :b.action==='grant'&&b.concessionId===undefined&&isUuid(b.studentId)&&isUuid(b.batchId)&&oneOf(b.kind,['percent','amount'])&&(b.kind==='percent'?int(b.value,1,100):int(b.value,1,100000000000))
    &&PERIOD.test(b.startsPeriod??'')&&(b.endsPeriod===undefined||b.endsPeriod===''||(PERIOD.test(b.endsPeriod)&&b.endsPeriod>=b.startsPeriod))&&text(b.reason,300,5)),
  args:(b,op)=>b.action==='revoke'?{p_action:'revoke',p_concession_id:b.concessionId,p_data:{},p_operation_id:op}
   :{p_action:'grant',p_concession_id:null,p_data:{studentId:b.studentId,batchId:b.batchId,kind:b.kind,value:b.value,startsPeriod:b.startsPeriod,...(b.endsPeriod?{endsPeriod:b.endsPeriod}:{}),reason:b.reason.trim()},p_operation_id:op}},
 'bill-period':{rpc:'coaching_bill_batch_period',valid:b=>only(b,['batchId','period'])&&isUuid(b.batchId)&&PERIOD.test(b.period??''),args:(b,op)=>({p_batch_id:b.batchId,p_period:b.period,p_operation_id:op})},
 'apply-concessions':{rpc:'coaching_apply_fee_concessions',valid:b=>only(b,['planId'])&&isUuid(b.planId),args:(b,op)=>({p_plan_id:b.planId,p_operation_id:op})},
 'exam-details':{rpc:'coaching_update_exam_details',valid:b=>only(b,['examId','title','scheduledAt','maxMarks','passMarks','instructions','coverageUnitIds','examType','durationMinutes'])&&isUuid(b.examId)&&text(b.title,120,2)
   &&typeof b.scheduledAt==='string'&&!Number.isNaN(Date.parse(b.scheduledAt))&&int(b.maxMarks,1,10000)&&(b.passMarks===null||int(b.passMarks,0,b.maxMarks))&&longText(b.instructions,4000)
   &&Array.isArray(b.coverageUnitIds)&&b.coverageUnitIds.length<=200&&b.coverageUnitIds.every(isUuid)&&oneOf(b.examType,['class_test','weekly','monthly','model_test','assignment','final'])&&(b.durationMinutes===null||int(b.durationMinutes,5,600)),
  args:(b,op)=>({p_exam_id:b.examId,p_title:b.title.trim(),p_scheduled_at:new Date(b.scheduledAt).toISOString(),p_max_marks:b.maxMarks,p_pass_marks:b.passMarks,p_instructions:b.instructions,p_coverage_unit_ids:b.coverageUnitIds,p_exam_type:b.examType,p_duration_minutes:b.durationMinutes,p_operation_id:op})},
 'exam-attendance':{rpc:'coaching_record_exam_attendance',valid:b=>only(b,['examId','studentId','attendance','marks','remarks'])&&isUuid(b.examId)&&isUuid(b.studentId)&&oneOf(b.attendance,['attempted','absent'])
   &&(b.attendance==='absent'?b.marks===null:typeof b.marks==='number'&&Number.isFinite(b.marks)&&b.marks>=0&&b.marks<=10000&&Math.round(b.marks*100)===b.marks*100)&&text(b.remarks??'',500),
  args:(b,op)=>({p_exam_id:b.examId,p_student_id:b.studentId,p_attendance:b.attendance,p_marks:b.marks,p_remarks:(b.remarks??'').trim(),p_operation_id:op})},
 'syllabus-write':{rpc:'coaching_syllabus_unit_write',valid:b=>only(b,['action','unitId','subjectId','data'])&&oneOf(b.action,['create','update','status'])&&plain(b.data)
   &&(b.action==='create'?isUuid(b.subjectId)&&b.unitId===undefined:isUuid(b.unitId)&&b.subjectId===undefined)
   &&(b.action==='status'?only(b.data,['status','completedOn'])&&oneOf(b.data.status,['planned','in_progress','completed'])&&(b.data.completedOn===undefined||DATE.test(b.data.completedOn))
    :only(b.data,['title','parentId','weight','plannedStart','plannedEnd','notes'])&&(b.action==='update'||text(b.data.title,160,2))&&(b.data.title===undefined||text(b.data.title,160,2))
     &&(b.data.parentId===undefined||b.data.parentId===''||isUuid(b.data.parentId))&&(b.data.weight===undefined||int(b.data.weight,1,100))
     &&['plannedStart','plannedEnd'].every(key=>b.data[key]===undefined||b.data[key]===''||DATE.test(b.data[key]))&&(b.data.notes===undefined||longText(b.data.notes,1000))),
  args:(b,op)=>({p_action:b.action,p_unit_id:b.unitId??null,p_subject_id:b.subjectId??null,p_data:b.data,p_operation_id:op})},
};

export function parseCommand(action,body,operation){
 const entry=Object.hasOwn(TEACHER_COMMANDS,action)?TEACHER_COMMANDS[action]:null;if(!entry)fail(404,'UNKNOWN_ACTION');
 if(!isUuid(operation))fail(400,'INVALID_OPERATION_ID');
 if(!entry.valid(body))fail(400,'INVALID_INPUT');
 return {rpc:entry.rpc,args:entry.args(body,operation)};
}

const KNOWN=new Map(Object.entries({
 FORBIDDEN:403,IDEMPOTENCY_CONFLICT:409,STUDENT_NOT_FOUND:404,BATCH_NOT_FOUND:404,EXAM_NOT_FOUND:404,UNIT_NOT_FOUND:404,SUBJECT_NOT_FOUND:404,PLAN_NOT_FOUND:404,CONCESSION_NOT_FOUND:404,MEDIA_NOT_FOUND:404,
 INVALID_LIFECYCLE:400,INVALID_LIFECYCLE_TRANSITION:409,LIFECYCLE_UNCHANGED:409,LIFECYCLE_REASON_REQUIRED:400,
 INVALID_BATCH:400,INVALID_SCHEDULE:400,INVALID_FEE_RULE:400,BATCH_CODE_EXISTS:409,BATCH_CODE_IMMUTABLE:409,CAPACITY_BELOW_ACTIVE:409,COVER_MEDIA_INVALID:400,
 BATCH_UNAVAILABLE:409,BATCH_NOT_BILLABLE:409,NO_FEE_RULE:409,FEE_RULE_EXISTS_FOR_PERIOD:409,
 INVALID_CONCESSION:400,STUDENT_NOT_ENROLLED:409,CONCESSION_OVERLAP:409,CONCESSION_NOT_ACTIVE:409,INVALID_INPUT:400,
 INVALID_EXAM:400,EXAM_NOT_EDITABLE:409,MARKS_EXCEED_MAX:400,COVERAGE_SUBJECT_MISMATCH:400,INVALID_RESULT:400,EXAM_NOT_SCHEDULED:409,EXAM_NOT_HELD:409,
 STUDENT_NOT_ACTIVE:409,RESULT_ALREADY_PUBLISHED:409,
 INVALID_SYLLABUS:400,PARENT_SUBJECT_MISMATCH:400,SYLLABUS_DEPTH_EXCEEDED:409,SYLLABUS_TOO_LARGE:409,COMPLETION_IN_FUTURE:400,INVALID_FILTER:400,
}));
/** Maps a PostgREST RPC error body to a safe status/code; unknown errors never leak details. */
export function managementFailure(status,body){
 const message=plain(body)?String(body.message??''):'';
 if(KNOWN.has(message))return {status:KNOWN.get(message),code:message};
 if(status===401)return {status:401,code:'UNAUTHORIZED'};
 if(status===404&&/function/i.test(message))return {status:503,code:'MIGRATION_NOT_APPLIED'};
 return {status:503,code:'SERVICE_UNAVAILABLE'};
}
