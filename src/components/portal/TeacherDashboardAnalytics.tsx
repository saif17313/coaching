'use client';
import {useEffect,useState} from 'react';
import {currentPeriod,friendlyError,managementRead,periodLabel,taka} from '@/client/management-api';
import './dashboard-analytics.css';

type Analytics={period:string;
 payments:{dues:number;paid:number;partial:number;unpaid:number;waived:number;overdue:number;expectedMinor:string;collectedMinor:string;outstandingMinor:string};
 batchCollection:{batchId:string;name:string;code:string;expectedMinor:string;collectedMinor:string;outstandingMinor:string;dues:number}[];
 students:{total:number;active:number;inactive:number;cancelled:number;completed:number;pendingAccounts:number;pendingEnrollments:number;newThisMonth:number};
 batches:{batchId:string;name:string;code:string;status:string;capacity:number;enrolled:number;syllabusBasisPoints:number;syllabusUnits:number}[];
 exams:{upcoming:{id:string;title:string;batchName:string;scheduledAt:string}[];upcomingCount:number;awaitingResults:number;published:number}};
// Payment states, validated with the dataviz palette checker (light surface): every check passes.
const STATUS=[{key:'paid',label:'Paid',color:'#0a8f7e',icon:'✓'},{key:'partial',label:'Partially paid',color:'#b8860b',icon:'◐'},{key:'unpaid',label:'Unpaid',color:'#c0392b',icon:'!'},{key:'waived',label:'Waived',color:'#5a62c4',icon:'–'}] as const;
const pct=(part:bigint,whole:bigint)=>whole>0n?Number(part*1000n/whole)/10:0;

function Donut({payments,onOpen}:{payments:Analytics['payments'];onOpen:()=>void}){
 const [hover,setHover]=useState<string|null>(null);
 const total=STATUS.reduce((sum,s)=>sum+payments[s.key],0),r=58,c=2*Math.PI*r;let offset=0;
 const rate=pct(BigInt(payments.collectedMinor),BigInt(payments.expectedMinor));
 return <div className="dash-donut">
  <button type="button" className="dash-donut-chart" onClick={onOpen} aria-label={`Payment status: ${STATUS.map(s=>`${payments[s.key]} ${s.label.toLowerCase()}`).join(', ')}. Open the payment ledger.`}>
   <svg viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r={r} className="dash-donut-track"/>
    {total>0&&STATUS.map(s=>{const value=payments[s.key];if(!value)return null;const length=value/total*c,gap=total>value?2:0,seg=<circle key={s.key} cx="75" cy="75" r={r} stroke={s.color} strokeDasharray={`${Math.max(0,length-gap)} ${c}`} strokeDashoffset={-offset} className={'dash-donut-seg'+(hover&&hover!==s.key?' is-dim':'')} onMouseEnter={()=>setHover(s.key)} onMouseLeave={()=>setHover(null)}/>;offset+=length;return seg;})}
   </svg>
   <span className="dash-donut-center"><strong>{rate}%</strong><small>collected</small></span>
  </button>
  <ul className="dash-legend">{STATUS.map(s=><li key={s.key} className={hover===s.key?'is-hover':''} onMouseEnter={()=>setHover(s.key)} onMouseLeave={()=>setHover(null)}><i style={{background:s.color}} aria-hidden="true">{s.icon}</i><span>{s.label}</span><b>{payments[s.key]}</b></li>)}</ul>
 </div>;
}

