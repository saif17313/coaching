import {domainRpcError,RpcError} from './rpc-errors.mjs';
import 'server-only';
import {createStudentWorkflow,type StudentWorkflowKind,type StudentWorkflowCommand} from './student-workflows.mjs';
import {verifyActiveActor} from './production-read-adapter';
const names:Record<StudentWorkflowKind,string>={
 submit:'coaching_submit_assignment',ownSubmission:'coaching_get_my_assignment_submission',submissionList:'coaching_list_assignment_submissions',grade:'coaching_grade_assignment_submission',gradePublish:'coaching_publish_assignment_grades',notificationRead:'coaching_mark_notification_read',unreadCount:'coaching_count_my_unread_notifications',
};
async function execute(kind:StudentWorkflowKind,c:StudentWorkflowCommand):Promise<unknown>{
 if(kind==='submit'||kind==='grade'||kind==='gradePublish'||kind==='notificationRead'){
  if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw new RpcError('MUTATIONS_DISABLED',503);
 }
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
 let root:URL;try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 const args:Record<StudentWorkflowKind,Record<string,unknown>>={
  submit:{p_assignment_id:c.target,p_answer_text:c.data.answerText,p_operation_id:c.operationId},
  ownSubmission:{p_assignment_id:c.target},
  submissionList:{p_assignment_id:c.target},
  grade:{p_submission_id:c.target,p_points:c.data.points,p_feedback:c.data.feedback,p_operation_id:c.operationId},
  gradePublish:{p_assignment_id:c.target,p_operation_id:c.operationId},
  notificationRead:{p_notification_id:c.target,p_operation_id:c.operationId},
  unreadCount:{},
 };
 const res=await fetch(new URL(`/rest/v1/rpc/${names[kind]}`,root),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args[kind]),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)await domainRpcError(res);return res.json();
}
export const studentWorkflowRoute=(kind:StudentWorkflowKind)=>createStudentWorkflow(kind,{verify:verifyActiveActor,execute});
