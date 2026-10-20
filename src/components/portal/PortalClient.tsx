'use client';
import './portal-accessibility.css';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {TeacherAnnouncements} from './TeacherAnnouncements';
import {TeacherManagement} from './TeacherManagement';
import {WebsiteAdminStudio} from './WebsiteAdminStudio';
import {TeacherAcademicStudio} from './TeacherAcademicStudio';
import {TeacherFinanceStudio} from './TeacherFinanceStudio';
import {StudentExperience} from './StudentExperience';
import {WEBSITE_MENU,getWebsiteTarget} from '@/client/reference-website-nav.mjs';

type Role='teacher'|'student';
type User={role:Role;userId:string};
type PageDescriptor={id:string;label:string;category:string;path?:string;batch?:boolean};
const teacherPages:PageDescriptor[]=[
 {id:'overview',label:'Overview',category:'Workspace',path:'/api/v1/teacher/overview'},
 {id:'students',label:'Students',category:'Management',path:'/api/v1/teacher/students'},
 {id:'batches',label:'Batches',category:'Management',path:'/api/v1/teacher/batches'},
 {id:'enrollments',label:'Enrollments',category:'Management',path:'/api/v1/teacher/enrollments'},
 {id:'subjects',label:'Subjects',category:'Academics',path:'/api/v1/teacher/batches/{batch}/subjects',batch:true},
 {id:'syllabus',label:'Syllabus',category:'Academics',batch:true},
 {id:'routine',label:'Routine',category:'Academics',path:'/api/v1/teacher/batches/{batch}/routine',batch:true},
 {id:'assignments',label:'Assignments',category:'Academics',path:'/api/v1/teacher/batches/{batch}/assignments',batch:true},
 {id:'exams',label:'Examinations',category:'Academics',path:'/api/v1/teacher/batches/{batch}/exams',batch:true},
 {id:'results',label:'Results',category:'Academics',batch:true},
 {id:'materials',label:'Study materials',category:'Academics',path:'/api/v1/teacher/batches/{batch}/materials',batch:true},
 {id:'announcements',label:'Announcements',category:'Academics',path:'/api/v1/teacher/batches/{batch}/announcements',batch:true},
 {id:'finance',label:'Cashflow & reports',category:'Operations',batch:true},
 {id:'plans',label:'Fee plans',category:'Operations',batch:true},
 {id:'dues',label:'Student dues',category:'Operations',batch:true},
 {id:'expenses',label:'Expenses',category:'Operations',batch:true},
 {id:'website',label:'Website CMS',category:'Website'},
 {id:'audit',label:'Audit log',category:'Account',path:'/api/v1/teacher/audit-logs'},
];
const studentPages:PageDescriptor[]=[
 {id:'dashboard',label:'My dashboard',category:'Workspace',path:'/api/v1/student/dashboard'},
 {id:'batches',label:'My batches',category:'Learning',path:'/api/v1/student/batches'},
 {id:'subjects',label:'Subjects & syllabus',category:'Learning',batch:true},
 {id:'assignments',label:'Assignments',category:'Learning',path:'/api/v1/student/batches/{batch}/assignments',batch:true},
 {id:'exams',label:'Exams',category:'Learning',path:'/api/v1/student/batches/{batch}/exams',batch:true},
 {id:'routine',label:'Routine',category:'Learning',path:'/api/v1/student/batches/{batch}/routine',batch:true},
 {id:'calendar',label:'Calendar',category:'Learning'},
 {id:'materials',label:'Materials',category:'Learning',path:'/api/v1/student/batches/{batch}/materials',batch:true},
 {id:'announcements',label:'Announcements',category:'Learning',path:'/api/v1/student/batches/{batch}/announcements',batch:true},
 {id:'results',label:'Results',category:'Progress',path:'/api/v1/student/results'},
 {id:'progress',label:'My progress',category:'Progress',path:'/api/v1/student/progress'},
 {id:'notifications',label:'Notifications',category:'Account',path:'/api/v1/student/notifications'},
 {id:'billing',label:'Billing statement',category:'Account',path:'/api/v1/student/billing'},
 {id:'dues',label:'My dues',category:'Account'},
 {id:'payments',label:'My payments',category:'Account'},
 {id:'profile',label:'My profile',category:'Account',path:'/api/v1/student/profile'},
];
function dataError(json:unknown,status:number):string{
 if(json&&typeof json==='object'&&!Array.isArray(json)){
  const e=Reflect.get(json,'error');const code=e&&typeof e==='object'?Reflect.get(e,'code'):null;
  if(status===401 && code!=='INVALID_CREDENTIALS')return 'Your session has expired. Please sign in again.';
  if(typeof code==='string')return code.replaceAll('_',' ').toLowerCase();
 }
 if(status===401)return 'Your session has expired. Please sign in again.';
 if(status===403)return 'This account does not have access.';
 return `Request failed (HTTP ${status}).`;
}
async function api(path:string,options:RequestInit={}){
 const method=options.method||'GET';
 const res=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',headers:{...(method!=='GET'?{'x-musa-ui':'1'}:{}),...(options.headers||{})}});
 const type=res.headers.get('content-type')||'';
 const json:unknown=type.includes('application/json')?await res.json():null;
 if(!res.ok)throw new Error(dataError(json,res.status));
 if(!json||typeof json!=='object'||Reflect.get(json,'success')!==true)throw new Error('Unexpected server response.');
 return Reflect.get(json,'data') as unknown;
}
async function change(path:string,body:unknown,method='POST'){
 return api(path,{method,headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});
}
function obj(x:unknown):Record<string,unknown>{return x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};}
function printable(value:unknown):string{
 if(value===null||value===undefined)return '—';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(typeof value==='string')return value.length>140?value.slice(0,137)+'…':value;
 if(typeof value==='number')return new Intl.NumberFormat('en-BD').format(value);
 if(Array.isArray(value))return `${value.length} entries`;
 if(typeof value==='object')return 'View details';return String(value);
}
function label(key:string){return key.replace(/([A-Z])/g,' $1').replace(/[_-]/g,' ').replace(/^./,v=>v.toUpperCase()).replace(/Minor$/,'(minor units)');}
function valueRows(data:unknown):Record<string,unknown>[]|null{
 if(Array.isArray(data))return data.filter(x=>x&&typeof x==='object'&&!Array.isArray(x));
 const d=obj(data);for(const k of ['items','rows','batches','students','enrollments','results','notifications','assignments','exams','materials','events','upcoming'])if(Array.isArray(d[k]))return (d[k] as unknown[]).filter(x=>x&&typeof x==='object'&&!Array.isArray(x)) as Record<string,unknown>[];
 return null;
}
function DataTable({data}:{data:unknown}){
 const rows=valueRows(data);const [expanded,setExpanded]=useState<string|null>(null);
 if(rows){
  if(rows.length===0)return <div className="portal-empty"><span>◎</span><h3>No records yet</h3><p>Nothing has been returned for this section.</p></div>;
  const keys=Object.keys(rows[0]).filter(k=>!['studentId','teacherId','ownerId'].includes(k)).slice(0,7);
  return <div className="portal-table-scroll"><table className="portal-table"><thead><tr>{keys.map(k=><th key={k}>{label(k)}</th>)}<th>Details</th></tr></thead><tbody>{rows.map((item,i)=><tr key={String(item.id||i)}>{keys.map(k=><td key={k} title={typeof item[k]==='string'?String(item[k]):undefined}>{printable(item[k])}</td>)}<td><button className="portal-text-button" onClick={()=>setExpanded(expanded===String(i)?null:String(i))} aria-expanded={expanded===String(i)}> {expanded===String(i)?'Hide':'View'} </button>{expanded===String(i)&&<div className="portal-row-detail">{Object.entries(item).map(([key,value])=><div key={key}><b>{label(key)}</b><span>{typeof value==='object'?JSON.stringify(value):printable(value)}</span></div>)}</div>}</td></tr>)}</tbody></table></div>;
 }
 if(!data||typeof data!=='object')return <div className="portal-empty">No details are available.</div>;
 return <div className="portal-metric-grid">{Object.entries(obj(data)).slice(0,18).map(([key,value])=><div className="portal-metric" key={key}><small>{label(key)}</small>{typeof value==='object'&&value!==null?<div className="portal-metric-nested">{Object.entries(obj(value)).slice(0,10).map(([k,v])=><div key={k}><span>{label(k)}</span><b>{printable(v)}</b></div>)}</div>:<strong>{printable(value)}</strong>}</div>)}</div>;
}
function SignIn({onLogin}:{onLogin:(user:User)=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const x=obj(await api('/api/portal/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}));if((x.role!=='teacher'&&x.role!=='student')||typeof x.userId!=='string')throw Error('Invalid session response');setPassword('');onLogin({role:x.role,userId:x.userId});}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 return <div className="portal-login-screen"><div className="portal-login-wrap"><div className="portal-login-aside"><Link href="/" className="portal-brand"><span className="portal-brand-mark">E</span><span>EduCentre<small>LEARNING STUDIO</small></span></Link><div className="portal-login-aside-content"><span className="portal-kicker">YOUR LEARNING SPACE</span><h1>Everything you need to move forward.</h1><p>One thoughtful workspace for teaching, learning and staying connected.</p><div className="portal-login-art"><span>✦</span><strong>Make room for progress.</strong><small>Learn · Grow · Achieve</small></div></div><small>Secure access. Real information. One connected experience.</small></div><div className="portal-login-form-panel"><div className="portal-login-mobile-brand">EduCentre · Learning Studio</div><span className="portal-kicker">WELCOME BACK</span><h2>Sign in to your portal</h2><p>Use your existing coaching account credentials.</p><form onSubmit={submit} className="portal-form"><label htmlFor="musa-email">Email address</label><input id="musa-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} placeholder="you@example.com"/><label htmlFor="musa-password">Password</label><input id="musa-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Your password"/>{error&&<div className="portal-alert" role="alert">{error}</div>}<button type="submit" className="portal-primary" disabled={busy}>{busy?'Verifying account…':'Sign in securely'} <span>↗</span></button></form><p className="portal-form-note">Only active teacher and student accounts can sign in. We do not store your password in the browser.</p><Link href="/" className="portal-back">← Back to website</Link></div></div></div>;
}
export function PortalClient(){
 const [user,setUser]=useState<User|null>(null),[checking,setChecking]=useState(true),[tab,setTab]=useState(''),[batch,setBatch]=useState(''),[batches,setBatches]=useState<{id:string;name:string}[]>([]),[period,setPeriod]=useState(()=>new Date().toISOString().slice(0,7)),[offset,setOffset]=useState(0),[data,setData]=useState<unknown>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState(false),[refresh,setRefresh]=useState(0),[name,setName]=useState(''),[saved,setSaved]=useState(''),[cmsTarget,setCmsTarget]=useState<{slug:string|null;kind:string|null;match:string|null;label:string;tab:'content'|'media'|'settings';requestId:number}>({slug:'home',kind:null,match:null,label:'Website Overview',tab:'content',requestId:0});
 useEffect(()=>{api('/api/portal/auth/session').then(x=>{const v=obj(x);if((v.role==='teacher'||v.role==='student')&&typeof v.userId==='string'){setUser({role:v.role,userId:v.userId});setTab(v.role==='teacher'?'overview':'dashboard');}}).catch(()=>{}).finally(()=>setChecking(false));},[]);
 const pages=user?.role==='teacher'?teacherPages:studentPages;
 const active=pages.find(x=>x.id===tab)||pages[0];
 const isCms=active?.id==='website';
 const isStudentExperience=user?.role==='student';
 const isTeacherManagement=user?.role==='teacher'&&(['students','batches','enrollments'].includes(active?.id||''));
 const isTeacherAcademic=user?.role==='teacher'&&(['subjects','syllabus','routine','assignments','exams','results'].includes(active?.id||''));
 const isTeacherNotice=user?.role==='teacher'&&active?.id==='announcements';
 const isTeacherFinance=user?.role==='teacher'&&(['finance','plans','dues','expenses'].includes(active?.id||''));
 const path=useMemo(()=>{
  if(!active||!active.path)return null;
  if(active.batch&&!batch)return null;
  const base=active.path.replace('{batch}',encodeURIComponent(batch));
  if(active.id==='billing'||active.id==='finance')return base+`?billPeriod=${encodeURIComponent(period)}`;
  if(['students','batches','enrollments','notifications','audit'].includes(active.id))return base+`?limit=20&offset=${offset}`;
  return base;
 },[active,batch,period,offset]);
 useEffect(()=>{if(!user)return;const root=`/api/v1/${user.role}/batches`;api(root+'?limit=20&offset=0').then(x=>{const list=valueRows(x)||[];setBatches(list.map(v=>({id:String(v.id||v.batchId||''),name:String(v.name||v.code||v.title||'Batch')})).filter(v=>/^[0-9a-f-]{36}$/i.test(v.id)));}).catch(()=>{});},[user]);
 useEffect(()=>{if(!user||!path||isCms||isStudentExperience||isTeacherManagement||isTeacherAcademic||isTeacherFinance||isTeacherNotice){return;}let ignore=false;Promise.resolve().then(()=>{if(!ignore){setBusy(true);setError('');setData(null);}});api(path).then(x=>{if(!ignore){setData(x);if(active.id==='profile')setName(String(obj(x).fullName||''));}}).catch(e=>{if(!ignore){setError(e.message);if(e.message.includes('session has expired')){setUser(null);}}}).finally(()=>{if(!ignore)setBusy(false);});return()=>{ignore=true;};},[user,path,active,isCms,isStudentExperience,isTeacherManagement,isTeacherAcademic,isTeacherFinance,isTeacherNotice,refresh]);
 async function logout(){try{await api('/api/portal/auth/logout',{method:'POST'});}catch{}setUser(null);setData(null);setTab('');setBatch('');}
 const changeTab=(id:string)=>{setTab(id);setOffset(0);setError('');setSaved('');setMenu(false);};
 const navigateWebsite=(id:string)=>{const target=getWebsiteTarget(id);if(!target)return;setCmsTarget(prev=>({...target,requestId:prev.requestId+1}));changeTab('website');};
 if(checking)return <div className="portal-checking"><div className="portal-spinner"/><p>Preparing your secure workspace…</p></div>;
 if(!user)return <SignIn onLogin={u=>{setUser(u);setTab(u.role==='teacher'?'overview':'dashboard');}}/>;
 const groups=[...new Set(pages.map(x=>x.category))];
 return <div className="portal-shell"><aside className={'portal-sidebar '+(menu?'portal-sidebar-open':'')}><Link href="/" className="portal-brand"><span className="portal-brand-mark">E</span><span>EduCentre<small>LEARNING STUDIO</small></span></Link><div className="portal-nav-scroll">{isCms&&user.role==='teacher'?<nav aria-label="Website administration" className="musa-cms-sidebar-nav"><div className="musa-cms-sidebar-heading">WEBSITE CONTENT <small>Shifat&apos;s Tales menu structure</small></div>{WEBSITE_MENU.map((group,i)=><details className="musa-cms-nav-group" key={group.title} open={i<2?true:undefined}><summary>{group.title}<span aria-hidden="true">⌄</span></summary><div className="musa-cms-nav-children">{group.items.map(target=><button type="button" key={target.id} onClick={()=>navigateWebsite(target.id)} className={'musa-cms-nav-shortcut '+(cmsTarget.label===target.label&&cmsTarget.slug===target.slug?'selected':'')} title={target.parity==='partial'?'Opens closest existing CMS editor; dedicated reference field mapping is not yet complete.':'Open secured CMS editor'} aria-current={cmsTarget.label===target.label&&cmsTarget.slug===target.slug?'page':undefined}><span className="musa-cms-nav-dot" aria-hidden="true">◦</span>{target.label}{target.parity==='partial'&&<span className="musa-cms-nav-partial" aria-label="Some reference fields are not yet mapped">◐</span>}</button>)}</div></details>)}</nav>:groups.map(group=><div className="portal-nav-group" key={group}><div className="portal-nav-label">{group}</div>{pages.filter(x=>x.category===group).map(x=><button onClick={()=>changeTab(x.id)} key={x.id} className={'portal-nav-link '+(tab===x.id?'selected':'')} aria-current={tab===x.id?'page':undefined}><span className="portal-nav-glyph" aria-hidden="true">{x.id==='website'?'✦':x.id==='overview'||x.id==='dashboard'?'◈':x.id==='students'||x.id==='profile'?'◎':x.id==='batches'?'▦':x.id==='billing'||x.id==='finance'?'◉':'◇'}</span>{x.label}{tab===x.id&&<span className="portal-nav-indicator"/>}</button>)}</div>)}</div><div className="portal-sidebar-foot"><span className="portal-user-avatar">{user.role==='teacher'?'T':'S'}</span><div><strong>{user.role==='teacher'?'Teacher account':'Student account'}</strong><small>Authenticated · Active</small></div><button onClick={logout} title="Sign out" aria-label="Sign out" className="portal-signout">↗</button></div></aside>
  {menu&&<button className="portal-mobile-backdrop" aria-label="Close menu" onClick={()=>setMenu(false)}/>}
  <div className="portal-workspace"><header className="portal-topbar"><div className="portal-top-left"><button className="portal-menu-trigger" onClick={()=>setMenu(!menu)} aria-label="Open navigation" aria-expanded={menu}>☰</button><div><span className="portal-top-eyebrow">{isCms?'WEBSITE ADMIN':user.role==='teacher'?'TEACHER WORKSPACE':'STUDENT WORKSPACE'}</span><strong>{isCms?cmsTarget.label:active?.label||'Portal'}</strong></div></div><div className="portal-top-actions">{user.role==='teacher'&&<div className="portal-workspace-switch" role="group" aria-label="Switch teacher workspace"><button type="button" aria-pressed={tab!=='website'} className={tab!=='website'?'is-active':''} onClick={()=>changeTab('overview')}>Teacher Portal</button><button type="button" aria-pressed={tab==='website'} className={tab==='website'?'is-active':''} onClick={()=>navigateWebsite('website-overview-all-published-pages')}>Website Admin</button></div>}<span className="portal-online"><i/> Connected securely</span><Link href="/" target="_blank" className="portal-site-link">Public website ↗</Link><button className="portal-mobile-logout" onClick={logout}>Sign out</button></div></header>
   <main className="portal-main"><div className="portal-heading"><div><span className="portal-kicker">{user.role==='teacher'?'MANAGE WITH CLARITY':'YOUR SPACE TO GROW'}</span><h1>{isCms?cmsTarget.label:active?.label||'Dashboard'}</h1><p>{isCms?'Manage published website content through verified CMS APIs.':'Live information from your coaching account. No sample records or demo statistics.'}</p></div>{!isCms&&!isStudentExperience&&<button className="portal-secondary" onClick={()=>setRefresh(x=>x+1)} disabled={busy}>↻ Refresh</button>}</div>
    {!isCms&&<div className="portal-toolbar">{active?.batch&&<label>Selected batch<select value={batch} onChange={e=>{setBatch(e.target.value);setOffset(0);}}><option value="">Choose a batch</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}{(active?.id==='billing'||active?.id==='finance'||active?.id==='plans'||active?.id==='dues'||active?.id==='expenses')&&<label>Billing period<input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/></label>}{active?.id==='billing'&&<a className="portal-secondary" download href={`/api/v1/student/billing/export?billPeriod=${encodeURIComponent(period)}`}>Export CSV ↓</a>}{active?.batch&&batches.length===0&&<p className="portal-muted">No batches returned. Check enrollment or permissions.</p>}</div>}
    {isStudentExperience?<StudentExperience key={(active?.id||'dashboard')+':'+batch} mode={(active?.id||'dashboard') as 'dashboard'|'batches'|'subjects'|'routine'|'assignments'|'exams'|'materials'|'announcements'|'results'|'progress'|'notifications'|'billing'|'dues'|'payments'|'profile'|'calendar'} batchId={batch} batchName={batches.find(b=>b.id===batch)?.name||''} billPeriod={period} onNavigate={changeTab} onSelectBatch={setBatch}/>:isCms?<WebsiteAdminStudio target={cmsTarget}/>:isTeacherManagement?<TeacherManagement key={active?.id||'students'} mode={(active?.id||'students') as 'students'|'batches'|'enrollments'}/>:isTeacherAcademic&&batch?<TeacherAcademicStudio key={(active?.id||'subjects')+batch} mode={(active?.id||'subjects') as 'subjects'|'syllabus'|'routine'|'assignments'|'exams'|'results'} batchId={batch} onNavigate={changeTab}/>:isTeacherNotice&&batch?<TeacherAnnouncements key={batch} batchId={batch}/>:isTeacherFinance&&batch?<TeacherFinanceStudio key={(active?.id||'finance')+batch} mode={(active?.id||'finance') as 'finance'|'plans'|'dues'|'expenses'} batchId={batch} billPeriod={period} onNavigate={changeTab}/>:!path?<div className="portal-panel portal-empty"><span>▦</span><h3>Select a batch</h3><p>Choose a batch above to load its real academic or financial records.</p></div>:<section className="portal-panel portal-data-panel" aria-live="polite">{busy?<div className="portal-loading"><div className="portal-spinner"/><span>Loading secure data…</span></div>:error?<div className="portal-alert" role="alert">{error}{error.includes('service unavailable')&&<p>Check your local database and API configuration. Write APIs also require an independently verified activation flag.</p>}</div>:<DataTable key={path} data={data}/>}
    {!isStudentExperience&&!busy&&!error&&data!==null&&data!==undefined&&['students','batches','enrollments','notifications','audit'].includes(tab)&&<div className="portal-pagination"><button disabled={offset===0} onClick={()=>setOffset(x=>Math.max(0,x-20))}>← Previous</button><span>Showing offset {offset}</span><button disabled={(valueRows(data)||[]).length<20} onClick={()=>setOffset(x=>x+20)}>Next →</button></div>}
    {tab==='profile'&&user.role==='student'&&!busy&&!error&&<form className="portal-profile-edit" onSubmit={e=>{e.preventDefault();setSaved('');change('/api/v1/student/profile/update',{fullName:name},'PATCH').then(()=>{setSaved('Profile saved');setRefresh(x=>x+1);}).catch(e=>setSaved(e.message));}}><h3>Update my name</h3><label>Full name<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={160} required/></label><button type="submit" className="portal-primary">Save profile</button>{saved&&<p role="status">{saved}</p>}</form>}</section>}
    <div className="portal-footnote">EduCentre · Secure Coaching Workspace <span>Content and permissions are provided by your existing backend.</span></div>
   </main></div></div>;
}
