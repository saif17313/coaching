'use client';
import {PortalScreen} from './PortalScreen';
import Image from 'next/image';
import {useEffect,useState,type FormEvent} from 'react';
import {PortalEmpty,PortalIcon,PortalMetric} from './PortalPrimitives';
import {DAY_LABELS,WEEK_ORDER,clock,currentPeriod,managementCommand,managementRead,minuteOf,periodLabel,scheduleText,taka,toMinor,uploadImage} from '@/client/management-api';

type Status='draft'|'open'|'running'|'completed'|'archived'|'cancelled';
type Batch={id:string;code:string;name:string;capacity:number;status:Status;admissionOpen:boolean;isArchived:boolean;startsOn:string|null;endsOn:string|null;subject:string;academicLevel:string;academicSession:string;coverMediaId:string|null;scheduleDays:number[];classStartMinute:number|null;classEndMinute:number|null;monthlyFeeMinor:string|null;admissionFeeMinor:string|null;enrolled:number;pending:number;availableSeats:number;hasHistory:boolean;subjects:string[]};
type Directory={batches:Batch[];total:number;limit:number;offset:number;levels:string[];metrics:{total:number;running:number;open:number;draft:number;completed:number;closed:number;activeEnrollments:number;availableSeats:number}};
type FeeRule={id:string;effectiveFrom:string;monthlyFeeMinor:string;admissionFeeMinor:string;dueDay:number;reason:string;createdAt:string};
type Concession={id:string;studentId:string;studentName:string;kind:'percent'|'amount';value:string;startsPeriod:string;endsPeriod:string|null;reason:string;status:'active'|'revoked'};
type Profile=Omit<Batch,'monthlyFeeMinor'|'admissionFeeMinor'|'availableSeats'|'subjects'>&{description:string;currentFee:{effectiveFrom:string;monthlyFeeMinor:string;admissionFeeMinor:string;dueDay:number}|null;feeHistory:FeeRule[];concessions:Concession[]};
type Roster={students:{id:string;fullName:string;admissionRoll:string|null;lifecycleStatus?:string;batches:{batchId:string;status:string}[]}[]};

export const BATCH_STATUS:Record<Status,{label:string;tone:string}>={draft:{label:'Draft',tone:'draft'},open:{label:'Open',tone:'active'},running:{label:'Running',tone:'info'},completed:{label:'Completed',tone:'completed'},archived:{label:'Archived',tone:'disabled'},cancelled:{label:'Cancelled',tone:'rejected'}};
const LEVELS=['SSC 2026','SSC 2027','HSC 2026','HSC 2027','HSC 2028','Class 8','Class 9','Class 10','University Admission'];
const blankForm={code:'',name:'',subject:'',academicLevel:'',academicSession:'',startsOn:'',endsOn:'',capacity:'30',status:'open' as Status,admissionOpen:true,scheduleDays:[] as number[],start:'',end:'',monthlyFee:'',admissionFee:'',dueDay:'10',description:'',coverMediaId:''};
type Form=typeof blankForm;
const cover=(id:string|null)=>id?`/api/v1/teacher/website/media/${id}/preview`:null;

function StatusBadge({status}:{status:Status}){return <span className="premium-badge" data-status={BATCH_STATUS[status].tone}>{BATCH_STATUS[status].label}</span>;}

