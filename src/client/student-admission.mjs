export const admissionFields=Object.freeze({fullName:160,phone:30,dateOfBirth:10,photoMediaId:36,schoolName:200,className:80,stream:80,academicSession:80,presentAddress:1000,district:100,guardianName:160,relationship:80,guardianMobile:30,emergencyContact:160,admittedOn:10,admissionDueId:36});
export const selfAdmissionFields=Object.freeze(['fullName','phone','dateOfBirth','presentAddress','district']);
export const admissionId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function validateAdmissionChanges(data,role){
 if(!plain(data)||!Object.keys(data).length)throw Error('INVALID_ADMISSION');
 for(const [key,value] of Object.entries(data)){
  if(!Object.hasOwn(admissionFields,key)||(role!=='teacher'&&!selfAdmissionFields.includes(key))||value!==null&&(typeof value!=='string'||value.length>admissionFields[key]||/[\x00-\x1f\x7f]/.test(value)))throw Error('INVALID_ADMISSION');
  if(['photoMediaId','admissionDueId'].includes(key)&&value&&!admissionId(value))throw Error('INVALID_ADMISSION');
  if(['dateOfBirth','admittedOn'].includes(key)&&value){const date=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value||value<(key==='dateOfBirth'?'1900-01-01':'2000-01-01')||key==='dateOfBirth'&&value>new Date().toISOString().slice(0,10))throw Error('INVALID_ADMISSION');}
 }
 if(Object.hasOwn(data,'fullName')&&(typeof data.fullName!=='string'||data.fullName.trim().length<2))throw Error('INVALID_ADMISSION');
 return {...data,...(Object.hasOwn(data,'fullName')?{fullName:data.fullName.trim()}:{})};
}
export function validateAdmissionProfile(value,id,role){
 const keys=['id','fullName','email','accountStatus','revision','admissionRoll','admittedOn','personal','guardian','admissionDueId','enrollments','feePlans'];
 const exact=(v,fields)=>plain(v)&&Object.keys(v).length===fields.length&&fields.every(key=>Object.hasOwn(v,key));
 const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
 if(!exact(value,keys)||value.id!==id||!text(value.fullName,160)||!text(value.email,254)||!['pending','active','disabled','rejected'].includes(value.accountStatus)||!Number.isSafeInteger(value.revision)||value.revision<0||!(value.admissionRoll===null||/^EC-\d{4}-\d{8,}$/.test(value.admissionRoll))||!(value.admittedOn===null||/^\d{4}-\d{2}-\d{2}$/.test(value.admittedOn)))throw Error('UPSTREAM_DATA_INVALID');
 const personal=['phone','dateOfBirth','photoMediaId','schoolName','className','stream','academicSession','presentAddress','district'];
 const guardian=['fullName','relationship','mobile',...(role==='teacher'?['emergencyContact']:[])];
 if(!exact(value.personal,personal)||!exact(value.guardian,guardian)||!guardian.every(key=>text(value.guardian[key],160)))throw Error('UPSTREAM_DATA_INVALID');
 for(const key of personal){const v=value.personal[key];if(key==='photoMediaId'?!(v===null||admissionId(v)):key==='dateOfBirth'?!(v===null||/^\d{4}-\d{2}-\d{2}$/.test(v)):!text(v,admissionFields[key]))throw Error('UPSTREAM_DATA_INVALID');}
 if(!(value.admissionDueId===null||role==='teacher'&&admissionId(value.admissionDueId))||!Array.isArray(value.enrollments)||value.enrollments.length>2000||!Array.isArray(value.feePlans)||value.feePlans.length>2000)throw Error('UPSTREAM_DATA_INVALID');
 for(const e of value.enrollments)if(!exact(e,['id','batchId','batchName','status'])||!admissionId(e.id)||!admissionId(e.batchId)||!text(e.batchName,160)||!['pending','active','rejected','cancelled'].includes(e.status))throw Error('UPSTREAM_DATA_INVALID');
 for(const f of value.feePlans)if(!exact(f,['id','batchId','billPeriod','amountMinor','currency','label'])||!admissionId(f.id)||!admissionId(f.batchId)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.billPeriod)||!Number.isSafeInteger(f.amountMinor)||f.amountMinor<1||f.currency!=='BDT'||!text(f.label,120))throw Error('UPSTREAM_DATA_INVALID');
 return value;
}
