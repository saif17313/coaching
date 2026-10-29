import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {STUDENT_READS,TEACHER_READS,managementFailure,parseCommand,parseRead} from '../src/server/management-commands.mjs';
import {validateStudentDirectory} from '../src/client/student-directory.mjs';

const op='3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b',id='9b7e1f2a-3c4d-4e5f-9a6b-7c8d9e0f1a2b';
const q=entries=>new URLSearchParams(entries);
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code);

test('reads are allow-listed and forward exact RPC arguments',()=>{
 assert.deepEqual(parseRead(TEACHER_READS,'students',q({q:' Rahim ',lifecycle:'cancelled',limit:'20',offset:'0'})),{rpc:'coaching_teacher_student_directory_v2',
  args:{p_search:'Rahim',p_status:'',p_class:'',p_fee_status:'',p_lifecycle:'cancelled',p_batch_id:null,p_limit:20,p_offset:0}});
 assert.equal(parseRead(TEACHER_READS,'payment-ledger',q({period:'2026-10',status:'partial'})).args.p_period,'2026-10');
 assert.equal(parseRead(TEACHER_READS,'payment-ledger',q({period:'2026'})).args.p_period,'2026');
 rejects(()=>parseRead(TEACHER_READS,'students',q({lifecycle:'deleted'})),'INVALID_FILTER');
 rejects(()=>parseRead(TEACHER_READS,'students',q({role:'teacher'})),'INVALID_FILTER');
 rejects(()=>parseRead(TEACHER_READS,'payment-ledger',q({period:'2026-13'})),'INVALID_FILTER');
 rejects(()=>parseRead(TEACHER_READS,'batches',q({limit:'51'})),'INVALID_FILTER');
 rejects(()=>parseRead(TEACHER_READS,'exam-sheet',q({})),'INVALID_FILTER');
 rejects(()=>parseRead(TEACHER_READS,'drop-table',q({})),'UNKNOWN_ACTION');
 rejects(()=>parseRead(TEACHER_READS,'__proto__',q({})),'UNKNOWN_ACTION');
 // Students can only reach their own academic reads, never Teacher projections.
 rejects(()=>parseRead(STUDENT_READS,'payment-ledger',q({})),'UNKNOWN_ACTION');
 assert.equal(parseRead(STUDENT_READS,'exam-history',q({})).rpc,'coaching_student_exam_history');
 // Teacher-built Student report and the organisation finance trend.
 assert.deepEqual(parseRead(TEACHER_READS,'student-exam-history',q({studentId:id})),{rpc:'coaching_teacher_student_exam_history',args:{p_student_id:id}});
 rejects(()=>parseRead(TEACHER_READS,'student-exam-history',q({})),'INVALID_FILTER');
 rejects(()=>parseRead(STUDENT_READS,'student-exam-history',q({studentId:id})),'UNKNOWN_ACTION');
 assert.deepEqual(parseRead(TEACHER_READS,'finance-trend',q({})).args,{p_months:12});
 assert.deepEqual(parseRead(TEACHER_READS,'finance-trend',q({months:'24'})).args,{p_months:24});
 for(const bad of ['2','25','12.5','012'])rejects(()=>parseRead(TEACHER_READS,'finance-trend',q({months:bad})),'INVALID_FILTER');
 assert.deepEqual(parseRead(TEACHER_READS,'dashboard',q({period:'2026-10'})),{rpc:'coaching_teacher_dashboard_analytics',args:{p_period:'2026-10'}});
 assert.deepEqual(parseRead(TEACHER_READS,'dashboard',q({})).args,{p_period:''});
 rejects(()=>parseRead(TEACHER_READS,'dashboard',q({period:'2026'})),'INVALID_FILTER');
 rejects(()=>parseRead(STUDENT_READS,'dashboard',q({})),'UNKNOWN_ACTION');
});

test('student lifecycle command requires a known status and bounded reason',()=>{
 assert.deepEqual(parseCommand('student-lifecycle',{studentId:id,status:'cancelled',reason:' Guardian withdrew '},op).args,{p_student_id:id,p_status:'cancelled',p_reason:'Guardian withdrew',p_operation_id:op});
 rejects(()=>parseCommand('student-lifecycle',{studentId:id,status:'deleted'},op),'INVALID_INPUT');
 rejects(()=>parseCommand('student-lifecycle',{studentId:id,status:'inactive',reason:'x'.repeat(501)},op),'INVALID_INPUT');
 rejects(()=>parseCommand('student-lifecycle',{studentId:id,status:'inactive'},'not-a-uuid'),'INVALID_OPERATION_ID');
});

