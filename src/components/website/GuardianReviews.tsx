'use client';
import {useCallback,useEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import Image from './SiteImage';
import {isPublishedSample} from '@/client/public-content-policy.mjs';
import type {SiteItem} from '@/server/website/public-site';
import './guardian-reviews.css';

const MEDIA_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Signed circular distance of slide `at` from the active slide (so the carousel loops without jumping).
const stepFor=(at:number,active:number,total:number)=>((at-active+total+Math.floor(total/2))%total)-Math.floor(total/2);
const text=(value:unknown)=>typeof value==='string'?value.trim():'';

/** A guardian review as displayed. Legacy (unstructured) cards have no person fields, so the headline stands in. */
function reviewOf(item:SiteItem){
 const meta=item.metadata??{},sample=isPublishedSample(item)||meta.demo===true,author=text(meta.author);
 const title=item.title.replace(/^\[SAMPLE\] /,'');
 const rating=Number.isInteger(meta.rating)&&Number(meta.rating)>=1&&Number(meta.rating)<=5?Number(meta.rating):null;
 const date=/^\d{4}-\d{2}-\d{2}$/.test(text(meta.reviewDate))?new Date(text(meta.reviewDate)+'T00:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}):'';
 return {id:item.id,sample,name:author||(sample?'Sample guardian':title),headline:author?title:sample?title:'',quote:item.description,
  role:[text(meta.relationship),text(meta.studentContext)].filter(Boolean).join(' · '),rating,date,photo:item.mediaId&&MEDIA_ID.test(item.mediaId)?item.mediaId:null};
}
type Review=ReturnType<typeof reviewOf>;
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'G';

function ReviewCard({review,position,total}:{review:Review;position?:number;total?:number}){
 return <figure className="gr-card" id={`item-${review.id.toLowerCase()}`}>
  <div className="gr-card-top"><svg className="gr-quote" viewBox="0 0 48 36" aria-hidden="true"><path d="M0 36V22C0 9.6 6.4 2.3 19.2 0l2 5.2C14.4 7 10.9 10.9 10.6 17H20v19H0Zm28 0V22C28 9.6 34.4 2.3 47.2 0l2 5.2C42.4 7 38.9 10.9 38.6 17H48v19H28Z"/></svg>
   {review.rating&&<span className="gr-stars" role="img" aria-label={`${review.rating} out of 5 stars`}>{[1,2,3,4,5].map(n=><span key={n} aria-hidden="true" className={n<=review.rating!?'on':''}>★</span>)}</span>}</div>
  {review.sample&&<span className="gr-sample">Sample · illustrative content</span>}
  {review.headline&&<p className="gr-headline">{review.headline}</p>}
  <blockquote className="gr-text"><p>{review.quote}</p></blockquote>
  <figcaption className="gr-person">
   <span className="gr-avatar">{review.photo?<Image unoptimized src={`/api/v1/public/media/${review.photo}`} alt="" width={112} height={112}/>:<span aria-hidden="true">{initials(review.name)}</span>}</span>
   <span><strong>{review.name}</strong>{review.role&&<small>{review.role}</small>}{review.date&&<small>{review.date}</small>}</span>
  </figcaption>
  {position!==undefined&&<span className="sr-only">Review {position} of {total}</span>}
 </figure>;
}

/** Guardian reviews: an auto-advancing, swipeable 3D carousel (or a grid on the full reviews page). */
export function GuardianReviews({items,mode='carousel',intervalSeconds=6,motion=true}:{items:SiteItem[];mode?:'carousel'|'grid';intervalSeconds?:number;motion?:boolean}){
 const reviews=items.map(reviewOf).filter(review=>review.quote),total=reviews.length;
 const [active,setActive]=useState(0),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[stopped,setStopped]=useState(false),[visible,setVisible]=useState(false),[reduced,setReduced]=useState(false);
 const root=useRef<HTMLDivElement>(null),drag=useRef<{x:number;id:number}|null>(null);
 const go=useCallback((delta:number)=>setActive(current=>total?(current+delta+total)%total:0),[total]);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{const element=root.current;if(!element)return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.25});observer.observe(element);return()=>observer.disconnect();},[]);
 const playing=mode==='carousel'&&total>1&&motion&&!reduced&&!stopped&&!hovered&&!focused&&visible;
 useEffect(()=>{if(!playing)return;const seconds=Math.min(20,Math.max(3,intervalSeconds||6));const timer=window.setInterval(()=>{if(!document.hidden)go(1);},seconds*1000);return()=>window.clearInterval(timer);},[playing,intervalSeconds,go]);
 if(!total)return null;
 if(mode==='grid'||total===1)return <div className={'gr-grid'+(total===1?' is-single':'')}>{reviews.map(review=><ReviewCard key={review.id} review={review}/>)}</div>;
 function key(event:KeyboardEvent){if(event.key==='ArrowRight'){event.preventDefault();go(1);}else if(event.key==='ArrowLeft'){event.preventDefault();go(-1);}}
 function down(event:PointerEvent){if(event.pointerType!=='mouse')drag.current={x:event.clientX,id:event.pointerId};}
 function up(event:PointerEvent){const start=drag.current;drag.current=null;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x;if(Math.abs(dx)>40)go(dx<0?1:-1);}
 return <div ref={root} className="gr-carousel" role="region" aria-roledescription="carousel" aria-label="Guardian reviews" onKeyDown={key}
  onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setFocused(false);}}>
  <div className="gr-stage" onPointerDown={down} onPointerUp={up} onPointerCancel={()=>{drag.current=null;}} aria-live={playing?'off':'polite'}>
   {reviews.map((review,index)=>{const step=stepFor(index,active,total),shown=Math.abs(step)<=1;
    return <div key={review.id} className={'gr-slide'+(step===0?' is-active':'')} style={{'--step':step,'--dist':Math.abs(step)} as CSSProperties} role="group" aria-roledescription="slide" aria-label={`${index+1} of ${total}`} aria-hidden={!shown||undefined} inert={!shown||undefined} data-hidden={!shown||undefined} onClick={()=>{if(step!==0)go(step);}}>
     <ReviewCard review={review} position={index+1} total={total}/>
    </div>;})}
  </div>
  <div className="gr-controls">
   <button type="button" className="gr-arrow" onClick={()=>go(-1)} aria-label="Previous review">←</button>
   <div className="gr-dots" role="group" aria-label="Choose a review">{reviews.map((review,index)=><button type="button" key={review.id} aria-label={`Show review ${index+1} of ${total}`} aria-current={index===active||undefined} onClick={()=>setActive(index)}/>)}</div>
   <button type="button" className="gr-arrow" onClick={()=>go(1)} aria-label="Next review">→</button>
   {motion&&!reduced&&<button type="button" className="gr-toggle" onClick={()=>setStopped(value=>!value)} aria-pressed={stopped}>{stopped?'Play':'Pause'}</button>}
  </div>
 </div>;
}
