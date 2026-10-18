import {officeReadRoute} from '@/server/http/production-office-reads';
export const GET=officeReadRoute('studentAnnouncements');
export const dynamic='force-dynamic';
