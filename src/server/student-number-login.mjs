import {authAdminHeaders} from './auth-admin-headers.mjs';
export const isStudentNumber=value=>typeof value==='string'&&/^[1-9][0-9]{9}$/.test(value);

/** Resolve an ID on the server; the browser never receives the underlying email. */
export async function resolveStudentLoginEmail(identifier,{root,adminKey,fetchImpl=globalThis.fetch}){
 if(!isStudentNumber(identifier))throw Error('INVALID_CREDENTIALS');
 const headers=authAdminHeaders(adminKey);
 if(!headers)throw Error('AUTH_UNAVAILABLE');
 const response=await fetchImpl(new URL('/rest/v1/rpc/coaching_resolve_student_login',root),{
  method:'POST',headers,body:JSON.stringify({p_student_number:identifier}),
  cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
 });
 if(!response.ok)throw Error('AUTH_UNAVAILABLE');
 const email=await response.json();
 if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('INVALID_CREDENTIALS');
 return email;
}
