'use client';
import {useEffect,useRef,useState} from 'react';
import {loadCmsPreviewSources} from '@/client/cms-preview-sources';
import type {SitePage,SiteSettings,NavItem} from '@/server/website/public-site';
const DEVICES=[{label:'Desktop',width:1440},{label:'Tablet',width:820},{label:'Mobile',width:390}] as const;
/** Live draft preview: the real public presentation in a scaled frame that fills the panel height. */
export function CmsLivePreview({draft,settings,surface='page',focus}:{draft:unknown;settings:SiteSettings|null;surface?:'home'|'page';focus?:{sectionId:string;itemId?:string;path?:(string|number)[]}}){
 const frame=useRef<HTMLIFrameElement>(null),box=useRef<HTMLDivElement>(null),[width,setWidth]=useState(1440),[size,setSize]=useState({width:360,height:640}),[ready,setReady]=useState(false),[reload,setReload]=useState(0),[context,setContext]=useState<{related:Record<string,SitePage|null>;navigation:NavItem[]}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void loadCmsPreviewSources().then(value=>{if(active){setContext(value);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[reload]);
 useEffect(()=>{const observer=new ResizeObserver(entries=>{const rect=entries[0].contentRect;setSize({width:Math.max(1,rect.width),height:Math.max(1,rect.height)});});if(box.current)observer.observe(box.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{function receive(event:MessageEvent){if(event.origin===location.origin&&event.source===frame.current?.contentWindow&&event.data?.type==='educentre-preview-ready'){setReady(true);if(context)frame.current?.contentWindow?.postMessage({type:'educentre-draft-preview',draft,settings,surface,focus,...context},location.origin);}}window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[context,draft,settings,surface,focus]);
 useEffect(()=>{if(ready&&context)frame.current?.contentWindow?.postMessage({type:'educentre-draft-preview',draft,settings,surface,focus,...context},location.origin);},[ready,context,draft,settings,surface,focus]);
 // Narrow devices are shown at their real width (centred) when they fit; wider ones are scaled down to fit.
 const scale=Math.min(1,size.width/width),shown=width*scale;
 return <div className="cms-preview">
  <div className="cms-preview-controls">
   <div role="group" aria-label="Preview viewport" className="cms-preview-devices">{DEVICES.map(device=><button key={device.width} type="button" aria-pressed={width===device.width} onClick={()=>setWidth(device.width)}>{device.label}</button>)}</div>
   <span className={'cms-preview-live'+(ready&&context?' is-ready':'')}>{ready&&context?'Live · updates as you edit':'Connecting…'}</span>
   <button type="button" className="cms-preview-reload" aria-label="Reload preview" title="Reload preview" onClick={()=>{setReady(false);setReload(value=>value+1);}}>↻</button>
  </div>
  {error&&<p role="alert" className="portal-alert">{error}</p>}
  <div className="cms-preview-stage" ref={box}>
   <div className="cms-preview-device" style={{width:shown}} data-device={DEVICES.find(d=>d.width===width)?.label.toLowerCase()}>
    <iframe key={reload} ref={frame} title="Actual website draft preview" src="/portal/website-preview" style={{width,height:size.height/scale,transform:`scale(${scale})`}}/>
   </div>
   {!(ready&&context)&&<div className="cms-preview-loading" role="status">Loading your draft…</div>}
  </div>
  <p className="cms-preview-note">Private draft — visitors see changes only after you publish. Shared sections show their published source unless you are editing it.</p>
 </div>;
}
