'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {managementRead} from '@/client/management-api';
import './dashboard-analytics.css';

export type PerformanceExam={id:string;subject:string;title:string;scheduledAt:string;maxMarks:number;examType:string;upcoming:boolean;participation:'upcoming'|'attempted'|'absent'|'not_recorded';marks:number|null};
const TYPE_LABEL:Record<string,string>={class_test:'class test',weekly:'weekly exam',monthly:'monthly exam',model_test:'model test',assignment:'assignment',final:'final exam'};
const short=(iso:string)=>new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short'});

function Trend({points}:{points:{exam:PerformanceExam;percent:number}[]}){
 const host=useRef<HTMLDivElement>(null),[width,setWidth]=useState(520),[active,setActive]=useState<number|null>(null);
 useEffect(()=>{const element=host.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(260,Math.round(entry.contentRect.width))));observer.observe(element);return()=>observer.disconnect();},[]);
 const height=200,pad={top:14,right:14,bottom:26,left:38},w=width-pad.left-pad.right,h=height-pad.top-pad.bottom;
 const x=(i:number)=>pad.left+(points.length===1?w/2:i/(points.length-1)*w),y=(v:number)=>pad.top+h*(1-v/100);
 const path=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(' ');
 const area=`${path} L${x(points.length-1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
 const tip=active===null?null:points[active];
 return <div className="spc-trend" ref={host} onMouseLeave={()=>setActive(null)}>
  <svg width={width} height={height} role="img" aria-label={`Score trend across ${points.length} published exams, from ${points[0].percent.toFixed(0)}% to ${points.at(-1)!.percent.toFixed(0)}%. A table follows.`}>
   <defs><linearGradient id="spc-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0a8f7e" stopOpacity=".22"/><stop offset="1" stopColor="#0a8f7e" stopOpacity="0"/></linearGradient></defs>
   {[0,25,50,75,100].map(v=><g key={v}><line x1={pad.left} x2={width-pad.right} y1={y(v)} y2={y(v)} className={v===0?'baseline':'grid'}/><text x={pad.left-8} y={y(v)} dy=".32em" textAnchor="end">{v}%</text></g>)}
   {points.length>1&&<path d={area} fill="url(#spc-fill)"/>}
   {points.length>1&&<path d={path} className="spc-line"/>}
   {points.map((p,i)=><g key={p.exam.id}><circle cx={x(i)} cy={y(p.percent)} r={active===i?6:4.5} className="spc-dot"/>
    <rect x={x(i)-Math.max(12,w/points.length/2)} y={pad.top} width={Math.max(24,w/points.length)} height={h} className="spc-hit" tabIndex={0} role="button" aria-label={`${p.exam.title}, ${p.exam.subject}, ${short(p.exam.scheduledAt)}: ${p.exam.marks} of ${p.exam.maxMarks}, ${p.percent.toFixed(1)}%`} onMouseEnter={()=>setActive(i)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)}/>
    {(points.length<=8||i%Math.ceil(points.length/8)===0)&&<text x={x(i)} y={height-8} textAnchor="middle" className="xlabel">{short(p.exam.scheduledAt)}</text>}</g>)}
  </svg>
  {tip&&<div className="spc-tip" style={{left:Math.min(Math.max(x(active!),90),width-90),top:Math.max(0,y(tip.percent)-78)}} role="status"><strong>{tip.exam.title}</strong><span>{tip.exam.subject}</span><b>{tip.exam.marks}/{tip.exam.maxMarks} · {tip.percent.toFixed(1)}%</b></div>}
 </div>;
}

/** Charts over the Student's own published results only (never drafts); "not recorded" is never treated as absent. */
export function StudentPerformanceCharts({exams,compact=false}:{exams:PerformanceExam[];compact?:boolean}){
 const view=useMemo(()=>{
  const graded=exams.filter(x=>x.participation==='attempted'&&x.marks!==null&&x.maxMarks>0).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)).map(exam=>({exam,percent:Number(exam.marks)/exam.maxMarks*100}));
  const subjects=[...graded.reduce((map,p)=>map.set(p.exam.subject,[...(map.get(p.exam.subject)??[]),p.percent]),new Map<string,number[]>())].map(([subject,list])=>({subject,average:list.reduce((a,b)=>a+b,0)/list.length,count:list.length})).sort((a,b)=>b.average-a.average);
  const last=graded.at(-1),previous=last?[...graded].reverse().find(p=>p!==last&&p.exam.subject===last.exam.subject&&p.exam.examType===last.exam.examType):undefined;
  const past=exams.filter(x=>!x.upcoming);
  return {graded,subjects,last,previous,attempted:past.filter(x=>x.participation==='attempted').length,absent:past.filter(x=>x.participation==='absent').length,awaiting:past.filter(x=>x.participation==='not_recorded').length};
 },[exams]);
 if(!view.graded.length&&!view.absent)return <div className="dash-empty">Your charts appear here once your teacher publishes your first exam result.</div>;
 const change=view.last&&view.previous?view.last.percent-view.previous.percent:null,participation=view.attempted+view.absent+view.awaiting;
 return <section className={'spc'+(compact?' is-compact':'')} aria-label="My performance charts">
  <article className="dash-card spc-trend-card"><div className="dash-card-head"><h4>Score trend</h4><small>Each exam as % of its total marks</small></div>
   {view.graded.length?<Trend points={view.graded}/>:<p className="dash-empty">No published scores yet.</p>}
   {change!==null&&<p className={'spc-change '+(change>=0?'up':'down')}><b>{change>=0?'▲':'▼'} {Math.abs(change).toFixed(1)} points</b> in your latest {view.last!.exam.subject} {TYPE_LABEL[view.last!.exam.examType]??'exam'} compared with the previous one.</p>}
   {view.graded.length>0&&view.graded.length<3&&<p className="spc-note">A trend becomes meaningful after a few more published exams.</p>}
   {!compact&&view.graded.length>0&&<details className="finance-trend-table"><summary>View as table</summary><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Date</th><th>Exam</th><th>Subject</th><th>Marks</th><th>%</th></tr></thead><tbody>{view.graded.map(p=><tr key={p.exam.id}><td>{short(p.exam.scheduledAt)}</td><td>{p.exam.title}</td><td>{p.exam.subject}</td><td>{p.exam.marks}/{p.exam.maxMarks}</td><td>{p.percent.toFixed(1)}%</td></tr>)}</tbody></table></div></details>}
  </article>
  <article className="dash-card"><div className="dash-card-head"><h4>By subject</h4><small>Average %</small></div>
   {view.subjects.length?<ul className="dash-bars spc-subjects">{view.subjects.map(s=><li key={s.subject}><span className="dash-bar-label"><strong>{s.subject}</strong><small>{s.average.toFixed(1)}% · {s.count} exam{s.count===1?'':'s'}</small></span><span className="dash-track"><span style={{width:`${s.average}%`}}/></span></li>)}</ul>:<p className="dash-empty">No subject scores yet.</p>}
  </article>
  <article className="dash-card"><div className="dash-card-head"><h4>Participation</h4><small>Held exams</small></div>
   {participation?<><div className="dash-stack" role="img" aria-label={`${view.attempted} attempted, ${view.absent} absent, ${view.awaiting} awaiting result`}>{view.attempted>0&&<span style={{flexGrow:view.attempted,background:'#0a8f7e'}}/>}{view.absent>0&&<span style={{flexGrow:view.absent,background:'#c0392b'}}/>}{view.awaiting>0&&<span style={{flexGrow:view.awaiting,background:'#b8860b'}}/>}</div>
    <ul className="dash-legend is-inline"><li><i style={{background:'#0a8f7e'}} aria-hidden="true"/><span>Attempted</span><b>{view.attempted}</b></li><li><i style={{background:'#c0392b'}} aria-hidden="true"/><span>Absent</span><b>{view.absent}</b></li><li><i style={{background:'#b8860b'}} aria-hidden="true"/><span>Awaiting result</span><b>{view.awaiting}</b></li></ul>
    <p className="spc-note">“Awaiting result” means your teacher has not published marks yet — it is not counted as absent.</p></>:<p className="dash-empty">No exams have been held yet.</p>}
  </article>
 </section>;
}

/** Self-loading compact panel for the Student dashboard. */
export function StudentProgressPanel(){
 const [exams,setExams]=useState<PerformanceExam[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;managementRead<{exams:PerformanceExam[]}>('exam-history',{},'student').then(d=>{if(active)setExams(d.exams);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 return <section className="spc-panel" aria-labelledby="spc-panel-title"><div className="dash-analytics-head"><div><span className="portal-kicker">MY PROGRESS</span><h3 id="spc-panel-title">How my results are going</h3></div><a className="portal-secondary" href="/api/v1/student/reports/progress" target="_blank" rel="noopener">Progress report PDF ↗</a></div>
  {error?<p className="premium-error" role="alert">{error}</p>:!exams?<div className="portal-loading" role="status">Loading your progress…</div>:<StudentPerformanceCharts exams={exams} compact/>}</section>;
}
