import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {bearer,callRpc,deny} from '@/server/http/management-route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** The signed-in Student's progress report PDF, built only from published results. */
export async function GET(request:Request){
 const auth=bearer(request);if(!auth)return deny(401,'UNAUTHORIZED');
 try{
  const actor=await verifyActiveActor(auth.slice(7));if(actor.role!=='student')return deny(403,'STUDENT_ONLY');
  const [history,admission]=await Promise.all([callRpc(auth,'coaching_student_exam_history',{}),callRpc(auth,'coaching_student_admission_read',{p_student_id:actor.userId})]);
  if(!history.ok)return deny(history.status,history.code);
  const profile=admission.ok&&admission.body&&typeof admission.body==='object'?admission.body as {fullName?:string;admissionRoll?:string|null}:{};
  const exams=(history.body as {exams?:unknown[]})?.exams??[];
  const {progressReportPdf}=await import('@/server/reports/academic-pdf.mjs');
  const pdf=await progressReportPdf({student:{fullName:profile.fullName||'Student',admissionRoll:profile.admissionRoll??null},exams});
  return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="progress-report.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return deny(503,'REPORT_UNAVAILABLE');}
}
