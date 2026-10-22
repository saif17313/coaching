import {cmsFetch,cmsRequest,validateCmsPage,CmsRequestError} from './cms-studio.mjs';
/** Validate the entire change set first; every draft step retains the optimistic lock. */
export async function saveCmsDraft(pageId,revision,steps,call=cmsFetch){
 if(!Array.isArray(steps)||!steps.length||steps.length>5)throw Error('Choose valid changes to save.');
 for(const [index,step] of steps.entries()){
  if(!['pageUpdate','section','item','fields','design'].includes(step.kind))throw Error('Invalid draft operation.');
  cmsRequest(step.kind,{...step.params,pageId,payload:{...step.params.payload,expectedRevision:revision+index}});
 }
 let current=revision,result;
 for(const step of steps){
  await call(step.kind,{...step.params,pageId,payload:{...step.params.payload,expectedRevision:current}});
  result=validateCmsPage(await call('page',{pageId}));
  if(result.id!==pageId||result.draftRevision!==current+1)throw new CmsRequestError('REVISION_CONFLICT',409,'The draft changed while saving. Some draft changes may be saved; reload and review before retrying.');
  current=result.draftRevision;
 }
 return result;
}
