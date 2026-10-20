'use client';
import {StudentAdmissionProfile} from './StudentAdmissionProfile';
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {normalizeTeacherList,readTeacherList,teacherCommand,type TeacherManagementScope,type TeacherRow} from '@/client/teacher-management.mjs';

type Mode=TeacherManagementScope;
type Action='create'|'edit'|'enroll'|'onboard'|'invite'|null;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stateOptions={students:['','pending','active','disabled','rejected'],enrollments:['','pending','active','rejected','cancelled']};
const isId=(x:unknown):x is string=>typeof x==='string'&&ID.test(x);
function short(id:string){return id.slice(0,8);}
function heading(mode:Mode){return ({students:'Student directory',batches:'Batch management',enrollments:'Enrollment requests'})[mode];}
function roleLabel(status?:string){return (status||'unknown').replace(/^./,s=>s.toUpperCase());}
function confirmAction(action:string,subject:string){return window.confirm(`${action} — ${subject}? This writes to your coaching database and may affect access.`);}
export function TeacherManagement({mode}:{mode:Mode}){
 const [items,setItems]=useState<TeacherRow[]>([]),[offset,setOffset]=useState(0),[filter,setFilter]=useState('');
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [refresh,setRefresh]=useState(0),[action,setAction]=useState<Action>(null),[selected,setSelected]=useState<TeacherRow|null>(null);
 const [name,setName]=useState(''),[code,setCode]=useState(''),[capacity,setCapacity]=useState('30');
 const [studentId,setStudentId]=useState(''),[batchId,setBatchId]=useState('');
 const submissionBusy=useRef(false);
 const [email,setEmail]=useState(''),[initialPassword,setInitialPassword]=useState('');
 const [students,setStudents]=useState<TeacherRow[]>([]),[batches,setBatches]=useState<TeacherRow[]>([]);
 const [search,setSearch]=useState('');
 const [admissionStudent,setAdmissionStudent]=useState<string|null>(null);
 const load=useCallback(async()=>normalizeTeacherList(mode,await readTeacherList(mode,{offset,filter})),[mode,offset,filter]);
 useEffect(()=>{
  let alive=true;
  Promise.resolve().then(()=>{if(alive){setLoading(true);setError('');}});
  load().then(rows=>{if(alive)setItems(rows);}).catch((err:Error)=>{if(alive)setError(err.message);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[load,refresh]);
 const listed=useMemo(()=>items.filter(x=>{
  const q=search.trim().toLowerCase();return !q||[x.name,x.code,x.status,x.studentId,x.batchId,x.id].some(value=>String(value||'').toLowerCase().includes(q));
 }),[items,search]);
 function begin(next:Action,row:TeacherRow|null=null){
  setSelected(row);setAction(next);setNotice('');setError('');
  setName(row?.name||'');setCode(row?.code||'');setCapacity(String(row?.capacity||30));setStudentId('');setBatchId('');setEmail('');setInitialPassword('');
 }
 const run=async(kind:Parameters<typeof teacherCommand>[0],input:Record<string,unknown>,id?:string)=>{
  setSaving(true);setError('');setNotice('');
  try{
   await teacherCommand(kind,{id,input});setNotice('Saved successfully. Data refreshed from the server.');setAction(null);setSelected(null);setRefresh(n=>n+1);
  }catch(err){setError((err as Error).message);}finally{setSaving(false);}
 };
 async function submitForm(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(action==='onboard'&&mode==='students')return onboardStudent();
  if(action==='invite'&&mode==='students')return inviteStudent();
  if(action==='create'&&mode==='batches')return run('createBatch',{code:code.trim(),name:name.trim(),capacity:Number(capacity)});
  if(action==='edit'&&selected&&mode==='batches')return run('updateBatch',{name:name.trim(),capacity:Number(capacity)},selected.id);
  if(action==='edit'&&selected&&mode==='students')return run('renameStudent',{fullName:name.trim()},selected.id);
  if(action==='enroll'&&isId(studentId)&&isId(batchId))return run('requestEnrollment',{studentId,batchId});
  setError('Complete the required fields.');
 }
 async function inviteStudent(){
  if(submissionBusy.current)return;submissionBusy.current=true;setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/v1/teacher/students/invite',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({email:email.trim().toLowerCase(),fullName:name.trim()})});
   const result=await response.json();
   if(!response.ok||result?.success!==true)throw Error(result?.error?.code==='AUTH_ADMIN_NOT_CONFIGURED'?'The server Auth invitation credential is not configured. Configure SUPABASE_AUTH_ADMIN_KEY on the server, then restart the reviewed DEV launcher. Never share it in chat.':result?.error?.code==='AUTH_INVITATION_REJECTED'?'Supabase rejected this invitation. Check whether the email already has an account; do not send repeated invitations.':`Invitation could not be confirmed (${result?.error?.code??response.status}).`);
   setNotice(result.data.message);setAction(null);setInitialPassword('');setRefresh(x=>x+1);
  }catch(e){setError((e as Error).message);}finally{submissionBusy.current=false;setSaving(false);}
 }
 async function onboardStudent(){
  if(submissionBusy.current)return;submissionBusy.current=true;
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/v1/teacher/students/onboard',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-musa-ui':'1'},body:JSON.stringify({email:email.trim().toLowerCase(),fullName:name.trim(),initialPassword})});
   const payload:unknown=await response.json();
   if(!response.ok||!payload||typeof payload!=='object'||Reflect.get(payload,'success')!==true){
    const code=payload&&typeof payload==='object'?Reflect.get(Reflect.get(payload,'error')??{},'code'):null;
    throw Error(code==='AUTH_SIGNUP_DISABLED'?'Public signup is disabled in Supabase. Use an approved server-side Auth invitation; enabling the CMS write gate does not enable account signup.':code==='AUTH_WEAK_PASSWORD'?'The password does not meet the Supabase password policy. Choose another password locally.':code==='WRITE_SERVICE_UNAVAILABLE'?'Student onboarding requires the guarded write gate.':code==='STUDENT_ALREADY_EXISTS_OR_UNCONFIRMED'?'Account already exists or needs confirmation. Do not create a duplicate.':`Student onboarding failed (${String(code||response.status)}).`);
   }
   const outcome=Reflect.get(payload,'data');const named=outcome&&typeof outcome==='object'&&Reflect.get(outcome,'nameSaved')===true;
   setNotice(named?'Student created with name in Supabase. Ask the student to confirm email; then activate and enroll. Share the temporary password privately.':'Student Auth account created, but the full name needs updating from the student directory. Confirm email, then activate and enroll.');
   setAction(null);setInitialPassword('');setRefresh(n=>n+1);
  }catch(err){setError((err as Error).message);}finally{submissionBusy.current=false;setSaving(false);}
 }
 async function beginEnrollment(preselected?:TeacherRow){
  begin('enroll');
  try{
   const [s,b]=await Promise.all([readTeacherList('students',{offset:0}),readTeacherList('batches',{offset:0})]);
   const eligible=normalizeTeacherList('students',s).filter(x=>x.status==='active');if(preselected?.status==='active'&&!eligible.some(row=>row.id===preselected.id))eligible.push(preselected);setStudents(eligible);if(preselected)setStudentId(preselected.id);
   setBatches(normalizeTeacherList('batches',b).filter(x=>!x.archived));
  }catch(err){setError((err as Error).message);setAction(null);}
 }
 const decision=(row:TeacherRow,choice:'approve'|'reject'|'cancel')=>{
  if(!confirmAction(choice==='approve'?'Approve enrollment':choice==='reject'?'Reject enrollment':'Cancel enrollment',`record ${short(row.id)}`))return;
  void run('decideEnrollment',{decision:choice},row.id);
 };
 const updateStatus=(row:TeacherRow,status:'active'|'disabled'|'rejected')=>{
  if(!confirmAction(status==='disabled'?'Disable student access':status==='rejected'?'Reject student account':'Activate student account',row.name||short(row.id)))return;
  void run('changeStudentStatus',{status},row.id);
 };
 const archive=(row:TeacherRow)=>{
  if(!confirmAction('Archive batch',row.name||short(row.id)))return;
  void run('updateBatch',{isArchived:true},row.id);
 };
 return <div className="teacher-ops">
  <div className="teacher-ops-top"><div><span className="portal-kicker">TEACHER OPERATIONS</span><h2>{heading(mode)}</h2><p>{mode==='students'?'Edit student profiles and manage account access. Create student Auth accounts securely, then activate and enroll them.':mode==='batches'?'Create batches, adjust capacity and archive completed batches.':'Request membership and review pending enrollment decisions.'}</p></div>
   <div className="teacher-ops-buttons"><button className="portal-secondary" disabled={loading||saving} onClick={()=>setRefresh(x=>x+1)}>↻ Refresh</button>{mode==='batches'&&<button className="portal-primary" onClick={()=>begin('create')}>+ New batch</button>}{mode==='students'&&<><button className="portal-primary" onClick={()=>begin('onboard')}>+ Add student</button><button className="portal-secondary" onClick={()=>begin('invite')}>+ Invite student</button></>}{mode==='enrollments'&&<button className="portal-primary" onClick={()=>void beginEnrollment()}>+ Enrollment request</button>}</div>
  </div>
  <div className="teacher-ops-note" role="note">Active Teacher access is required. Account activation and enrollment approval are separate actions.</div>
  {notice&&<div className="portal-success" role="status">{notice}</div>}
  {error&&<div className="portal-alert" role="alert">{error}</div>}
  <div className="teacher-ops-filters"><label>Search current page<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={mode==='students'?'Search names or IDs':'Search by name, code or ID'}/></label>
    {mode!=='batches'&&<label>Status<select value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0);}}>{stateOptions[mode].map(s=><option key={s} value={s}>{s?roleLabel(s):'All statuses'}</option>)}</select></label>}
    <span className="teacher-ops-count">{items.length} records on this page</span>
  </div>
  {loading?<div className="portal-loading" role="status">Loading verified records…</div>:<>
   {listed.length===0?<div className="teacher-ops-empty"><span>◇</span><h3>{items.length?'No matching records':'No records yet'}</h3><p>{items.length?'Try another search or status.':mode==='students'?'Choose Add student to create a pending Auth account with email verification.':mode==='batches'?'Create the first batch using the form above.':'Create an enrollment request for an active student and available batch.'}</p></div>:
    <div className="teacher-ops-list">{listed.map(row=><article className="teacher-ops-row" key={row.id}>
      <div className="teacher-ops-row-top"><div className="teacher-ops-avatar">{(row.name||row.code||'E').slice(0,1).toUpperCase()}</div><div className="teacher-ops-row-name"><strong>{row.name||row.code||`Enrollment ${short(row.id)}`}</strong><small>{mode==='students'?`Student · ${short(row.id)}`:mode==='batches'?`${row.code} · ${row.capacity} seats`:`Student ${short(row.studentId||'')} · Batch ${short(row.batchId||'')}`}</small></div>
        <span className={'teacher-ops-pill '+((row.status==='active'||!row.archived&&mode==='batches')?'good':row.status==='rejected'||row.archived?'off':'wait')}>{mode==='batches'?(row.archived?'Archived':'Open'):roleLabel(row.status)}</span></div>
      <div className="teacher-ops-row-actions">
       {mode==='students'&&<><button className="portal-secondary" onClick={()=>setAdmissionStudent(row.id)}>Admission & full profile</button><button className="portal-secondary" disabled={saving} onClick={()=>begin('edit',row)}>Edit profile</button>{row.status==='pending'&&<><button className="portal-secondary" disabled={saving} onClick={()=>updateStatus(row,'active')}>Activate</button><button className="portal-secondary" disabled={saving} onClick={()=>updateStatus(row,'rejected')}>Reject</button></>}{row.status==='active'&&<button className="portal-secondary" disabled={saving} onClick={()=>updateStatus(row,'disabled')}>Disable access</button>}{row.status==='disabled'&&<button className="portal-secondary" disabled={saving} onClick={()=>updateStatus(row,'active')}>Reactivate</button>}</>}
       {mode==='batches'&&<><button className="portal-secondary" disabled={saving||!!row.archived} onClick={()=>begin('edit',row)}>Edit batch</button>{!row.archived&&<button className="portal-secondary teacher-ops-danger" disabled={saving} onClick={()=>archive(row)}>Archive</button>}</>}
       {mode==='enrollments'&&row.status==='pending'&&<><button className="portal-secondary" disabled={saving} onClick={()=>decision(row,'approve')}>Approve</button><button className="portal-secondary teacher-ops-danger" disabled={saving} onClick={()=>decision(row,'reject')}>Reject</button><button className="portal-secondary" disabled={saving} onClick={()=>decision(row,'cancel')}>Cancel</button></>}
      </div>
     </article>)}</div>}
   <div className="teacher-ops-pagination"><button className="portal-secondary" disabled={offset===0||loading||saving} onClick={()=>setOffset(n=>Math.max(0,n-20))}>← Previous</button><span>Page {offset/20+1}</span><button className="portal-secondary" disabled={items.length<20||loading||saving} onClick={()=>setOffset(n=>n+20)}>Next →</button></div>
  </>}
  {mode==='students'&&admissionStudent&&<StudentAdmissionProfile key={`${admissionStudent}:${refresh}`} role="teacher" studentId={admissionStudent} onAssignBatch={()=>void beginEnrollment(items.find(row=>row.id===admissionStudent))} onClose={()=>{setAdmissionStudent(null);setRefresh(value=>value+1);}}/>}
  {action&&<div className="teacher-ops-overlay"><div className="teacher-ops-modal" role="dialog" aria-modal="true" aria-labelledby="teacher-form-heading"><div className="teacher-ops-modal-head"><div><span className="portal-kicker">MANAGEMENT ACTION</span><h3 id="teacher-form-heading">{action==='create'?'Create a batch':action==='enroll'?'Request enrollment':action==='onboard'?'Add a student':action==='invite'?'Invite a student':mode==='students'?'Edit student name':'Edit batch'}</h3></div><button type="button" className="portal-secondary" aria-label="Close form" disabled={saving} onClick={()=>setAction(null)}>✕</button></div>
    {error&&<div className="portal-alert" role="alert">{error}</div>}
    <form className="teacher-ops-form" onSubmit={e=>void submitForm(e)}>
     {mode==='batches'&&action!=='enroll'&&<>{action==='create'&&<label>Batch code <small>2–24 uppercase letters, numbers, underscores or hyphens</small><input required minLength={2} maxLength={24} pattern="[A-Z0-9][A-Z0-9_-]{1,23}" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="MATH_2026"/></label>}<label>Batch name<input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="HSC Mathematics"/></label><label>Capacity<input required type="number" min={1} max={100000} step={1} value={capacity} onChange={e=>setCapacity(e.target.value)}/></label></>}
     {mode==='students'&&action==='invite'&&<><p className="portal-muted">Sends an invitation through the server Auth administrator. Public signup can remain disabled. The student confirms email and chooses their own password; Teacher approval and enrollment remain required.</p><label>Student name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label>Student email<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label></>}
     {mode==='students'&&action==='onboard'&&<><p className="portal-muted">Creates a <strong>pending student</strong> in Supabase Auth. The student must own this email address and confirm it. Share the initial password privately; never paste it into chat or public messages. The account cannot access student data until you activate and enroll it.</p><label>Student name<input autoComplete="name" required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Student full name"/></label><label>Student email<input type="email" autoComplete="off" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="student@example.org"/></label><label>Initial password <small>12–128 characters with uppercase, lowercase, number and symbol. Student should change it using Auth recovery after first login.</small><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={initialPassword} onChange={e=>setInitialPassword(e.target.value)}/></label></>}
     {mode==='students'&&action==='edit'&&<label>Student full name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>}
     {action==='enroll'&&<><p className="portal-muted">Choose an active student and an open batch from the first 20 records. To select others, use the directory and pagination in a later workflow.</p><label>Active student<select required value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Select student</option>{students.map(row=><option key={row.id} value={row.id}>{row.name||short(row.id)}</option>)}</select></label><label>Open batch<select required value={batchId} onChange={e=>setBatchId(e.target.value)}><option value="">Select batch</option>{batches.map(row=><option key={row.id} value={row.id}>{row.name} · {row.code}</option>)}</select></label>{(students.length===0||batches.length===0)&&<p className="portal-muted">You need at least one active student and an open batch to create an enrollment.</p>}</>}
     <div className="teacher-ops-form-actions"><button type="button" className="portal-secondary" disabled={saving} onClick={()=>setAction(null)}>Cancel</button><button type="submit" className="portal-primary" disabled={saving||(action==='enroll'&&(!studentId||!batchId))}>{saving?'Saving…':action==='onboard'?'Create pending student':action==='invite'?'Send invitation':'Save changes'}</button></div>
    </form></div></div>}
 </div>;
}
