import {admissionId} from './student-admission.mjs';
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
export function validateStudentDirectory(value){
 const fail=()=>{throw Error('UPSTREAM_DATA_INVALID');};
 if(!exact(value,['students','total','limit','offset','classes','metrics'])||!Array.isArray(value.students)||!Number.isSafeInteger(value.limit)||value.limit<1||value.limit>50||value.students.length>value.limit||!Number.isSafeInteger(value.offset)||value.offset<0||!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.classes)||value.classes.some(item=>!text(item,80))||!exact(value.metrics,['total','active','newAdmissions','pendingDues'])||Object.values(value.metrics).some(item=>!Number.isSafeInteger(item)||item<0))fail();
 const keys=['id','fullName','accountStatus','admissionRoll','admittedOn','phone','schoolName','className','stream','academicSession','photoMediaId','guardianName','guardianRelationship','guardianMobile','outstandingMinor','batches'];
 const seen=new Set();for(const row of value.students){
  if(!exact(row,keys)||!admissionId(row.id)||seen.has(row.id)||!text(row.fullName,160)||!['pending','active','disabled','rejected'].includes(row.accountStatus)||!(row.admissionRoll===null||/^EC-\d{4}-\d{8,}$/.test(row.admissionRoll))||!(row.admittedOn===null||/^\d{4}-\d{2}-\d{2}$/.test(row.admittedOn))||!(row.photoMediaId===null||admissionId(row.photoMediaId))||typeof row.outstandingMinor!=='string'||!/^\d+$/.test(row.outstandingMinor)||row.outstandingMinor.length>20||!Array.isArray(row.batches)||row.batches.length>2000)fail();
  for(const [key,max] of Object.entries({phone:30,schoolName:200,className:80,stream:80,academicSession:80,guardianName:160,guardianRelationship:80,guardianMobile:30}))if(!text(row[key],max))fail();
  for(const batch of row.batches)if(!exact(batch,['id','batchId','name','status'])||!admissionId(batch.id)||!admissionId(batch.batchId)||!text(batch.name,160)||!['pending','active','rejected','cancelled'].includes(batch.status))fail();
  seen.add(row.id);
 }
 return value;
}
