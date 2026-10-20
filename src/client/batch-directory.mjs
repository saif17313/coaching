import {admissionId} from './student-admission.mjs';
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
export function validateBatchDirectory(value){
 const fail=()=>{throw Error('UPSTREAM_DATA_INVALID');};
 if(!exact(value,['batches','total','limit','offset','classes','sessions','metrics'])||!Array.isArray(value.batches)||!count(value.total)||!count(value.offset)||!count(value.limit)||value.limit<1||value.limit>50||value.batches.length>value.limit||!Array.isArray(value.classes)||value.classes.some(item=>!text(item,80))||!Array.isArray(value.sessions)||value.sessions.some(item=>!text(item,80))||!exact(value.metrics,['activeBatches','activeEnrollments','availableSeats','upcomingStarts'])||Object.values(value.metrics).some(item=>!count(item)))fail();
 const seen=new Set();for(const batch of value.batches){
  if(!exact(batch,['id','code','name','capacity','isArchived','startsOn','endsOn','status','enrolled','pending','availableSeats','subjects','routine','classes','sessions'])||!admissionId(batch.id)||seen.has(batch.id)||!text(batch.code,32)||!text(batch.name,160)||!count(batch.capacity)||batch.capacity<1||!count(batch.enrolled)||batch.enrolled>batch.capacity||!count(batch.pending)||!count(batch.availableSeats)||batch.availableSeats!==Math.max(0,batch.capacity-batch.enrolled)||typeof batch.isArchived!=='boolean'||!['open','upcoming','archived'].includes(batch.status)||['startsOn','endsOn'].some(key=>!(batch[key]===null||/^\d{4}-\d{2}-\d{2}$/.test(batch[key])))||!Array.isArray(batch.subjects)||batch.subjects.some(item=>!text(item,120))||!Array.isArray(batch.classes)||batch.classes.some(item=>!text(item,80))||!Array.isArray(batch.sessions)||batch.sessions.some(item=>!text(item,80))||!Array.isArray(batch.routine)||batch.routine.length>2000)fail();
  for(const slot of batch.routine)if(!exact(slot,['id','dayOfWeek','startMinute','endMinute','room','subject'])||!admissionId(slot.id)||!count(slot.dayOfWeek)||slot.dayOfWeek>6||!count(slot.startMinute)||!count(slot.endMinute)||slot.endMinute<=slot.startMinute||slot.endMinute>1440||!text(slot.room,100)||!text(slot.subject,120))fail();
  seen.add(batch.id);
 }
 return value;
}
