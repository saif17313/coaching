import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {bearer,callRpc,deny} from '@/server/http/management-route';
import {isUuid} from '@/server/management-commands.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{studentId:string}>};
/** Teacher-built progress report PDF for one Student: the same published results that Student sees. */
export async function GET(request:Request,context:Context){
 const auth=bearer(request);if(!auth)return deny(401,'UNAUTHORIZED');
 const {studentId}=await context.params;if(!isUuid(studentId))return deny(400,'INVALID_STUDENT_ID');
 try{
  const actor=await verifyActiveActor(auth.slice(7));if(actor.role!=='teacher')return deny(403,'TEACHER_ONLY');
  const [history,admission]=await Promise.all([callRpc(auth,'coaching_teacher_student_exam_history',{p_student_id:studentId}),callRpc(auth,'coaching_student_admission_read',{p_student_id:studentId})]);
  if(!history.ok)return deny(history.status,history.code);
  const profile=admission.ok&&admission.body&&typeof admission.body==='object'?admission.body as {fullName?:string;admissionRoll?:string|null}:{};
  const exams=(history.body as {exams?:unknown[]})?.exams??[];
  const {progressReportPdf}=await import('@/server/reports/academic-pdf.mjs');
  const pdf=await progressReportPdf({student:{fullName:profile.fullName||'Student',admissionRoll:profile.admissionRoll??null},exams});
  return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="progress-report-${studentId.slice(0,8)}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return deny(503,'REPORT_UNAVAILABLE');}
}
