/** Part S: secure browser-only Finance Studio contract; never handles bearer JWT. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PER=/^20\d{2}-(0[1-9]|1[0-2])$/;
const DATE=/^\d{4}-\d\d-\d\d$/;
const id=x=>typeof x==='string'&&UUID.test(x);
const period=x=>typeof x==='string'&&PER.test(x);
const validDate=x=>typeof x==='string'&&DATE.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const int=(x,low,high)=>Number.isSafeInteger(x)&&x>=low&&x<=high;
const clean=(x,min,max,multiline=false)=>typeof x==='string'&&x.trim().length>=min&&x.trim().length<=max&&!(multiline?/\x00|[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(x);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const lists={
 plans:id=>`/api/v1/teacher/batches/${id}/fee-plans`,
 dues:id=>`/api/v1/teacher/batches/${id}/dues`,
 expenses:id=>`/api/v1/teacher/batches/${id}/expenses`,
 finance:id=>`/api/v1/teacher/batches/${id}/cashflow`,
 duePayments:id=>`/api/v1/teacher/dues/${id}/payments`,
 dueAdjustments:id=>`/api/v1/teacher/dues/${id}/adjustments`,
};
const cmds={
 plan:{target:'batch',url:id=>`/api/v1/teacher/batches/${id}/fee-plans/create`,fields:['period','amountMinor','dueOn','label']},
 generate:{target:'plan',url:id=>`/api/v1/teacher/fee-plans/${id}/dues/generate`,fields:[]},
 payment:{target:'due',url:id=>`/api/v1/teacher/dues/${id}/payments/post`,fields:['studentId','amountMinor','method','reference']},
 waiver:{target:'due',url:id=>`/api/v1/teacher/dues/${id}/waive`,fields:['amountMinor','reason']},
 refund:{target:'payment',url:id=>`/api/v1/teacher/payments/${id}/refund`,fields:['amountMinor','reason']},
 expense:{target:'batch',url:id=>`/api/v1/teacher/batches/${id}/expenses/create`,fields:['expenseOn','category','payee','notes','amountMinor','method','reference']},
 reverse:{target:'expense',url:id=>`/api/v1/teacher/expenses/${id}/reverse`,fields:['reason']},
};
const paymentMethods=['cash','bank','mobile_banking'];
const expenseCategories=['rent','salary','utilities','supplies','maintenance','marketing','other'];
function validate(kind,input){const keys=cmds[kind]?.fields;
 if(!keys||!exact(input,keys))throw Error('Complete the required finance fields without extra properties.');
 if(kind==='plan'&&(!period(input.period)||!int(input.amountMinor,1,100000000000)||!validDate(input.dueOn)||input.dueOn<input.period+'-01'||!clean(input.label,2,120)))throw Error('Check plan period, amount, due date and label.');
 if(kind==='payment'&&(!id(input.studentId)||!int(input.amountMinor,1,100000000000)||!paymentMethods.includes(input.method)||!clean(input.reference,0,120)))throw Error('Check the student, payment amount, method and reference.');
 if(['waiver','refund'].includes(kind)&&(!int(input.amountMinor,1,100000000000)||!clean(input.reason,5,500,true)))throw Error('Enter a positive amount and an explanation (5–500 characters).');
 if(kind==='expense'&&(!validDate(input.expenseOn)||!expenseCategories.includes(input.category)||!clean(input.payee,2,120)||!clean(input.notes,0,500,true)||!int(input.amountMinor,1,100000000000)||!paymentMethods.includes(input.method)||!clean(input.reference,0,120)))throw Error('Check the expense date, category, payee, amount and method.');
 if(kind==='reverse'&&!clean(input.reason,5,500,true))throw Error('Explain why this expense is being reversed.');
 return input;
}
function failMessage(payload,status){const code=payload?.error?.code;
 if(status===401)return 'Session expired. Please sign in again.';
 if(status===403)return 'Your account is not authorized for this finance action.';
 if(status===503)return code==='MUTATIONS_DISABLED'?'This server is read-only. The reviewed write session must be enabled before saving.':'The service is temporarily unavailable. Your changes could not be confirmed; reload before retrying.';
 if(typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,65}$/.test(code))return code.replaceAll('_',' ').toLowerCase();
 return `Finance request failed (HTTP ${status}).`;
}
async function transport(url,options,fetchImpl){const r=await fetchImpl(url,{...options,credentials:'same-origin',cache:'no-store'});
 let payload=null;if((r.headers.get('content-type')||'').includes('application/json')){try{payload=await r.json();}catch{throw Error('Invalid finance response format.');}}
 if(!r.ok)throw Error(failMessage(payload,r.status));
 if(!payload||payload.success!==true||!Object.hasOwn(payload,'data'))throw Error('Invalid finance response.');
 return payload.data;
}
export function parseBDTToMinor(value){if(typeof value!=='string'||!/^\d{1,9}(?:\.\d{1,2})?$/.test(value))throw Error('Enter a BDT amount (up to 2 decimal places).');
 const [whole,frac='']=value.split('.');const amount=BigInt(whole)*100n+BigInt((frac+'00').slice(0,2));
 if(amount<=0n||amount>100000000000n)throw Error('Amount must be greater than zero and within limit.');
 return Number(amount);
}
export function minorToBDT(value){if(!(typeof value==='string'&&/^-?\d{1,27}$/.test(value))&&!Number.isSafeInteger(value))return '—';
 const n=BigInt(value),negative=n<0n,a=negative?-n:n,whole=a/100n,dec=(a%100n).toString().padStart(2,'0');
 return `${negative?'−':''}৳${new Intl.NumberFormat('en-BD').format(whole)}.${dec}`;
}
export function financeList(kind,target,{billPeriod,offset=0,limit=20}={},fetchImpl=globalThis.fetch){
 if(!Object.hasOwn(lists,kind)||!id(target)||!int(offset,0,10000)||!int(limit,1,50))throw Error('Invalid finance list request.');
 const q=new URLSearchParams();
 if(kind==='finance'||kind==='expenses'){if(!period(billPeriod))throw Error('Choose a valid billing month.');q.set('period',billPeriod);}
 else {if(billPeriod!==undefined){if(!period(billPeriod)||!['plans','dues'].includes(kind))throw Error('Invalid finance period filter.');q.set('billPeriod',billPeriod);}q.set('limit',String(limit));q.set('offset',String(offset));}
 if(kind==='expenses'){q.set('limit',String(limit));q.set('offset',String(offset));}
 const url=lists[kind](target)+'?'+q.toString();
 return transport(url,{method:'GET'},fetchImpl).then(data=>{
  if(kind==='finance'){
   if(!data||data.batchId!==target||data.period!==billPeriod||data.currency!=='BDT'||data.unit!=='paisa'||data.basis!=='posted_utc'||typeof data.netCashFlowMinor!=='string')throw Error('Invalid financial statement.');
   return data;
  }
  if(!data||!Array.isArray(data.items)||data.items.length>limit||(!['duePayments','dueAdjustments','expenses'].includes(kind)&&!('batch' in data)))throw Error('Unexpected finance list.');
  if(kind==='expenses'&&(data.batchId!==target||data.period!==billPeriod||!int(data.total,0,100000)))throw Error('Invalid expense pagination.');
  const ids=new Set();for(const row of data.items){if(!row||!id(row.id)||ids.has(row.id))throw Error('Invalid finance record.');ids.add(row.id);
   if(['plans','dues','expenses'].includes(kind)&&row.batchId!==target)throw Error('Cross-batch finance record blocked.');
   if(kind==='duePayments'&&row.dueId!==target||kind==='dueAdjustments'&&row.dueId!==target)throw Error('Foreign due record blocked.');
  }
  return data;
 });
}
export function financeCommand(kind,target,input,fetchImpl=globalThis.fetch,uuid=()=>globalThis.crypto.randomUUID()){
 if(!Object.hasOwn(cmds,kind)||!id(target))throw Error('Invalid finance resource.');
 const data=validate(kind,input),op=uuid();if(!id(op))throw Error('Secure operation ID unavailable.');
 return transport(cmds[kind].url(target),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':op,'x-musa-ui':'1'},body:JSON.stringify(data)},fetchImpl);
}
export function financeCsv(kind,batchId,billPeriod){if(!['cashflow','expenses'].includes(kind)||!id(batchId)||!period(billPeriod))throw Error('Invalid export request.');
 return kind==='cashflow'?`/api/v1/teacher/batches/${batchId}/cashflow/export?period=${billPeriod}`:`/api/v1/teacher/batches/${batchId}/expenses/export?period=${billPeriod}`;
}
export const financeKinds=Object.freeze(Object.keys(lists));
