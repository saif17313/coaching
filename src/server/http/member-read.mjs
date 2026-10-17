/** Framework-free, independently tested authenticated read gateway for core tables. */
import { BoundaryError } from './protected-read.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const CONFIG=Object.freeze({
  'student-batches':{role:'student',many:true,resource:null},
  'student-batch':{role:'student',many:false,resource:'batchId'},
  'teacher-enrollments':{role:'teacher',many:true,resource:null},
  'teacher-student':{role:'teacher',many:false,resource:'studentId'},
  'teacher-batch':{role:'teacher',many:false,resource:'batchId'},
});
const denied=(status,code)=>{throw new BoundaryError(status,code);};
const isId=x=>typeof x==='string'&&UUID.test(x);
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
const boundedText=(x,max,empty=false)=>typeof x==='string'&&x.length<=max&&(empty||x.trim().length>0)&&!/[\x00-\x1f\x7f]/.test(x);
const ts=x=>typeof x==='string'&&x.length>=20&&x.length<=40&&Number.isFinite(Date.parse(x));
const entry=x=>{if(!exact(x,['id','role','full_name'])||!isId(x.id)||x.role!=='student'||!boundedText(x.full_name,160,true))denied(502,'UPSTREAM_DATA_INVALID');return {...x};};
const batch=x=>{if(!exact(x,['id','code','name','capacity','is_archived'])||!isId(x.id)||!boundedText(x.code,32)||!(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/).test(x.code)||!boundedText(x.name,160)||!Number.isSafeInteger(x.capacity)||x.capacity<1||typeof x.is_archived!=='boolean')denied(502,'UPSTREAM_DATA_INVALID');return {...x};};
const enrollment=x=>{if(!exact(x,['id','student_id','batch_id','status','requested_at','decided_at'])||!isId(x.id)||!isId(x.student_id)||!isId(x.batch_id)||!['pending','active','rejected','cancelled'].includes(x.status)||!ts(x.requested_at)||(x.status==='pending'?x.decided_at!==null:!ts(x.decided_at)))denied(502,'UPSTREAM_DATA_INVALID');return {...x};};
const json=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
function query(url,kind){
  const params=new URL(url).searchParams;
  const list=CONFIG[kind].many, allow=list?(kind==='teacher-enrollments'?['limit','offset','status']:['limit','offset']):[];
  for(const key of params.keys())if(!allow.includes(key)||params.getAll(key).length!==1)denied(400,'INVALID_QUERY');
  if(!list)return {limit:2,offset:0,filter:null};
  const l=params.get('limit')??'20',o=params.get('offset')??'0',filter=params.get('status');
  if(!/^[1-9][0-9]*$/.test(l)||!/^(0|[1-9][0-9]*)$/.test(o)||Number(l)>20||Number(o)>10000||!Number.isSafeInteger(Number(l))||!Number.isSafeInteger(Number(o)))denied(400,'INVALID_QUERY');
  if(filter!==null&&!['pending','active','rejected','cancelled'].includes(filter))denied(400,'INVALID_QUERY');
  return {limit:Number(l),offset:Number(o),filter};
}
function authorization(headers){
  const raw=headers.get('authorization'),match=raw&&/^Bearer ([^\s,]+)$/.exec(raw);
  if(!match||match[1].length>8192||!TOKEN.test(match[1]))denied(401,'UNAUTHORIZED');
  return match[1];
}
function rows(value,max){if(!Array.isArray(value)||value.length>max)denied(502,'UPSTREAM_DATA_INVALID');return value;}
async function resource(ctx,name){
  const params=await ctx?.params;
  if(!params||typeof params!=='object'||Array.isArray(params)||!isId(params[name]))denied(400,'INVALID_RESOURCE_ID');
  return params[name];
}
function uniqueEntries(items,key='id'){
  const seen=new Set();for(const x of items){if(seen.has(x[key]))denied(502,'UPSTREAM_DATA_INVALID');seen.add(x[key]);}return items;
}
export function createMemberReadEndpoint(kind,{verify,readRows}={}){
  if(!Object.hasOwn(CONFIG,kind)||typeof verify!=='function'||typeof readRows!=='function')throw new Error('INVALID_MEMBER_READ_PORT');
  const cfg=CONFIG[kind];
  return async function GET(request,context={}){
    try{
      if(!(request instanceof Request)||request.method!=='GET')denied(405,'METHOD_NOT_ALLOWED');
      const q=query(request.url,kind),id=cfg.resource?await resource(context,cfg.resource):null;
      const token=authorization(request.headers);
      const actor=await verify(token);
      if(!actor||actor.verified!==true||!isId(actor.userId)||actor.accessToken!==token||actor.accountStatus!=='active'||!['student','teacher'].includes(actor.role))denied(401,'UNAUTHORIZED');
      if(actor.role!==cfg.role)denied(403,'FORBIDDEN');
      const read=(table,params)=>readRows(table,token,params);
      let data;
      if(kind==='teacher-student'){
        const p=rows(await read('profiles',{select:'id,role,full_name',id:`eq.${id}`,limit:'2'}),2);
        if(p.length===0)denied(404,'NOT_FOUND');if(p.length!==1)denied(502,'UPSTREAM_DATA_INVALID');
        data=entry(p[0]);if(data.id!==id)denied(502,'UPSTREAM_DATA_INVALID');
      }else if(kind==='teacher-batch'){
        const b=rows(await read('batches',{select:'id,code,name,capacity,is_archived',id:`eq.${id}`,limit:'2'}),2);
        if(b.length===0)denied(404,'NOT_FOUND');if(b.length!==1)denied(502,'UPSTREAM_DATA_INVALID');
        data=batch(b[0]);if(data.id!==id)denied(502,'UPSTREAM_DATA_INVALID');
      }else if(kind==='teacher-enrollments'){
        const p={select:'id,student_id,batch_id,status,requested_at,decided_at',limit:String(q.limit),offset:String(q.offset),order:'requested_at.desc'};
        if(q.filter)p.status=`eq.${q.filter}`;
        data=uniqueEntries(rows(await read('enrollments',p),q.limit).map(enrollment));
        if(q.filter&&data.some(e=>e.status!==q.filter))denied(502,'UPSTREAM_DATA_INVALID');
      }else{
        const p={select:'id,student_id,batch_id,status,requested_at,decided_at',student_id:`eq.${actor.userId}`,status:'eq.active',limit:kind==='student-batch'?'2':String(q.limit),offset:kind==='student-batch'?undefined:String(q.offset),order:'requested_at.desc'};
        if(id){p.batch_id=`eq.${id}`;delete p.offset;}
        const es=uniqueEntries(rows(await read('enrollments',p),kind==='student-batch'?2:q.limit).map(enrollment));
        if(es.some(e=>e.student_id!==actor.userId||e.status!=='active'||(id&&e.batch_id!==id)))denied(502,'UPSTREAM_DATA_INVALID');
        uniqueEntries(es,'batch_id');
        if(id&&es.length===0)denied(404,'NOT_FOUND');
        if(id&&es.length!==1)denied(502,'UPSTREAM_DATA_INVALID');
        const fetched=await Promise.all(es.map(async e=>{
          const value=rows(await read('batches',{select:'id,code,name,capacity,is_archived',id:`eq.${e.batch_id}`,limit:'2'}),2);
          if(value.length!==1)denied(502,'UPSTREAM_DATA_INVALID');
          const b=batch(value[0]);if(b.id!==e.batch_id)denied(502,'UPSTREAM_DATA_INVALID');
          return {...b,enrollment_id:e.id};
        }));
        data=kind==='student-batch'?fetched[0]:fetched;
      }
      return json(200,{success:true,data});
    }catch(error){
      if(error instanceof BoundaryError)return json(error.status,{success:false,error:{code:error.code}});
      return json(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});
    }
  };
}
