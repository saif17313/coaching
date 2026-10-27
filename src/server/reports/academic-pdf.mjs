import 'regenerator-runtime/runtime.js';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const TYPES={class_test:'Class test',weekly:'Weekly exam',monthly:'Monthly exam',model_test:'Model test',assignment:'Assignment',final:'Final exam'};
const PARTICIPATION={attempted:'Attempted',absent:'Absent',not_recorded:'Not recorded',upcoming:'Upcoming'};
const dhaka=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dhaka'}).format(new Date(value));
const today=()=>new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'Asia/Dhaka'}).format(new Date());
export const letterGrade=percent=>percent>=80?'A+':percent>=70?'A':percent>=60?'A-':percent>=50?'B':percent>=40?'C':percent>=33?'D':'F';

async function document(title){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(await readFile(join(process.cwd(),'public/fonts/NotoSansBengali.ttf')),{subset:true});
 const logo=await doc.embedPng(await readFile(join(process.cwd(),'public/brand/icon-192.png')));
 doc.setTitle(title);doc.setAuthor('EduCentre');doc.setCreationDate(new Date());
 const ink=rgb(.08,.19,.24),teal=rgb(.02,.40,.38),muted=rgb(.34,.42,.46),rule=rgb(.86,.92,.92),band=rgb(.95,.98,.97);
 const state={page:null,y:0};
 const fresh=()=>{state.page=doc.addPage([595.28,841.89]);state.y=780;state.page.drawRectangle({x:0,y:825,width:595.28,height:17,color:teal});
  state.page.drawText('EduCentre · Academic report · Generated '+today(),{x:44,y:30,size:7,font,color:muted});};
 const fit=(text,size,width)=>{let t=String(text??'');while(t.length>1&&font.widthOfTextAtSize(t,size)>width)t=t.slice(0,-2)+'…';return t;};
 const line=(text,size=10,color=ink,x=44)=>{if(state.y<70)fresh();state.page.drawText(fit(text,size,595-x-44),{x,y:state.y,size,font,color});state.y-=size+9;};
 const header=(heading,sub)=>{fresh();state.page.drawImage(logo,{x:487,y:742,width:60,height:60});line('EduCentre',24,teal);line('ACADEMIC CARE · STUDENT SUCCESS',8,muted);state.y-=10;line(heading,17);if(sub)line(sub,9,muted);state.y-=6;};
 const facts=pairs=>{for(const [label,value] of pairs){if(state.y<70)fresh();state.page.drawText(label,{x:44,y:state.y,size:8,font,color:muted});state.page.drawText(fit(value,10,380),{x:170,y:state.y,size:10,font,color:ink});state.y-=17;}state.y-=6;};
 const table=(columns,rows)=>{
  const head=()=>{if(state.y<110)fresh();state.page.drawRectangle({x:40,y:state.y-5,width:515,height:19,color:band});let x=44;for(const c of columns){state.page.drawText(c.label,{x,y:state.y,size:8,font,color:teal});x+=c.width;}state.y-=22;};
  head();
  for(const row of rows){if(state.y<70){fresh();head();}let x=44;row.forEach((cell,i)=>{state.page.drawText(fit(cell,9,columns[i].width-6),{x,y:state.y,size:9,font,color:ink});x+=columns[i].width;});
   state.page.drawLine({start:{x:40,y:state.y-6},end:{x:555,y:state.y-6},thickness:.5,color:rule});state.y-=19;}
  state.y-=8;
 };
 return {doc,line,header,facts,table,state,muted,teal};
}

