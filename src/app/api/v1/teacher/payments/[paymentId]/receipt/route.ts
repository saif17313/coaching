import {paymentReceiptRoute} from '@/server/http/production-student-admission';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=paymentReceiptRoute('teacher');
export const POST=paymentReceiptRoute('teacher');
