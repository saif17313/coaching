'use client';
import {useEffect,useRef,type CSSProperties} from 'react';
import {currentMilestone,displayPercent,easeProgress,progressTarget,shouldExit,type PreloaderSignals} from '@/client/preloader-progress.mjs';
import {EduCentreLogo} from './EduCentreLogo';
import {InlineScript} from './InlineScript';
import './preloader.css';

const SEEN_KEY='educentre:intro-seen';
const REPLAY_AFTER_MS=12*60*60*1000;
/** The brand reveal (CSS timeline) needs this long from first paint; reduced motion skips it. */
const INTRO_MS=2600,INTRO_REDUCED_MS=300;
/** Hold after reaching 100% so the completion shimmer is seen, then the exit transition length. */
const COMPLETE_HOLD_MS=520,EXIT_MS=950;
/** Once the interface is running, slow images never hold the site hostage beyond this. */
const MAX_WAIT_MS=6000;
/** Once everything has loaded the bar may still be animating; the guard timer allows for that final stretch. */
const FINISH_GRACE_MS=1500;
/** Matches the CSS failsafe that hides the overlay if scripts never arrive. */
const FAILSAFE_MS=11000;

// Decides before first paint: the intro plays once per 12 hours, never inside frames (CMS previews) or automated
// browsers (it is purely presentational and would only delay tests), and not at all when storage is unavailable,
// so a blocked browser is never shown it on every load.
const DECIDE=`(function(){var s=document.currentScript,el=s&&s.parentNode,play=false;if(!el)return;try{var now=Date.now(),last=Number(localStorage.getItem("${SEEN_KEY}"))||0;play=window.self===window.top&&!navigator.webdriver&&now-last>${REPLAY_AFTER_MS};if(play)localStorage.setItem("${SEEN_KEY}",String(now))}catch(e){play=false}el.setAttribute("data-state",play?"intro":"done");el.setAttribute("data-t0",String(Math.round(performance.now())))})()`;

const MOTES:[string,string,number,number][]=[['9%','68%',.9,3],['16%','28%',2.2,2],['24%','86%',3.6,2.5],['31%','14%',1.4,2],['69%','18%',2.8,2.5],['77%','80%',1.1,3],['86%','36%',4.2,2],['92%','62%',1.9,2.5],['6%','42%',4.8,2],['61%','90%',3.2,2],['43%','9%',5.1,2],['54%','84%',.7,2.5]];
const TICKS=[.25,.5,.75];

