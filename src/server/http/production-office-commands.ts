import 'server-only';
import {createOfficeCommand,type OfficeKind,type OfficeCommand} from './office-commands.mjs';
import {verifyActiveActor} from './production-read-adapter';
const fn:Record<OfficeKind,string>={plan:'coaching_create_fee_plan',dues:'coaching_generate_monthly_dues',payment:'coaching_post_payment',waiver:'coaching_waive_due',refund:'coaching_refund_payment',announcement:'coaching_create_announcement',publish:'coaching_publish_announcement',notify:'coaching_dispatch_batch_notification'};
async function execute(kind:OfficeKind,c:OfficeCommand):Promise<unknown>{
 if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw Error('MUTATIONS_DISABLED');
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
 let root:URL;try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 const d=c.data;
 const args:Record<OfficeKind,Record<string,unknown>>={
  plan:{p_batch_id:c.target,p_period:d.period,p_amount_minor:d.amountMinor,p_due_on:d.dueOn,p_label:d.label},
  dues:{p_plan_id:c.target},
  payment:{p_due_id:c.target,p_student_id:d.studentId,p_amount_minor:d.amountMinor,p_method:d.method,p_reference:d.reference},
  waiver:{p_due_id:c.target,p_amount_minor:d.amountMinor,p_reason:d.reason},
  refund:{p_payment_id:c.target,p_amount_minor:d.amountMinor,p_reason:d.reason},
  announcement:{p_batch_id:c.target,p_title:d.title,p_body:d.body,p_visible_from:d.visibleFrom},
  publish:{p_announcement_id:c.target},
  notify:{p_batch_id:c.target,p_event_id:d.eventId,p_title:d.title,p_body:d.body},
 };
 const res=await fetch(new URL(`/rest/v1/rpc/${fn[kind]}`,root),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({...args[kind],p_operation_id:c.operationId}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('OFFICE_RPC_REJECTED');return res.json();
}
export const officeCommand=(kind:OfficeKind)=>createOfficeCommand(kind,{verify:verifyActiveActor,execute});
