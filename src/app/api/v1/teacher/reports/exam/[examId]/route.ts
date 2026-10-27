import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {bearer,callRpc,deny} from '@/server/http/management-route';
import {isUuid} from '@/server/management-commands.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{examId:string}>};
/** Teacher result sheet PDF for one offline exam (draft or published). */
export async function GET(request:Request,context:Context){
 const auth=bearer(request);if(!auth)return deny(401,'UNAUTHORIZED');
 const {examId}=await context.params;if(!isUuid(examId))return deny(400,'INVALID_EXAM_ID');
 try{
  const actor=await verifyActiveActor(auth.slice(7));if(actor.role!=='teacher')return deny(403,'TEACHER_ONLY');
  const sheet=await callRpc(auth,'coaching_teacher_exam_sheet',{p_exam_id:examId});if(!sheet.ok)return deny(sheet.status,sheet.code);
  const {examSheetPdf}=await import('@/server/reports/academic-pdf.mjs');
  const pdf=await examSheetPdf(sheet.body);
  return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="result-sheet-${examId.slice(0,8)}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return deny(503,'REPORT_UNAVAILABLE');}
}
