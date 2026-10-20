'use client';
import {useEffect,useRef} from 'react';
const visible=(node:Element)=>node.getClientRects().length>0;
const focusable=(root:Element)=>Array.from(root.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex]')).filter(node=>node.tabIndex>=0&&!node.matches(':disabled')&&visible(node));
export function PortalFocusManager({mobile,menuOpen,setMenu}:{mobile:boolean;menuOpen:boolean;setMenu:(open:boolean)=>void}){
 const wasOpen=useRef(false);
 useEffect(()=>{
  let dialog:HTMLElement|null=null,previous:HTMLElement|null=null;
  function synchronize(){const next=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).find(visible)??null;if(next===dialog)return;if(dialog&&previous?.isConnected)previous.focus({preventScroll:true});dialog=next;if(dialog){previous=document.activeElement instanceof HTMLElement?document.activeElement:null;const first=focusable(dialog)[0];if(first)first.focus();else{dialog.tabIndex=-1;dialog.focus();}}}
  const observer=new MutationObserver(synchronize);observer.observe(document.body,{childList:true,subtree:true});synchronize();
  function keydown(event:KeyboardEvent){
   const root=dialog??(mobile&&menuOpen?document.querySelector<HTMLElement>('.portal-sidebar-open'):null);if(!root)return;
   if(event.key==='Escape'){if(dialog){const close=dialog.querySelector<HTMLButtonElement>('button[aria-label*="close" i]');if(close&&!close.disabled){event.preventDefault();close.click();}}else{event.preventDefault();setMenu(false);}return;}
   if(event.key!=='Tab')return;const nodes=focusable(root);if(!nodes.length){event.preventDefault();return;}const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}
  }
  document.addEventListener('keydown',keydown);
  return()=>{observer.disconnect();document.removeEventListener('keydown',keydown);};
 },[mobile,menuOpen,setMenu]);
 useEffect(()=>{if(mobile&&menuOpen)document.querySelector<HTMLElement>('.portal-sidebar-open .portal-nav-link,.portal-sidebar-open summary')?.focus();else if(mobile&&wasOpen.current)document.querySelector<HTMLElement>('.portal-menu-trigger')?.focus();wasOpen.current=menuOpen;},[mobile,menuOpen]);
 return null;
}