export function TeacherBatchStudio({version=0,onNavigate}:{version?:number;onNavigate?:(page:string,batchId:string)=>void}){
 const [data,setData]=useState<Directory|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[admission,setAdmission]=useState(''),[level,setLevel]=useState(''),[offset,setOffset]=useState(0),[reload,setReload]=useState(0);
 const [editing,setEditing]=useState<{id:string|null;form:Form;locked:boolean}|null>(null),[detail,setDetail]=useState<string|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setOffset(0);},250);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted){setLoading(true);setError('');}});
  managementRead<Directory>('batches',{q:query,status,admission,level,limit:20,offset},'teacher',controller.signal).then(next=>{if(!controller.signal.aborted)setData(next);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();},[query,status,admission,level,offset,reload,version]);
 const refresh=(message='')=>{setNotice(message);setReload(value=>value+1);};
 async function openEditor(batch?:Batch){
  if(!batch){setEditing({id:null,form:{...blankForm,startsOn:new Date().toISOString().slice(0,10)},locked:false});return;}
  try{const p=await managementRead<Profile>('batch-profile',{batchId:batch.id});
   setEditing({id:batch.id,locked:p.hasHistory||p.status!=='draft',form:{...blankForm,code:p.code,name:p.name,subject:p.subject,academicLevel:p.academicLevel,academicSession:p.academicSession,startsOn:p.startsOn??'',endsOn:p.endsOn??'',
    capacity:String(p.capacity),status:p.status,admissionOpen:p.admissionOpen,scheduleDays:p.scheduleDays,start:clock(p.classStartMinute),end:clock(p.classEndMinute),description:p.description,coverMediaId:p.coverMediaId??''}});}
  catch(e){setError((e as Error).message);}
 }
 const metrics=data?.metrics;
 return <section className="mgmt-studio" aria-label="Batch management">
  <div className="premium-filterbar"><label className="premium-search"><span className="sr-only">Search batches</span><PortalIcon name="search"/><input value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} placeholder="Search by batch name, code, subject or level…"/></label>
   <select aria-label="Batch status filter" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">All statuses</option><option value="current">Open & running</option>{(Object.keys(BATCH_STATUS) as Status[]).map(s=><option key={s} value={s}>{BATCH_STATUS[s].label}</option>)}<option value="upcoming">Starting later</option></select>
   <select aria-label="Admission filter" value={admission} onChange={e=>{setAdmission(e.target.value);setOffset(0);}}><option value="">All admissions</option><option value="open">Admission open</option><option value="closed">Admission closed</option></select>
   <select aria-label="Level filter" value={level} onChange={e=>{setLevel(e.target.value);setOffset(0);}}><option value="">All levels</option>{data?.levels.map(l=><option key={l}>{l}</option>)}</select>
   <button className="portal-primary" onClick={()=>void openEditor()}><PortalIcon name="plus" size={17}/>Create batch</button></div>
  {metrics&&<div className="premium-metrics"><PortalMetric icon="batches" label="Total batches" value={metrics.total} detail={`${metrics.draft} draft · ${metrics.completed} completed`}/><PortalMetric icon="clock" label="Running" value={metrics.running} detail={`${metrics.open} open for admission`}/><PortalMetric icon="students" label="Active enrollments" value={metrics.activeEnrollments} detail="Across open and running batches"/><PortalMetric icon="profile" label="Seats available" value={metrics.availableSeats} detail="In open and running batches"/></div>}
  {notice&&<div className="mgmt-notice" role="status">{notice}<button className="portal-text-button" onClick={()=>setNotice('')} aria-label="Dismiss">✕</button></div>}
  {error&&<div className="premium-error" role="alert">{error} <button className="portal-secondary" onClick={()=>refresh()}>Retry</button></div>}
  {loading&&!data?<div className="mgmt-skeleton-grid" aria-busy="true">{[0,1,2].map(i=><div key={i} className="mgmt-skeleton-card"/>)}</div>:data?.batches.length?<div className="mgmt-batch-grid" aria-busy={loading}>{data.batches.map(b=>{const fill=b.capacity?Math.min(100,Math.round(b.enrolled/b.capacity*100)):0;return <article key={b.id} className="mgmt-batch-card" data-status={b.status}>
    <div className="mgmt-batch-cover">{b.coverMediaId?<Image unoptimized src={cover(b.coverMediaId)!} alt="" width={640} height={260}/>:<span aria-hidden="true">{b.code.slice(0,3)}</span>}<div className="mgmt-batch-badges"><StatusBadge status={b.status}/><span className="premium-badge" data-status={b.admissionOpen?'active':'disabled'}>{b.admissionOpen?'Admission open':'Admission closed'}</span></div></div>
    <div className="mgmt-batch-body"><small className="mgmt-code">{b.code}</small><h3>{b.name}</h3><p>{[b.subject,b.academicLevel,b.academicSession].filter(Boolean).join(' · ')||'Subject and level not set'}</p>
     <dl className="mgmt-facts"><div><dt>Schedule</dt><dd>{scheduleText(b.scheduleDays,b.classStartMinute,b.classEndMinute)}</dd></div><div><dt>Monthly fee</dt><dd>{b.monthlyFeeMinor?taka(b.monthlyFeeMinor):'Not set'}{b.admissionFeeMinor&&b.admissionFeeMinor!=='0'&&<small> · adm. {taka(b.admissionFeeMinor)}</small>}</dd></div><div><dt>Dates</dt><dd>{b.startsOn??'—'}{b.endsOn?` → ${b.endsOn}`:''}</dd></div></dl>
     <div className="mgmt-capacity" aria-label={`${b.enrolled} of ${b.capacity} seats filled`}><div><span style={{width:fill+'%'}}/></div><small>{b.enrolled}/{b.capacity} enrolled{b.pending?` · ${b.pending} pending`:''}</small></div></div>
    <div className="mgmt-batch-actions"><button className="portal-primary" onClick={()=>setDetail(b.id)}>Manage</button><button className="portal-secondary" onClick={()=>void openEditor(b)}>Edit</button><button className="portal-secondary" onClick={()=>onNavigate?.('dues',b.id)} title="Open dues for this batch">Dues</button></div>
   </article>;})}</div>:!error&&<PortalEmpty icon="batches" title={query||status||admission||level?'No matching batches':'No batches yet'} detail={query||status||admission||level?'Try a different search or filter.':'Create the first batch with its schedule, capacity and monthly fee.'}/>}
  {data&&data.total>data.limit&&<div className="premium-pagination"><span>Showing {data.offset+1}–{Math.min(data.offset+data.limit,data.total)} of {data.total}</span><div><button className="portal-secondary" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-20))}>‹</button><button className="portal-secondary" disabled={offset+20>=data.total} onClick={()=>setOffset(v=>v+20)}>›</button></div></div>}
  {editing&&<BatchEditor state={editing} onClose={()=>setEditing(null)} onSaved={message=>{setEditing(null);refresh(message);}}/>}
  {detail&&<BatchDetail batchId={detail} onClose={()=>setDetail(null)} onChanged={message=>refresh(message)} onEdit={b=>{setDetail(null);void openEditor(b);}} onNavigate={onNavigate}/>}
 </section>;
}

