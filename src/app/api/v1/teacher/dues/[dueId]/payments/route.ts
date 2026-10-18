import {officeReadRoute} from '@/server/http/production-office-reads';
export const GET=officeReadRoute('duePayments');
export const dynamic='force-dynamic';
