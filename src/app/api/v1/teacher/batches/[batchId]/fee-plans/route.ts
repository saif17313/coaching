import {officeReadRoute} from '@/server/http/production-office-reads';
export const GET=officeReadRoute('feePlans');
export const dynamic='force-dynamic';