function BatchEditor({state,onClose,onSaved}:{state:{id:string|null;form:Form;locked:boolean};onClose:()=>void;onSaved:(message:string)=>void}){
 const [form,setForm]=useState(state.form),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[operation]=useState(()=>crypto.randomUUID());
 const set=<K extends keyof Form>(key:K,value:Form[K])=>setForm(f=>({...f,[key]:value}));
 const create=!state.id;
 async function submit(e:FormEvent){e.preventDefault();setError('');
  const start=minuteOf(form.start),end=minuteOf(form.end);
  if((form.start||form.end)&&(start===null||end===null||end<=start))return setError('Class end time must be after the start time.');
  if(form.startsOn&&form.endsOn&&form.endsOn<form.startsOn)return setError('End date must be after the start date.');
  const data:Record<string,unknown>={name:form.name.trim(),capacity:Number(form.capacity),subject:form.subject.trim(),academicLevel:form.academicLevel.trim(),academicSession:form.academicSession.trim(),
   startsOn:form.startsOn,endsOn:form.endsOn,status:form.status,admissionOpen:form.admissionOpen,scheduleDays:form.scheduleDays,classStartMinute:start,classEndMinute:end,description:form.description,coverMediaId:form.coverMediaId};
  if(create||!state.locked)data.code=form.code.trim().toUpperCase();
  if(create){const fee=form.monthlyFee?toMinor(form.monthlyFee):null,adm=form.admissionFee?toMinor(form.admissionFee):0;
   if(form.monthlyFee&&fee===null||adm===null)return setError('Enter fees as amounts in BDT, e.g. 3000.');
   if(fee!==null){data.monthlyFeeMinor=fee;data.admissionFeeMinor=adm;data.dueDay=Number(form.dueDay);}}
  setBusy(true);
  try{await managementCommand('batch-write',create?{action:'create',data}:{action:'update',batchId:state.id,data},operation);onSaved(create?`Batch ${form.name.trim()} created.`:'Batch details saved.');}
  catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 async function chooseCover(file:File|undefined){if(!file)return;setUploading(true);setError('');try{set('coverMediaId',await uploadImage(file,`${form.name||'Batch'} cover image`));}catch(e){setError((e as Error).message);}finally{setUploading(false);}}
 return <PortalScreen trail={create?['Create batch']:[state.form.name||'Batch','Edit']} kicker="BATCH PROFILE" title={create?'Create a batch':`Edit ${state.form.name}`} subtitle={create?'Profile, class schedule, capacity and fees.':'Changes apply immediately; fee changes take effect from the month you choose.'} onBack={()=>{if(!busy)onClose();}}><form className="teacher-ops-modal mgmt-modal-wide" aria-label={create?'Create a batch':`Edit ${state.form.name}`} onSubmit={submit}>
  <div className="teacher-ops-modal-head"><div><span className="portal-kicker">BATCH PROFILE</span><h3 id="batch-editor-heading">{create?'Create a batch':`Edit ${state.form.name}`}</h3></div><button type="button" className="portal-secondary" onClick={onClose} aria-label="Close batch editor">✕</button></div>
  {!create&&state.locked&&<p className="mgmt-hint">The batch code is locked because this batch already has enrollments or is past the draft stage.</p>}
  <div className="mgmt-form-grid">
   <label>Batch name<input required minLength={1} maxLength={160} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. HSC 2027 Physics Batch A"/></label>
   <label>Batch code<input required pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,31}" maxLength={32} value={form.code} disabled={!create&&state.locked} onChange={e=>set('code',e.target.value.toUpperCase())} placeholder="PHY-HSC27-A"/></label>
   <label>Subject<input maxLength={120} value={form.subject} onChange={e=>set('subject',e.target.value)} placeholder="Physics & Higher Mathematics"/></label>
   <label>Class / level<input list="mgmt-levels" maxLength={80} value={form.academicLevel} onChange={e=>set('academicLevel',e.target.value)} placeholder="HSC 2027"/><datalist id="mgmt-levels">{LEVELS.map(l=><option key={l} value={l}/>)}</datalist></label>
   <label>Academic session<input maxLength={80} value={form.academicSession} onChange={e=>set('academicSession',e.target.value)} placeholder="2026-27"/></label>
   <label>Capacity<input required type="number" min={1} max={100000} value={form.capacity} onChange={e=>set('capacity',e.target.value)}/></label>
   <label>Start date<input type="date" value={form.startsOn} onChange={e=>set('startsOn',e.target.value)}/></label>
   <label>End date (optional)<input type="date" value={form.endsOn} onChange={e=>set('endsOn',e.target.value)}/></label>
   <label>Status<select value={form.status} onChange={e=>set('status',e.target.value as Status)}>{(Object.keys(BATCH_STATUS) as Status[]).filter(s=>create||state.form.status==='draft'||s!=='draft').map(s=><option key={s} value={s}>{BATCH_STATUS[s].label}</option>)}</select></label>
   <label className="mgmt-check"><input type="checkbox" checked={form.admissionOpen} onChange={e=>set('admissionOpen',e.target.checked)}/>Admission open (accepting new Students)</label>
  </div>
  <fieldset className="mgmt-fieldset"><legend>Class schedule</legend><div className="mgmt-day-pills" role="group" aria-label="Class days">{WEEK_ORDER.map(i=>{const d=DAY_LABELS[i];return <button type="button" key={d} aria-pressed={form.scheduleDays.includes(i)} className={form.scheduleDays.includes(i)?'is-on':''} onClick={()=>set('scheduleDays',form.scheduleDays.includes(i)?form.scheduleDays.filter(x=>x!==i):[...form.scheduleDays,i].sort())}>{d}</button>;})}</div>
   <div className="mgmt-form-grid"><label>Start time<input type="time" value={form.start} onChange={e=>set('start',e.target.value)}/></label><label>End time<input type="time" value={form.end} onChange={e=>set('end',e.target.value)}/></label></div></fieldset>
  {create&&<fieldset className="mgmt-fieldset"><legend>Fees (BDT)</legend><div className="mgmt-form-grid"><label>Monthly tuition<input inputMode="decimal" value={form.monthlyFee} onChange={e=>set('monthlyFee',e.target.value)} placeholder="3000"/></label><label>Admission fee<input inputMode="decimal" value={form.admissionFee} onChange={e=>set('admissionFee',e.target.value)} placeholder="0"/></label><label>Due day of month<input type="number" min={1} max={28} value={form.dueDay} onChange={e=>set('dueDay',e.target.value)}/></label></div><p className="mgmt-hint">Later fee changes are added from Manage → Fees with an effective month, so issued dues are never rewritten.</p></fieldset>}
  <label className="mgmt-block">Description<textarea maxLength={2000} rows={3} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Curriculum focus, prerequisites, materials…"/></label>
  <div className="mgmt-cover-field">{form.coverMediaId?<Image unoptimized src={cover(form.coverMediaId)!} alt="Batch cover preview" width={320} height={130}/>:<div className="mgmt-cover-empty">No cover image</div>}<label className="portal-secondary mgmt-file">{uploading?'Uploading…':form.coverMediaId?'Replace cover':'Upload cover'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>void chooseCover(e.target.files?.[0])}/></label>{form.coverMediaId&&<button type="button" className="portal-text-button" onClick={()=>set('coverMediaId','')}>Remove</button>}</div>
  {error&&<div className="portal-alert" role="alert">{error}</div>}
  <div className="teacher-ops-modal-actions"><button type="button" className="portal-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="portal-primary" disabled={busy||uploading}>{busy?'Saving…':create?'Create batch':'Save changes'}</button></div>
 </form></PortalScreen>;
}

