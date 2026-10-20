'use client';
import {useState} from 'react';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Privacy-first: no external iframe or provider requests before visitor clicks Play. */
export function PublishedVideo({videoId,title}:{videoId:string;title:string}){
 const [active,setActive]=useState(false);
 if(!VIDEO_ID.test(videoId))return null;
 const name=title.trim().slice(0,160)||'Learning video';
 return <div className="musa-video-preview">
  {active?<iframe title={name} src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" allowFullScreen/>:
   <button type="button" className="musa-video-play" onClick={()=>setActive(true)} aria-label={`Play ${name} on YouTube`}><span aria-hidden="true" className="musa-video-play-symbol">▶</span><strong>{name}</strong><small>Load video from YouTube</small></button>}
 </div>;
}
