'use client';
import {useCallback,useEffect,useRef,useState,type KeyboardEvent,type CSSProperties} from 'react';
import Image from 'next/image';
import type {SiteItem} from '@/server/website/public-site';

const MEDIA_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stepFor=(at:number,center:number,len:number)=>((at-center+len+Math.floor(len/2))%len)-Math.floor(len/2);
export function ReferenceCourseCarousel({items}:{items:SiteItem[]}){
 const [current,setCurrent]=useState(0),[paused,setPaused]=useState(false),[selected,setSelected]=useState<SiteItem|null>(null);
 const [autoplay,setAutoplay]=useState(true),dialog=useRef<HTMLElement>(null),dragStart=useRef<number|null>(null);
 const total=items.length;
 const next=useCallback(()=>setCurrent(x=>total>0?(x+1)%total:0),[total]);
 const previous=useCallback(()=>setCurrent(x=>total>0?(x-1+total)%total:0),[total]);
 useEffect(()=>{
  if(total<=1||paused||selected||!autoplay)return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');let handle:number|undefined;
  const update=()=>{window.clearInterval(handle);if(!preference.matches)handle=window.setInterval(()=>{if(!document.hidden)next();},5000);};
  update();preference.addEventListener('change',update);
  return()=>{window.clearInterval(handle);preference.removeEventListener('change',update);};
 },[total,paused,selected,next,autoplay]);
 useEffect(()=>{
  if(!selected||!dialog.current)return;
  const previous=document.activeElement,element=dialog.current;
  element.querySelector<HTMLButtonElement>('button')?.focus();
  function key(event:globalThis.KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();setSelected(null);}
   if(event.key==='Tab'){
    const items=Array.from(element.querySelectorAll<HTMLElement>('button,a[href]')),first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  }
  element.addEventListener('keydown',key);
  return()=>{element.removeEventListener('keydown',key);if(previous instanceof HTMLElement)previous.focus();};
 },[selected]);
 function onKey(e:KeyboardEvent){if(e.key==='ArrowLeft'){e.preventDefault();previous();}if(e.key==='ArrowRight'){e.preventDefault();next();}}
 return <div className="tale-carousel-shell" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={()=>setPaused(false)} onKeyDown={onKey} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="Published courses and batches">
  <div className="tale-carousel-stage" style={{touchAction:'pan-y'}} onPointerDown={e=>{if(e.pointerType!=='mouse')dragStart.current=e.clientX;}} onPointerCancel={()=>{dragStart.current=null;}} onPointerUp={e=>{const start=dragStart.current;dragStart.current=null;if(start!==null&&Math.abs(e.clientX-start)>45){if(e.clientX<start)next();else previous();}}}>
   {items.map((item,index)=>{const offset=stepFor(index,current,total);const visible=Math.abs(offset)<=2;const active=offset===0;
    return <article className={`tale-carousel-card ${active?'is-current':''}`} key={item.id} style={{'--card-offset':String(offset),'--card-depth':String(Math.abs(offset))} as CSSProperties} aria-hidden={!visible} inert={!visible}>
     <div className="tale-carousel-photo">{item.mediaId&&MEDIA_ID.test(item.mediaId)?<Image unoptimized src={`/api/v1/public/media/${item.mediaId}`} width={700} height={460} alt={item.title||'Published program'} sizes="(max-width:700px) 76vw,340px"/>:<div className="tale-carousel-fallback"><Image src={`/images/musa-course-art-${(index%4)+1}.webp`} alt="" aria-hidden="true" width={900} height={540} sizes="(max-width:700px) 76vw,340px"/><b>LEARN WITH EDUCENTRE</b></div>}</div>
     <div className="tale-carousel-copy"><span className="tale-carousel-eyebrow">PROGRAM {String(index+1).padStart(2,'0')}</span><h3>{item.title}</h3><p>{item.description}</p><button type="button" onClick={()=>active?setSelected(item):setCurrent(index)} aria-label={`View ${item.title} details`}>View details <span>↗</span></button></div>
    </article>;
   })}
  </div>
  <div className="tale-carousel-controls"><button type="button" aria-label="Previous batch" onClick={previous}>←</button><span>{String(current+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span><button type="button" aria-label="Next batch" onClick={next}>→</button></div>
  <button type="button" className="tale-autoplay-toggle" aria-pressed={!autoplay} onClick={()=>setAutoplay(x=>!x)}>{autoplay?'Pause automatic rotation':'Resume automatic rotation'}</button><div className="tale-carousel-dots">{items.map((x,i)=><button type="button" key={x.id} aria-label={`Go to course ${i+1}`} aria-current={i===current?'true':undefined} onClick={()=>setCurrent(i)}/>)}</div>
  {selected&&<div className="tale-course-dialog-backdrop" role="presentation" onClick={()=>setSelected(null)}><section ref={dialog} role="dialog" aria-modal="true" aria-label={`${selected.title} details`} className="tale-course-dialog" onClick={e=>e.stopPropagation()}><button type="button" className="tale-dialog-close" onClick={()=>setSelected(null)} aria-label="Close course details">×</button><span className="tale-eyebrow">PUBLISHED PROGRAM</span><h2>{selected.title}</h2><p>{selected.description}</p>{selected.url?.startsWith('https://')&&<a href={selected.url} rel="noopener noreferrer" target="_blank">Course information ↗</a>}<button type="button" onClick={()=>setSelected(null)}>Close</button></section></div>}
 </div>;
}
