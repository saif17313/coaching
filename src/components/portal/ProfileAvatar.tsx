'use client';
import Image from 'next/image';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
export function ProfileAvatar({src,name,size=96,zoomable=false,caption}:{src:string|null;name:string;size?:number;zoomable?:boolean;caption?:string}){
 const [failed,setFailed]=useState(false),[open,setOpen]=useState(false);
 const label=name||'Student',hasPhoto=Boolean(src&&!failed);
 const face=<span className="profile-avatar" style={{width:size,height:size,display:'inline-flex',flexShrink:0,alignItems:'center',justifyContent:'center',borderRadius:'50%',overflow:'hidden',background:'#e0f3e9',color:'#006d66',fontSize:size*.35,fontWeight:750}}>{hasPhoto?<Image unoptimized src={src!} width={size} height={size} alt={`${label} portrait`} style={{width:'100%',height:'100%',objectFit:'cover'}} onError={()=>setFailed(true)}/>:<span aria-label={`${label} initials`}>{name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'S'}</span>}</span>;
 if(!zoomable||!hasPhoto)return face;
 return <><button type="button" className="avatar-zoom" aria-label={`View larger photo of ${label}`} onClick={event=>{event.stopPropagation();setOpen(true);}}>{face}</button>{open&&<PhotoLightbox src={src!} name={label} caption={caption} onClose={()=>setOpen(false)}/>}</>;
}
/** Enlarged photo floating over the page; a click anywhere, the close button or Escape dismisses it. */
function PhotoLightbox({src,name,caption,onClose}:{src:string;name:string;caption?:string;onClose:()=>void}){
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',key);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;};},[onClose]);
 return createPortal(<div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} onClick={onClose}>
  <button type="button" className="photo-lightbox-close" aria-label="Close photo" onClick={onClose}>✕</button>
  <figure><Image unoptimized src={src} width={560} height={560} alt={`${name} portrait, enlarged`}/><figcaption>{name}{caption&&<small>{caption}</small>}</figcaption></figure>
 </div>,document.body);
}
