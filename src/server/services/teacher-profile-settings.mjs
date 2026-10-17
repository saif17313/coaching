/**
 * Offline Teacher Profile + Preferences service.
 * Actor must originate from verified server Auth; the DB adapter must repeat
 * authorization checks, lock rows, and append audit within the same transaction.
 * No production adapter is provided; writes fail closed without a port.
 */
export class TeacherSettingsError extends Error {
  constructor(code) { super(code); this.name = 'TeacherSettingsError'; this.code = code; }
}
const fail = code => { throw new TeacherSettingsError(code); };
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const fields = (x, names) => obj(x) && Object.keys(x).length > 0 && Object.keys(x).every(k => names.includes(k));
const string = (x, max, min = 0) => typeof x === 'string' && x.trim().length >= min && x.trim().length <= max && !/[\u0000-\u0008\u000b\u000e-\u001f]/.test(x);
const copy = x => structuredClone(x);
function teacher(actor) {
  if (!obj(actor) || actor.verified !== true || actor.role !== 'teacher' || !uuid(actor.id)) fail('UNAUTHENTICATED');
}
function need(port, name) { if (!port || typeof port[name] !== 'function') fail('PERSISTENCE_PORT_UNAVAILABLE'); }
function txNeed(tx,name) { if (!tx || typeof tx[name] !== 'function') fail('TRANSACTION_PORT_INCOMPLETE'); }
function profilePatch(input) {
  if (!fields(input,['displayName','bio','phone','avatarMediaId'])) fail('INVALID_PROFILE_PATCH');
  const out = {};
  if (Object.hasOwn(input,'displayName')) {if(!string(input.displayName,160,2))fail('INVALID_PROFILE_PATCH');out.displayName=input.displayName.trim();}
  if (Object.hasOwn(input,'bio')) {if(!string(input.bio,1200))fail('INVALID_PROFILE_PATCH');out.bio=input.bio.trim();}
  if (Object.hasOwn(input,'phone')) {if(input.phone!==null && (typeof input.phone!=='string'|| !/^\+?[0-9][0-9 -]{6,18}$/.test(input.phone)))fail('INVALID_PROFILE_PATCH');out.phone=input.phone;}
  if (Object.hasOwn(input,'avatarMediaId')) {if(input.avatarMediaId!==null&&!uuid(input.avatarMediaId))fail('INVALID_PROFILE_PATCH');out.avatarMediaId=input.avatarMediaId;}
  return out;
}
function preferencePatch(input) {
  if (!fields(input,['theme','locale','emailNotifications','pushNotifications'])) fail('INVALID_PREFERENCES');
  const out={};
  if(Object.hasOwn(input,'theme')) {if(!['light','dark','system'].includes(input.theme))fail('INVALID_PREFERENCES');out.theme=input.theme;}
  if(Object.hasOwn(input,'locale')) {if(!['en','bn'].includes(input.locale))fail('INVALID_PREFERENCES');out.locale=input.locale;}
  for(const key of ['emailNotifications','pushNotifications']) if(Object.hasOwn(input,key)){if(typeof input[key]!=='boolean')fail('INVALID_PREFERENCES');out[key]=input[key];}
  return out;
}
function view(x,actorId,type){
  const names= type==='profile'?['id','displayName','bio','phone','avatarMediaId']:['teacherId','theme','locale','emailNotifications','pushNotifications'];
  const idKey=type==='profile'?'id':'teacherId';
  if(!obj(x)||x[idKey]!==actorId||!names.every(k=>Object.hasOwn(x,k))||Object.keys(x).some(k=>!names.includes(k)))fail('DATA_ACCESS_VIOLATION');
  if(type==='profile') {
    if(!string(x.displayName,160,2)||!string(x.bio,1200)|| (x.phone!==null&&(typeof x.phone!=='string'||!/^\+?[0-9][0-9 -]{6,18}$/.test(x.phone)))||(x.avatarMediaId!==null&&!uuid(x.avatarMediaId)))fail('DATA_ACCESS_VIOLATION');
  } else if(!['light','dark','system'].includes(x.theme)||!['en','bn'].includes(x.locale)||typeof x.emailNotifications!=='boolean'||typeof x.pushNotifications!=='boolean')fail('DATA_ACCESS_VIOLATION');
  return copy(x);
}
export function createTeacherProfileSettings(port){
  return Object.freeze({
    async getMyProfile(actor){
      teacher(actor);need(port,'getTeacherProfileAuthorized');const row=await port.getTeacherProfileAuthorized(actor.id);return view(row,actor.id,'profile');
    },
    async updateMyProfile(actor,input){
      teacher(actor);const patch=profilePatch(input);need(port,'inTransaction');
      return port.inTransaction(async tx=>{
        txNeed(tx,'assertTeacherActive');await tx.assertTeacherActive(actor.id);
        if(patch.avatarMediaId){txNeed(tx,'assertPublicReadyMedia');await tx.assertPublicReadyMedia(patch.avatarMediaId);}
        txNeed(tx,'updateTeacherProfile');txNeed(tx,'appendAudit');
        const result=await tx.updateTeacherProfile(actor.id,copy(patch));
        await tx.appendAudit({actorId:actor.id,action:'teacher.profile.updated',entityId:actor.id});
        return view(result,actor.id,'profile');
      });
    },
    async getMyPreferences(actor){
      teacher(actor);need(port,'getTeacherPreferencesAuthorized');const row=await port.getTeacherPreferencesAuthorized(actor.id);return view(row,actor.id,'preferences');
    },
    async updateMyPreferences(actor,input){
      teacher(actor);const patch=preferencePatch(input);need(port,'inTransaction');
      return port.inTransaction(async tx=>{
        txNeed(tx,'assertTeacherActive');await tx.assertTeacherActive(actor.id);
        txNeed(tx,'updateTeacherPreferences');txNeed(tx,'appendAudit');
        const row=await tx.updateTeacherPreferences(actor.id,copy(patch));
        await tx.appendAudit({actorId:actor.id,action:'teacher.preferences.updated',entityId:actor.id});
        return view(row,actor.id,'preferences');
      });
    },
    async requestCredentialChange(actor){
      teacher(actor);
      // Password, MFA, and email changes require verified Auth flow + reauthentication,
      // never generic profile patch or editable student/teacher database fields.
      fail('AUTH_REAUTH_INTEGRATION_REQUIRED');
    }
  });
}
