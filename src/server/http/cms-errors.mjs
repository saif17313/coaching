/** Public CMS errors are an allowlist. Never return Postgres details, hints or SQL. */
const conflicts = new Set(['ALREADY_PUBLISHED','REVISION_CONFLICT','IDEMPOTENCY_CONFLICT','SECTION_KEY_CONFLICT','DUPLICATE_SECTION_ORDER','DUPLICATE_ITEM_ORDER','MEDIA_PUBLIC_IN_USE','MEDIA_DRAFT_IN_USE','MEDIA_ALREADY_ARCHIVED','CMS_SECTION_LIMIT','CMS_ITEM_LIMIT','CMS_SNAPSHOT_LIMIT','REVISION_LIMIT','SETTINGS_DRAFT_EMPTY','MEDIA_NOT_VERIFIED','MEDIA_STORAGE_NOT_VERIFIED']);
const invalid = new Set(['INVALID_PRESENTATION','INVALID_CONTENT_ORDER','INVALID_CMS_SETTINGS','INVALID_CMS_SETTINGS_COMMAND','INVALID_SETTINGS_PUBLISH','INVALID_CMS_COMMAND','INVALID_TYPED_CONTENT','INVALID_CONTENT_REFERENCE','SECTION_KEY_REQUIRED','INVALID_PAGE','INVALID_PAGE_PATCH','INVALID_PARENT','INVALID_REVISION','INVALID_SECTION','INVALID_ITEM','INVALID_PUBLISH','INVALID_SETTINGS','INVALID_MEDIA','INVALID_MEDIA_PATH','INVALID_MEDIA_COMMAND','INVALID_MEDIA_TARGET']);
const missing = new Set(['PAGE_NOT_FOUND','SECTION_NOT_FOUND','ITEM_NOT_FOUND','MEDIA_NOT_FOUND']);
export function cmsError(code,status){return Object.assign(new Error(code),{code,status});}
export async function cmsRpcError(response){
 let data;
 try{data=await response.json();}catch{throw cmsError('CMS_SERVICE_UNAVAILABLE',503);}
 const message=typeof data?.message==='string'?data.message:'';
 if(data?.code==='P0001'){
  if(conflicts.has(message))throw cmsError(message,409);
  if(invalid.has(message))throw cmsError(message,400);
  if(missing.has(message))throw cmsError(message,404);
  if(message==='FORBIDDEN')throw cmsError('FORBIDDEN',403);
 }
 if(data?.code==='23505')throw cmsError('RESOURCE_CONFLICT',409);
 if(data?.code==='42501')throw cmsError('CMS_PERMISSION_DENIED',403);
 if(['PGRST202','42883'].includes(data?.code))throw cmsError('CMS_RPC_UNAVAILABLE',503);
 if(response.status===401)throw cmsError('UNAUTHORIZED',401);
 throw cmsError('CMS_SERVICE_UNAVAILABLE',503);
}
export function cmsFailure(error){
 if(error?.message==='MUTATIONS_DISABLED')return {status:503,code:'MUTATIONS_DISABLED'};
 const status=error?.status??error?.httpStatus,code=error?.code??error?.publicCode;
 if([400,401,403,404,405,409,413,415,502,503].includes(status)&&typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(code))return {status,code};
 return {status:503,code:'CMS_SERVICE_UNAVAILABLE'};
}
