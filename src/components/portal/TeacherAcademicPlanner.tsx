'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {managementCommand,managementRead} from '@/client/management-api';
import {academicPublish} from '@/client/teacher-academics.mjs';

type UnitStatus='planned'|'in_progress'|'completed';
type Topic={id:string;title:string;position:number;status:UnitStatus;weight:number;plannedStart:string|null;plannedEnd:string|null;completedOn:string|null;notes:string};
type Chapter=Topic&{progressBasisPoints:number;topics:Topic[]};
type Subject={id:string;code:string;title:string;progressBasisPoints:number;inProgressTopics:number;chapters:Chapter[]};
type Syllabus={batchId:string;progressBasisPoints:number;subjects:Subject[]};
const STATUS_LABEL:Record<UnitStatus,string>={planned:'Planned',in_progress:'In progress',completed:'Completed'};
const pct=(bp:number)=>Math.round(bp/100);

export function Progress({value,label}:{value:number;label?:string}){return <div className="mgmt-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}><span style={{width:`${value}%`}}/></div>;}

/** Subject -> chapter -> topic planner with weighted completion (completed leaf weight / total leaf weight). */
export function SyllabusPlanner({batchId,readOnly=false,role='teacher'}:{batchId:string;readOnly?:boolean;role?:'teacher'|'student'}){
 const [data,setData]=useState<Syllabus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[version,setVersion]=useState(0),[draft,setDraft]=useState<Record<string,string>>({}),[editing,setEditing]=useState<Topic|null>(null);
 useEffect(()=>{let active=true;managementRead<Syllabus>('syllabus',{batchId},role).then(next=>{if(active)setData(next);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[batchId,version,role]);
 async function write(key:string,body:unknown){setBusy(key);setError('');try{await managementCommand('syllabus-write',body);setVersion(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 const add=(key:string,subjectId:string,parentId?:string)=>{const title=(draft[key]??'').trim();if(title.length<2)return;setDraft(d=>({...d,[key]:''}));void write(key,{action:'create',subjectId,data:{title,...(parentId?{parentId}:{})}});};
 const status=(unit:Topic,next:UnitStatus)=>void write(unit.id,{action:'status',unitId:unit.id,data:{status:next}});
 if(!data)return error?<div className="portal-alert" role="alert">{error}</div>:<div className="portal-loading"><div className="portal-spinner"/>Loading syllabus…</div>;
 const overall=pct(data.progressBasisPoints);
 return <section className="mgmt-syllabus" aria-label="Syllabus progress">
  <div className="mgmt-syllabus-summary"><div className="premium-ring" style={{background:`conic-gradient(#009583 ${overall}%,#e5f2ed 0)`}}><span>{overall}%</span></div><div><h4>Syllabus completion</h4><p>Weighted by topic. Chapters without topics count as one unit; planned and in-progress units count as not yet covered.</p></div></div>
  {error&&<div className="portal-alert" role="alert">{error}</div>}
  {data.subjects.length===0&&<p className="portal-muted">{readOnly?'Your teacher has not added subjects to this batch yet.':'Add a subject to this batch first (Academics → Subjects), then build its chapters here.'}</p>}
  {data.subjects.map(subject=><article key={subject.id} className="mgmt-subject">
   <header><div><small className="mgmt-code">{subject.code}</small><h4>{subject.title}</h4></div><div className="mgmt-subject-meter"><strong>{pct(subject.progressBasisPoints)}%</strong><Progress value={pct(subject.progressBasisPoints)} label={`${subject.title} completion`}/></div></header>
   <ol className="mgmt-chapters">{subject.chapters.map(chapter=><li key={chapter.id} data-status={chapter.status}>
    <div className="mgmt-unit-row"><span className="mgmt-unit-title">{chapter.title}{chapter.weight>1&&<small> · weight {chapter.weight}</small>}</span>
     {chapter.topics.length?<span className="mgmt-unit-progress">{pct(chapter.progressBasisPoints)}%<Progress value={pct(chapter.progressBasisPoints)} label={`${chapter.title} completion`}/></span>
      :readOnly?<span className="premium-badge" data-status={chapter.status==='completed'?'active':chapter.status==='in_progress'?'info':'draft'}>{STATUS_LABEL[chapter.status]}</span>
      :<select aria-label={`${chapter.title} status`} value={chapter.status} disabled={busy===chapter.id} onChange={e=>status(chapter,e.target.value as UnitStatus)}>{(Object.keys(STATUS_LABEL) as UnitStatus[]).map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>}
     {!readOnly&&<button className="portal-text-button" onClick={()=>setEditing(chapter)} aria-label={`Edit ${chapter.title}`}>Edit</button>}</div>
    {(chapter.plannedStart||chapter.completedOn)&&<small className="mgmt-unit-dates">{chapter.plannedStart?`Planned ${chapter.plannedStart}${chapter.plannedEnd?' → '+chapter.plannedEnd:''}`:''}{chapter.completedOn?` · Completed ${chapter.completedOn}`:''}</small>}
    {chapter.topics.length>0&&<ul className="mgmt-topics">{chapter.topics.map(topic=><li key={topic.id} data-status={topic.status}><span>{topic.title}</span>
     {readOnly?<span className="premium-badge" data-status={topic.status==='completed'?'active':topic.status==='in_progress'?'info':'draft'}>{STATUS_LABEL[topic.status]}</span>
      :<><select aria-label={`${topic.title} status`} value={topic.status} disabled={busy===topic.id} onChange={e=>status(topic,e.target.value as UnitStatus)}>{(Object.keys(STATUS_LABEL) as UnitStatus[]).map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select><button className="portal-text-button" onClick={()=>setEditing(topic)} aria-label={`Edit ${topic.title}`}>Edit</button></>}</li>)}</ul>}
    {!readOnly&&<form className="mgmt-inline mgmt-add-topic" onSubmit={e=>{e.preventDefault();add('t:'+chapter.id,subject.id,chapter.id);}}><input aria-label={`New topic in ${chapter.title}`} maxLength={160} value={draft['t:'+chapter.id]??''} onChange={e=>setDraft(d=>({...d,['t:'+chapter.id]:e.target.value}))} placeholder="Add a topic…"/><button className="portal-text-button" disabled={busy==='t:'+chapter.id}>+ Topic</button></form>}
   </li>)}</ol>
   {!readOnly&&<form className="mgmt-inline" onSubmit={e=>{e.preventDefault();add('c:'+subject.id,subject.id);}}><input aria-label={`New chapter in ${subject.title}`} maxLength={160} value={draft['c:'+subject.id]??''} onChange={e=>setDraft(d=>({...d,['c:'+subject.id]:e.target.value}))} placeholder="Add a chapter…"/><button className="portal-secondary" disabled={busy==='c:'+subject.id}>+ Chapter</button></form>}
  </article>)}
  {editing&&<UnitEditor unit={editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setVersion(v=>v+1);}}/>}
 </section>;
}

function UnitEditor({unit,onClose,onSaved}:{unit:Topic;onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState({title:unit.title,weight:String(unit.weight),plannedStart:unit.plannedStart??'',plannedEnd:unit.plannedEnd??'',notes:unit.notes}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await managementCommand('syllabus-write',{action:'update',unitId:unit.id,data:{title:form.title.trim(),weight:Number(form.weight),plannedStart:form.plannedStart,plannedEnd:form.plannedEnd,notes:form.notes}});onSaved();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 return <div className="teacher-ops-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><form className="teacher-ops-modal" role="dialog" aria-modal="true" aria-labelledby="unit-editor-heading" onSubmit={submit}>
  <div className="teacher-ops-modal-head"><div><span className="portal-kicker">SYLLABUS UNIT</span><h3 id="unit-editor-heading">Edit {unit.title}</h3></div><button type="button" className="portal-secondary" onClick={onClose} aria-label="Close">✕</button></div>
  <label>Title<input required minLength={2} maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
  <div className="mgmt-form-grid"><label>Weight (1–100)<input type="number" min={1} max={100} value={form.weight} onChange={e=>setForm({...form,weight:e.target.value})}/></label><label>Planned start<input type="date" value={form.plannedStart} onChange={e=>setForm({...form,plannedStart:e.target.value})}/></label><label>Planned end<input type="date" value={form.plannedEnd} onChange={e=>setForm({...form,plannedEnd:e.target.value})}/></label></div>
  <label>Notes<textarea maxLength={1000} rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
  {error&&<div className="portal-alert" role="alert">{error}</div>}
  <div className="teacher-ops-modal-actions"><button type="button" className="portal-secondary" onClick={onClose}>Cancel</button><button className="portal-primary" disabled={busy}>{busy?'Saving…':'Save unit'}</button></div>
 </form></div>;
}

type ExamType='class_test'|'weekly'|'monthly'|'model_test'|'assignment'|'final';
export const EXAM_TYPES:Record<ExamType,string>={class_test:'Class test',weekly:'Weekly exam',monthly:'Monthly exam',model_test:'Model test',assignment:'Assignment',final:'Final exam'};
type SheetRow={studentId:string;fullName:string;admissionRoll:string|null;participation:'attempted'|'absent'|'not_recorded';marks:number|null;rank:number|null;remarks:string;resultStatus:'draft'|'published'|null};
type Sheet={exam:{id:string;batchId:string;batchName:string;batchCode:string;subject:string;title:string;scheduledAt:string;maxMarks:number;passMarks:number|null;examType:ExamType;durationMinutes:number|null;instructions:string;coverageUnitIds:string[];status:string;lifecycle:string};rows:SheetRow[]};
const csvCell=(value:string|number|null)=>{const text=value===null?'':String(value);const safe=/^[=+\-@\t\r]/.test(text)?`'${text}`:text;return /[",\r\n]/.test(safe)?`"${safe.replaceAll('"','""')}"`:safe;};
/** Result sheet as CSV (spreadsheet-safe: formula prefixes neutralised, UTF-8 BOM for Bangla names). */
function exportResultsCsv(sheet:Sheet){
 const {exam}=sheet,label={attempted:'Attempted',absent:'Absent',not_recorded:'Not recorded'} as const;
 const rows=[['Exam',exam.title],['Batch',exam.batchName],['Subject',exam.subject],['Scheduled',new Date(exam.scheduledAt).toISOString()],['Total marks',exam.maxMarks],['Pass marks',exam.passMarks],[],
  ['Admission roll','Student','Attendance','Marks','Percent','Grade','Rank','Result','Status','Remarks'],
  ...sheet.rows.map(row=>{const percent=row.marks===null?null:Math.round(row.marks/exam.maxMarks*1000)/10;return [row.admissionRoll,row.fullName,label[row.participation],row.marks,percent,percent===null?'':grade(percent),row.rank,row.marks===null||exam.passMarks===null?'':row.marks>=exam.passMarks?'Pass':'Fail',row.resultStatus??'',row.remarks];})];
 const blob=new Blob(['﻿'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=`results-${exam.title.replace(/[^\w-]+/g,'-').slice(0,60)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const LIFECYCLE:Record<string,string>={draft:'Draft (hidden)',scheduled:'Scheduled',completed:'Held · results pending',result_draft:'Result draft',result_published:'Results published',archived:'Archived'};
export function grade(percent:number){return percent>=80?'A+':percent>=70?'A':percent>=60?'A-':percent>=50?'B':percent>=40?'C':percent>=33?'D':'F';}

/** Offline exam result sheet: Attempted / Absent / Not recorded per Student, marks, remarks, publish and PDF. */
export function ExamResultsSheet({exams}:{exams:{id:string;title:string}[]}){
 const [examId,setExamId]=useState(exams[0]?.id??''),[sheet,setSheet]=useState<Sheet|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[version,setVersion]=useState(0),[edits,setEdits]=useState<Record<string,{participation:string;marks:string;remarks:string}>>({}),[details,setDetails]=useState(false),[loadedAt,setLoadedAt]=useState(0);
 useEffect(()=>{if(!examId)return;let active=true;Promise.resolve().then(()=>{if(active){setSheet(null);setError('');}});managementRead<Sheet>('exam-sheet',{examId}).then(next=>{if(active){setSheet(next);setEdits({});setLoadedAt(Date.now());}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[examId,version]);
 const stats=useMemo(()=>{if(!sheet)return null;const attempted=sheet.rows.filter(r=>r.participation==='attempted'&&r.marks!==null),marks=attempted.map(r=>Number(r.marks));const pass=sheet.exam.passMarks;
  return {attempted:attempted.length,absent:sheet.rows.filter(r=>r.participation==='absent').length,pending:sheet.rows.filter(r=>r.participation==='not_recorded').length,average:marks.length?(marks.reduce((a,b)=>a+b,0)/marks.length).toFixed(1):'—',highest:marks.length?Math.max(...marks):'—',passRate:pass!==null&&marks.length?Math.round(marks.filter(m=>m>=pass).length/marks.length*100)+'%':'—'};},[sheet]);
 if(!exams.length)return <div className="academic-empty"><span>✧</span><h4>No examinations yet</h4><p>Create and schedule an exam in Examinations first.</p></div>;
 const published=sheet?.exam.lifecycle==='result_published',held=sheet?Date.parse(sheet.exam.scheduledAt)<=loadedAt:false;
 async function saveRow(row:SheetRow){const edit=edits[row.studentId];if(!edit||!sheet)return;setBusy(row.studentId);setError('');setNotice('');
  try{if(edit.participation==='not_recorded')throw new Error('Choose Attempted or Absent before saving.');const marks=edit.participation==='absent'?null:Number(edit.marks);
   if(edit.participation==='attempted'&&(edit.marks===''||!Number.isFinite(marks)||marks!<0||marks!>sheet.exam.maxMarks))throw new Error(`Marks must be between 0 and ${sheet.exam.maxMarks}.`);
   await managementCommand('exam-attendance',{examId:sheet.exam.id,studentId:row.studentId,attendance:edit.participation,marks,remarks:edit.remarks});setNotice(`Saved ${row.fullName}.`);setVersion(v=>v+1);}
  catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function publish(){if(!sheet||!window.confirm(`Publish results for ${sheet.exam.title}? Students will see their marks, rank and attendance. Students still "not recorded" stay unpublished.`))return;setBusy('publish');setError('');try{await academicPublish('results',sheet.exam.id);setNotice('Results published to enrolled Students.');setVersion(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <section className="mgmt-exam-sheet" aria-label="Exam result sheet">
  <div className="academic-context"><label>Choose exam<select value={examId} onChange={e=>setExamId(e.target.value)}>{exams.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
   {sheet&&<div className="mgmt-quick-row"><button className="portal-secondary" onClick={()=>setDetails(true)} disabled={published}>Exam details</button><a className="portal-secondary" href={`/api/v1/teacher/reports/exam/${sheet.exam.id}`} target="_blank" rel="noopener">Result sheet PDF ↗</a><button type="button" className="portal-secondary" onClick={()=>exportResultsCsv(sheet)}>Results CSV ↓</button></div>}</div>
  {error&&<div className="portal-alert" role="alert">{error}</div>}{notice&&<div className="portal-success" role="status">✓ {notice}</div>}
  {!sheet?<div className="portal-loading"><div className="portal-spinner"/>Loading result sheet…</div>:<>
   <div className="mgmt-exam-head"><div><span className="premium-badge" data-status={published?'active':'pending'}>{LIFECYCLE[sheet.exam.lifecycle]??sheet.exam.lifecycle}</span><h4>{sheet.exam.title}</h4><p>{EXAM_TYPES[sheet.exam.examType]} · {sheet.exam.subject} · {new Date(sheet.exam.scheduledAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}{sheet.exam.durationMinutes?` · ${sheet.exam.durationMinutes} min`:''} · Total {sheet.exam.maxMarks}{sheet.exam.passMarks!==null?` · Pass ${sheet.exam.passMarks}`:''}</p></div>
    <dl className="mgmt-pay-summary"><div><dt>Attempted</dt><dd>{stats!.attempted}</dd></div><div><dt>Absent</dt><dd>{stats!.absent}</dd></div><div><dt>Not recorded</dt><dd>{stats!.pending}</dd></div><div><dt>Average</dt><dd>{stats!.average}</dd></div><div><dt>Highest</dt><dd>{stats!.highest}</dd></div><div><dt>Pass rate</dt><dd>{stats!.passRate}</dd></div></dl></div>
   {!held&&<p className="mgmt-hint">Attendance and marks can be recorded once the exam time has passed.</p>}
   <div className="premium-table-wrap" tabIndex={0} role="region" aria-label="Result entries"><table className="premium-table"><thead><tr><th>Student</th><th>Attendance</th><th>Marks / {sheet.exam.maxMarks}</th><th>Grade</th><th>Remarks</th><th>Rank</th><th></th></tr></thead>
    <tbody>{sheet.rows.map(row=>{const edit=edits[row.studentId]??{participation:row.participation,marks:row.marks===null?'':String(row.marks),remarks:row.remarks},locked=row.resultStatus==='published'||published||!held,dirty=!!edits[row.studentId];
     const percent=row.marks!==null?Number(row.marks)/sheet.exam.maxMarks*100:null;
     return <tr key={row.studentId}><td><strong>{row.fullName}</strong><small>{row.admissionRoll??'No roll'}</small></td>
      <td><select aria-label={`${row.fullName} attendance`} disabled={locked} value={edit.participation} onChange={e=>setEdits(x=>({...x,[row.studentId]:{...edit,participation:e.target.value,marks:e.target.value==='absent'?'':edit.marks}}))}><option value="not_recorded">Not recorded</option><option value="attempted">Attempted</option><option value="absent">Absent</option></select></td>
      <td><input aria-label={`${row.fullName} marks`} className="mgmt-marks" inputMode="decimal" disabled={locked||edit.participation!=='attempted'} value={edit.marks} onChange={e=>setEdits(x=>({...x,[row.studentId]:{...edit,marks:e.target.value}}))}/></td>
      <td>{percent!==null?<span className="premium-badge" data-status={sheet.exam.passMarks!==null&&Number(row.marks)<sheet.exam.passMarks?'rejected':'active'}>{grade(percent)}</span>:row.participation==='absent'?'Absent':'—'}</td>
      <td><input aria-label={`${row.fullName} remarks`} maxLength={500} disabled={locked} value={edit.remarks} onChange={e=>setEdits(x=>({...x,[row.studentId]:{...edit,remarks:e.target.value}}))}/></td>
      <td>{row.rank??'—'}</td><td>{!locked&&<button className="portal-secondary" disabled={!dirty||busy===row.studentId} onClick={()=>void saveRow(row)}>{busy===row.studentId?'Saving…':'Save'}</button>}{row.resultStatus&&<small>{row.resultStatus==='published'?'Published':'Draft'}</small>}</td></tr>;})}</tbody></table></div>
   {!published&&stats!.attempted+stats!.absent>0&&<div className="academic-publish-panel"><div><strong>Ready to publish?</strong><p>Attempted and absent records will be published; Students not recorded stay unpublished and are never shown as absent or zero.</p></div><button className="portal-primary" disabled={busy==='publish'} onClick={()=>void publish()}>Publish results ↗</button></div>}
   {details&&<ExamDetailsDialog exam={sheet.exam} onClose={()=>setDetails(false)} onSaved={()=>{setDetails(false);setVersion(v=>v+1);}}/>}
  </>}
 </section>;
}

/** Exam details: type, schedule, duration, total/pass marks, instructions and syllabus coverage. */
export function ExamDetailsDialog({exam,onClose,onSaved}:{exam:Sheet['exam'];onClose:()=>void;onSaved:()=>void}){
 const local=(iso:string)=>{const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
 const [form,setForm]=useState({title:exam.title,scheduledAt:local(exam.scheduledAt),examType:exam.examType,maxMarks:String(exam.maxMarks),passMarks:exam.passMarks===null?'':String(exam.passMarks),durationMinutes:exam.durationMinutes===null?'':String(exam.durationMinutes),instructions:exam.instructions,coverage:exam.coverageUnitIds});
 const [units,setUnits]=useState<{id:string;title:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;managementRead<Syllabus>('syllabus',{batchId:exam.batchId}).then(s=>{if(active)setUnits(s.subjects.filter(x=>x.title===exam.subject).flatMap(x=>x.chapters.flatMap(c=>[{id:c.id,title:c.title},...c.topics.map(t=>({id:t.id,title:`${c.title} › ${t.title}`}))])));}).catch(()=>{});return()=>{active=false;};},[exam.batchId,exam.subject]);
 async function submit(e:FormEvent){e.preventDefault();setError('');const max=Number(form.maxMarks),pass=form.passMarks===''?null:Number(form.passMarks);
  if(pass!==null&&(pass<0||pass>max))return setError('Pass marks must be between 0 and the total marks.');setBusy(true);
  try{await managementCommand('exam-details',{examId:exam.id,title:form.title.trim(),scheduledAt:new Date(form.scheduledAt).toISOString(),maxMarks:max,passMarks:pass,instructions:form.instructions,coverageUnitIds:form.coverage,examType:form.examType,durationMinutes:form.durationMinutes===''?null:Number(form.durationMinutes)});onSaved();}
  catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 return <div className="teacher-ops-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><form className="teacher-ops-modal mgmt-modal-wide" role="dialog" aria-modal="true" aria-labelledby="exam-details-heading" onSubmit={submit}>
  <div className="teacher-ops-modal-head"><div><span className="portal-kicker">OFFLINE EXAMINATION</span><h3 id="exam-details-heading">Exam details</h3></div><button type="button" className="portal-secondary" onClick={onClose} aria-label="Close">✕</button></div>
  <div className="mgmt-form-grid"><label className="mgmt-span">Title<input required minLength={2} maxLength={120} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
   <label>Type<select value={form.examType} onChange={e=>setForm({...form,examType:e.target.value as ExamType})}>{(Object.keys(EXAM_TYPES) as ExamType[]).map(t=><option key={t} value={t}>{EXAM_TYPES[t]}</option>)}</select></label>
   <label>Date & time<input type="datetime-local" required value={form.scheduledAt} onChange={e=>setForm({...form,scheduledAt:e.target.value})}/></label>
   <label>Duration (minutes)<input type="number" min={5} max={600} value={form.durationMinutes} onChange={e=>setForm({...form,durationMinutes:e.target.value})}/></label>
   <label>Total marks<input type="number" required min={1} max={10000} value={form.maxMarks} onChange={e=>setForm({...form,maxMarks:e.target.value})}/></label>
   <label>Pass marks<input type="number" min={0} max={10000} value={form.passMarks} onChange={e=>setForm({...form,passMarks:e.target.value})}/></label></div>
  <label>Instructions / exam syllabus notes<textarea rows={3} maxLength={4000} value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} placeholder="Chapters covered, materials allowed, room…"/></label>
  {units.length>0&&<fieldset className="mgmt-fieldset"><legend>Syllabus coverage</legend><div className="mgmt-check-list">{units.map(u=><label key={u.id} className="mgmt-check"><input type="checkbox" checked={form.coverage.includes(u.id)} onChange={e=>setForm({...form,coverage:e.target.checked?[...form.coverage,u.id]:form.coverage.filter(x=>x!==u.id)})}/>{u.title}</label>)}</div></fieldset>}
  {error&&<div className="portal-alert" role="alert">{error}</div>}
  <div className="teacher-ops-modal-actions"><button type="button" className="portal-secondary" onClick={onClose}>Cancel</button><button className="portal-primary" disabled={busy}>{busy?'Saving…':'Save exam details'}</button></div>
 </form></div>;
}

/** Loads an exam's details for the exams list, then opens the details dialog. */
export function ExamDetailsLoader({examId,onClose,onSaved}:{examId:string;onClose:()=>void;onSaved:()=>void}){
 const [exam,setExam]=useState<Sheet['exam']|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;managementRead<Sheet>('exam-sheet',{examId}).then(s=>{if(active)setExam(s.exam);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[examId]);
 if(exam)return <ExamDetailsDialog exam={exam} onClose={onClose} onSaved={onSaved}/>;
 return <div className="teacher-ops-overlay"><div className="teacher-ops-modal" role="dialog" aria-modal="true" aria-label="Loading exam">{error?<><div className="portal-alert">{error}</div><button className="portal-secondary" onClick={onClose}>Close</button></>:<div className="portal-loading"><div className="portal-spinner"/>Loading exam…</div>}</div></div>;
}
