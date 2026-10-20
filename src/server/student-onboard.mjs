/** Strict teacher-initiated account creation body. Auth signup creates only a student/pending profile. */
export function signupFailure(status,payload){
 const code=payload?.code??payload?.error_code;
 if(code==='signup_disabled')return {status:403,code:'AUTH_SIGNUP_DISABLED'};
 if(code==='weak_password')return {status:400,code:'AUTH_WEAK_PASSWORD'};
 if(status===429||['over_email_send_rate_limit','over_request_rate_limit'].includes(code))return {status:429,code:'AUTH_RATE_LIMIT'};
 if(['email_exists','user_already_exists'].includes(code))return {status:409,code:'STUDENT_ALREADY_EXISTS_OR_UNCONFIRMED'};
 return {status:[400,422].includes(status)?409:503,code:[400,422].includes(status)?'STUDENT_SIGNUP_REJECTED':'AUTH_UNAVAILABLE'};
}
export function validStudentOnboard(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return false;
 if(Object.keys(input).sort().join(',')!=='email,fullName,initialPassword')return false;
 const {email,fullName,initialPassword}=input;
 return typeof email==='string'&&email.length>=6&&email.length<=254&&/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)&&
  typeof fullName==='string'&&fullName.trim().length>=2&&fullName.trim().length<=160&&fullName===fullName.trim()&&
  typeof initialPassword==='string'&&initialPassword.length>=12&&initialPassword.length<=128&&/[a-z]/.test(initialPassword)&&/[A-Z]/.test(initialPassword)&&/[0-9]/.test(initialPassword)&&/[^A-Za-z0-9]/.test(initialPassword);
}
export function validSignupResult(payload,email){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
 const user=payload.user&&typeof payload.user==='object'?payload.user:payload; // GoTrue REST returns direct user; supabase-js returns an envelope.
 return !!user&&typeof user==='object'&&typeof user.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)&&
 typeof user.email==='string'&&user.email.toLowerCase()===email.toLowerCase()&&Array.isArray(user.identities)&&user.identities.length>=1;
}
