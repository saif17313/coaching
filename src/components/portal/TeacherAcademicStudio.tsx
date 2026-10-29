'use client';
import {ClassSessionsPanel} from './ClassSessions';
import {PortalScreen} from './PortalScreen';
import {AssignmentReview} from './AssignmentReview';
import {ExamDetailsLoader,ExamResultsSheet,SyllabusPlanner} from './TeacherAcademicPlanner';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {academicList,academicCommand,academicPublish,activeBatchRoster,type AcademicMode,type AcademicCommand,type AcademicItem} from '@/client/teacher-academics.mjs';

const modes: {id:AcademicMode;label:string;description:string;symbol:string}[]=[
 {id:'subjects',label:'Subjects',description:'Organise the subjects taught in this batch.',symbol:'01'},
 {id:'syllabus',label:'Syllabus',description:'Chapters and topics per subject, with weighted completion progress.',symbol:'02'},
 {id:'routine',label:'Routine',description:'Plan weekly lessons without schedule overlap.',symbol:'03'},
 {id:'assignments',label:'Assignments',description:'Prepare and publish student assignments.',symbol:'04'},
 {id:'exams',label:'Examinations',description:'Schedule offline exams with type, pass marks, duration and syllabus coverage.',symbol:'05'},
 {id:'results',label:'Results',description:'Record attendance (attempted / absent) and marks, then publish ranked results.',symbol:'06'}
];
type Named={id:string;title:string};
const fieldLabels:Record<string,string>={code:'Subject code',title:'Title',position:'Sequence',subjectId:'Subject',dayOfWeek:'Weekday',startMinute:'Start',endMinute:'End',room:'Room / meeting link',instructions:'Instructions',releaseAt:'Release date',dueAt:'Deadline',maxPoints:'Maximum points',allowResubmit:'Allow resubmission',scheduledAt:'Scheduled date',maxMarks:'Maximum marks',studentId:'Student',marks:'Marks'};
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const commandByMode:Record<AcademicMode,AcademicCommand>={subjects:'subject',syllabus:'syllabus',routine:'routine',assignments:'assignment',exams:'exam',results:'result'};
const asStr=(x:unknown)=>typeof x==='string'?x:'';
const displayDate=(x:unknown)=>typeof x==='string'&&!Number.isNaN(Date.parse(x))?new Date(x).toLocaleString('en-BD',{dateStyle:'medium',timeStyle:'short'}):'—';
const hhmm=(x:unknown)=>typeof x==='number'&&Number.isInteger(x)?`${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`:'—';
function localIso(value:string){const d=new Date(value);if(!value||Number.isNaN(d.getTime()))throw Error('Enter a valid date and time.');return d.toISOString();}
function timeMinute(s:string){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('Enter a valid class time.');const [h,m]=s.split(':').map(Number);return h*60+m;}
function short(id:string){return id.slice(0,8);}
function recordDescription(mode:AcademicMode,row:AcademicItem,subjects:Named[]){
 const subject=subjects.find(s=>s.id===row.subjectId)?.title;
 switch(mode){
  case 'subjects':return `Code ${asStr(row.code)} · ${short(row.id)}`;
  case 'syllabus':return `Unit ${row.position} · ${short(row.id)}`;
  case 'routine':return `${days[Number(row.dayOfWeek)]||'Day'} · ${hhmm(row.startMinute)}–${hhmm(row.endMinute)}${subject?' · '+subject:''}`;
  case 'assignments':return `${subject||'Subject'} · Deadline ${displayDate(row.dueAt)}`;
  case 'exams':return `${subject||'Subject'} · ${displayDate(row.scheduledAt)}`;
  case 'results':return `Student ${asStr(row.studentId).slice(0,8)} · ${typeof row.marks==='number'?row.marks:'—'} marks${typeof row.rank==='number'?' · Rank '+row.rank:''}`;
 }
}
const itemTitle=(mode:AcademicMode,row:AcademicItem)=>mode==='routine'?`${asStr(row.room)||'Class session'}`:mode==='results'?`Result ${short(row.id)}`:asStr(row.title)||short(row.id);
const formFields:Record<AcademicMode,string[]>={subjects:['code','title'],syllabus:['title','position'],routine:['subjectId','dayOfWeek','startMinute','endMinute','room'],assignments:['subjectId','title','instructions','releaseAt','dueAt','maxPoints','allowResubmit'],exams:['subjectId','title','scheduledAt','maxMarks'],results:['studentId','marks']};
const createNames:Record<AcademicMode,string>={subjects:'Add subject',syllabus:'Add syllabus unit',routine:'Add weekly class',assignments:'Create assignment draft',exams:'Create exam draft',results:'Save result draft'};
export function TeacherAcademicStudio({mode,batchId,onNavigate}:{mode:AcademicMode;batchId:string;onNavigate:(m:AcademicMode)=>void}){
 const [review,setReview]=useState<AcademicItem|null>(null),[detailsId,setDetailsId]=useState('');
 const planner=mode==='syllabus'||mode==='results';
 const [subjects,setSubjects]=useState<Named[]>([]),[exams,setExams]=useState<Named[]>([]),[target]=useState(''),[items,setItems]=useState<AcademicItem[]>([]);
 const [students,setStudents]=useState<Named[]>([]),[studentOffset,setStudentOffset]=useState(0),[offset,setOffset]=useState(0),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [formOpen,setFormOpen]=useState(false),[values,setValues]=useState<Record<string,string>>({}),[notice,setNotice]=useState(''),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const descriptor=modes.find(m=>m.id===mode)||modes[0];
 const kind=commandByMode[mode];
 const secondary=mode==='syllabus'||mode==='results';
 const subjectRequired=mode==='routine'||mode==='assignments'||mode==='exams';
 const refreshAll=useCallback(()=>{setRefresh(x=>x+1);},[]);
 // Read related batch subjects/exams, never synthesize missing subject/exam options.
 useEffect(()=>{let gone=false;Promise.all([
  academicList('subjects',batchId,{limit:50}),academicList('exams',batchId,{limit:50})
 ]).then(([s,e])=>{if(!gone){setSubjects(s.items.map(x=>({id:x.id,title:String(x.title||x.code||'Subject')})));setExams(e.items.map(x=>({id:x.id,title:String(x.title||'Exam')})));}}).catch(e=>{if(!gone)setError((e as Error).message);});return()=>{gone=true;};},[batchId,refresh]);
 const resolved=secondary?target:batchId;
 useEffect(()=>{let gone=false;if(!resolved){Promise.resolve().then(()=>{if(!gone){setItems([]);setLoading(false);}});return()=>{gone=true;};}Promise.resolve().then(()=>{if(!gone){setLoading(true);setError('');}});
  academicList(mode,resolved,{offset,limit:20}).then(d=>{if(!gone)setItems(d.items);}).catch(e=>{if(!gone){setError((e as Error).message);setItems([]);}}).finally(()=>{if(!gone)setLoading(false);});return()=>{gone=true;};},[mode,resolved,offset,refresh]);
 useEffect(()=>{if(mode!=='results'||!batchId)return;let gone=false;activeBatchRoster(batchId,{offset:studentOffset}).then(list=>{if(!gone)setStudents(list.map(s=>({id:s.id,title:s.name})));}).catch(e=>{if(!gone)setError((e as Error).message);});return()=>{gone=true;};},[mode,batchId,studentOffset,refresh]);
 const subjectOptions=subjects;
 function openForm(){setValues({position:'1',dayOfWeek:'0',startMinute:'09:00',endMinute:'10:00',maxPoints:'100',maxMarks:'100',marks:'0',allowResubmit:'false',subjectId:subjectOptions[0]?.id||'',studentId:students[0]?.id||''});setError('');setNotice('');setFormOpen(true);}
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(saving)return;setSaving(true);try{
  const id=mode==='syllabus'||mode==='results'?target:batchId;
  if(!id)throw Error('Select a subject or examination first.');
  let data:Record<string,unknown>={};
  if(kind==='subject')data={code:asStr(values.code).trim().toUpperCase(),title:asStr(values.title).trim()};
  if(kind==='syllabus')data={title:asStr(values.title).trim(),position:Number(values.position)};
  if(kind==='routine')data={subjectId:values.subjectId,dayOfWeek:Number(values.dayOfWeek),startMinute:timeMinute(values.startMinute),endMinute:timeMinute(values.endMinute),room:asStr(values.room).trim()};
  if(kind==='assignment')data={subjectId:values.subjectId,title:asStr(values.title).trim(),instructions:asStr(values.instructions).trim(),releaseAt:localIso(values.releaseAt),dueAt:localIso(values.dueAt),maxPoints:Number(values.maxPoints),allowResubmit:values.allowResubmit==='true'};
  if(kind==='exam')data={subjectId:values.subjectId,title:asStr(values.title).trim(),scheduledAt:localIso(values.scheduledAt),maxMarks:Number(values.maxMarks)};
  if(kind==='result'){const exam=await academicList('exams',batchId,{limit:50});const selected=exam.items.find(e=>e.id===target);if(!selected)throw Error('Selected exam is no longer available.');if(Number(values.marks)>Number(selected.maxMarks))throw Error('Marks cannot exceed examination maximum.');data={studentId:values.studentId,marks:Number(values.marks)};}
  setError('');await academicCommand(kind,id,data);setNotice(`${createNames[mode]} saved successfully.`);setFormOpen(false);refreshAll();
 }catch(e){setError((e as Error).message);}finally{setSaving(false);}}
 async function publish(type:'assignment'|'exam'|'results',id:string,title:string){
  if(!window.confirm(`Publish ${title}? This will expose approved content to enrolled students and writes to the coaching database.`))return;
  try{setSaving(true);setError('');await academicPublish(type,id);setNotice(`Published: ${title}`);refreshAll();}catch(e){setError((e as Error).message);}finally{setSaving(false);}
 }
 function update(key:string,value:string){setValues(v=>({...v,[key]:value}));}
 const canCreate=(!secondary||Boolean(target))&&(!subjectRequired||subjectOptions.length>0)&&(mode!=='results'||students.length>0);
 return <div className="academic-studio">
  <div className="academic-hero"><div className="academic-hero-copy"><span className="portal-kicker">ACADEMIC COMMAND CENTRE</span><h2>Teach with a clearer rhythm.</h2><p>Plan a subject, shape a syllabus, schedule learning, assess progress and release results — one connected workspace.</p></div><div className="academic-hero-mark" aria-hidden="true"><span>◈</span><small>EDUCENTRE / ACADEMICS</small></div></div>
  <div className="academic-flow" role="navigation" aria-label="Academic workflow">{modes.map(m=><button key={m.id} type="button" onClick={()=>onNavigate(m.id)} className={'academic-flow-step'+(m.id===mode?' active':'')} aria-current={m.id===mode?'step':undefined}><small>{m.symbol}</small><strong>{m.label}</strong></button>)}</div>
  <div className="academic-heading"><div><span className="portal-kicker">{descriptor.symbol} / ACADEMIC OPERATIONS</span><h3>{descriptor.label}</h3><p>{descriptor.description}</p></div>{!planner&&<div className="academic-heading-actions"><button type="button" className="portal-secondary" disabled={loading||saving} onClick={refreshAll}>↻ Refresh</button><button type="button" className="portal-primary" disabled={!canCreate||saving||loading} onClick={openForm}>+ {createNames[mode]}</button></div>}</div>
  <p className="academic-security-note">Only active Teachers can edit academic records. Assignment grades and exam results stay private until you publish them.</p>
  {mode==='syllabus'?<SyllabusPlanner key={batchId} batchId={batchId}/>:mode==='results'?<ExamResultsSheet key={batchId+exams.length} exams={exams}/>:<>
  {notice&&<div className="portal-success" role="status">✓ {notice}</div>}
  {error&&<div className="portal-alert" role="alert">{error}</div>}
  {loading?<div className="academic-empty" role="status"><div className="portal-spinner"/> Loading records…</div>:
   !resolved?<div className="academic-empty"><span>◎</span><h4>Choose a batch</h4><p>Select an item above to begin.</p></div>:
   items.length===0?<div className="academic-empty"><span>✧</span><h4>Nothing here yet</h4><p>{mode==='subjects'?'Start by adding a subject to this batch.':'Use the action above to begin the first record.'}</p></div>:
   <div className="academic-cards">{items.map(row=><article key={row.id} className="academic-card"><div className="academic-card-icon">{descriptor.symbol}</div><div className="academic-card-content"><h4>{itemTitle(mode,row)}</h4><p>{recordDescription(mode,row,subjectOptions)}</p><small>Record {short(row.id)}</small></div><div className="academic-card-actions">{typeof row.status==='string'&&<span className={'academic-state '+(row.status==='published'?'good':row.status==='draft'?'draft':'')}>{row.status}</span>}{mode==='assignments'&&row.status==='draft'&&<button type="button" className="portal-secondary" disabled={saving} onClick={()=>void publish('assignment',row.id,itemTitle(mode,row))}>Publish ↗</button>}{mode==='assignments'&&row.status==='published'&&<button type="button" className="portal-secondary" onClick={()=>setReview(row)}>Review submissions</button>}{mode==='exams'&&<button type="button" className="portal-secondary" onClick={()=>setDetailsId(row.id)}>Details</button>}{mode==='exams'&&row.status==='draft'&&<button type="button" className="portal-secondary" disabled={saving} onClick={()=>void publish('exam',row.id,itemTitle(mode,row))}>Schedule (publish) ↗</button>}</div></article>)}</div>}
  {mode==='routine'&&batchId&&<ClassSessionsPanel key={batchId} batchId={batchId} role="teacher"/>}
  {review&&<AssignmentReview assignmentId={review.id} title={String(review.title)} maxPoints={Number(review.maxPoints)} onClose={()=>setReview(null)}/>}
  {resolved&&<div className="teacher-ops-pagination"><button className="portal-secondary" disabled={offset===0||loading||saving} onClick={()=>setOffset(n=>Math.max(0,n-20))}>← Previous</button><span>Page {Math.floor(offset/20)+1}</span><button className="portal-secondary" disabled={items.length<20||loading||saving} onClick={()=>setOffset(n=>n+20)}>Next →</button></div>}
  </>}
  {detailsId&&<ExamDetailsLoader examId={detailsId} onClose={()=>setDetailsId('')} onSaved={()=>{setDetailsId('');setNotice('Exam details saved.');refreshAll();}}/>}
  {formOpen&&<PortalScreen trail={[createNames[mode]]} kicker="SECURE ACADEMIC ACTION" title={createNames[mode]} onBack={()=>{if(!saving)setFormOpen(false);}}><section className="teacher-ops-modal academic-dialog" aria-label={createNames[mode]}><div className="teacher-ops-modal-head"><div><span className="portal-kicker">SECURE ACADEMIC ACTION</span><h3 id="academic-form-heading">{createNames[mode]}</h3></div><button type="button" className="portal-secondary" aria-label="Close" disabled={saving} onClick={()=>setFormOpen(false)}>✕</button></div>
   <p className="academic-form-note">For batch-specific records, only available subjects and enrolled students can be selected.</p>
   {error&&<div className="portal-alert" role="alert">{error}</div>}
   <form className="teacher-ops-form academic-form" onSubmit={e=>void save(e)}>{formFields[mode].map(field=><label key={field}>{fieldLabels[field]}
    {field==='subjectId'?<select required value={values.subjectId||''} onChange={e=>update(field,e.target.value)}><option value="">Choose subject</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select>:
     field==='studentId'?<><select required value={values.studentId||''} onChange={e=>update(field,e.target.value)}><option value="">Choose enrolled student</option>{students.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select><small className="academic-form-help">Roster page {studentOffset/20+1} · <button type="button" className="portal-text-button" disabled={studentOffset===0||saving} onClick={()=>setStudentOffset(x=>Math.max(0,x-20))}>Previous</button> · <button type="button" className="portal-text-button" disabled={students.length<20||saving} onClick={()=>setStudentOffset(x=>x+20)}>Next</button></small></>:
     field==='dayOfWeek'?<select value={values.dayOfWeek||'0'} onChange={e=>update(field,e.target.value)}>{days.map((day,i)=><option key={day} value={i}>{day}</option>)}</select>:
     field==='allowResubmit'?<select value={values.allowResubmit||'false'} onChange={e=>update(field,e.target.value)}><option value="false">No</option><option value="true">Yes</option></select>:
     field==='instructions'?<textarea rows={5} required minLength={2} maxLength={20000} value={values.instructions||''} onChange={e=>update(field,e.target.value)} placeholder="Explain the task clearly…"/>:
     ['releaseAt','dueAt','scheduledAt'].includes(field)?<input type="datetime-local" required value={values[field]||''} onChange={e=>update(field,e.target.value)}/>:
     ['startMinute','endMinute'].includes(field)?<input type="time" required value={values[field]||''} onChange={e=>update(field,e.target.value)}/>:
     ['maxPoints','maxMarks','position','marks'].includes(field)?<input type="number" required min={field==='marks'?0:1} max={field==='marks'?10000:field==='maxPoints'?1000:field==='position'?10000:10000} step={field==='marks'?'0.01':'1'} value={values[field]||''} onChange={e=>update(field,e.target.value)}/>:
     <input required={field!=='room'} minLength={field==='room'?0:field==='code'?2:2} maxLength={field==='room'?100:field==='code'?24:160} value={values[field]||''} onChange={e=>update(field,field==='code'?e.target.value.toUpperCase():e.target.value)} placeholder={field==='code'?'MATH_01':field==='room'?'Room 204':'Enter '+fieldLabels[field].toLowerCase()}/>}</label>)}
    <div className="teacher-ops-form-actions"><button type="button" className="portal-secondary" disabled={saving} onClick={()=>setFormOpen(false)}>Cancel</button><button className="portal-primary" disabled={saving}>{saving?'Saving…':'Save securely ↗'}</button></div>
   </form></section></PortalScreen>}
 </div>;
}
