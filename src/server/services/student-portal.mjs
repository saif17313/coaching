/** Student Portal read orchestration. No auth adapter or HTTP exposure included. */
export class PortalError extends Error {constructor(code){super(code);this.name='PortalError';this.code=code;}}
const fail=code=>{throw new PortalError(code);};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const keys=(x,allowed)=>plain(x)&&Object.keys(x).every(k=>allowed.includes(k));
const safeNum=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
const checkActor=actor=>{if(!plain(actor)||actor.verified!==true||actor.role!=='student'||!uuid(actor.id))fail('UNAUTHENTICATED');};
const requirePort=(port,k)=>{if(!port||typeof port[k]!=='function')fail('PERSISTENCE_PORT_UNAVAILABLE');};
function queryValid(query={}){if(!keys(query,['limit'])||query.limit!==undefined&&(!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>20))fail('INVALID_QUERY');return {limit:query.limit??10};}
// Service must validate provider outputs. The production database/RLS layer must
// independently bind all joins to auth.uid(), enrollment state and release time.
export function createStudentPortalOperations(port){return Object.freeze({
  async getDashboard(actor,query={}){
    checkActor(actor);const q=queryValid(query);requirePort(port,'assertStudentActive');await port.assertStudentActive(actor.id);
    requirePort(port,'getDashboardSnapshotAuthorized');const data=await port.getDashboardSnapshotAuthorized(actor.id,q);
    if(!plain(data)||!Array.isArray(data.batches)||!Array.isArray(data.upcomingClasses)||!Array.isArray(data.assignments)||!Array.isArray(data.unreadNotifications)||!plain(data.summary))fail('DATA_ACCESS_VIOLATION');
    if(data.batches.length>q.limit||data.upcomingClasses.length>q.limit||data.assignments.length>q.limit||data.unreadNotifications.length>q.limit)fail('DATA_ACCESS_VIOLATION');
    if(!['active'].includes(data.accountStatus)||!safeNum(data.summary.activeBatches)||!safeNum(data.summary.pendingAssignments)||!safeNum(data.summary.unreadCount))fail('DATA_ACCESS_VIOLATION');
    const ownBatches=new Set();
    for(const batch of data.batches){if(!plain(batch)||!uuid(batch.id)||batch.enrollmentStatus!=='active'||batch.studentId!==actor.id||ownBatches.has(batch.id))fail('DATA_ACCESS_VIOLATION');ownBatches.add(batch.id);}
    for(const row of [...data.upcomingClasses,...data.assignments]){
      if(!plain(row)||!uuid(row.batchId)||!uuid(row.studentId)||row.studentId!==actor.id||row.enrollmentStatus!=='active')fail('DATA_ACCESS_VIOLATION');
      // An item can reference an active batch outside the first page. Provider must independently check membership.
      if(!row.authorizedForStudent)fail('DATA_ACCESS_VIOLATION');
    }
    if(data.assignments.some(x=>x.status!=='published'||x.released!==true)||data.upcomingClasses.some(x=>x.status!=='active'))fail('DATA_ACCESS_VIOLATION');
    if(data.unreadNotifications.some(x=>!plain(x)||x.recipientId!==actor.id||x.readAt!==null))fail('DATA_ACCESS_VIOLATION');
    return structuredClone(data);
  }
});}