/** Live teacher dashboard analytics for a billing month, drawn only from persisted records. */
export function TeacherDashboardAnalytics({onNavigate,onOpenBatch,version=0}:{onNavigate:(page:string)=>void;onOpenBatch:(page:string,batchId:string)=>void;version?:number}){
 const [period,setPeriod]=useState(currentPeriod()),[data,setData]=useState<Analytics|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted){setLoading(true);setError('');}});
  managementRead<Analytics>('dashboard',{period},'teacher',controller.signal).then(next=>{if(!controller.signal.aborted)setData(next);}).catch(e=>{if(!controller.signal.aborted)setError(friendlyError((e as Error).message));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();},[period,version]);
 const p=data?.payments,maxExpected=data?Math.max(1,...data.batchCollection.map(b=>Number(b.expectedMinor))):1;
 return <section className="dash-analytics" aria-labelledby="dash-analytics-title" aria-busy={loading}>
  <header className="dash-analytics-head"><div><span className="portal-kicker">LIVE ANALYTICS</span><h3 id="dash-analytics-title">{periodLabel(period)} at a glance</h3><p>Tuition, students, batches and exams from your recorded data.</p></div>
   <label className="dash-period"><span className="sr-only">Billing month</span><input type="month" value={period} onChange={e=>setPeriod(e.target.value||currentPeriod())}/></label></header>
  {error?<p className="premium-error" role="alert">{error}</p>:!data?<div className="portal-loading" role="status">Loading analytics…</div>:<div className="dash-grid">
   <article className="dash-card dash-card-payments">
    <div className="dash-card-head"><h4>Payment status</h4><button type="button" className="portal-text-button" onClick={()=>onNavigate('ledger')}>Open ledger →</button></div>
    {p!.dues?<><Donut payments={p!} onOpen={()=>onNavigate('ledger')}/>
     <dl className="dash-money"><div><dt>Expected</dt><dd>{taka(p!.expectedMinor)}</dd></div><div><dt>Collected</dt><dd className="good">{taka(p!.collectedMinor)}</dd></div><div><dt>Outstanding</dt><dd className="bad">{taka(p!.outstandingMinor)}</dd></div></dl>
     {p!.overdue>0&&<p className="dash-alert">⚠ {p!.overdue} due{p!.overdue===1?' is':'s are'} past the due date.</p>}</>
     :<p className="dash-empty">No dues were issued for {periodLabel(period)}. Generate them from a batch’s Monthly billing.</p>}
   </article>
   <article className="dash-card dash-card-collection">
    <div className="dash-card-head"><h4>Collection by batch</h4><span className="dash-key"><i className="good"/>Collected <i className="bad"/>Outstanding</span></div>
    {data.batchCollection.length?<ul className="dash-bars">{data.batchCollection.map(b=>{const expected=Number(b.expectedMinor),collected=Number(b.collectedMinor),outstanding=Number(b.outstandingMinor);
     return <li key={b.batchId}><button type="button" onClick={()=>onOpenBatch('finance',b.batchId)} aria-label={`${b.name}: collected ${taka(b.collectedMinor)} of ${taka(b.expectedMinor)}, outstanding ${taka(b.outstandingMinor)}. Open batch finance.`}>
      <span className="dash-bar-label"><strong>{b.name}</strong><small>{taka(b.collectedMinor)} of {taka(b.expectedMinor)}</small></span>
      <span className="dash-bar" style={{width:`${Math.max(8,expected/maxExpected*100)}%`}}><span className="good" style={{flexGrow:collected}}/><span className="bad" style={{flexGrow:outstanding}}/></span>
     </button></li>;})}</ul>:<p className="dash-empty">No batch has dues for this month yet.</p>}
   </article>
   <article className="dash-card">
    <div className="dash-card-head"><h4>Students</h4><button type="button" className="portal-text-button" onClick={()=>onNavigate('students')}>Directory →</button></div>
    <div className="dash-stack" role="img" aria-label={`${data.students.active} active, ${data.students.inactive} inactive, ${data.students.completed} completed, ${data.students.cancelled} cancelled`}>
     {[['active','#0a8f7e'],['inactive','#b8860b'],['completed','#5a62c4'],['cancelled','#c0392b']].map(([key,color])=>{const value=data.students[key as 'active'];return value?<span key={key} style={{flexGrow:value,background:color}}/>:null;})}</div>
    <ul className="dash-legend is-inline">{[['Active','active','#0a8f7e'],['Inactive','inactive','#b8860b'],['Completed','completed','#5a62c4'],['Cancelled','cancelled','#c0392b']].map(([label,key,color])=><li key={key}><i style={{background:color}} aria-hidden="true"/><span>{label}</span><b>{data.students[key as 'active']}</b></li>)}</ul>
    <dl className="dash-facts"><div><dt>New admissions this month</dt><dd>{data.students.newThisMonth}</dd></div><div><dt>Accounts awaiting approval</dt><dd>{data.students.pendingAccounts}</dd></div><div><dt>Enrollment requests</dt><dd>{data.students.pendingEnrollments}</dd></div></dl>
   </article>
   <article className="dash-card">
    <div className="dash-card-head"><h4>Batches · seats & syllabus</h4><button type="button" className="portal-text-button" onClick={()=>onNavigate('batches')}>All batches →</button></div>
    {data.batches.length?<ul className="dash-progress-list">{data.batches.map(b=><li key={b.batchId}><button type="button" onClick={()=>onOpenBatch('syllabus',b.batchId)} aria-label={`${b.name}: ${b.enrolled} of ${b.capacity} seats, syllabus ${b.syllabusBasisPoints/100}% complete. Open syllabus.`}>
      <strong>{b.name}</strong>
      <span className="dash-mini"><small>Seats {b.enrolled}/{b.capacity}</small><span className="dash-track"><span style={{width:`${Math.min(100,b.capacity?b.enrolled/b.capacity*100:0)}%`}}/></span></span>
      <span className="dash-mini"><small>{b.syllabusUnits?`Syllabus ${(b.syllabusBasisPoints/100).toFixed(0)}%`:'No syllabus yet'}</small><span className="dash-track is-gold"><span style={{width:`${b.syllabusBasisPoints/100}%`}}/></span></span>
     </button></li>)}</ul>:<p className="dash-empty">No running or open batches.</p>}
   </article>
   <article className="dash-card">
    <div className="dash-card-head"><h4>Examinations</h4><button type="button" className="portal-text-button" onClick={()=>onNavigate('exams')}>Exams →</button></div>
    <dl className="dash-facts is-row"><div><dt>Next 30 days</dt><dd>{data.exams.upcomingCount}</dd></div><div><dt>Awaiting results</dt><dd className={data.exams.awaitingResults?'warn':''}>{data.exams.awaitingResults}</dd></div><div><dt>Published</dt><dd>{data.exams.published}</dd></div></dl>
    {data.exams.upcoming.length?<ul className="dash-upcoming">{data.exams.upcoming.map(x=><li key={x.id}><time dateTime={x.scheduledAt}>{new Date(x.scheduledAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</time><span><strong>{x.title}</strong><small>{x.batchName} · {new Date(x.scheduledAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</small></span></li>)}</ul>
     :<p className="dash-empty">No exams scheduled in the next 30 days.</p>}
    {data.exams.awaitingResults>0&&<button type="button" className="portal-secondary dash-cta" onClick={()=>onNavigate('results')}>Record & publish results</button>}
   </article>
  </div>}
 </section>;
}
