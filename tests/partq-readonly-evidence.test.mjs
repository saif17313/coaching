import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {assessCatalog,makeCatalogSql,inspectStatusEnv,REQUIRED_RPCS,REQUIRED_TABLES} from '../scripts/local-partq-core.mjs';
const versions=Array.from({length:27},(_,i)=>'20261019'+String(i).padStart(6,'0'));
function fake(){return {tables:REQUIRED_TABLES.map(name=>({name,exists:true,rls:true})),rpcs:REQUIRED_RPCS.map(name=>({name,exists:true})),dangerous_grants:[],migration_versions:[...versions],teacher:{auth_users:1,active_teacher_profiles:1},media_bucket:{exists:true,private:true}};}
test('catalog audit accepts exact safe read-only local schema',()=>{const a=assessCatalog(fake(),versions);assert.equal(a.failed,0);assert.ok(a.passed>=37);});
test('catalog audit fails closed on absent RLS and RPC',()=>{const s=fake();s.tables[0].rls=false;s.rpcs[0].exists=false;assert.equal(assessCatalog(s,versions).failed,2);});
test('catalog audit detects unapproved direct DML grant',()=>{const s=fake();s.dangerous_grants=[{table:'batches',grantee:'authenticated',privilege:'INSERT'}];assert.equal(assessCatalog(s,versions).failed,1);});
test('catalog audit detects missing migrations and wrong teacher profile',()=>{const s=fake();s.migration_versions=[];s.teacher.active_teacher_profiles=0;assert.equal(assessCatalog(s,versions).failed,2);});
test('no accidental remote target or missing key in status env parser',()=>{assert.throws(()=>inspectStatusEnv('API_URL=https://host.supabase.co\nANON_KEY=abc'));assert.throws(()=>inspectStatusEnv('API_URL=http://127.0.0.1:54321'));assert.equal(inspectStatusEnv('API_URL=http://127.0.0.1:54321\nANON_KEY=abcd').api,'http://127.0.0.1:54321');});
test('catalog SQL is explicitly transaction read-only and contains no DML',()=>{const s=makeCatalogSql();assert.match(s,/BEGIN READ ONLY;/);assert.match(s,/ROLLBACK;/);assert.doesNotMatch(s,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\s+(?:INTO|TABLE|FUNCTION|USER)/i);});
test('real local diagnostic denies remote Docker, not enable mutations, and never writes SQL',()=>{const s=readFileSync(new URL('../scripts/local-partq-readiness.mjs',import.meta.url),'utf8');assert.match(s,/supabase_db_coaching/);assert.match(s,/MUSA_PARTQ_LOCAL_READONLY/);assert.doesNotMatch(s,/COACHING_ENABLE_MUTATION_APIS|service_role/i);assert.doesNotMatch(s,/\.env\.local/);});
test('malformed catalog cannot be misreported as green',()=>{assert.throws(()=>assessCatalog({tables:[],rpcs:[]},versions));});
