'use client';
import {useEffect,useRef} from 'react';
export function PremiumAtmosphere({enabled=true}:{enabled?:boolean}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const site=root.current?.closest<HTMLElement>('.tale-site');if(!site||!enabled)return;const reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');let frame=0,current:HTMLElement|null=null,pointer:{x:number;y:number}|null=null;
 const reset=()=>{if(current){current.style.removeProperty('--premium-tilt-x');current.style.removeProperty('--premium-tilt-y');current=null;}};
 const move=(event:PointerEvent)=>{if(reduced.matches||!fine.matches||document.hidden)return;const card=(event.target as Element)?.closest<HTMLElement>('.tale-card');if(card!==current){reset();current=card;}pointer={x:event.clientX,y:event.clientY};if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!current||!pointer)return;const bounds=current.getBoundingClientRect();current.style.setProperty('--premium-tilt-x',((.5-(pointer.y-bounds.top)/bounds.height)*4).toFixed(2)+'deg');current.style.setProperty('--premium-tilt-y',(((pointer.x-bounds.left)/bounds.width-.5)*5).toFixed(2)+'deg');current.style.setProperty('--glow-x',((pointer.x-bounds.left)/bounds.width*100).toFixed(1)+'%');current.style.setProperty('--glow-y',((pointer.y-bounds.top)/bounds.height*100).toFixed(1)+'%');});};
 site.addEventListener('pointermove',move,{passive:true});site.addEventListener('pointerleave',reset);reduced.addEventListener('change',reset);return()=>{cancelAnimationFrame(frame);reset();site.removeEventListener('pointermove',move);site.removeEventListener('pointerleave',reset);reduced.removeEventListener('change',reset);};
 },[enabled]);
 return <div ref={root} className={'premium-atmosphere'+(enabled?'':' is-still')} aria-hidden="true"><i/><i/><span className="premium-orbit premium-orbit-one"/><span className="premium-orbit premium-orbit-two"/></div>;
}
