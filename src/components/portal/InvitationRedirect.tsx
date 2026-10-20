'use client';
import {useEffect} from 'react';
/** Auth may fall back to Site URL when the requested callback is not allowlisted. */
export function InvitationRedirect(){
 useEffect(()=>{
  if(location.pathname==='/portal/accept-invite')return;
  const fragment=location.hash,params=new URLSearchParams(fragment.slice(1));
  if(params.get('type')==='invite'&&params.has('access_token'))location.replace('/portal/accept-invite'+fragment);
 },[]);
 return null;
}
