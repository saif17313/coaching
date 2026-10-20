import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
/** Attached Chrome does not forward its owner's download events to a second CDP client. */
export async function downloadMaterial(page,link){
 const session=await page.context().newCDPSession(page),info=await session.send('Target.getTargetInfo'),browserContextId=info.targetInfo.browserContextId;
 const directory=join(tmpdir(),'educentre-audit-downloads',crypto.randomUUID());mkdirSync(directory,{recursive:true});
 try{
  await session.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory,eventsEnabled:true,...(browserContextId?{browserContextId}:{})});
  await link.click();const deadline=Date.now()+15000;
  while(Date.now()<deadline){const names=readdirSync(directory).filter(name=>name.toLowerCase().endsWith('.pdf'));if(names.length===1)return readFileSync(join(directory,names[0]));await new Promise(resolve=>setTimeout(resolve,250));}
  throw Error('Chrome did not save the requested PDF within 15 seconds.');
 }finally{await session.send('Browser.setDownloadBehavior',{behavior:'default',...(browserContextId?{browserContextId}:{})}).catch(()=>{});await session.detach();}
}