/** Teacher exam result sheet: one row per enrolled Student with attendance, marks, grade and rank. */
export async function examSheetPdf(sheet){
 const e=sheet.exam,{doc,line,header,facts,table,muted}=await document('Result sheet: '+e.title);
 header('EXAM RESULT SHEET',e.lifecycle==='result_published'?'Published results':'Draft — not yet published to Students');
 facts([['Examination',e.title],['Type',TYPES[e.examType]??'Exam'],['Batch',`${e.batchName} (${e.batchCode})`],['Subject',e.subject],['Date',dhaka(e.scheduledAt)+(e.durationMinutes?` · ${e.durationMinutes} minutes`:'')],
  ['Marks',`Total ${e.maxMarks}${e.passMarks!==null?` · Pass ${e.passMarks}`:''}`]]);
 const attempted=sheet.rows.filter(r=>r.participation==='attempted'&&r.marks!==null),marks=attempted.map(r=>Number(r.marks));
 const passed=e.passMarks===null?null:marks.filter(m=>m>=e.passMarks).length;
 facts([['Attempted',String(attempted.length)],['Absent',String(sheet.rows.filter(r=>r.participation==='absent').length)],['Not recorded',String(sheet.rows.filter(r=>r.participation==='not_recorded').length)],
  ['Average',marks.length?(marks.reduce((a,b)=>a+b,0)/marks.length).toFixed(2):'—'],['Highest / lowest',marks.length?`${Math.max(...marks)} / ${Math.min(...marks)}`:'—'],['Pass rate',passed===null||!marks.length?'—':`${Math.round(passed/marks.length*100)}% (${passed}/${marks.length})`]]);
 const ordered=[...sheet.rows].sort((a,b)=>(a.rank??9999)-(b.rank??9999)||a.fullName.localeCompare(b.fullName));
 table([{label:'RANK',width:42},{label:'STUDENT',width:150},{label:'ROLL',width:95},{label:'ATTENDANCE',width:72},{label:'MARKS',width:52},{label:'%',width:40},{label:'GRADE',width:40},{label:'REMARKS',width:24}],
  ordered.map(r=>{const p=r.marks!==null?Number(r.marks)/e.maxMarks*100:null;return [r.rank?String(r.rank):'—',r.fullName,r.admissionRoll??'—',PARTICIPATION[r.participation]??r.participation,r.marks!==null?String(Number(r.marks)):'—',p===null?'—':p.toFixed(1),p===null?'—':letterGrade(p),r.remarks?'✓':''];}));
 const remarks=ordered.filter(r=>r.remarks);if(remarks.length){line('Remarks',11);for(const r of remarks)line(`${r.fullName}: ${r.remarks}`,9,muted);}
 line('"Not recorded" means no result was entered; it is never counted as absent or zero.',8,muted);
 return Buffer.from(await doc.save());
}

/** Student progress report from published academic records only. */
export async function progressReportPdf({student,exams}){
 const {doc,line,header,facts,table,muted}=await document('Progress report: '+student.fullName);
 header('STUDENT PROGRESS REPORT','Published examination results');
 const past=exams.filter(x=>!x.upcoming),attempted=past.filter(x=>x.participation==='attempted'&&x.marks!==null),percents=attempted.map(x=>Number(x.marks)/x.maxMarks*100);
 const avg=percents.length?percents.reduce((a,b)=>a+b,0)/percents.length:null;
 facts([['Student',student.fullName],['Admission roll',student.admissionRoll||'—'],['Batches',[...new Set(exams.map(x=>x.batchName))].join(', ')||'—'],['Report date',today()]]);
 facts([['Exams attempted',String(attempted.length)],['Absent',String(past.filter(x=>x.participation==='absent').length)],['Awaiting result',String(past.filter(x=>x.participation==='not_recorded').length)],
  ['Average score',avg===null?'—':`${avg.toFixed(1)}% (${letterGrade(avg)})`],['Best score',percents.length?`${Math.max(...percents).toFixed(1)}%`:'—']]);
 const bySubject=new Map();for(const x of attempted){const list=bySubject.get(x.subject)??[];list.push(Number(x.marks)/x.maxMarks*100);bySubject.set(x.subject,list);}
 if(bySubject.size){line('Subject summary',11);table([{label:'SUBJECT',width:220},{label:'EXAMS',width:70},{label:'AVERAGE',width:90},{label:'GRADE',width:135}],
  [...bySubject].map(([subject,list])=>{const a=list.reduce((x,y)=>x+y,0)/list.length;return [subject,String(list.length),a.toFixed(1)+'%',letterGrade(a)];}));}
 line('Examination history',11);
 table([{label:'DATE',width:70},{label:'EXAM',width:150},{label:'SUBJECT',width:90},{label:'STATUS',width:70},{label:'MARKS',width:60},{label:'GRADE',width:40},{label:'RANK',width:35}],
  past.map(x=>{const p=x.marks!==null?Number(x.marks)/x.maxMarks*100:null;return [new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeZone:'Asia/Dhaka'}).format(new Date(x.scheduledAt)),x.title,x.subject,PARTICIPATION[x.participation]??'',x.marks!==null?`${Number(x.marks)}/${x.maxMarks}`:'—',p===null?'—':letterGrade(p),x.rank?String(x.rank):'—'];}));
 line('Only results your teacher has published are included. Grades: A+ ≥80%, A ≥70%, A- ≥60%, B ≥50%, C ≥40%, D ≥33%.',8,muted);
 return Buffer.from(await doc.save());
}