function BatchDetail({batchId,onClose,onChanged,onEdit,onNavigate}:{batchId:string;onClose:()=>void;onChanged:(message:string)=>void;onEdit:(batch:Batch)=>void;onNavigate?:(page:string,batchId:string)=>void}){
 const [profile,setProfile]=useState<Profile|null>(null),[roster,setRoster]=useState<Roster['students']>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(''),[version,setVersion]=useState(0);
 const [period,setPeriod]=useState(currentPeriod()),[fee,setFee]=useState({effectiveFrom:currentPeriod(),monthly:'',admission:'0',dueDay:'10',reason:''}),[grant,setGrant]=useState({studentId:'',kind:'percent',value:'',startsPeriod:currentPeriod(),endsPeriod:'',reason:''});
 useEffect(()=>{let active=true;Promise.all([managementRead<Profile>('batch-profile',{batchId}),managementRead<Roster>('students',{batchId,limit:50})]).then(([p,r])=>{if(active){setProfile(p);setRoster(r.students);
   if(p.currentFee)setFee(f=>({...f,admission:String(Number(p.currentFee!.admissionFeeMinor)/100),dueDay:String(p.currentFee!.dueDay)}));}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[batchId,version]);
 async function act(label:string,action:string,body:unknown,done:string){setBusy(label);setError('');setMessage('');try{const result=await managementCommand<Record<string,unknown>>(action,body);setMessage(typeof done==='string'?done.replace('{created}',String(result?.created??'')).replace('{applied}',String(result?.concessionsApplied??'')):'Saved.');setVersion(v=>v+1);onChanged('');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 // One screen for both the loading and loaded states, so it is never remounted (one history entry).
 if(!profile)return <PortalScreen trail={['Batch']} kicker="BATCH" title="Loading batch…" onBack={onClose}>{error?<div className="portal-alert" role="alert">{error}</div>:<div className="portal-loading" role="status">Loading batch…</div>}</PortalScreen>;
 const p=profile,active=roster.filter(s=>s.batches.some(b=>b.batchId===batchId&&b.status==='active'));
 const transition=(status:Status,label:string)=>void act(status,'batch-write',{action:'update',batchId,data:{status}},`Batch marked ${label.toLowerCase()}.`);
 return <PortalScreen trail={[p.name]} kicker={p.code} title={p.name} subtitle={[p.subject,p.academicLevel,p.academicSession].filter(Boolean).join(' · ')||undefined} onBack={()=>{if(!busy)onClose();}}><section className="teacher-ops-modal mgmt-modal-wide mgmt-detail" aria-label={`${p.name} details`}>
  <div className="teacher-ops-modal-head"><div><span className="portal-kicker">{p.code}</span><h3 id="batch-detail-heading">{p.name}</h3><p className="portal-muted">{[p.subject,p.academicLevel,p.academicSession].filter(Boolean).join(' · ')}</p></div><button className="portal-secondary" onClick={onClose} aria-label="Close batch details">✕</button></div>
  <div className="mgmt-detail-status"><StatusBadge status={p.status}/><span className="premium-badge" data-status={p.admissionOpen?'active':'disabled'}>{p.admissionOpen?'Admission open':'Admission closed'}</span><span>{scheduleText(p.scheduleDays,p.classStartMinute,p.classEndMinute)}</span><span>{p.enrolled}/{p.capacity} enrolled{p.pending?` · ${p.pending} pending`:''}</span></div>
  {message&&<div className="mgmt-notice" role="status">{message}</div>}{error&&<div className="portal-alert" role="alert">{error}</div>}
  <div className="mgmt-quick-row">
   <button className="portal-secondary" disabled={!!busy} onClick={()=>onEdit({...p,monthlyFeeMinor:p.currentFee?.monthlyFeeMinor??null,admissionFeeMinor:p.currentFee?.admissionFeeMinor??null,availableSeats:Math.max(0,p.capacity-p.enrolled),subjects:[]})}>Edit details</button>
   {!['archived','cancelled','completed'].includes(p.status)&&<button className="portal-secondary" disabled={!!busy} onClick={()=>void act('admission','batch-write',{action:'update',batchId,data:{admissionOpen:!p.admissionOpen}},p.admissionOpen?'Admission closed.':'Admission opened.')}>{p.admissionOpen?'Close admission':'Open admission'}</button>}
   {p.status==='draft'&&<button className="portal-secondary" onClick={()=>transition('open','Open')}>Publish (open)</button>}
   {['draft','open'].includes(p.status)&&<button className="portal-secondary" onClick={()=>transition('running','Running')}>Start classes</button>}
   {['open','running'].includes(p.status)&&<button className="portal-secondary" onClick={()=>transition('completed','Completed')}>Mark completed</button>}
   {['completed','cancelled'].includes(p.status)&&<button className="portal-secondary" onClick={()=>transition('archived','Archived')}>Archive</button>}
   {['archived','completed','cancelled'].includes(p.status)&&<button className="portal-secondary" onClick={()=>transition('running','Running')}>Reopen</button>}
   {!['cancelled','archived'].includes(p.status)&&<button className="portal-secondary mgmt-danger" onClick={()=>{if(confirm(`Cancel ${p.name}? Enrollments, payments and results are kept, but no new enrollments or billing will be allowed.`))transition('cancelled','Cancelled');}}>Cancel batch</button>}
  </div>
  <div className="mgmt-detail-grid">
   <section className="mgmt-panel"><h4>Monthly billing</h4><p className="mgmt-hint">Issues the month&apos;s tuition to every active Student in this batch who does not have it yet, using the fee in force for that month, then applies concessions.</p>
    <div className="mgmt-inline"><label>Billing month<input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/></label><button className="portal-primary" disabled={!!busy||!/^\d{4}-\d{2}$/.test(period)} onClick={()=>void act('bill','bill-period',{batchId,period},`${periodLabel(period)} billed: {created} new due(s), {applied} concession(s) applied.`)}>{busy==='bill'?'Billing…':'Generate dues'}</button></div>
    <button className="portal-text-button" onClick={()=>onNavigate?.('ledger',batchId)}>Open payment ledger →</button></section>
   <section className="mgmt-panel"><h4>Fees</h4>{p.currentFee?<p className="mgmt-fee-now"><strong>{taka(p.currentFee.monthlyFeeMinor)}</strong> / month · admission {taka(p.currentFee.admissionFeeMinor)} · due day {p.currentFee.dueDay}<small>In force from {periodLabel(p.currentFee.effectiveFrom)}</small></p>:<p className="mgmt-hint">No monthly fee set yet.</p>}
    <form className="mgmt-form-grid mgmt-compact" onSubmit={e=>{e.preventDefault();const m=toMinor(fee.monthly),a=toMinor(fee.admission||'0');if(m===null||a===null){setError('Enter the fees as BDT amounts, e.g. 3000.');return;}void act('fee','fee-rule',{batchId,effectiveFrom:fee.effectiveFrom,monthlyFeeMinor:m,admissionFeeMinor:a,dueDay:Number(fee.dueDay),reason:fee.reason.trim()||'Fee update'},'Fee change saved. Existing dues are unchanged.');}}>
     <label>Effective from<input type="month" required value={fee.effectiveFrom} onChange={e=>setFee({...fee,effectiveFrom:e.target.value})}/></label><label>Monthly fee (BDT)<input required inputMode="decimal" value={fee.monthly} onChange={e=>setFee({...fee,monthly:e.target.value})} placeholder="3000"/></label>
     <label>Admission fee<input inputMode="decimal" value={fee.admission} onChange={e=>setFee({...fee,admission:e.target.value})}/></label><label>Due day<input type="number" min={1} max={28} value={fee.dueDay} onChange={e=>setFee({...fee,dueDay:e.target.value})}/></label>
     <label className="mgmt-span">Reason<input maxLength={300} value={fee.reason} onChange={e=>setFee({...fee,reason:e.target.value})} placeholder="e.g. New session fee"/></label><button className="portal-secondary" disabled={!!busy}>{p.currentFee?'Add fee change':'Set monthly fee'}</button></form>
    {p.feeHistory.length>0&&<ul className="mgmt-history">{p.feeHistory.map(f=><li key={f.id}><strong>{periodLabel(f.effectiveFrom)}</strong> {taka(f.monthlyFeeMinor)}/month<small>{f.reason}</small></li>)}</ul>}</section>
   <section className="mgmt-panel"><h4>Concessions</h4><p className="mgmt-hint">Approved discounts are applied as audited waivers when a month is billed.</p>
    {p.concessions.length?<ul className="mgmt-history">{p.concessions.map(c=><li key={c.id}><strong>{c.studentName}</strong> {c.kind==='percent'?`${c.value}%`:taka(c.value)} off · {c.startsPeriod}{c.endsPeriod?` → ${c.endsPeriod}`:' onward'}<small>{c.reason}</small>{c.status==='active'?<button className="portal-text-button" onClick={()=>void act('revoke','concession',{action:'revoke',concessionId:c.id},'Concession revoked. Waivers already applied are kept.')}>Revoke</button>:<span className="premium-badge" data-status="disabled">Revoked</span>}</li>)}</ul>:<p className="portal-muted">No concessions.</p>}
    <form className="mgmt-form-grid mgmt-compact" onSubmit={e=>{e.preventDefault();const value=grant.kind==='percent'?Number(grant.value):toMinor(grant.value);if(!value){setError('Enter the concession value.');return;}void act('grant','concession',{action:'grant',studentId:grant.studentId,batchId,kind:grant.kind,value,startsPeriod:grant.startsPeriod,...(grant.endsPeriod?{endsPeriod:grant.endsPeriod}:{}),reason:grant.reason.trim()},'Concession granted.');}}>
     <label className="mgmt-span">Student<select required value={grant.studentId} onChange={e=>setGrant({...grant,studentId:e.target.value})}><option value="">Choose an enrolled Student</option>{active.map(s=><option key={s.id} value={s.id}>{s.fullName}{s.admissionRoll?` (${s.admissionRoll})`:''}</option>)}</select></label>
     <label>Type<select value={grant.kind} onChange={e=>setGrant({...grant,kind:e.target.value})}><option value="percent">Percent</option><option value="amount">Fixed BDT</option></select></label><label>{grant.kind==='percent'?'Percent off':'BDT off'}<input required inputMode="decimal" value={grant.value} onChange={e=>setGrant({...grant,value:e.target.value})}/></label>
     <label>From<input type="month" required value={grant.startsPeriod} onChange={e=>setGrant({...grant,startsPeriod:e.target.value})}/></label><label>Until (optional)<input type="month" value={grant.endsPeriod} onChange={e=>setGrant({...grant,endsPeriod:e.target.value})}/></label>
     <label className="mgmt-span">Reason<input required minLength={5} maxLength={300} value={grant.reason} onChange={e=>setGrant({...grant,reason:e.target.value})} placeholder="e.g. Sibling discount approved"/></label><button className="portal-secondary" disabled={!!busy||!grant.studentId}>Grant concession</button></form></section>
   <section className="mgmt-panel"><h4>Students ({active.length})</h4>{active.length?<ul className="mgmt-roster">{active.map(s=><li key={s.id}><span>{s.fullName}</span><small>{s.admissionRoll??'No roll yet'}{s.lifecycleStatus&&s.lifecycleStatus!=='active'?` · ${s.lifecycleStatus}`:''}</small></li>)}</ul>:<p className="portal-muted">No active Students yet.</p>}
    <div className="mgmt-quick-row"><button className="portal-text-button" onClick={()=>onNavigate?.('enrollments',batchId)}>Enrollments →</button><button className="portal-text-button" onClick={()=>onNavigate?.('syllabus',batchId)}>Syllabus →</button><button className="portal-text-button" onClick={()=>onNavigate?.('exams',batchId)}>Exams →</button><button className="portal-text-button" onClick={()=>onNavigate?.('materials',batchId)}>Materials →</button></div></section>
  </div>
 </section></PortalScreen>;
}
