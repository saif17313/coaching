'use client';
import {useEffect,useRef} from 'react';
import {useRouter} from 'next/navigation';
/** Published-only polling: after a CMS publish, active visitors see the latest safe snapshot.
 *  This is bounded refresh polling, not Supabase Realtime push transport. */
export function PublishedRefresh({slug,revision,settingsRevision,fingerprint=null,watched='{}'}:{slug:string;revision:number|null;settingsRevision:number|null;fingerprint?:string|null;watched?:string}){
 const router=useRouter();
 const inFlight=useRef(false);
 useEffect(()=>{
  let active=true;
  const controller=new AbortController();
  async function check(){
   if(!active||inFlight.current||document.visibilityState==='hidden')return;
   inFlight.current=true;
   try{
    if(fingerprint){
     const response=await fetch('/api/v1/public/site-revisions',{cache:'no-store',signal:controller.signal});
     if(!active||!response.ok)return;
     const value=await response.json(),next=value?.data?.fingerprint;
     const expected=JSON.parse(watched) as Record<string,number|null>;
     const changed=Object.entries(expected).some(([key,rev])=>(value?.data?.pages?.[key]??null)!==rev);
     if(value?.success===true&&typeof next==='string'&&/^[0-9a-f]{32}$/.test(next)&&(next!==fingerprint||changed||value.data.settingsRevision!==settingsRevision))router.refresh();
     return;
    }
    const [p,s]=await Promise.all([
     fetch(`/api/v1/public/site-pages/${encodeURIComponent(slug)}`,{cache:'no-store',signal:controller.signal}),
     fetch('/api/v1/public/site-settings',{cache:'no-store',signal:controller.signal})
    ]);
    if(!active||!p.ok||!s.ok)return;
    const [page,settings]=await Promise.all([p.json(),s.json()]);
    const nextPage=page?.success===true?page?.data?.revision:null;
    const nextSettings=settings?.success===true?settings?.data?.revision:null;
    if(typeof nextPage==='number'&&nextPage!==revision||typeof nextSettings==='number'&&nextSettings!==settingsRevision){
     router.refresh();
    }
   }catch{/* Offline visitors can retry on the next visible interval. */}
   finally{inFlight.current=false;}
  }
  const timer=setInterval(()=>{void check();},30000);
  const onFocus=()=>{void check();};
  window.addEventListener('focus',onFocus);
  document.addEventListener('visibilitychange',onFocus);
  return ()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
 },[slug,revision,settingsRevision,fingerprint,watched,router]);
 return null;
}