test('batch write validates profile, schedule and create-only fees; never deletes',()=>{
 const data={code:'PHY-HSC27',name:'Physics HSC 2027',capacity:30,status:'open',admissionOpen:true,scheduleDays:[6,1,3],classStartMinute:960,classEndMinute:1050,monthlyFeeMinor:300000,admissionFeeMinor:100000,dueDay:10};
 assert.equal(parseCommand('batch-write',{action:'create',data},op).rpc,'coaching_batch_profile_write');
 rejects(()=>parseCommand('batch-write',{action:'delete',batchId:id,data:{}},op),'INVALID_INPUT');
 rejects(()=>parseCommand('batch-write',{action:'update',batchId:id,data:{monthlyFeeMinor:5}},op),'INVALID_INPUT');
 rejects(()=>parseCommand('batch-write',{action:'create',data:{...data,scheduleDays:[7]}},op),'INVALID_INPUT');
 rejects(()=>parseCommand('batch-write',{action:'create',data:{...data,classEndMinute:900}},op),'INVALID_INPUT');
 rejects(()=>parseCommand('batch-write',{action:'create',data:{...data,status:'deleted'}},op),'INVALID_INPUT');
 rejects(()=>parseCommand('batch-write',{action:'create',data:{...data,isArchived:true}},op),'INVALID_INPUT');
});

test('finance commands use integer paisa and valid periods',()=>{
 assert.deepEqual(parseCommand('bill-period',{batchId:id,period:'2026-10'},op).args,{p_batch_id:id,p_period:'2026-10',p_operation_id:op});
 rejects(()=>parseCommand('bill-period',{batchId:id,period:'2026-1'},op),'INVALID_INPUT');
 rejects(()=>parseCommand('fee-rule',{batchId:id,effectiveFrom:'2026-11',monthlyFeeMinor:3000.5,admissionFeeMinor:0,dueDay:10,reason:'New session'},op),'INVALID_INPUT');
 assert.equal(parseCommand('concession',{action:'grant',studentId:id,batchId:id,kind:'percent',value:10,startsPeriod:'2026-10',reason:'Sibling discount'},op).args.p_data.value,10);
 rejects(()=>parseCommand('concession',{action:'grant',studentId:id,batchId:id,kind:'percent',value:101,startsPeriod:'2026-10',reason:'Too much'},op),'INVALID_INPUT');
 rejects(()=>parseCommand('concession',{action:'grant',studentId:id,batchId:id,kind:'amount',value:5000,startsPeriod:'2026-10',endsPeriod:'2026-09',reason:'Backwards range'},op),'INVALID_INPUT');
});

test('exam attendance distinguishes attempted, absent and never sends marks for absence',()=>{
 assert.equal(parseCommand('exam-attendance',{examId:id,studentId:id,attendance:'attempted',marks:42.5,remarks:''},op).args.p_marks,42.5);
 assert.equal(parseCommand('exam-attendance',{examId:id,studentId:id,attendance:'absent',marks:null},op).args.p_marks,null);
 rejects(()=>parseCommand('exam-attendance',{examId:id,studentId:id,attendance:'absent',marks:0},op),'INVALID_INPUT');
 rejects(()=>parseCommand('exam-attendance',{examId:id,studentId:id,attendance:'not_recorded',marks:null},op),'INVALID_INPUT');
 rejects(()=>parseCommand('exam-attendance',{examId:id,studentId:id,attendance:'attempted',marks:1.234},op),'INVALID_INPUT');
 rejects(()=>parseCommand('exam-details',{examId:id,title:'Weekly',scheduledAt:'2026-11-01T10:00:00Z',maxMarks:50,passMarks:60,instructions:'',coverageUnitIds:[],examType:'weekly',durationMinutes:60},op),'INVALID_INPUT');
});

test('syllabus writes support create/update/status only',()=>{
 assert.equal(parseCommand('syllabus-write',{action:'create',subjectId:id,data:{title:'Vectors',weight:2}},op).rpc,'coaching_syllabus_unit_write');
 assert.equal(parseCommand('syllabus-write',{action:'status',unitId:id,data:{status:'completed'}},op).args.p_action,'status');
 rejects(()=>parseCommand('syllabus-write',{action:'delete',unitId:id,data:{}},op),'INVALID_INPUT');
 rejects(()=>parseCommand('syllabus-write',{action:'status',unitId:id,data:{status:'done'}},op),'INVALID_INPUT');
});

test('RPC failures map to safe codes without leaking details',()=>{
 assert.deepEqual(managementFailure(400,{message:'INVALID_LIFECYCLE_TRANSITION'}),{status:409,code:'INVALID_LIFECYCLE_TRANSITION'});
 assert.deepEqual(managementFailure(400,{message:'PAYMENT_EXCEEDS_BALANCE'}),{status:503,code:'SERVICE_UNAVAILABLE'});
 assert.deepEqual(managementFailure(400,{message:'duplicate key value violates unique constraint "x"'}),{status:503,code:'SERVICE_UNAVAILABLE'});
 assert.deepEqual(managementFailure(404,{message:'Could not find the function public.x'}),{status:503,code:'MIGRATION_NOT_APPLIED'});
});

