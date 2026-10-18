import 'server-only';
import {createOfficeOperationsRoute,type OfficeOpKind,type OfficeOpCall} from './office-operations.mjs';
import {verifyActiveActor} from './production-read-adapter';
const rpc:Record<OfficeOpKind,string>={expenseCreate:'coaching_record_office_expense',expenseReverse:'coaching_reverse_office_expense',announcementEdit:'coaching_edit_announcement_draft',announcementArchive:'coaching_archive_announcement',expenseList:'coaching_list_office_expenses',expenseDetail:'coaching_get_office_expense',statement:'coaching_office_cashflow_statement',statementCsv:'coaching_office_cashflow_statement',expensesCsv:'coaching_export_office_expenses'};
const writes=new Set<OfficeOpKind>(['expenseCreate','expenseReverse','announcementEdit','announcementArchive']);
function dbConfig(){const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
 let root:URL;try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');return {root,key};}
async function call(kind:OfficeOpKind,c:OfficeOpCall):Promise<unknown>{
 if(writes.has(kind)&&process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw Error('MUTATIONS_DISABLED');
 const {root,key}=dbConfig(),d=c.data;
 const args:Record<string,unknown>=kind==='expenseCreate'?{p_batch_id:c.target,p_expense_on:d.expenseOn,p_category:d.category,p_payee:d.payee,p_notes:d.notes,p_amount_minor:d.amountMinor,p_method:d.method,p_reference:d.reference,p_operation_id:c.operationId}
 :kind==='expenseReverse'?{p_expense_id:c.target,p_reason:d.reason,p_operation_id:c.operationId}
 :kind==='announcementEdit'?{p_announcement_id:c.target,p_title:d.title,p_body:d.body,p_visible_from:d.visibleFrom,p_operation_id:c.operationId}
 :kind==='announcementArchive'?{p_announcement_id:c.target,p_operation_id:c.operationId}
 :kind==='expenseDetail'?{p_expense_id:c.target}
 :kind==='expensesCsv'?{p_batch_id:c.target,p_period:c.period}
 :kind==='statement'||kind==='statementCsv'?{p_batch_id:c.target,p_period:c.period}
 :{p_batch_id:c.target,p_period:c.period,p_limit:c.limit,p_offset:c.offset};
 const res=await fetch(new URL(`/rest/v1/rpc/${rpc[kind]}`,root),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('OFFICE_OP_RPC_FAILED');return res.json();
}
export const officeOperationsRoute=(kind:OfficeOpKind)=>createOfficeOperationsRoute(kind,{verify:verifyActiveActor,call});
