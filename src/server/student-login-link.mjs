/** Offline admission and later login activation: pure validation and error mapping. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid=value=>typeof value==='string'&&UUID.test(value);

export function validOfflineStudent(input){
 return !!input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).join(',')==='fullName'
  &&typeof input.fullName==='string'&&input.fullName.trim().length>=2&&input.fullName.length<=160&&!/[\x00-\x1f\x7f]/.test(input.fullName);
}

export function validLoginEmail(input){
 return !!input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).join(',')==='email'
  &&typeof input.email==='string'&&input.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim());
}

const RPC_CODES={
 FORBIDDEN:[403,'FORBIDDEN'],INVALID_STUDENT:[400,'INVALID_STUDENT'],INVALID_LOGIN_LINK:[400,'INVALID_LOGIN_EMAIL'],
 IDEMPOTENCY_CONFLICT:[409,'IDEMPOTENCY_CONFLICT'],STUDENT_NOT_FOUND:[404,'STUDENT_NOT_FOUND'],
 STUDENT_ALREADY_HAS_LOGIN:[409,'STUDENT_ALREADY_HAS_LOGIN'],EMAIL_ALREADY_REGISTERED:[409,'EMAIL_ALREADY_REGISTERED'],EMAIL_ALREADY_RESERVED:[409,'EMAIL_ALREADY_RESERVED']
};
/** Maps a PostgREST RPC error body to a safe status/code; unknown errors never leak details. */
export function rpcFailure(status,body){
 const message=body&&typeof body==='object'?String(Reflect.get(body,'message')??''):'';
 const known=RPC_CODES[message];
 if(known)return {status:known[0],code:known[1]};
 if(status===401)return {status:401,code:'UNAUTHORIZED'};
 if(status===404&&/function/i.test(message))return {status:503,code:'MIGRATION_NOT_APPLIED'};
 return {status:503,code:'WRITE_SERVICE_UNAVAILABLE'};
}

/** The Auth user must carry exactly the permanent Student id and the reserved email. */
export function validLinkedAuthUser(user,studentId,email){
 return !!user&&typeof user==='object'&&user.id===studentId&&typeof user.email==='string'&&user.email.toLowerCase()===email.toLowerCase();
}
