export class AcademicError extends Error { constructor(code){super(code);this.name='AcademicError';this.code=code;} }
const fail=code=>{throw new AcademicError(code)};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const txt=(x,max=120)=>typeof x==='string'&&x.trim().length>=2&&x.trim().length<=max;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.includes(k));
function actorCheck(actor,teacher=false){if(!actor||actor.verified!==true||!uuid(actor.id)||!['student','teacher'].includes(actor.role))fail('UNAUTHENTICATED');if(teacher&&actor.role!=='teacher')fail('FORBIDDEN');}
function portCheck(port,key){if(!port||typeof port[key]!=='function')fail('PERSISTENCE_PORT_UNAVAILABLE')}
function pagination(query){if(!exact(query,['limit','offset']))fail('INVALID_QUERY');const limit=query.limit??20,offset=query.offset??0;if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)fail('INVALID_PAGINATION');return {limit,offset};}
export function validateSubject(input){if(!exact(input,['id','batchId','title','code'])||!uuid(input.id)||!uuid(input.batchId)||!txt(input.title)||typeof input.code!=='string'||!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(input.code))fail('INVALID_SUBJECT');return {...input,title:input.title.trim()};}
export function validateSyllabusUnit(input){if(!exact(input,['id','subjectId','title','position'])||!uuid(input.id)||!uuid(input.subjectId)||!txt(input.title,160)||!Number.isSafeInteger(input.position)||input.position<1||input.position>10000)fail('INVALID_SYLLABUS_UNIT');return {...input,title:input.title.trim()};}
export function validateExam(input){if(!exact(input,['id','batchId','subjectId','title','maxMarks','scheduledAt'])||!uuid(input.id)||!uuid(input.batchId)||!uuid(input.subjectId)||!txt(input.title)||!Number.isSafeInteger(input.maxMarks)||input.maxMarks<1||input.maxMarks>10000||!Number.isFinite(Date.parse(input.scheduledAt))||typeof input.scheduledAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(input.scheduledAt))fail('INVALID_EXAM');return {...input,title:input.title.trim(),status:'draft'};}
export function validateMark(mark,max){if(mark===null)return null;if(typeof mark!=='number'||!Number.isFinite(mark)||mark<0||mark>max||Math.round(mark*100)!==mark*100)fail('INVALID_MARK');return mark;}
export function rankPublishedResults(rows){if(!Array.isArray(rows)||rows.some(x=>!obj(x)||!uuid(x.studentId)||typeof x.marks!=='number'||!Number.isFinite(x.marks)||x.marks<0))fail('INVALID_RESULT_SET');const ids=new Set();for(const x of rows){if(ids.has(x.studentId))fail('DUPLICATE_RESULT');ids.add(x.studentId);}let position=0,previous=null,rank=0;return [...rows].sort((a,b)=>b.marks-a.marks||a.studentId.localeCompare(b.studentId)).map(row=>{position++;if(row.marks!==previous){rank=position;previous=row.marks;}return {studentId:row.studentId,marks:row.marks,rank};});}
// Auth claims must come ONLY from server-verified auth. Real DB adapter must independently
// enforce batch/subject linkage, active enrollment, visibility, row locks, atomic publish and audits.
export function createAcademicOperations(port){return Object.freeze({
 async createSubject(actor,input){actorCheck(actor,true);portCheck(port,'createSubjectAtomic');return port.createSubjectAtomic(actor,structuredClone(validateSubject(input)));},
 async createSyllabusUnit(actor,input){actorCheck(actor,true);portCheck(port,'createSyllabusUnitAtomic');return port.createSyllabusUnitAtomic(actor,structuredClone(validateSyllabusUnit(input)));},
 async listSubjects(actor,batchId,query={}){actorCheck(actor);if(!uuid(batchId))fail('INVALID_BATCH_ID');portCheck(port,'listSubjectsAuthorized');return port.listSubjectsAuthorized(actor,batchId,pagination(query));},
 async createExam(actor,input){actorCheck(actor,true);portCheck(port,'createExamAtomic');return port.createExamAtomic(actor,structuredClone(validateExam(input)));},
 async saveMarksDraft(actor,examId,results){actorCheck(actor,true);if(!uuid(examId)||!Array.isArray(results)||results.length>5000||results.some(r=>!exact(r,['studentId','marks'])||!uuid(r.studentId)))fail('INVALID_RESULT_SET');const ids=new Set();for(const r of results){if(ids.has(r.studentId))fail('DUPLICATE_RESULT');ids.add(r.studentId);if(r.marks!==null&&(typeof r.marks!=='number'||!Number.isFinite(r.marks)))fail('INVALID_MARK');}portCheck(port,'saveMarksDraftAtomic');return port.saveMarksDraftAtomic(actor,examId,structuredClone(results));},
 async publishExam(actor,examId){actorCheck(actor,true);if(!uuid(examId))fail('INVALID_EXAM_ID');portCheck(port,'publishExamAtomic');return port.publishExamAtomic(actor,examId);},
 async viewResults(actor,examId){actorCheck(actor);if(!uuid(examId))fail('INVALID_EXAM_ID');portCheck(port,'viewResultsAuthorized');return port.viewResultsAuthorized(actor,examId);},
});}
