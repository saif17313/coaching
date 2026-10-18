import 'server-only';
import {createOfficeReadEndpoint,createFinanceReportEndpoint,type OfficeReadKind} from './office-reads.mjs';
import {verifyActiveActor} from './production-read-adapter';
import {readSupabaseRows} from '../supabase/rest';
import {officeReadRows} from '../supabase/office-read';
const read=(table:string,token:string,query:Readonly<Record<string,string>>):Promise<unknown[]> =>
 ['batches','profiles','enrollments'].includes(table)
  ? readSupabaseRows(table as 'batches'|'profiles'|'enrollments',token,query)
  : officeReadRows(table,token,query);
const ports={verify:verifyActiveActor,readRows:read};
export const officeReadRoute=(kind:OfficeReadKind)=>createOfficeReadEndpoint(kind,ports);
export const officeFinanceReportRoute=()=>createFinanceReportEndpoint(ports);
