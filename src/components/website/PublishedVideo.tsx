'use client';
import {useState} from 'react';
import Image from 'next/image';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** No provider iframe until Play. A bounded YouTube thumbnail identifies the video. */
export function PublishedVideo({videoId,title}:{videoId:string;title:string}){
 const [active,setActive]=useState(false),[thumbnailError,setThumbnailError]=useState(false),[playbackError,setPlaybackError]=useState(false),[loading,setLoading]=useState(false);
 if(!VIDEO_ID.test(videoId))return null;
 const name=title.trim().slice(0,160)||'Learning video';
 return <div className="musa-video-preview">
  {active&&!playbackError?<><iframe title={name} src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" allowFullScreen onLoad={()=>setLoading(false)} onError={()=>{setPlaybackError(true);setLoading(false);}}/>{loading&&<span className="video-loading" role="status">Loading video…</span>}</>:
   <button type="button" className="musa-video-play" onClick={()=>{setActive(true);setPlaybackError(false);setLoading(true);}} aria-label={`Play ${name} on YouTube`}>{!thumbnailError&&<Image unoptimized src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} width={1280} height={720} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setThumbnailError(true)} className="video-thumbnail"/>}<span className="video-play-copy"><span aria-hidden="true" className="musa-video-play-symbol">▶</span><strong>{name}</strong><small>Play video · YouTube</small></span></button>}
  <a className="video-provider-link" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">{playbackError?'Playback unavailable here. Open on YouTube ↗':'Watch on YouTube ↗'}</a>
 </div>;
}
