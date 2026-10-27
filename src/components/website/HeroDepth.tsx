'use client';
import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';

const HeroScene3D=dynamic(()=>import('./HeroScene3D'),{ssr:false,loading:()=>null});

/**
 * Hero depth layer: lazy WebGL atom behind the hero portrait plus a pointer-driven 3D tilt of the hero visual.
 * Skipped entirely for reduced motion, when CMS motion is off, or when WebGL is unavailable; the static
 * illustration underneath is always the fallback, so nothing on the page depends on this layer.
 */
export function HeroDepth({enabled=true}:{enabled?:boolean}){
 const host=useRef<HTMLDivElement>(null),pointer=useRef({x:0,y:0});
 const [mode,setMode]=useState<'off'|'lite'|'full'>('off'),[active,setActive]=useState(false);
 useEffect(()=>{
  const element=host.current,visual=element?.closest<HTMLElement>('.tale-hero-visual'),hero=element?.closest<HTMLElement>('.tale-home-hero');
  if(!element||!visual||!hero||!enabled)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');if(reduced.matches)return;
  let webgl=false;try{const c=document.createElement('canvas');webgl=Boolean(c.getContext('webgl2')||c.getContext('webgl'));}catch{}
  const nav=navigator as Navigator&{deviceMemory?:number};
  const lite=(nav.hardwareConcurrency??8)<=4||(nav.deviceMemory??8)<=4||matchMedia('(max-width: 700px)').matches;
  // Mount the scene after first paint so it never competes with the hero text for the main thread.
  const mount=()=>{if(webgl)setMode(lite?'lite':'full');},usesIdle=typeof window.requestIdleCallback==='function',idle=usesIdle?window.requestIdleCallback(mount,{timeout:1500}):window.setTimeout(mount,600);
  const observer=new IntersectionObserver(entries=>setActive(entries[0]?.isIntersecting??false),{rootMargin:'80px'});observer.observe(element);
  const fine=matchMedia('(hover: hover) and (pointer: fine)');let frame=0;
  const move=(event:PointerEvent)=>{if(!fine.matches)return;const box=hero.getBoundingClientRect();pointer.current={x:(event.clientX-box.left)/box.width-.5,y:(event.clientY-box.top)/box.height-.5};
   if(frame)return;frame=requestAnimationFrame(()=>{frame=0;visual.style.setProperty('--hero-tilt-x',(pointer.current.y*-7).toFixed(2)+'deg');visual.style.setProperty('--hero-tilt-y',(pointer.current.x*9).toFixed(2)+'deg');});};
  const leave=()=>{pointer.current={x:0,y:0};visual.style.setProperty('--hero-tilt-x','0deg');visual.style.setProperty('--hero-tilt-y','0deg');};
  const stop=()=>{setMode('off');leave();};
  hero.addEventListener('pointermove',move,{passive:true});hero.addEventListener('pointerleave',leave);reduced.addEventListener('change',stop);
  return()=>{if(usesIdle)window.cancelIdleCallback(idle);else window.clearTimeout(idle);observer.disconnect();cancelAnimationFrame(frame);hero.removeEventListener('pointermove',move);hero.removeEventListener('pointerleave',leave);reduced.removeEventListener('change',stop);};
 },[enabled]);
 return <div ref={host} className={'tale-hero-depth'+(mode!=='off'?' is-live':'')} aria-hidden="true">{mode!=='off'&&<HeroScene3D active={active} lite={mode==='lite'} pointer={pointer}/>}</div>;
}
