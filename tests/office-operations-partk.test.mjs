import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOfficeOperationsRoute} from '../src/server/http/office-operations.mjs';
const t='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const e='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const a='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const op='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const token='AAA.BBB.CCC';
const verified={verified:true,role:'teacher',accountStatus:'active',userId:t,accessToken:token};
const expense={id:e,batchId:b,expenseOn:'2026-10-19',amountMinor:5000,category:'supplies',payee:'=Office supply',notes:'ink cartridge',method:'cash',reference:'',createdAt:'2026-10-19T06:00:00Z',reversed:false};
const detail={...expense,reversalReason:null};
const list={period:'2026-10',batchId:b,total:1,items:[expense]};
const statement={batchId:b,period:'2026-10',currency:'BDT',unit:'paisa',basis:'posted_utc',grossCollectionsMinor:'20000',refundsMinor:'2000',netCollectionsMinor:'18000',grossExpensesMinor:'6000',reversedExpensesMinor:'1000',netExpensesMinor:'5000',netCashFlowMinor:'13000',waiversMemoMinor:'1000',billedMemoMinor:'50000',paymentCount:1};
const createBody={expenseOn:'2026-10-19',category:'supplies',payee:'Office supplies',notes:'ink cartridge',amountMinor:5000,method:'cash',reference:''};
const output={expenseCreate:{id:e,batchId:b,amountMinor:5000,category:'supplies',expenseOn:'2026-10-19',reversed:false},expenseReverse:{id:e,batchId:b,amountMinor:5000,reversed:true},announcementEdit:{id:a,batchId:b,status:'draft',title:'New classroom notice'},announcementArchive:{id:a,status:'archived'},expenseList:list,expenseDetail:detail,statement,statementCsv:statement,expensesCsv:list};
const paths={expenseCreate:['POST',`/teacher/batches/${b}/expenses/create`,{batchId:b}],expenseReverse:['POST',`/teacher/expenses/${e}/reverse`,{expenseId:e}],announcementEdit:['POST',`/teacher/announcements/${a}/edit`,{announcementId:a}],announcementArchive:['POST',`/teacher/announcements/${a}/archive`,{announcementId:a}],expenseList:['GET',`/teacher/batches/${b}/expenses?period=2026-10`,{batchId:b}],expenseDetail:['GET',`/teacher/expenses/${e}`,{expenseId:e}],statement:['GET',`/teacher/batches/${b}/cashflow?period=2026-10`,{batchId:b}],statementCsv:['GET',`/teacher/batches/${b}/cashflow/export?period=2026-10`,{batchId:b}],expensesCsv:['GET',`/teacher/batches/${b}/expenses/export?period=2026-10`,{batchId:b}]};
const bodies={expenseCreate:createBody,expenseReverse:{reason:'Receipt duplicated'},announcementEdit:{title:'New classroom notice',body:'Class starts at noon',visibleFrom:null},announcementArchive:{}};
const mk=(kind,{actor=verified,result=output[kind],headers={},body=bodies[kind],method,call}={})=>{
 const [expected,url,params]=paths[kind],usedMethod=method??expected;
 const h={authorization:`Bearer ${token}`,...headers};if(expected==='POST'&&usedMethod==='POST'){h['idempotency-key']=headers['idempotency-key']??op;h['content-type']=headers['content-type']??'application/json';}
 const request=new Request('https://localhost/api/v1'+url,{method:usedMethod,headers:h,...(usedMethod==='POST'?{body:JSON.stringify(body)}:{})});
 let calls=0;const port=createOfficeOperationsRoute(kind,{verify:async()=>actor,call:async(k,c)=>{calls++;return typeof call==='function'?call(k,c):result;}});
 return {request,port,context:{params:Promise.resolve(params)},count:()=>calls};
};
async function perform(x){const response=await x.port(x.request,x.context);return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text(),headers:response.headers,count:x.count()};}
for(const kind of Object.keys(paths)){
 test('Part K '+kind+' happy path with minimal output',async()=>{const r=await perform(mk(kind));assert.equal(r.status,kind.includes('Csv')?200:kind.endsWith('Create')||['expenseReverse','announcementEdit','announcementArchive'].includes(kind)?201:200);assert.equal(r.count,1);if(kind.includes('Csv'))assert.match(r.headers.get('content-type'),/text\/csv/);else assert.deepEqual(r.data.data,output[kind]);});
 test('Part K '+kind+' active teacher only',async()=>{for(const actor of [null,{...verified,role:'student'},{...verified,accountStatus:'disabled'},{...verified,accessToken:'fake'}]){const r=await perform(mk(kind,{actor}));assert.equal(r.status,403);assert.equal(r.count,0);}});
 test('Part K '+kind+' rejects missing authentication',async()=>{const r=await perform(mk(kind,{headers:{authorization:''}}));assert.equal(r.status,401);assert.equal(r.count,0);});
 test('Part K '+kind+' denies unexpected upstream fields',async()=>{const good=output[kind];const r=await perform(mk(kind,{result:{...good,secret:'SHOULD_NEVER_LEAK'}}));assert.equal(r.status,502);assert.ok(!JSON.stringify(r.data).includes('SHOULD_NEVER_LEAK'));});
}
test('expense create validates amounts, dates, categories and strict keys',async()=>{for(const body of [{...createBody,amountMinor:0},{...createBody,amountMinor:1.5},{...createBody,expenseOn:'2026-02-30'},{...createBody,category:'password'},{...createBody,extra:true},{...createBody,payee:'=X\nInjected'}]){const r=await perform(mk('expenseCreate',{body}));assert.equal(r.status,400);assert.equal(r.count,0);}});
test('expense reverse reason required',async()=>{const r=await perform(mk('expenseReverse',{body:{reason:'x'}}));assert.equal(r.status,400);assert.equal(r.count,0);});
test('announcement mutation draft only and archive output sanitized',async()=>{const r=await perform(mk('announcementEdit',{result:{...output.announcementEdit,status:'published'}}));assert.equal(r.status,502);});
test('POST command requires UUID receipt and JSON',async()=>{for(const kind of ['expenseCreate','expenseReverse','announcementEdit','announcementArchive']){for(const headers of [{'idempotency-key':'bad'},{'content-type':'text/plain'}]){const r=await perform(mk(kind,{headers}));assert.ok([400,415].includes(r.status));assert.equal(r.count,0);}}});
test('invalid method fails before DB',async()=>{for(const kind of ['expenseList','statement','expenseCreate']){const r=await perform(mk(kind,{method:'DELETE'}));assert.equal(r.status,405);assert.equal(r.count,0);}});
test('invalid report period / unknown filters block DB',async()=>{for(const url of ['/teacher/batches/'+b+'/cashflow?period=2026-13','/teacher/batches/'+b+'/cashflow?period=2026-10&token=abc','/teacher/batches/'+b+'/expenses?period=2026-10&limit=101','/teacher/batches/'+b+'/expenses?period=2026-10&period=2026-10']){const kind=url.includes('cashflow')?'statement':'expenseList';const x=mk(kind);x.request=new Request('https://localhost/api/v1'+url,{headers:{Authorization:`Bearer ${token}`}});const r=await perform(x);assert.equal(r.status,400);assert.equal(r.count,0);}});
test('cashflow derived numbers must reconcile exactly',async()=>{for(const key of ['netCollectionsMinor','netExpensesMinor','netCashFlowMinor']){const r=await perform(mk('statement',{result:{...statement,[key]:'99999999'}}));assert.equal(r.status,502);}});
test('cashflow numeric aggregates are strings, never unsafe JS numbers',async()=>{const r=await perform(mk('statement',{result:{...statement,grossCollectionsMinor:20000}}));assert.equal(r.status,502);});
test('expense list denies duplicates, mismatched ownership and surplus',async()=>{for(const bad of [{...list,items:[expense,expense],total:2},{...list,items:[{...expense,batchId:a}]},{...list,items:[{...expense,socialSecurityNumber:'secret'}]}]){const r=await perform(mk('expenseList',{result:bad}));assert.equal(r.status,502);}});
test('no incomplete expense CSV exports; 1001 rows return explicit conflict',async()=>{const r=await perform(mk('expensesCsv',{result:{...list,total:1001}}));assert.equal(r.status,409);assert.equal(r.data.error.code,'EXPORT_ROW_LIMIT');});
test('complete CSV escapes formulas in cells',async()=>{const r=await perform(mk('expensesCsv'));assert.equal(r.status,200);assert.match(r.data,/\"'=Office supply\"/);assert.match(r.headers.get('content-disposition'),/attachment/);});
test('detail not found is 404, never another student resource',async()=>{const r=await perform(mk('expenseDetail',{result:null}));assert.equal(r.status,404);});
test('fixed RPC allowlist, global mutate opt-in, JWT-only (no service role)',()=>{const s=readFileSync('src/server/http/production-office-operations.ts','utf8');assert.match(s,/enabled-after-db-verification/);assert.match(s,/Authorization:`Bearer \$\{c.token\}`/);assert.ok(!s.includes('SERVICE_ROLE'));for(const rpc of ['coaching_record_office_expense','coaching_reverse_office_expense','coaching_office_cashflow_statement','coaching_edit_announcement_draft'])assert.ok(s.includes(rpc));});
test('expense SQL has no direct student DML and uses append-only reversal',()=>{const s=readFileSync('supabase/migrations/20261019000100_office_expenses_and_financial_statement.sql','utf8');assert.ok(s.includes('ENABLE ROW LEVEL SECURITY'));assert.ok(s.includes('GRANT SELECT ON public.office_expenses'));assert.ok(!/GRANT (INSERT|UPDATE|DELETE|ALL) ON public.office_expenses TO authenticated/i.test(s));assert.match(s,/expense_id uuid PRIMARY KEY/);assert.match(s,/coaching_mutation_receipts/);});
