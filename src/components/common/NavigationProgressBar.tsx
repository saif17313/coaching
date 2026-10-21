'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';

export function NavigationProgressBar(){
 const pathname=usePathname();
 const searchParams=useSearchParams();
 const [progress,setProgress]=useState(0);
 const [visible,setVisible]=useState(false);
 const active=useRef(false);

 useEffect(()=>{
  if(active.current){
   active.current=false;
   const timer1=setTimeout(()=>setProgress(100),0);
   const timer2=setTimeout(()=>{
    setVisible(false);
    setProgress(0);
   },250);
   return()=>{
    clearTimeout(timer1);
    clearTimeout(timer2);
   };
  }
 },[pathname,searchParams]);

 useEffect(()=>{
  function handleClick(e:MouseEvent){
   const target=(e.target as HTMLElement)?.closest('a');
   if(!target)return;
   const href=target.getAttribute('href');
   if(!href||href.startsWith('#')||href.startsWith('mailto:')||href.startsWith('tel:')||target.target==='_blank')return;
   try{
    const url=new URL(href,window.location.origin);
    if(url.origin!==window.location.origin)return;
    const isSamePage=url.pathname===window.location.pathname&&url.search===window.location.search;
    if(isSamePage)return;

    active.current=true;
    setVisible(true);
    setProgress(25);
    setTimeout(()=>setProgress(65),80);
    setTimeout(()=>setProgress(85),200);
   }catch{
    // Ignore invalid URLs
   }
  }

  document.addEventListener('click',handleClick,true);
  return()=>document.removeEventListener('click',handleClick,true);
 },[]);

 if(!visible)return null;

 return (
  <div
   aria-hidden="true"
   style={{
    position:'fixed',
    top:0,
    left:0,
    right:0,
    height:'3px',
    zIndex:99999,
    pointerEvents:'none',
    overflow:'hidden',
    background:'transparent'
   }}
  >
   <div
    style={{
     height:'100%',
     width:`${progress}%`,
     background:'linear-gradient(90deg, #00796b, #00b4a0, #26a69a)',
     boxShadow:'0 0 10px rgba(0, 180, 160, 0.65)',
     transition:progress===100?'width 150ms ease-out, opacity 150ms ease-out':'width 350ms cubic-bezier(0.1, 0.05, 0.1, 1)'
    }}
   />
  </div>
 );
}
