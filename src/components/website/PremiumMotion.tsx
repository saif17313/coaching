'use client';
import {useEffect} from 'react';

const TARGETS='.tale-section-title,.tale-card,.tale-trust-strip,.tale-soft-panel,.tale-mentor,.tale-top-student-grid>*,.tale-block .tale-cards>*,.tale-interior-hero>*,.tale-footer>*';

/**
 * Scroll-reveal with staggered entrances and a gentle hero parallax. Content is visible by default;
 * only elements still below the fold when this runs are hidden and then revealed, so server-rendered
 * content never disappears without JavaScript, and reduced-motion users see no animation at all.
 */
export function PremiumMotion({enabled=true}:{enabled?:boolean}){
 // Header glass firms up once the page has scrolled; independent of motion preferences.
 useEffect(()=>{const site=document.querySelector<HTMLElement>('.tale-site');if(!site)return;let frame=0;
  const update=()=>{frame=0;site.dataset.scrolled=String(window.scrollY>24);};const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
  update();window.addEventListener('scroll',onScroll,{passive:true});return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',onScroll);delete site.dataset.scrolled;};},[]);
 useEffect(()=>{
  const site=document.querySelector<HTMLElement>('.tale-site');
  if(!site||!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window))return;
  const fold=window.innerHeight*0.92,seen=new WeakSet<Element>();
  const observer=new IntersectionObserver(entries=>{
   // Anything already scrolled past (anchor jumps, End key) is shown at once, never left hidden.
   for(const entry of entries)if(!entry.isIntersecting&&entry.boundingClientRect.bottom<0){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}
   const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top||a.boundingClientRect.left-b.boundingClientRect.left);
   visible.forEach((entry,i)=>{const el=entry.target as HTMLElement;el.style.setProperty('--reveal-delay',`${Math.min(i,6)*70}ms`);el.classList.add('is-revealed');observer.unobserve(el);});
  },{rootMargin:'0px 0px -8% 0px',threshold:.12});
  const scan=()=>{for(const el of site.querySelectorAll<HTMLElement>(TARGETS)){if(seen.has(el))continue;seen.add(el);
   if(el.getBoundingClientRect().top>fold){el.classList.add('reveal-pending');observer.observe(el);}}};
  site.classList.add('motion-ready');scan();
  // Published content can re-render (draft refresh, carousels); pick up new cards once per frame.
  let queued=0;const mutation=new MutationObserver(()=>{if(!queued)queued=requestAnimationFrame(()=>{queued=0;scan();});});
  mutation.observe(site,{childList:true,subtree:true});
  const hero=site.querySelector<HTMLElement>('.tale-home-hero,.tale-interior-hero');let frame=0;
  const parallax=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!hero)return;const y=Math.min(window.scrollY,hero.offsetHeight);hero.style.setProperty('--hero-parallax',`${(y*0.12).toFixed(1)}px`);hero.style.setProperty('--hero-fade',(1-Math.min(.35,y/hero.offsetHeight*.45)).toFixed(3));});};
  // Fallback for jumps that skip elements entirely (no intersection change is ever reported).
  let catchFrame=0;const catchUp=()=>{if(catchFrame)return;catchFrame=requestAnimationFrame(()=>{catchFrame=0;for(const el of site.querySelectorAll<HTMLElement>('.reveal-pending:not(.is-revealed)'))if(el.getBoundingClientRect().top<window.innerHeight){el.classList.add('is-revealed');observer.unobserve(el);}});};
  window.addEventListener('scroll',catchUp,{passive:true});
  if(hero){window.addEventListener('scroll',parallax,{passive:true});parallax();}
  return()=>{observer.disconnect();mutation.disconnect();cancelAnimationFrame(queued);cancelAnimationFrame(frame);cancelAnimationFrame(catchFrame);window.removeEventListener('scroll',parallax);window.removeEventListener('scroll',catchUp);site.classList.remove('motion-ready');
   for(const el of site.querySelectorAll('.reveal-pending'))el.classList.remove('reveal-pending');};
 },[enabled]);
 return null;
}
