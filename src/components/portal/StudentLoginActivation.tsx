'use client';
import {useEffect,useState,type FormEvent} from 'react';
type LoginState={studentId:string;state:'none'|'reserved'|'invited'|'linked';email:string};
const labels:Record<LoginState['state'],string>={none:'No portal login (offline record)',reserved:'Email reserved, invitation not sent',invited:'Invitation sent, waiting for the Student to verify',linked:'Portal login active'};
const errors:Record<string,string>={
 EMAIL_ALREADY_REGISTERED:'This email already belongs to another account. Use an email the Student owns that is not registered yet.',
 EMAIL_ALREADY_RESERVED:'This email is already reserved for another Student.',
 STUDENT_ALREADY_HAS_LOGIN:'This Student already has a verified portal login.',
 LOGIN_EMAIL_MISMATCH:'An invitation was already sent to a different email. Ask the Student to use that invitation.',
 AUTH_RATE_LIMIT:'Too many invitation emails were sent recently. Try again later.',
 AUTH_ADMIN_NOT_CONFIGURED:'The server invitation credential is not configured.',
 MIGRATION_NOT_APPLIED:'Portal activation is not available until the database update is applied.'
};

/** Teacher-only: activates portal access for an existing Student without changing any of its records. */
export function StudentLoginActivation({studentId}:{studentId:string}){
 const [state,setState]=useState<LoginState|null>(null);const [email,setEmail]=useState('');const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');const [version,setVersion]=useState(0);const [operation,setOperation]=useState(()=>crypto.randomUUID());
 useEffect(()=>{let active=true;void fetch(`/api/v1/teacher/students/${studentId}/login`,{cache:'no-store',credentials:'same-origin'}).then(r=>r.json()).then(body=>{
  if(!active)return;if(body?.success){setState(body.data);setEmail(current=>current||body.data.email||'');}else setError(errors[body?.error?.code]??`Login status unavailable (${body?.error?.code??'error'}).`);
 }).catch(()=>{if(active)setError('Login status unavailable.');});return()=>{active=false;};},[studentId,version]);
 async function activate(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  if(!window.confirm(`Send a portal invitation to ${email.trim()}? The Student verifies this email and chooses a password. All existing records stay attached.`))return;
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch(`/api/v1/teacher/students/${studentId}/login`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':operation},body:JSON.stringify({email:email.trim().toLowerCase()})});
   const body=await response.json();
   if(!response.ok||!body?.success)throw Error(errors[body?.error?.code]??`Activation failed (${body?.error?.code??response.status}).`);
   setNotice('Invitation sent. The Student keeps the same record, batches, payments and results after signing in.');setOperation(crypto.randomUUID());setVersion(v=>v+1);
  }catch(e){setError((e as Error).message);setOperation(crypto.randomUUID());}finally{setBusy(false);}
 }
 return <fieldset className="studio-expansion" aria-label="Portal login">
  <legend>Portal login</legend>
  {state?<p><strong>{labels[state.state]}</strong>{state.email&&<> · {state.email}</>}</p>:!error&&<p role="status">Checking portal login…</p>}
  {error&&<p className="portal-alert" role="alert">{error}</p>}{notice&&<p className="portal-success" role="status">{notice}</p>}
  {state&&state.state!=='linked'&&<form className="studio-form" onSubmit={event=>void activate(event)}>
   <label>Student email<input type="email" required maxLength={254} autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
   <p className="studio-hint">Only use an email the Student owns. Access starts after the Student verifies it.</p>
   <div className="studio-actions"><button type="submit" className="portal-primary" disabled={busy||!email.trim()}>{busy?'Sending…':state.state==='invited'?'Resend invitation':'Activate portal login'}</button></div>
  </form>}
 </fieldset>;
}