test('student directory validator accepts v1 and v2 rows, rejects unknown lifecycle',()=>{
 const row={id,fullName:'A',accountStatus:'active',admissionRoll:null,admittedOn:null,phone:'',schoolName:'',className:'',stream:'',academicSession:'',photoMediaId:null,guardianName:'',guardianRelationship:'',guardianMobile:'',outstandingMinor:'0',batches:[]};
 const base={total:1,limit:20,offset:0,classes:[],metrics:{total:1,active:1,newAdmissions:0,pendingDues:0}};
 assert.ok(validateStudentDirectory({students:[row],...base}));
 const v2={...base,metrics:{total:1,active:1,inactive:0,cancelled:0,completed:0,newAdmissions:0,pendingDues:0}};
 assert.ok(validateStudentDirectory({students:[{...row,lifecycleStatus:'cancelled',reviewStatus:'',loginState:'none'}],...v2}));
 assert.throws(()=>validateStudentDirectory({students:[{...row,lifecycleStatus:'deleted',reviewStatus:'',loginState:'none'}],...v2}));
});

test('management migrations keep RLS closed, never delete, and guard history',()=>{
 const dir='supabase/migrations',files=readdirSync(dir).filter(f=>f>='20261027094139'&&f.endsWith('.sql'));
 assert.ok(files.length>=9,'all management migrations present');
 const sql=files.map(f=>readFileSync(`${dir}/${f}`,'utf8')).join('\n');
 assert.doesNotMatch(sql,/\bdelete\s+from\s+public\./i);
 assert.doesNotMatch(sql,/\bdrop\s+table\b/i);
 assert.doesNotMatch(sql,/disable\s+row\s+level\s+security/i);
 for(const table of ['student_lifecycle','student_lifecycle_events','batch_fee_rules','student_fee_concessions','concession_applications'])
  assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
 assert.match(sql,/STUDENT_LIFECYCLE_NOT_ACTIVE/);assert.match(sql,/ADMISSION_CLOSED/);assert.match(sql,/BATCH_NOT_ACCEPTING/);
 assert.match(sql,/not exists\(select 1 from public\.student_lifecycle l where l\.student_id=e\.student_id and l\.status<>'active'\)/);
});

test('management routes require teacher/student verification and the write gate',()=>{
 const route=readFileSync('src/server/http/management-route.ts','utf8');
 assert.match(route,/allowedBrowserMutation/);assert.match(route,/COACHING_ENABLE_MUTATION_APIS/);assert.match(route,/actor\.role!==role/);assert.match(route,/actor\.role!=='teacher'/);
 assert.match(readFileSync('src/app/api/v1/student/academic/[action]/route.ts','utf8'),/managementRead\('student'\)/);
 assert.doesNotMatch(readFileSync('src/app/api/v1/student/academic/[action]/route.ts','utf8'),/POST/);
});

test('class session reads are range-checked and commands validate exact data keys',()=>{
 assert.deepEqual(parseRead(TEACHER_READS,'sessions',q({batchId:id,from:'2026-10-01',to:'2026-10-31'})),{rpc:'coaching_class_sessions',args:{p_batch_id:id,p_from:'2026-10-01',p_to:'2026-10-31'}});
 assert.equal(parseRead(STUDENT_READS,'sessions',q({batchId:id,from:'2026-10-01',to:'2026-10-31'})).rpc,'coaching_class_sessions');
 rejects(()=>parseRead(TEACHER_READS,'sessions',q({batchId:id,from:'2026-10-31',to:'2026-10-01'})),'INVALID_FILTER');
 rejects(()=>parseRead(TEACHER_READS,'sessions',q({batchId:id})),'INVALID_FILTER');
 const create={action:'create',data:{batchId:id,date:'2026-11-02',startMinute:960,endMinute:1050,topic:'Vectors',location:'Room 2'}};
 assert.deepEqual(parseCommand('session-write',create,op).args,{p_action:'create',p_session_id:null,p_data:create.data,p_operation_id:op});
 rejects(()=>parseCommand('session-write',{...create,data:{...create.data,endMinute:900}},op),'INVALID_INPUT');
 rejects(()=>parseCommand('session-write',{...create,data:{...create.data,evil:1}},op),'INVALID_INPUT');
 rejects(()=>parseCommand('session-write',{action:'update',sessionId:id,data:{batchId:id}},op),'INVALID_INPUT');
 assert.equal(parseCommand('session-write',{action:'status',sessionId:id,data:{status:'completed',markTopicCompleted:true}},op).rpc,'coaching_class_session_write');
 rejects(()=>parseCommand('session-write',{action:'status',sessionId:id,data:{status:'deleted'}},op),'INVALID_INPUT');
 assert.equal(parseCommand('session-generate',{batchId:id,from:'2026-11-01',to:'2026-11-30'},op).rpc,'coaching_generate_class_sessions');
 rejects(()=>parseCommand('session-generate',{batchId:id,from:'2026-11-01',to:'2027-02-01'},op),'INVALID_INPUT');
});
