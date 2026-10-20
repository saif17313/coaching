const uid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function validOrganization(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join(',')!=='action,expectedRevision,itemId,orderIds,sectionId'||!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision<1||data.expectedRevision>1e9)return false;
 if(data.action==='media.detach')return uid(data.itemId)&&data.sectionId===null&&data.orderIds===null;
 return ['sections.reorder','items.reorder'].includes(data.action)&&data.itemId===null&&(data.action==='sections.reorder'?data.sectionId===null:uid(data.sectionId))&&Array.isArray(data.orderIds)&&data.orderIds.length<=(data.action==='sections.reorder'?60:100)&&data.orderIds.every(uid)&&new Set(data.orderIds).size===data.orderIds.length;
}
