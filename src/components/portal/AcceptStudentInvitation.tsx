'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
export function AcceptStudentInvitation(){
 const token=useRef(''),initialized=useRef(false),[available,setAvailable]=useState(false),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(initialized.current)return;initialized.current=true;
  const params=new URLSearchParams(window.location.hash.slice(1)),candidate=params.get('access_token')??'';
  // Erase all fragment credentials before loading any external resources.
  history.replaceState(null,'',window.location.pathname);
  if(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate)&&candidate.length<=8192){token.current=candidate;queueMicrotask(()=>setAvailable(true));}
 },[]);
 async function save(event:FormEvent){event.preventDefault();if(busy)return;if(password!==confirm){setError('The two passwords must match.');return;}setBusy(true);setError('');
  try{
   const response=await fetch('/api/portal/auth/accept-invite',{method:'POST',headers:{'Content-Type':'application/json','x-musa-ui':'1'},body:JSON.stringify({accessToken:token.current,password}),cache:'no-store'});
   const result=await response.json();if(!response.ok||result?.success!==true)throw Error(result?.error?.code==='INVITATION_EXPIRED'?'This invitation expired. Request a new invitation from your Teacher.':result?.error?.code==='PASSWORD_POLICY_REJECTED'?'Choose another password that meets the password policy.':'The password could not be saved. Try again when Auth is available.');
   token.current='';setAvailable(false);setPassword('');setConfirm('');setNotice(result.data.message);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <main className="portal-checking"><section className="portal-panel"><h1>Welcome to EduCentre</h1><p>Choose a password for your Student account.</p>{error&&<p role="alert">{error}</p>}{notice?<p role="status">{notice}</p>:available?<form className="studio-form" onSubmit={save}><label>New password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm password<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><p>Use 12–128 characters including uppercase, lowercase, a number and a symbol.</p><button disabled={busy} className="portal-primary">{busy?'Saving…':'Set my password'}</button></form>:<p>Open the complete invitation link from your email to set your password. Refreshing removes the invitation from this page for your privacy.</p>}<Link href="/portal">Go to sign in</Link></section></main>;
}
