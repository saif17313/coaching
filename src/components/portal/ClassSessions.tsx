'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {clock,friendlyError,managementCommand,managementRead,minuteOf} from '@/client/management-api';
import {PortalScreen} from './PortalScreen';
import './dashboard-analytics.css';
import './class-sessions.css';

type Session={id:string;date:string;startMinute:number;endMinute:number;status:'scheduled'|'completed'|'cancelled';topic:string;location:string;notes:string;fromRoutine:boolean;subjectId:string|null;subject:string;unitId:string|null;unit:string;unitStatus:string|null};
type Syllabus={subjects:{id:string;title:string;chapters:{id:string;title:string;topics:{id:string;title:string}[]}[]}[]};
const STATUS:Record<Session['status'],{label:string;tone:string}>={scheduled:{label:'Scheduled',tone:'info'},completed:{label:'Completed',tone:'active'},cancelled:{label:'Cancelled',tone:'rejected'}};
const today=()=>new Date(Date.now()+6*3600000).toISOString().slice(0,10);
const monthRange=(month:string)=>{const [y,m]=month.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).getUTCDate();return {from:`${month}-01`,to:`${month}-${String(last).padStart(2,'0')}`};};
const dayLabel=(iso:string)=>new Date(iso+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
const isLink=(value:string)=>/^https:\/\//i.test(value);

function SessionEditor({batchId,session,syllabus,onClose,onSaved}:{batchId:string;session:Session|null;syllabus:Syllabus|null;onClose:()=>void;onSaved:(message:string)=>void}){
 const [form,setForm]=useState({date:session?.date??today(),start:clock(session?.startMinute??960),end:clock(session?.endMinute??1050),subjectId:session?.subjectId??'',unitId:session?.unitId??'',topic:session?.topic??'',location:session?.location??'',notes:session?.notes??''});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const units=useMemo(()=>syllabus?.subjects.find(s=>s.id===form.subjectId)?.chapters.flatMap(c=>[{id:c.id,title:c.title},...c.topics.map(t=>({id:t.id,title:`${c.title} › ${t.title}`}))])??[],[syllabus,form.subjectId]);
 async function submit(e:FormEvent){e.preventDefault();const start=minuteOf(form.start),end=minuteOf(form.end);
  if(start===null||end===null||end<=start)return setError('The end time must be after the start time.');
  setBusy(true);setError('');
  const data={date:form.date,startMinute:start,endMinute:end,subjectId:form.subjectId,unitId:form.unitId,topic:form.topic.trim(),location:form.location.trim(),notes:form.notes};
  try{await managementCommand('session-write',session?{action:'update',sessionId:session.id,data}:{action:'create',data:{...data,batchId}});onSaved(session?'Class updated.':'Class added to the schedule.');}
  catch(err){setError(friendlyError((err as Error).message));}finally{setBusy(false);}}
 const title=session?`Edit class · ${dayLabel(session.date)}`:'Add a class';
 return <PortalScreen trail={[session?'Edit class':'Add class']} kicker="CLASS SCHEDULE" title={title} subtitle="Date, time, subject, syllabus topic and where the class happens." onBack={()=>{if(!busy)onClose();}}>
  <form className="teacher-ops-modal mgmt-modal-wide" onSubmit={submit} aria-label={title}>
   <div className="mgmt-form-grid">
    <label>Date<input type="date" required value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
    <label>Start time<input type="time" required value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label>
    <label>End time<input type="time" required value={form.end} onChange={e=>setForm({...form,end:e.target.value})}/></label>
    <label>Subject<select value={form.subjectId} onChange={e=>setForm({...form,subjectId:e.target.value,unitId:''})}><option value="">General / not subject-specific</option>{syllabus?.subjects.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    <label className="mgmt-span">Syllabus topic<select value={form.unitId} disabled={!form.subjectId||!units.length} onChange={e=>setForm({...form,unitId:e.target.value})}><option value="">{form.subjectId?(units.length?'No specific topic':'This subject has no syllabus yet'):'Choose a subject first'}</option>{units.map(u=><option key={u.id} value={u.id}>{u.title}</option>)}</select></label>
    <label className="mgmt-span">Topic / chapter for the class<input maxLength={200} value={form.topic} onChange={e=>setForm({...form,topic:e.target.value})} placeholder="e.g. Vectors — resolution of forces"/></label>
    <label className="mgmt-span">Location (room or https:// online link)<input maxLength={300} value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Room 2 or https://meet.example/…"/></label>
    <label className="mgmt-span">Teacher notes (not shown to Students)<textarea rows={2} maxLength={1000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   </div>
   {error&&<div className="portal-alert" role="alert">{error}</div>}
   <div className="teacher-ops-modal-actions"><button type="button" className="portal-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="portal-primary" disabled={busy}>{busy?'Saving…':session?'Save class':'Add class'}</button></div>
  </form>
 </PortalScreen>;
}

/** Dated class sessions for one batch: a month at a time for teachers, the coming weeks for Students. */
export function ClassSessionsPanel({batchId,role}:{batchId:string;role:'teacher'|'student'}){
 const teacher=role==='teacher';
 const [month,setMonth]=useState(today().slice(0,7)),[data,setData]=useState<Session[]|null>(null),[syllabus,setSyllabus]=useState<Syllabus|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[version,setVersion]=useState(0),[editing,setEditing]=useState<Session|null|'new'>(null);
 const range=useMemo(()=>{if(teacher)return monthRange(month);const from=today(),to=new Date(Date.parse(from)+41*86400000).toISOString().slice(0,10);return {from,to};},[teacher,month]);
 useEffect(()=>{const controller=new AbortController();managementRead<{sessions:Session[]}>('sessions',{batchId,...range},role,controller.signal).then(d=>{if(!controller.signal.aborted){setData(d.sessions);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(friendlyError((e as Error).message));});return()=>controller.abort();},[batchId,range,role,version]);
 useEffect(()=>{if(!teacher)return;let active=true;managementRead<Syllabus>('syllabus',{batchId}).then(s=>{if(active)setSyllabus(s);}).catch(()=>{});return()=>{active=false;};},[batchId,teacher]);
 async function act(label:string,action:string,body:unknown,done:string){setBusy(label);setError('');setNotice('');try{const result=await managementCommand<Record<string,unknown>>(action,body);setNotice(done.replace('{created}',String(result?.created??0)));setVersion(v=>v+1);}catch(e){setError(friendlyError((e as Error).message));}finally{setBusy('');}}
 const shiftMonth=(delta:number)=>{const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));setMonth(d.toISOString().slice(0,7));};
 const groups=useMemo(()=>{const map=new Map<string,Session[]>();for(const s of data??[])map.set(s.date,[...(map.get(s.date)??[]),s]);return [...map];},[data]);
 const counts=useMemo(()=>({scheduled:(data??[]).filter(s=>s.status==='scheduled').length,completed:(data??[]).filter(s=>s.status==='completed').length,cancelled:(data??[]).filter(s=>s.status==='cancelled').length}),[data]);
 return <section className="cls" aria-labelledby={`cls-title-${role}`}>
  <header className="dash-analytics-head"><div><span className="portal-kicker">{teacher?'CLASS SCHEDULE':'UPCOMING CLASSES'}</span><h3 id={`cls-title-${role}`}>{teacher?'Dated classes':'Your next classes'}</h3><p>{teacher?'Each class on its date — mark it completed or cancelled, and link it to a syllabus topic.':'Classes for the next six weeks, including any changes from your teacher.'}</p></div>
   {teacher&&<div className="cls-toolbar"><div className="cls-month" role="group" aria-label="Month"><button type="button" className="portal-secondary" aria-label="Previous month" onClick={()=>shiftMonth(-1)}>‹</button><input type="month" aria-label="Month" value={month} onChange={e=>e.target.value&&setMonth(e.target.value)}/><button type="button" className="portal-secondary" aria-label="Next month" onClick={()=>shiftMonth(1)}>›</button></div>
    <button type="button" className="portal-secondary" disabled={!!busy} onClick={()=>void act('generate','session-generate',{batchId,...monthRange(month)},'Added {created} class(es) from the weekly routine.')}>{busy==='generate'?'Generating…':'Fill month from weekly routine'}</button>
    <button type="button" className="portal-primary" onClick={()=>setEditing('new')}>+ Add class</button></div>}
  </header>
  {notice&&<div className="portal-success" role="status">✓ {notice}</div>}{error&&<div className="portal-alert" role="alert">{error}</div>}
  {teacher&&data&&data.length>0&&<ul className="dash-legend is-inline cls-counts"><li><i style={{background:'#5a62c4'}} aria-hidden="true"/><span>Scheduled</span><b>{counts.scheduled}</b></li><li><i style={{background:'#0a8f7e'}} aria-hidden="true"/><span>Completed</span><b>{counts.completed}</b></li><li><i style={{background:'#c0392b'}} aria-hidden="true"/><span>Cancelled</span><b>{counts.cancelled}</b></li></ul>}
  {!data?<div className="portal-loading" role="status">Loading classes…</div>:!groups.length?<p className="dash-empty">{teacher?'No classes this month yet. Fill the month from the weekly routine or add a class.':'No classes are scheduled for the coming weeks yet.'}</p>:
   <ol className="cls-days">{groups.map(([date,sessions])=><li key={date} className={date===today()?'is-today':''}><h4><time dateTime={date}>{dayLabel(date)}</time>{date===today()&&<span className="premium-badge" data-status="info">Today</span>}</h4>
    <ul>{sessions.map(s=><li key={s.id} className={'cls-item is-'+s.status}>
     <span className="cls-time">{clock(s.startMinute)}<small>{clock(s.endMinute)}</small></span>
     <div className="cls-body"><strong>{s.subject||'Class'}{s.topic&&<span> · {s.topic}</span>}</strong>
      <small>{s.unit&&<>Syllabus: {s.unit}{s.unitStatus==='completed'?' ✓':''} · </>}{s.location?isLink(s.location)?<a href={s.location} target="_blank" rel="noopener noreferrer">Join online ↗</a>:s.location:'Location to be confirmed'}{s.fromRoutine&&teacher?' · from routine':''}</small>
      {teacher&&s.notes&&<small className="cls-notes">Note: {s.notes}</small>}</div>
     <span className="premium-badge" data-status={STATUS[s.status].tone}>{STATUS[s.status].label}</span>
     {teacher&&<div className="premium-table-actions">
      {s.status==='scheduled'&&date<=today()&&<button className="portal-secondary" disabled={!!busy} onClick={()=>void act(s.id,'session-write',{action:'status',sessionId:s.id,data:{status:'completed',...(s.unitId&&s.unitStatus!=='completed'&&window.confirm(`Also mark the syllabus topic “${s.unit}” as completed?`)?{markTopicCompleted:true}:{})}},'Class marked completed.')}>Completed</button>}
      {s.status==='scheduled'&&<button className="portal-secondary" disabled={!!busy} onClick={()=>{if(window.confirm('Cancel this class? Students will see it as cancelled.'))void act(s.id,'session-write',{action:'status',sessionId:s.id,data:{status:'cancelled'}},'Class cancelled.');}}>Cancel</button>}
      {s.status!=='scheduled'&&<button className="portal-secondary" disabled={!!busy} onClick={()=>void act(s.id,'session-write',{action:'status',sessionId:s.id,data:{status:'scheduled'}},'Class restored to scheduled.')}>Restore</button>}
      <button className="portal-secondary" onClick={()=>setEditing(s)}>Edit</button></div>}
    </li>)}</ul></li>)}</ol>}
  {teacher&&editing&&<SessionEditor batchId={batchId} session={editing==='new'?null:editing} syllabus={syllabus} onClose={()=>setEditing(null)} onSaved={message=>{setEditing(null);setNotice(message);setVersion(v=>v+1);}}/>}
 </section>;
}
