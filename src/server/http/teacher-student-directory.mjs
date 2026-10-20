import {validateBatchDirectory} from '../../client/batch-directory.mjs';
import {validateStudentDirectory} from '../../client/student-directory.mjs';
import {RpcError} from './rpc-errors.mjs';
const fail=(code,status)=>{throw new RpcError(code,status);};
function directoryRoute(kind,{verify,call}){
 const students=kind==='students';
 return async request=>{try{
  if(request.method!=='GET')fail('METHOD_NOT_ALLOWED',405);
  const query=new URL(request.url).searchParams;
  for(const key of query.keys())if(!(students?['q','accountStatus','className','feeStatus','limit','offset']:['q','status','className','session','limit','offset']).includes(key)||query.getAll(key).length!==1)fail('INVALID_FILTER',400);
  const q=query.get('q')??'',status=query.get(students?'accountStatus':'status')??'',className=query.get('className')??'',fee=query.get(students?'feeStatus':'session')??'',limit=query.get('limit')??'20',offset=query.get('offset')??'0';
  if(q.length>100||/[\x00-\x1f\x7f]/.test(q+className)||className.length>80||!(students?['','pending','active','disabled','rejected']:['','open','upcoming','archived']).includes(status)||(students?!['','paid','pending'].includes(fee):fee.length>80)||!/^[1-9]\d*$/.test(limit)||Number(limit)>50||!/^(0|[1-9]\d*)$/.test(offset)||Number(offset)>100000)fail('INVALID_FILTER',400);
  const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token||token.length>8192)fail('UNAUTHORIZED',401);
  const actor=await verify(token);if(!actor?.verified||actor.role!=='teacher'||actor.accountStatus!=='active'||actor.accessToken!==token)fail('FORBIDDEN',403);
  const raw=await call(students?'coaching_teacher_student_directory':'coaching_teacher_batch_directory',token,{p_search:q.trim(),p_status:status,p_class:className,...(students?{p_fee_status:fee}:{p_session:fee}),p_limit:Number(limit),p_offset:Number(offset)});
  let data;try{data=(students?validateStudentDirectory:validateBatchDirectory)(raw);}catch{fail('UPSTREAM_DATA_INVALID',502);}
  if(data.limit!==Number(limit)||data.offset!==Number(offset))fail('UPSTREAM_DATA_INVALID',502);
  return Response.json({success:true,data},{headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
 }catch(error){const status=error.status??error.httpStatus;return Response.json({success:false,error:{code:[400,401,403,405,502,503].includes(status)?error.code??error.publicCode:'DIRECTORY_SERVICE_UNAVAILABLE'}},{status:[400,401,403,405,502,503].includes(status)?status:503,headers:{'Cache-Control':'no-store'}});}};
}

export const createTeacherStudentDirectory=ports=>directoryRoute('students',ports);
export const createTeacherBatchDirectory=ports=>directoryRoute('batches',ports);
