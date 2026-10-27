'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {managementCommand,managementRead} from '@/client/management-api';
import type {Lifecycle} from '@/client/student-directory.mjs';

type State={studentId:string;status:Lifecycle;reason:string;changedAt:string|null;history:{from:Lifecycle;to:Lifecycle;reason:string;at:string}[];preserved:{enrollments:number;dues:number;payments:number;receipts:number;examResults:number}};
const LABEL:Record<Lifecycle,string>={active:'Active',inactive:'Inactive',cancelled:'Cancelled',completed:'Completed'};
const TONE:Record<Lifecycle,string>={active:'active',inactive:'pending',cancelled:'rejected',completed:'completed'};
const MEANING:Record<Lifecycle,string>={active:'Enrolled and eligible: included in batch billing, exams and new enrollments.',inactive:'Temporarily not attending: skipped by monthly billing and new enrollments; history stays visible.',
 cancelled:'Admission cancelled: no new enrollments or billing. Payments, receipts and results are preserved.',completed:'Course completed: kept for records and reports; no new billing.'};
/** Allowed transitions; the database enforces the same rules. */
const NEXT:Record<Lifecycle,{to:Lifecycle;label:string;needsReason:boolean}[]>={
 active:[{to:'inactive',label:'Mark inactive',needsReason:true},{to:'completed',label:'Mark completed',needsReason:false},{to:'cancelled',label:'Cancel admission',needsReason:true}],
 inactive:[{to:'active',label:'Reactivate',needsReason:false},{to:'cancelled',label:'Cancel admission',needsReason:true}],
 cancelled:[{to:'active',label:'Reinstate',needsReason:true}],completed:[{to:'active',label:'Reinstate',needsReason:true}],
};

/** Teacher control for a Student's lifecycle status, separate from portal access, enrollment and payment status. */
export function StudentLifecyclePanel({studentId,onChanged}:{studentId:string;onChanged?:(status:Lifecycle)=>void}){
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[pending,setPending]=useState<{to:Lifecycle;label:string;needsReason:boolean}|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[saved,setSaved]=useState('');
 useEffect(()=>{let active=true;managementRead<State>('student-lifecycle',{studentId}).then(next=>{if(active)setState(next);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[studentId,version]);
 async function submit(e:FormEvent){e.preventDefault();if(!pending)return;setBusy(true);setError('');
  try{await managementCommand('student-lifecycle',{studentId,status:pending.to,reason:reason.trim()});setSaved(`Status changed to ${LABEL[pending.to]}.`);setPending(null);setReason('');setVersion(v=>v+1);onChanged?.(pending.to);}
  catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 if(!state)return <fieldset className="mgmt-lifecycle"><legend>Student status</legend>{error?<p className="portal-alert" role="alert">{error}</p>:<p className="portal-muted">Loading status…</p>}</fieldset>;
 return <fieldset className="mgmt-lifecycle" aria-label="Student status">
  <legend>Student status</legend>
  <div className="mgmt-lifecycle-head"><span className="premium-badge" data-status={TONE[state.status]}>{LABEL[state.status]}</span><p>{MEANING[state.status]}</p></div>
  {state.reason&&state.status!=='active'&&<p className="mgmt-hint">Reason: {state.reason}{state.changedAt?` · ${new Date(state.changedAt).toLocaleDateString('en-GB')}`:''}</p>}
  {saved&&<p className="mgmt-notice" role="status">{saved}</p>}
  <div className="mgmt-quick-row">{NEXT[state.status].map(option=><button type="button" key={option.to} className={'portal-secondary'+(option.to==='cancelled'?' mgmt-danger':'')} onClick={()=>{setPending(option);setReason('');setSaved('');}}>{option.label}</button>)}</div>
  {pending&&<form className="mgmt-lifecycle-confirm" onSubmit={submit}>
   <label>{pending.needsReason?'Reason (required)':'Note (optional)'}<input autoFocus required={pending.needsReason} minLength={pending.needsReason?3:0} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder={pending.to==='cancelled'?'e.g. Guardian withdrew the admission':pending.to==='inactive'?'e.g. Exam break until December':'e.g. Rejoined after break'}/></label>
   {pending.to==='cancelled'&&<p className="mgmt-hint">Nothing is deleted: {state.preserved.payments} payment(s), {state.preserved.receipts} receipt(s), {state.preserved.dues} due(s) and {state.preserved.examResults} result(s) stay on record.</p>}
   <div className="mgmt-quick-row"><button type="button" className="portal-secondary" onClick={()=>setPending(null)} disabled={busy}>Back</button><button className="portal-primary" disabled={busy}>{busy?'Saving…':`Confirm: ${pending.label}`}</button></div>
  </form>}
  {error&&<p className="portal-alert" role="alert">{error}</p>}
  {state.history.length>0&&<details className="mgmt-history-details"><summary>Status history ({state.history.length})</summary><ol className="mgmt-history">{state.history.map((h,i)=><li key={i}><strong>{LABEL[h.from]} → {LABEL[h.to]}</strong><small>{new Date(h.at).toLocaleString('en-GB')}{h.reason?` · ${h.reason}`:''}</small></li>)}</ol></details>}
 </fieldset>;
}
