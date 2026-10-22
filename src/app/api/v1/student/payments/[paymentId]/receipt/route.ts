import {paymentReceiptRoute} from '@/server/http/production-student-admission';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=paymentReceiptRoute('student');
export const POST=paymentReceiptRoute('student');
