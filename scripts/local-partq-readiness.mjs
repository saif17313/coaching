/** Strictly local, read-only evidence collection. Does not set mutation flags. */
import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {makeCatalogSql,assessCatalog,inspectStatusEnv,localCliCommand} from './local-partq-core.mjs';
const HOME='http://127.0.0.1:54321';
const OPT='MUSA_PARTQ_LOCAL_READONLY';
if(process.env[OPT]!=='I_UNDERSTAND_LOCAL_ONLY')throw Error('Local read-only opt-in missing; run RUN_MUSA_PARTQ_READONLY.ps1');
if(process.env.MUSA_PARTQ_CONTAINER!=='supabase_db_coaching')throw Error('Unexpected Docker database container');
if(process.env.DOCKER_HOST&&!/^(?:npipe:\/\/|unix:\/\/)/.test(process.env.DOCKER_HOST))throw Error('Remote Docker host not allowed');
function cmd(bin,args,timeout=15000){return execFileSync(bin,args,{encoding:'utf8',timeout,maxBuffer:1024*1024,windowsHide:true});}
function versions(){const folder=join(process.cwd(),'supabase','migrations');return readdirSync(folder).filter(n=>/^\d{14}_.+\.sql$/.test(n)).map(n=>n.slice(0,14)).sort();}
async function get(url,init={}){if(!url.startsWith(HOME+'/'))throw Error('Remote HTTP target blocked');return fetch(url,{...init,signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'});}
const expectedVersions=versions();
if(expectedVersions.length!==27||new Set(expectedVersions).size!==27)throw Error('Local migration file set has drifted from 27 unique source versions; stop and inspect');
const dockerEndpoint=cmd('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],8000).trim();
if(!/^(?:npipe:\/\/|unix:\/\/)/.test(dockerEndpoint))throw Error('Remote Docker context blocked');
const raw=cmd('docker',['exec','supabase_db_coaching','psql','-X','-A','-t','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',makeCatalogSql()],30000);
const line=raw.split(/\r?\n/).map(s=>s.trim()).find(s=>s.startsWith('{')&&s.endsWith('}'));
if(!line)throw Error('PostgreSQL did not return expected read-only JSON catalog');
const audit=assessCatalog(JSON.parse(line),expectedVersions);
try{const health=await get(HOME+'/auth/v1/health');audit.checks.push({name:'Local GoTrue Auth health',pass:health.ok,details:'HTTP '+health.status});if(health.ok)audit.passed++;else audit.failed++;}
catch{audit.checks.push({name:'Local GoTrue Auth health',pass:false,details:'Local HTTP unavailable'});audit.failed++;}
for(const c of audit.checks)console.log(`[${c.pass?'PASS':'FAIL'}] ${c.name}: ${c.details}`);
console.log(`[SUMMARY] ${audit.passed}/${audit.checks.length} checks passed; no SQL writes or cloud requests`);
if(process.argv.includes('--auth-smoke')){
  const cliConfig=localCliCommand(process.platform);
  const cli=cmd(cliConfig.bin,cliConfig.args,30000);
  const {api,key}=inspectStatusEnv(cli);
  let password=process.env.MUSA_PARTQ_AUTH_PASSWORD||'';
  delete process.env.MUSA_PARTQ_AUTH_PASSWORD;
  if(password.length<8||password.length>128){password='';throw Error('Invalid test password length');}
  const auth=await get(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:'teacher1@example.com',password})});
  password='';
  if(!auth.ok)throw Error('Local Auth password flow failed HTTP '+auth.status+'; no password printed');
  const result=await auth.json();
  const token=result.access_token;
  if(typeof token!=='string'||token.length>8192)throw Error('Local access-token response invalid');
  const self=await get(api+'/auth/v1/user',{headers:{apikey:key,Authorization:`Bearer ${token}`}});
  if(!self.ok)throw Error('Local signed user verify failed HTTP '+self.status);
  const me=await self.json();
  if(typeof me.id!=='string'||!/^[a-f0-9-]{36}$/i.test(me.id))throw Error('Local Auth identity invalid');
  const profile=await get(api+'/rest/v1/profiles?select=id,role,account_status&id=eq.'+encodeURIComponent(me.id)+'&limit=2',{headers:{apikey:key,Authorization:`Bearer ${token}`,'Accept':'application/json'}});
  if(!profile.ok)throw Error('Local RLS profile request HTTP '+profile.status);
  const rows=await profile.json();
  if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==me.id||rows[0].role!=='teacher'||rows[0].account_status!=='active')throw Error('Teacher RLS scope/profile mismatch');
  console.log('[PASS] Real local signed Teacher JWT -> /user -> RLS-scoped teacher/active profile');
}
if(audit.failed){process.exitCode=2;console.log('[BLOCKED] Core local readiness requirements not met. Do not activate mutation APIs.');}
else console.log('[READY FOR NEXT GATE] Read-only preflight passed; write permissions/RPC E2E NOT certified. Mutation flag remains OFF.');
