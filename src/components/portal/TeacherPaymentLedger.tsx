'use client';
import {Fragment,useEffect,useRef,useState,type FormEvent} from 'react';
import {PortalEmpty,PortalIcon,PortalMetric} from './PortalPrimitives';
import {currentPeriod,managementRead,periodLabel,taka,toMinor} from '@/client/management-api';
import {financeCommand} from '@/client/teacher-finance.mjs';
import {PortalScreen} from './PortalScreen';

type Payment={id:string;amountMinor:string;method:'cash'|'bank'|'mobile_banking';reference:string;createdAt:string;receiptNumber:string|null};
type Row={dueId:string;period:string;dueOn:string;label:string;batchId:string;batchName:string;batchCode:string;studentId:string;studentName:string;admissionRoll:string|null;amountMinor:string;paidMinor:string;waivedMinor:string;refundedMinor:string;correctedMinor:string;outstandingMinor:string;status:'paid'|'partial'|'unpaid'|'waived';overdue:boolean;payments:Payment[]};
type Ledger={rows:Row[];total:number;limit:number;offset:number;summary:{expectedMinor:string;collectedMinor:string;waivedMinor:string;outstandingMinor:string;paid:number;partial:number;unpaid:number;waived:number;overdue:number;methods:{cash:string;bank:string;mobileBanking:string}}};
const STATUS:Record<Row['status'],{label:string;tone:string}>={paid:{label:'Paid',tone:'active'},partial:{label:'Partially paid',tone:'pending'},unpaid:{label:'Unpaid',tone:'rejected'},waived:{label:'Waived',tone:'completed'}};
const METHOD:Record<Payment['method'],string>={cash:'Cash',bank:'Bank transfer',mobile_banking:'Mobile banking'};

async function openReceipt(paymentId:string){
 const endpoint=`/api/v1/teacher/payments/${paymentId}/receipt`;
 const issued=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-musa-ui':'1'},body:'{}'});
 if(!issued.ok){const body=await issued.json().catch(()=>null);throw new Error(body?.error?.code??'Receipt could not be issued.');}
 const response=await fetch(endpoint,{cache:'no-store'});
 if(!response.ok||!response.headers.get('content-type')?.startsWith('application/pdf'))throw new Error('Receipt PDF could not be downloaded.');
 const url=URL.createObjectURL(await response.blob());window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);
}

