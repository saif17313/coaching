import {RpcError} from './rpc-errors.mjs';
/** Part K Office operations: teacher JWT, transactional writes and complete-only report exports. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const id=x=>typeof x==='string'&&UUID.test(x);
const period=x=>typeof x==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(x);
const minor=x=>Number.isSafeInteger(x)&&x>=1&&x<=100000000000;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x&&x>='2000-01-01'&&x<='2100-12-31';
const stamp=x=>typeof x==='string'&&x.length<=40&&Number.isFinite(Date.parse(x));
const validText=(x,a,b,multi=false)=>typeof x==='string'&&x.trim().length>=a&&x.trim().length<=b&&!((multi?/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(x));
const object=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const fail=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const send=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const spec={
 expenseCreate:{method:'POST',key:'batchId'},expenseReverse:{method:'POST',key:'expenseId'},
 announcementEdit:{method:'POST',key:'announcementId'},announcementArchive:{method:'POST',key:'announcementId'},
 expenseList:{method:'GET',key:'batchId'},expenseDetail:{method:'GET',key:'expenseId'},
 statement:{method:'GET',key:'batchId'},statementCsv:{method:'GET',key:'batchId'},expensesCsv:{method:'GET',key:'batchId'},
};
async function jsonBody(req){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))fail(415,'UNSUPPORTED_MEDIA_TYPE');
 const length=req.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||+length>16000))fail(413,'BODY_TOO_LARGE');
 const reader=req.body?.getReader();if(!reader)fail(400,'INVALID_BODY');
 const chunks=[];let size=0;try{while(true){const v=await reader.read();if(v.done)break;size+=v.value.byteLength;if(size>16000)fail(413,'BODY_TOO_LARGE');chunks.push(v.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let i=0;for(const x of chunks){bytes.set(x,i);i+=x.length;}
 let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(400,'INVALID_JSON');}
 return parsed;
}
function bodyFor(kind,b){
 if(kind==='expenseCreate'){
  if(!object(b,['expenseOn','category','payee','notes','amountMinor','method','reference'])||!date(b.expenseOn)||!['rent','salary','utilities','supplies','maintenance','marketing','other'].includes(b.category)||!validText(b.payee,2,120)||!validText(b.notes,0,500,true)||!minor(b.amountMinor)||!['cash','bank','mobile_banking'].includes(b.method)||!validText(b.reference,0,120))fail(400,'INVALID_PAYLOAD');
  return {...b,payee:b.payee.trim(),notes:b.notes.trim(),reference:b.reference.trim()};
 }
 if(kind==='expenseReverse'){
  if(!object(b,['reason'])||!validText(b.reason,5,500,true))fail(400,'INVALID_PAYLOAD');return {reason:b.reason.trim()};
 }
 if(kind==='announcementEdit'){
  if(!object(b,['title','body','visibleFrom'])||!validText(b.title,2,160)||!validText(b.body,2,10000,true)||!(b.visibleFrom===null||(typeof b.visibleFrom==='string'&&/^(20\d{2})-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(b.visibleFrom)&&stamp(b.visibleFrom))))fail(400,'INVALID_PAYLOAD');
  return {...b,title:b.title.trim(),body:b.body.trim()};
 }
 if(kind==='announcementArchive'){
  if(!object(b,[]))fail(400,'INVALID_PAYLOAD');return {};
 }
 fail(400,'INVALID_PAYLOAD');
}
function moneyStr(v,signed=false){return typeof v==='string'&&new RegExp(signed?'^-?\\d{1,27}$':'^\\d{1,27}$').test(v)&&BigInt(v)<=10n**26n&&BigInt(v)>=-(10n**26n);}
const reportKeys=['batchId','period','currency','unit','basis','grossCollectionsMinor','refundsMinor','netCollectionsMinor','grossExpensesMinor','reversedExpensesMinor','netExpensesMinor','netCashFlowMinor','waiversMemoMinor','billedMemoMinor','paymentCount'];
function checkReport(v,batch,per){
 if(!object(v,reportKeys)||v.batchId!==batch||v.period!==per||v.currency!=='BDT'||v.unit!=='paisa'||v.basis!=='posted_utc'||!Number.isSafeInteger(v.paymentCount)||v.paymentCount<0)fail(502,'UPSTREAM_DATA_INVALID');
 const fields=['grossCollectionsMinor','refundsMinor','netCollectionsMinor','grossExpensesMinor','reversedExpensesMinor','netExpensesMinor','netCashFlowMinor','waiversMemoMinor','billedMemoMinor'];
 for(const k of fields)if(!moneyStr(v[k],['netCollectionsMinor','netExpensesMinor','netCashFlowMinor'].includes(k)))fail(502,'UPSTREAM_DATA_INVALID');
 const n=k=>BigInt(v[k]);
 if(n('grossCollectionsMinor')-n('refundsMinor')!==n('netCollectionsMinor')||n('grossExpensesMinor')-n('reversedExpensesMinor')!==n('netExpensesMinor')||n('netCollectionsMinor')-n('netExpensesMinor')!==n('netCashFlowMinor'))fail(502,'UPSTREAM_DATA_INVALID');
 return v;
}
const expenseKeys=['id','batchId','expenseOn','amountMinor','category','payee','notes','method','reference','createdAt','reversed'];
function checkExpense(v,opts={}){
 const keys=opts.detail?[...expenseKeys,'reversalReason']:expenseKeys;
 if(!object(v,keys)||!id(v.id)||!id(v.batchId)||!date(v.expenseOn)||!minor(v.amountMinor)||!['rent','salary','utilities','supplies','maintenance','marketing','other'].includes(v.category)||!validText(v.payee,2,120)||!validText(v.notes,0,500,true)||!['cash','bank','mobile_banking'].includes(v.method)||!validText(v.reference,0,120)||!stamp(v.createdAt)||typeof v.reversed!=='boolean')fail(502,'UPSTREAM_DATA_INVALID');
 if(opts.batch&&v.batchId!==opts.batch)fail(502,'UPSTREAM_DATA_INVALID');
 if(opts.target&&v.id!==opts.target)fail(502,'UPSTREAM_DATA_INVALID');
 if(opts.detail&&!(v.reversalReason===null||(v.reversed&&validText(v.reversalReason,5,500,true))))fail(502,'UPSTREAM_DATA_INVALID');
 return v;
}
function checkList(v,batch,per,limit,offset){
 if(!object(v,['period','batchId','total','items'])||v.period!==per||v.batchId!==batch||!Number.isSafeInteger(v.total)||v.total<0||!Array.isArray(v.items)||v.items.length>limit||v.items.length>Math.max(0,v.total-offset))fail(502,'UPSTREAM_DATA_INVALID');
 const seen=new Set();for(const row of v.items){checkExpense(row,{batch});if(seen.has(row.id))fail(502,'UPSTREAM_DATA_INVALID');seen.add(row.id);}return v;
}
function csvField(value){
 let x=String(value??'');if(/^[=+@\-\t\r]/.test(x))x="'"+x;
 return '"'+x.replaceAll('"','""')+'"';
}
function csv(rows,name){return new Response('\uFEFF'+rows.map(r=>r.map(csvField).join(',')).join('\r\n')+'\r\n',{status:200,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});}
function statementCsv(x){const names=['Gross collections','Refunds','Net collections','Gross expenses','Reversed expenses','Net expenses','Net cashflow','Waivers (non-cash)','Billed (memo-only)'];const fields=['grossCollectionsMinor','refundsMinor','netCollectionsMinor','grossExpensesMinor','reversedExpensesMinor','netExpensesMinor','netCashFlowMinor','waiversMemoMinor','billedMemoMinor'];return csv([['Metric','BDT paisa','Period (UTC postings)','Batch ID'],...names.map((n,i)=>[n,x[fields[i]],x.period,x.batchId])],`cashflow-${x.period}.csv`);}
function expensesCsv(x){return csv([['ID','Batch','Posted UTC','Expense date','Category','Payee','Amount (BDT paisa)','Method','Reference','Notes','Reversed'],...x.items.map(r=>[r.id,r.batchId,r.createdAt,r.expenseOn,r.category,r.payee,r.amountMinor,r.method,r.reference,r.notes,r.reversed?'yes':'no'])],`expenses-${x.period}.csv`);}
function resultMutation(kind,target,d,v){
 const base=kind==='expenseCreate'?['id','batchId','amountMinor','category','expenseOn','reversed']:kind==='expenseReverse'?['id','batchId','amountMinor','reversed']:kind==='announcementEdit'?['id','batchId','status','title']:['id','status'];
 if(!object(v,base))fail(502,'UPSTREAM_DATA_INVALID');
 if(kind==='expenseCreate'&&(!id(v.id)||v.batchId!==target||v.amountMinor!==d.amountMinor||v.category!==d.category||v.expenseOn!==d.expenseOn||v.reversed!==false))fail(502,'UPSTREAM_DATA_INVALID');
 if(kind==='expenseReverse'&&(v.id!==target||!id(v.batchId)||!minor(v.amountMinor)||v.reversed!==true))fail(502,'UPSTREAM_DATA_INVALID');
 if(kind==='announcementEdit'&&(v.id!==target||!id(v.batchId)||v.status!=='draft'||v.title!==d.title))fail(502,'UPSTREAM_DATA_INVALID');
 if(kind==='announcementArchive'&&(v.id!==target||v.status!=='archived'))fail(502,'UPSTREAM_DATA_INVALID');
 return v;
}
export function createOfficeOperationsRoute(kind,{verify,call}={}){
 if(!spec[kind]||typeof verify!=='function'||typeof call!=='function')throw Error('INVALID_OFFICE_OP_PORT');
 return async function handler(req,ctx={}){try{
  if(!(req instanceof Request)||req.method!==spec[kind].method)fail(405,'METHOD_NOT_ALLOWED');
  const u=new URL(req.url),q=u.searchParams;
  const isPost=spec[kind].method==='POST';
  if(isPost&&u.search)fail(400,'INVALID_QUERY');
  const allow=kind==='expenseList'?['period','limit','offset']:kind==='expenseDetail'?[]:['period'];
  if(!isPost&&([...q.keys()].some(k=>!allow.includes(k))||[...q.keys()].some(k=>q.getAll(k).length!==1)||q.size>allow.length))fail(400,'INVALID_QUERY');
  let per,limit=20,offset=0;
  if(!isPost&&kind!=='expenseDetail'){
   per=q.get('period');if(!period(per))fail(400,'INVALID_PERIOD');
   if(kind==='expenseList'){
    const l=q.get('limit'),o=q.get('offset');if(l!==null&&(!/^\d+$/.test(l)||+l<1||+l>100))fail(400,'INVALID_LIMIT');if(o!==null&&(!/^\d+$/.test(o)||+o>10000))fail(400,'INVALID_OFFSET');limit=l===null?20:+l;offset=o===null?0:+o;
   }
  }
  const match=/^Bearer ([^\s,]+)$/.exec(req.headers.get('authorization')??'');if(!match||match[1].length>8192||!JWT.test(match[1]))fail(401,'UNAUTHORIZED');
  const target=(await ctx.params)?.[spec[kind].key];if(!id(target))fail(400,'INVALID_RESOURCE_ID');
  const token=match[1];let d={},op=null;
  if(isPost){op=req.headers.get('idempotency-key');if(!id(op))fail(400,'INVALID_OPERATION_ID');d=bodyFor(kind,await jsonBody(req));}
  const actor=await verify(token);if(!actor||actor.verified!==true||actor.role!=='teacher'||actor.accountStatus!=='active'||actor.accessToken!==token||!id(actor.userId))fail(403,'FORBIDDEN');
  const args={target,token,operationId:op,data:d,period:per,limit,offset};
  if(isPost){const v=resultMutation(kind,target,d,await call(kind,args));return send(201,{success:true,data:v});}
  if(kind==='expenseDetail'){const v=await call(kind,args);if(v===null)return send(404,{success:false,error:{code:'NOT_FOUND'}});return send(200,{success:true,data:checkExpense(v,{detail:true,target})});}
  if(['statement','statementCsv'].includes(kind)){const v=checkReport(await call('statement',args),target,per);return kind==='statementCsv'?statementCsv(v):send(200,{success:true,data:v});}
  const max=kind==='expensesCsv'?100:limit;
  const v=checkList(await call('expenseList',{...args,limit:max,offset:kind==='expensesCsv'?0:offset}),target,per,max,kind==='expensesCsv'?0:offset);
  if(kind==='expensesCsv'){
   if(v.total>1000)return send(409,{success:false,error:{code:'EXPORT_ROW_LIMIT',message:'Filter to a smaller period; export must be complete.'}});
   const seen=new Set(v.items.map(row=>row.id));
   while(v.items.length<v.total){
    const next=checkList(await call('expenseList',{...args,limit:100,offset:v.items.length}),target,per,100,v.items.length);
    if(next.total!==v.total)return send(409,{success:false,error:{code:'EXPORT_CHANGED',message:'Expense records changed during export. Reload and export again.'}});
    if(!next.items.length)fail(502,'UPSTREAM_DATA_INVALID');
    for(const row of next.items){if(seen.has(row.id))fail(502,'UPSTREAM_DATA_INVALID');seen.add(row.id);}
    v.items.push(...next.items);
   }
   if(v.items.length!==v.total)fail(502,'UPSTREAM_DATA_INVALID');return expensesCsv(v);
  }
  return send(200,{success:true,data:v});
 }catch(e){if(e instanceof RpcError)return send(e.status,{success:false,error:{code:e.code}});if(e&&[400,401,403,404,405,409,413,415,502].includes(e.status)&&e.code)return send(e.status,{success:false,error:{code:e.code}});return send(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}};
}
