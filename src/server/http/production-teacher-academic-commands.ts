import 'server-only';
import {createAcademicCommand,type AcademicKind,type AcademicCommand} from './teacher-academic-commands.mjs';
import {verifyActiveActor} from './production-read-adapter';
const names:Record<AcademicKind,string>={
 'subject-create':'coaching_create_subject',
 'syllabus-add':'coaching_add_syllabus_unit',
 'routine-create':'coaching_create_routine_slot',
 'assignment-draft':'coaching_create_assignment_draft',
 'exam-draft':'coaching_create_exam_draft',
 'result-draft':'coaching_save_exam_result_draft',
};
async function execute(kind:AcademicKind,c:AcademicCommand):Promise<unknown>{
 if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw Error('MUTATIONS_DISABLED');
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('INVALID_DB_CONFIG');
 let root:URL;try{root=new URL(raw);}catch{throw Error('INVALID_DB_CONFIG');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 const d=c.data;
 const args:Record<AcademicKind,Record<string,unknown>>={
  'subject-create':{p_batch_id:c.target,p_code:d.code,p_title:d.title},
  'syllabus-add':{p_subject_id:c.target,p_title:d.title,p_position:d.position},
  'routine-create':{p_batch_id:c.target,p_subject_id:d.subjectId,p_day_of_week:d.dayOfWeek,p_start_minute:d.startMinute,p_end_minute:d.endMinute,p_room:d.room},
  'assignment-draft':{p_batch_id:c.target,p_subject_id:d.subjectId,p_title:d.title,p_instructions:d.instructions,p_release_at:d.releaseAt,p_due_at:d.dueAt,p_max_points:d.maxPoints,p_allow_resubmit:d.allowResubmit},
  'exam-draft':{p_batch_id:c.target,p_subject_id:d.subjectId,p_title:d.title,p_scheduled_at:d.scheduledAt,p_max_marks:d.maxMarks},
  'result-draft':{p_exam_id:c.target,p_student_id:d.studentId,p_marks:d.marks},
 };
 const url=new URL(`/rest/v1/rpc/${names[kind]}`,root);
 const res=await fetch(url,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({...args[kind],p_operation_id:c.operationId}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('DB_RPC_REJECTED');return res.json();
}
export const academicSubjectCreate=createAcademicCommand('subject-create',{verify:verifyActiveActor,execute});
export const academicSyllabusAdd=createAcademicCommand('syllabus-add',{verify:verifyActiveActor,execute});
export const academicRoutineCreate=createAcademicCommand('routine-create',{verify:verifyActiveActor,execute});
export const academicAssignmentDraft=createAcademicCommand('assignment-draft',{verify:verifyActiveActor,execute});
export const academicExamDraft=createAcademicCommand('exam-draft',{verify:verifyActiveActor,execute});
export const academicResultDraft=createAcademicCommand('result-draft',{verify:verifyActiveActor,execute});