/** Teacher-wide (or one Student's) tuition ledger: every monthly due with its separate payments and receipts. */
export function TeacherPaymentLedger({studentId,batchId:fixedBatch,initialBatch,batches=[],compact=false}:{studentId?:string;batchId?:string;initialBatch?:string;batches?:{id:string;name:string}[];compact?:boolean}){
 const [period,setPeriod]=useState(studentId?'':currentPeriod()),[batchId,setBatchId]=useState(fixedBatch??initialBatch??''),[status,setStatus]=useState(''),[method,setMethod]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[offset,setOffset]=useState(0);
 const [data,setData]=useState<Ledger|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[open,setOpen]=useState(''),[paying,setPaying]=useState<Row|null>(null),[notice,setNotice]=useState('');
 const limit=compact?20:50;
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setOffset(0);},250);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted){setLoading(true);setError('');}});
  managementRead<Ledger>('payment-ledger',{period,batchId,status,method,q:query,studentId,limit,offset},'teacher',controller.signal).then(next=>{if(!controller.signal.aborted)setData(next);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();},[period,batchId,status,method,query,studentId,offset,limit,reload]);
 const s=data?.summary,collectedRate=s&&BigInt(s.expectedMinor)>0n?Number(BigInt(s.collectedMinor)*100n/BigInt(s.expectedMinor)):0;
 async function receipt(id:string){setError('');try{await openReceipt(id);}catch(e){setError((e as Error).message);}}
 return <section className={'mgmt-ledger'+(compact?' is-compact':'')} aria-label={studentId?'Student payment history':'Tuition payment ledger'}>
  <div className="premium-filterbar">
   {!studentId&&<label className="premium-search"><span className="sr-only">Search ledger</span><PortalIcon name="search"/><input value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} placeholder="Search Student, roll or batch…"/></label>}
   <label className="mgmt-filter">Billing month<input type="month" aria-label="Billing month" value={period} onChange={e=>{setPeriod(e.target.value);setOffset(0);}}/></label>
   {period&&<button className="portal-text-button" onClick={()=>{setPeriod('');setOffset(0);}}>All months</button>}
   {!fixedBatch&&batches.length>0&&<select aria-label="Batch filter" value={batchId} onChange={e=>{setBatchId(e.target.value);setOffset(0);}}><option value="">All batches</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}
   <select aria-label="Payment status filter" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">All statuses</option><option value="paid">Paid</option><option value="partial">Partially paid</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option><option value="waived">Waived</option><option value="refunded">Refunded</option></select>
   {!compact&&<select aria-label="Payment method filter" value={method} onChange={e=>{setMethod(e.target.value);setOffset(0);}}><option value="">All methods</option><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="mobile_banking">Mobile banking</option></select>}
  </div>
  {s&&<div className="premium-metrics"><PortalMetric icon="finance" label={period?`Expected · ${periodLabel(period)}`:'Expected'} value={taka(s.expectedMinor)} detail={`${data!.total} billing record(s)`}/><PortalMetric icon="results" label="Collected" value={taka(s.collectedMinor)} detail={`${collectedRate}% collection rate`}/><PortalMetric icon="clock" label="Outstanding" value={taka(s.outstandingMinor)} detail={`${s.overdue} overdue · ${taka(s.waivedMinor)} waived`}/><PortalMetric icon="students" label="Payment status" value={`${s.paid} paid`} detail={`${s.partial} partial · ${s.unpaid} unpaid`}/></div>}
  {s&&!compact&&<p className="mgmt-hint">By method: cash {taka(s.methods.cash)} · bank {taka(s.methods.bank)} · mobile banking {taka(s.methods.mobileBanking)}</p>}
  {notice&&<div className="mgmt-notice" role="status">{notice}<button className="portal-text-button" onClick={()=>setNotice('')} aria-label="Dismiss">✕</button></div>}
  {error&&<div className="premium-error" role="alert">{error} <button className="portal-secondary" onClick={()=>setReload(v=>v+1)}>Retry</button></div>}
  <div className="premium-surface premium-directory-surface" aria-busy={loading}>
   {loading&&!data?<div className="portal-loading" role="status"><span className="portal-spinner"/>Loading ledger…</div>:data?.rows.length?<div className="premium-table-wrap" tabIndex={0} role="region" aria-label="Ledger records"><table className="premium-table mgmt-ledger-table"><thead><tr>{!studentId&&<th>Student</th>}<th>Month / batch</th><th>Expected</th><th>Paid</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{data.rows.map(r=><Fragment key={r.dueId}><tr>{!studentId&&<td><strong>{r.studentName}</strong><small>{r.admissionRoll??'No roll'}</small></td>}<td>{periodLabel(r.period)}<small>{r.batchName} · due {r.dueOn}</small></td><td>{taka(r.amountMinor)}{r.waivedMinor!=='0'&&<small>waived {taka(r.waivedMinor)}</small>}</td><td>{taka(r.paidMinor)}<small>{r.payments.length} payment(s)</small></td><td><strong>{taka(r.outstandingMinor)}</strong></td>
     <td><span className="premium-badge" data-status={STATUS[r.status].tone}>{STATUS[r.status].label}</span>{r.overdue&&<small className="mgmt-overdue">Overdue</small>}</td>
     <td><div className="premium-table-actions">{r.status!=='paid'&&r.status!=='waived'&&<button className="portal-primary" onClick={()=>setPaying(r)}>Record payment</button>}<button className="portal-secondary" aria-expanded={open===r.dueId} onClick={()=>setOpen(open===r.dueId?'':r.dueId)}>{open===r.dueId?'Hide':'Payments'}</button></div></td></tr>
     {open===r.dueId&&<tr className="mgmt-ledger-detail"><td colSpan={studentId?6:7}>{r.payments.length?<ol>{r.payments.map((p,i)=><li key={p.id}><span>#{i+1} · {new Date(p.createdAt).toLocaleDateString('en-GB')} · {METHOD[p.method]}{p.reference?` · ${p.reference}`:''}</span><strong>{taka(p.amountMinor)}</strong><button className="portal-text-button" onClick={()=>void receipt(p.id)}>{p.receiptNumber?`Receipt ${p.receiptNumber}`:'Issue receipt'} ↗</button></li>)}</ol>:<p className="portal-muted">No payments yet for this month.</p>}{r.refundedMinor!=='0'&&<p className="mgmt-hint">Refunded {taka(r.refundedMinor)}</p>}</td></tr>}</Fragment>)}</tbody></table></div>
    :!error&&<PortalEmpty icon="finance" title="No billing records" detail={studentId?'This Student has no monthly dues yet.':'Generate a month from a batch (Batches → Manage → Monthly billing) or adjust the filters.'}/>}
   {data&&data.total>limit&&<div className="premium-pagination"><span>Showing {data.offset+1}–{Math.min(data.offset+limit,data.total)} of {data.total}</span><div><button className="portal-secondary" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-limit))}>‹</button><button className="portal-secondary" disabled={offset+limit>=data.total} onClick={()=>setOffset(v=>v+limit)}>›</button></div></div>}
  </div>
  {paying&&<PaymentDialog row={paying} onClose={()=>setPaying(null)} onSaved={amount=>{setPaying(null);setNotice(`Payment of ${amount} recorded for ${paying.studentName}. Each payment keeps its own receipt.`);setOpen(paying.dueId);setReload(v=>v+1);}}/>}
 </section>;
}

function PaymentDialog({row,onClose,onSaved}:{row:Row;onClose:()=>void;onSaved:(amount:string)=>void}){
 const [amount,setAmount]=useState(''),[method,setMethod]=useState<Payment['method']>('cash'),[reference,setReference]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const submitted=useRef(false);
 const outstanding=BigInt(row.outstandingMinor);
 async function submit(e:FormEvent){e.preventDefault();if(submitted.current)return;setError('');const minor=toMinor(amount);
  if(minor===null||minor<=0)return setError('Enter the amount received in BDT.');if(BigInt(minor)>outstanding)return setError(`The amount is more than the outstanding ${taka(row.outstandingMinor)}.`);
  if(method!=='cash'&&!reference.trim())return setError('Add the transaction or bank reference.');
  submitted.current=true;setBusy(true);
  try{await financeCommand('payment',row.dueId,{studentId:row.studentId,amountMinor:minor,method,reference:reference.trim()});onSaved(taka(minor));}
  catch(err){submitted.current=false;setError((err as Error).message.replaceAll('_',' ').toLowerCase());}finally{setBusy(false);}
 }
 return <PortalScreen trail={[row.studentName,'Record payment']} kicker="RECORD OFFLINE PAYMENT" title="Record payment" subtitle={<>{row.studentName}{row.admissionRoll?` · ${row.admissionRoll}`:''} · {row.batchName} · {periodLabel(row.period)}</>} onBack={()=>{if(!busy)onClose();}}><form className="teacher-ops-modal mgmt-pay-screen" aria-label={`Record payment for ${row.studentName}`} onSubmit={submit}>
  <div className="teacher-ops-modal-head"><div><span className="portal-kicker">RECORD OFFLINE PAYMENT</span><h3 id="ledger-pay-heading">{row.studentName}</h3><p className="portal-muted">{periodLabel(row.period)} · {row.batchName}</p></div><button type="button" className="portal-secondary" onClick={onClose} aria-label="Close payment form">✕</button></div>
  <dl className="mgmt-pay-summary"><div><dt>Expected</dt><dd>{taka(row.amountMinor)}</dd></div><div><dt>Paid so far</dt><dd>{taka(row.paidMinor)}</dd></div><div><dt>Outstanding</dt><dd><strong>{taka(row.outstandingMinor)}</strong></dd></div></dl>
  <label>Amount received (BDT)<input autoFocus required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={String(Number(outstanding)/100)}/></label>
  <div className="mgmt-quick-row"><button type="button" className="portal-text-button" onClick={()=>setAmount(String(Number(outstanding)/100))}>Full balance</button><button type="button" className="portal-text-button" onClick={()=>setAmount(String(Math.floor(Number(outstanding)/200)))}>Half</button></div>
  <label>Method<select value={method} onChange={e=>setMethod(e.target.value as Payment['method'])}><option value="cash">Cash</option><option value="mobile_banking">Mobile banking (bKash/Nagad)</option><option value="bank">Bank transfer</option></select></label>
  <label>Reference {method==='cash'?'(optional)':''}<input maxLength={120} value={reference} onChange={e=>setReference(e.target.value)} placeholder={method==='cash'?'Receipt book no.':'Transaction ID'}/></label>
  {error&&<div className="portal-alert" role="alert">{error}</div>}
  <div className="teacher-ops-modal-actions"><button type="button" className="portal-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="portal-primary" disabled={busy}>{busy?'Recording…':'Record payment'}</button></div>
  {row.payments.length>0&&<section className="mgmt-pay-history" aria-label="Earlier payments for this month"><h4>Earlier payments this month</h4><ol>{row.payments.map((p,i)=><li key={p.id}><span>#{i+1} · {new Date(p.createdAt).toLocaleDateString('en-GB')} · {METHOD[p.method]}{p.reference?` · ${p.reference}`:''}</span><strong>{taka(p.amountMinor)}</strong></li>)}</ol></section>}
 </form></PortalScreen>;
}
