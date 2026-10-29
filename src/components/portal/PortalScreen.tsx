'use client';
import {createContext,useContext,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

/**
 * In-portal screens. Actions that used to open a modal (edit a profile, record a payment, manage a batch…)
 * open a full screen inside the portal's main area instead: breadcrumb trail, a Back button and the browser
 * Back button all return to the list exactly as it was, and the sidebar navigation never changes.
 *
 * The screen is rendered by the component that opened it (so its state and callbacks stay intact) and
 * portalled into a slot at the top of <main>; CSS hides the page underneath while a screen is open.
 */
type Slot={element:HTMLElement|null;root:string};
const SlotContext=createContext<Slot>({element:null,root:''});
type Crumb={label:string;level:number};
let pendingBack:Promise<void>|null=null;
function historyBack(){
 pendingBack=new Promise(resolve=>{const done=()=>{window.removeEventListener('popstate',done);window.clearTimeout(timer);pendingBack=null;resolve();};const timer=window.setTimeout(done,600);window.addEventListener('popstate',done);});
 window.history.back();
}
const TrailContext=createContext<{crumbs:Crumb[];depth:number}>({crumbs:[],depth:0});

export function PortalScreenSlot({root,children}:{root:string;children:ReactNode}){
 const [element,setElement]=useState<HTMLElement|null>(null);
 return <SlotContext.Provider value={{element,root}}><div className="portal-screen-slot" ref={setElement}/>{children}</SlotContext.Provider>;
}

export function PortalScreen({trail,title,subtitle,kicker,onBack,backLabel='Back',actions,hideHead=false,children}:{trail:string[];title:string;subtitle?:ReactNode;kicker?:string;onBack:()=>void;backLabel?:string;actions?:ReactNode;hideHead?:boolean;children:ReactNode}){
 const slot=useContext(SlotContext),parent=useContext(TrailContext),headingId=useId(),heading=useRef<HTMLHeadingElement>(null);
 const back=useRef(onBack),token=useRef('');
 // The control that opened the screen, captured before any autoFocus inside it moves focus.
 const [opener]=useState(()=>typeof document!=='undefined'&&document.activeElement instanceof HTMLElement?document.activeElement:null);
 useEffect(()=>{back.current=onBack;});
 const depth=parent.depth+1,own=trail.reduce<Crumb[]>((list,label)=>list.at(-1)?.label===label?list:[...list,{label,level:depth}],[...parent.crumbs]),
  crumbs=[...(slot.root?[{label:slot.root,level:0}]:[]),...own];
 useEffect(()=>{
  const scroll=window.scrollY,id=Math.random().toString(36).slice(2);let pushed=false,closedByHistory=false,cancelled=false;
  // Deferred so a development double-mount never leaves a stray history entry behind, and queued behind any
  // history.back() still in flight from a screen that just closed (otherwise that Back would close this one).
  void (pendingBack??Promise.resolve()).then(()=>window.setTimeout(()=>{if(cancelled)return;window.history.pushState({...window.history.state,portalScreen:id},'');token.current=id;pushed=true;},0));
  const pop=()=>{if(pushed&&window.history.state?.portalScreen!==id&&!closedByHistory){closedByHistory=true;back.current();}};
  window.addEventListener('popstate',pop);
  window.scrollTo({top:0});
  // Keep a field that focused itself (autoFocus); otherwise announce the screen through its heading.
  if(!heading.current?.closest('.portal-screen')?.contains(document.activeElement))heading.current?.focus({preventScroll:true});
  return()=>{
   cancelled=true;window.removeEventListener('popstate',pop);
   // Closed by a button or after saving: drop this screen's history entry too.
   if(pushed&&!closedByHistory&&window.history.state?.portalScreen===id)historyBack();
   // Return to where the page was, unless another screen has taken over.
   requestAnimationFrame(()=>{if(document.querySelector('.portal-screen-slot>.portal-screen'))return;window.scrollTo({top:scroll});if(opener?.isConnected)opener.focus({preventScroll:true});});
  };
 },[opener]);
 // Back goes through history so the browser Back button and this button behave identically.
 const goBack=(levels=1)=>{if(token.current&&window.history.state?.portalScreen===token.current)window.history.go(-levels);else back.current();};
 const view=<TrailContext.Provider value={{crumbs:own,depth}}>
  <section className="portal-screen" aria-labelledby={headingId}>
   <div className="portal-screen-bar">
    <button type="button" className="portal-screen-back" onClick={()=>goBack()}><span aria-hidden="true">←</span>{backLabel}</button>
    <nav aria-label="You are here" className="portal-screen-crumbs"><ol>{crumbs.map((crumb,i)=>{const last=i===crumbs.length-1,
     // Only the last label a level added is a destination (the page itself, or a parent screen).
     target=!last&&crumb.level<depth&&crumbs[i+1]?.level!==crumb.level;
     return <li key={i+crumb.label}>{last?<span aria-current="page">{crumb.label}</span>:target?<button type="button" onClick={()=>goBack(depth-crumb.level)}>{crumb.label}</button>:<span>{crumb.label}</span>}</li>;})}</ol></nav>
   </div>
   <header className={'portal-screen-head'+(hideHead?' sr-only':'')}><div>{kicker&&<span className="portal-kicker">{kicker}</span>}<h2 id={headingId} ref={heading} tabIndex={-1}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{actions&&<div className="portal-screen-actions">{actions}</div>}</header>
   <div className="portal-screen-body">{children}</div>
  </section>
 </TrailContext.Provider>;
 return slot.element?createPortal(view,slot.element):view;
}
