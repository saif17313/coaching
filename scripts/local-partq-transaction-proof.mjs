/** Local PostgreSQL role/RPC smoke that always rolls back; not an HTTP JWT write E2E. */
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {EXPECTED_DOCKER_HOST,LOCAL_API,validatedNames,baselineSql,makeProofSql,parseBaseline,isClear,assertProofOutput} from './local-partq-rollback-core.mjs';
if(process.env.MUSA_PARTQ_TX_PROOF!=='LOCAL_ROLLBACK_ONLY')throw Error('Opt-in missing. Use RUN_MUSA_PARTQ_TX_ROLLBACK.ps1');
if(process.env.DOCKER_HOST&&!EXPECTED_DOCKER_HOST.test(process.env.DOCKER_HOST))throw Error('Remote Docker host prohibited');
function run(name,args,options={}){
 const result=spawnSync(name,args,{encoding:'utf8',timeout:35000,maxBuffer:1024*1024,windowsHide:true,...options});
 if(result.error)throw Error(`${name} could not start: ${result.error.code||'UNKNOWN'}`);
 if(result.status!==0)throw Error(`${name} failed; no persistent change committed. ${String(result.stderr||'').slice(0,1200)}`);
 return result.stdout||'';
}
const context=run('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}']).trim();
if(!EXPECTED_DOCKER_HOST.test(context))throw Error('Docker context is not local');
const target=run('docker',['inspect','--format','{{.Name}} {{.State.Running}}','supabase_db_coaching']).trim();
if(target!=='/supabase_db_coaching true')throw Error('Expected local Supabase container is not running');
const health=await fetch(LOCAL_API+'/auth/v1/health',{signal:AbortSignal.timeout(6000),redirect:'error'}).catch(()=>null);
if(!health?.ok)throw Error('Local Supabase Auth health unavailable');
const names=validatedNames(randomBytes(6).toString('hex'),[randomUUID(),randomUUID(),randomUUID(),randomUUID()]);
const psql=(sql)=>run('docker',['exec','-i','supabase_db_coaching','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql});
const initial=parseBaseline(psql(baselineSql(names)));
if(!isClear(initial))throw Error('Unexpected existing probe row/receipt; no transaction started');
console.log('[PASS] Exact local Docker + Supabase Auth health; isolated probe IDs are unused.');
let proof=false;
try{
 const output=psql(makeProofSql(names));
 assertProofOutput(output);proof=true;
 console.log('[PASS] Local authenticated PostgreSQL role: batch create/update, idempotency, CMS create, unauthorized denial, audit and receipts.');
 console.log('[PASS] Explicit PostgreSQL ROLLBACK completed.');
}finally{
 // A dead psql connection rolls back its open transaction automatically.
 // Always inspect from a separate connection; if anything persists we fail closed.
 const final=parseBaseline(psql(baselineSql(names)));
 if(!isClear(final))throw Error('CRITICAL: unexpected persistent probe rows/receipts detected; stop all deployment work');
 console.log('[PASS] Independent post-transaction inspection: zero batch/page/receipt/audit residue.');
}
if(!proof)throw Error('Transaction smoke incomplete');
console.log('[GATE] PostgreSQL simulated-role rollback proof PASS. This does NOT certify signed-JWT PostgREST HTTP mutations.');
console.log('[SAFE] Mutation flag remains OFF. No cloud, .env, migration, Git or database reset changes.');
