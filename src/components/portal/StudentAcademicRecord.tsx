'use client';
import {useEffect,useMemo,useState} from 'react';
import {managementRead} from '@/client/management-api';
import {EXAM_TYPES,grade} from './TeacherAcademicPlanner';
import {StudentPerformanceCharts} from './StudentPerformanceCharts';

type Exam={id:string;batchId:string;batchName:string;subject:string;title:string;scheduledAt:string;maxMarks:number;passMarks:number|null;examType:keyof typeof EXAM_TYPES;durationMinutes:number|null;instructions:string;coverage:string[];upcoming:boolean;resultPublished:boolean;participation:'upcoming'|'attempted'|'absent'|'not_recorded';marks:number|null;rank:number|null;remarks:string;participants:number|null};
const PARTICIPATION:Record<Exam['participation'],{label:string;tone:string}>={upcoming:{label:'Upcoming',tone:'info'},attempted:{label:'Attempted',tone:'active'},absent:{label:'Absent',tone:'rejected'},not_recorded:{label:'Result not published yet',tone:'pending'}};

/** Student exam schedule and published results, distinguishing absent from not-yet-recorded. */
export function StudentExamHistory({batchId}:{batchId?:string}){
 const [exams,setExams]=useState<Exam[]|null>(null),[error,setError]=useState(''),[filter,setFilter]=useState('');
 useEffect(()=>{let active=true;managementRead<{exams:Exam[]}>('exam-history',{},'student').then(d=>{if(active)setExams(d.exams);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 const list=useMemo(()=>(exams??[]).filter(x=>(!batchId||x.batchId===batchId)&&(!filter||x.participation===filter)),[exams,batchId,filter]);
 const graded=list.filter(x=>x.participation==='attempted'&&x.marks!==null),percents=graded.map(x=>Number(x.marks)/x.maxMarks*100);
 const average=percents.length?Math.round(percents.reduce((a,b)=>a+b,0)/percents.length):null,best=percents.length?Math.round(Math.max(...percents)):null;
 if(error)return <div className="portal-alert" role="alert">{error}</div>;
 if(!exams)return <div className="portal-loading"><div className="portal-spinner"/>Loading your exams…</div>;
 return <section className="mgmt-student-exams" aria-label="My examinations">
  <div className="student-metric-grid"><div className="student-metric"><span>Average score</span><strong>{average===null?'—':average+'%'}</strong></div><div className="student-metric"><span>Best score</span><strong>{best===null?'—':best+'%'}</strong></div>
   <div className="student-metric"><span>Attempted</span><strong>{list.filter(x=>x.participation==='attempted').length}</strong></div><div className="student-metric"><span>Absent</span><strong>{list.filter(x=>x.participation==='absent').length}</strong></div><div className="student-metric"><span>Upcoming</span><strong>{list.filter(x=>x.upcoming).length}</strong></div></div>
  <StudentPerformanceCharts exams={(exams??[]).filter(x=>!batchId||x.batchId===batchId)}/>
  <div className="student-controls"><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All exams</option><option value="upcoming">Upcoming</option><option value="attempted">Attempted</option><option value="absent">Absent</option><option value="not_recorded">Awaiting result</option></select></label><a className="portal-secondary" href="/api/v1/student/reports/progress" target="_blank" rel="noopener">Download progress report (PDF) ↗</a></div>
  {list.length===0?<p className="portal-muted">No examinations to show.</p>:<div className="student-grid">{list.map(x=>{const percent=x.marks!==null?Number(x.marks)/x.maxMarks*100:null;return <article key={x.id} className="student-record mgmt-exam-card">
   <span className="premium-badge" data-status={PARTICIPATION[x.participation].tone}>{PARTICIPATION[x.participation].label}</span>
   <h4>{x.title}</h4><p>{EXAM_TYPES[x.examType]??'Exam'} · {x.subject} · {x.batchName}</p>
   <p>{new Date(x.scheduledAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}{x.durationMinutes?` · ${x.durationMinutes} min`:''}</p>
   <small>Total {x.maxMarks}{x.passMarks!==null?` · pass ${x.passMarks}`:''}</small>
   {x.participation==='attempted'&&x.marks!==null&&<div className="mgmt-score"><strong>{x.marks}/{x.maxMarks}</strong><span>{percent!.toFixed(1)}% · {grade(percent!)}{x.passMarks!==null?(Number(x.marks)>=x.passMarks?' · Passed':' · Below pass mark'):''}</span>{x.rank&&<span>Rank {x.rank}{x.participants?` of ${x.participants}`:''}</span>}</div>}
   {x.participation==='absent'&&<p className="mgmt-hint">You were recorded absent for this exam.</p>}
   {x.remarks&&<p className="mgmt-hint">Teacher&apos;s remarks: {x.remarks}</p>}
   {x.upcoming&&(x.coverage.length>0||x.instructions)&&<details><summary>Exam syllabus</summary>{x.coverage.length>0&&<ul>{x.coverage.map(c=><li key={c}>{c}</li>)}</ul>}{x.instructions&&<p>{x.instructions}</p>}</details>}
  </article>;})}</div>}
 </section>;
}
