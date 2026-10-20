import {admissionId} from './student-admission.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value,max,multiline=false)=>typeof value==='string'&&value.length<=max&&!(multiline?/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(value);
export const accountStamp=value=>value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)&&Number.isFinite(Date.parse(value));
export function validateTeacherAccount(value,id){
 if(!exact(value,['id','displayName','bio','phone','avatarMediaId','email','emailConfirmed','updatedAt'])||value.id!==id||!text(value.displayName,160)||!text(value.bio,1200,true)||!(value.phone===null||text(value.phone,20)&&value.phone.length>=7)||!(value.avatarMediaId===null||admissionId(value.avatarMediaId))||!text(value.email,254)||typeof value.emailConfirmed!=='boolean'||!accountStamp(value.updatedAt))throw Error('UPSTREAM_DATA_INVALID');return value;
}
export function validateTeacherAccountChanges(value){
 if(!exact(value,['displayName','bio','phone','avatarMediaId'])||!text(value.displayName,160)||value.displayName.trim().length<2||!text(value.bio,1200,true)||!(value.phone===null||text(value.phone,20)&&value.phone.trim().length>=7)||!(value.avatarMediaId===null||admissionId(value.avatarMediaId)))throw Error('INVALID_PROFILE');return {...value,displayName:value.displayName.trim(),phone:value.phone?.trim()??null};
}