export function EduCentrePreloader(){
 const rootRef=useRef<HTMLDivElement>(null),barRef=useRef<HTMLDivElement>(null),percentRef=useRef<HTMLSpanElement>(null),statusRef=useRef<HTMLSpanElement>(null),skipRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const el=rootRef.current,bar=barRef.current,percent=percentRef.current,status=statusRef.current,skip=skipRef.current;
  if(!el||!bar||!percent||!status||!skip)return;
  if(el.dataset.state!=='intro'){el.dataset.state='done';return;}
  const started=performance.now(),t0=Number(el.dataset.t0)||0;
  // Scripts arrived after the CSS failsafe already revealed the page.
  if(started-t0>FAILSAFE_MS-400){el.dataset.state='done';return;}
  el.dataset.live='';
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const introUntil=t0+(reduce?INTRO_REDUCED_MS:INTRO_MS),deadline=Math.max(started+MAX_WAIT_MS,introUntil);
  const signals:PreloaderSignals={document:document.readyState!=='loading',interface:true,typography:!document.fonts,resources:document.readyState==='complete',media:{done:0,total:0}};
  let alive=true,frame=0,exitTimer=0,display=0,last=started,sampled=0,shown=-1,label='',completeAt=0;
  const fontsReady=()=>{if(alive)signals.typography=true;};
  document.fonts?.ready.then(fontsReady,fontsReady);
  const onReady=()=>{signals.document=true;},onLoad=()=>{signals.document=true;signals.resources=true;};
  document.addEventListener('DOMContentLoaded',onReady);window.addEventListener('load',onLoad);
  // Images the visitor will see first: on screen, laid out, outside the overlay. Failed images count as settled.
  const sampleMedia=()=>{let done=0,total=0;const h=window.innerHeight;for(const img of Array.from(document.images)){if(el.contains(img))continue;const r=img.getBoundingClientRect();if(!r.width||!r.height||r.bottom<0||r.top>h)continue;total++;if(img.complete)done++;}signals.media={done,total};};
  const exit=()=>{
   if(!alive||el.dataset.state!=='intro')return;
   cancelAnimationFrame(frame);
   if(el.contains(document.activeElement))(document.activeElement as HTMLElement).blur();
   el.dataset.state='exit';
   exitTimer=window.setTimeout(()=>{el.dataset.state='done';},reduce?280:EXIT_MS);
  };
  const step=(now:number)=>{
   if(!alive)return;
   try{
    if(now-sampled>150){sampled=now;sampleMedia();}
    const target=progressTarget(signals);
    display=easeProgress(display,target,now-last);last=now;
    el.style.setProperty('--ec-p',display.toFixed(4));
    const pct=displayPercent(display),text=currentMilestone(signals)?.label??(pct===100?'Ready':'Finishing up');
    if(pct!==shown||text!==label){
     if(pct!==shown){shown=pct;percent.textContent=pct+'%';bar.setAttribute('aria-valuenow',String(pct));}
     if(text!==label){label=text;status.textContent=text;}
     bar.setAttribute('aria-valuetext',`${pct}% · ${text}`);
    }
    if(display>=1&&!completeAt){completeAt=now;el.dataset.complete='';}
    if(shouldExit({now,introUntil,deadline,completeAt,holdMs:COMPLETE_HOLD_MS,target})){exit();return;}
   }catch{exit();return;}
   frame=requestAnimationFrame(step);
  };
  frame=requestAnimationFrame(step);
  // rAF pauses in background tabs; this still releases the page (with room for a bar that is finishing its last stretch).
  const guard=window.setTimeout(exit,deadline-started+COMPLETE_HOLD_MS+FINISH_GRACE_MS);
  const block=(e:Event)=>e.preventDefault();
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')exit();};
  el.addEventListener('wheel',block,{passive:false});el.addEventListener('touchmove',block,{passive:false});
  window.addEventListener('keydown',onKey);skip.addEventListener('click',exit);
  return()=>{
   alive=false;cancelAnimationFrame(frame);clearTimeout(guard);clearTimeout(exitTimer);
   document.removeEventListener('DOMContentLoaded',onReady);window.removeEventListener('load',onLoad);
   el.removeEventListener('wheel',block);el.removeEventListener('touchmove',block);
   window.removeEventListener('keydown',onKey);skip.removeEventListener('click',exit);
  };
 },[]);
 return <div ref={rootRef} className="ec-preloader" data-state="intro" data-t0="" suppressHydrationWarning>
  <InlineScript html={DECIDE}/>
  <noscript><style>{'.ec-preloader{display:none!important}'}</style></noscript>
  <div className="ec-pre-atmos" aria-hidden="true">
   <span className="ec-pre-orb ec-pre-orb-gold"/><span className="ec-pre-orb ec-pre-orb-navy"/><span className="ec-pre-orb ec-pre-orb-mist"/>
   <svg className="ec-pre-ribbons" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
    <defs>
     <linearGradient id="ec-ribbon-a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e2c27f" stopOpacity="0"/><stop offset=".55" stopColor="#e2c27f" stopOpacity=".8"/><stop offset="1" stopColor="#fff3d6" stopOpacity=".15"/></linearGradient>
     <linearGradient id="ec-ribbon-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c9d3e6" stopOpacity=".05"/><stop offset=".5" stopColor="#e6d2a6" stopOpacity=".7"/><stop offset="1" stopColor="#e6d2a6" stopOpacity="0"/></linearGradient>
    </defs>
    <path d="M940 -30C1110 120 1300 200 1640 150" stroke="url(#ec-ribbon-a)" strokeWidth="1.2" pathLength={1}/>
    <path d="M1060 -40C1210 110 1380 250 1650 290" stroke="url(#ec-ribbon-b)" strokeWidth=".8" pathLength={1}/>
    <path d="M-40 610C200 600 420 700 560 930" stroke="url(#ec-ribbon-b)" strokeWidth="1" pathLength={1}/>
    <path d="M1240 930C1330 770 1470 660 1660 630" stroke="url(#ec-ribbon-a)" strokeWidth=".9" pathLength={1}/>
   </svg>
   {MOTES.map(([x,y,d,s])=><span key={x+y} className="ec-pre-mote" style={{'--x':x,'--y':y,'--d':`${d}s`,'--s':`${s}px`} as CSSProperties}/>)}
  </div>
  <div className="ec-pre-stage">
   <div className="ec-pre-mark"><span className="ec-pre-halo" aria-hidden="true"/><EduCentreLogo className="ec-pre-logo" sweep/></div>
   <div className="ec-pre-ornament" aria-hidden="true"><i/><svg viewBox="0 0 16 16"><path d="M8 0c.5 4.6 2.9 7 8 8-5.1 1-7.5 3.4-8 8-.5-4.6-2.9-7-8-8 5.1-1 7.5-3.4 8-8Z" fill="currentColor"/></svg><i/></div>
   <p className="ec-pre-tagline">Musa Sir’s Coaching</p>
   <div className="ec-pre-loading">
    <p className="ec-pre-message">Preparing your learning space</p>
    <div className="ec-pre-row">
     <div ref={barRef} className="ec-pre-track" role="progressbar" aria-label="Loading EduCentre" aria-valuemin={0} aria-valuemax={100} aria-valuetext="Connecting">
      <span className="ec-pre-scan"/><span className="ec-pre-fill"/><span className="ec-pre-head"/>
      {TICKS.map(at=><span key={at} className="ec-pre-tick" style={{'--at':at} as CSSProperties}/>)}
     </div>
     <span className="ec-pre-divider" aria-hidden="true"/>
     <span ref={percentRef} className="ec-pre-percent" aria-hidden="true"/>
    </div>
    <span ref={statusRef} className="ec-pre-status" aria-hidden="true">Connecting</span>
   </div>
  </div>
  <button ref={skipRef} type="button" className="ec-pre-skip">Skip intro</button>
 </div>;
}
