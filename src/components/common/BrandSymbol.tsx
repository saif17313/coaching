import {useId} from 'react';
import {EDUCENTRE_EMBLEM as P} from './educentre-logo-paths';

/** Square EduCentre brand mark: the traced cap, E monogram and open book on an ivory tile with a hairline gold edge. */
export function BrandSymbol({size=64,className=''}:{size?:number;className?:string}){
 const uid='bs'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
 const gold=`url(#${uid}-gold)`;
 return <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <defs>
   <linearGradient id={`${uid}-tile`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fffdf8"/><stop offset="1" stopColor="#f3ecdc"/></linearGradient>
   <linearGradient id={`${uid}-gold`} gradientUnits="userSpaceOnUse" x1="250" y1="0" x2="850" y2="0"><stop offset="0" stopColor="#b08341"/><stop offset=".5" stopColor="#e3c487"/><stop offset="1" stopColor="#ad8040"/></linearGradient>
  </defs>
  <rect x="1.5" y="1.5" width="61" height="61" rx="17" fill={`url(#${uid}-tile)`} stroke="#c9a15a" strokeOpacity=".55"/>
  <g transform="translate(-4.26 10.9) scale(.0663)" fillRule="evenodd">
   <path d={P.bookBase} fill="#071d42"/><path d={P.pageLeft} fill={gold}/><path d={P.pageRight} fill={gold}/>
   <path d={P.monogram} fill="#071d42"/><path d={P.capBoard} fill="#071d42"/><path d={P.capBand} fill={gold}/><path d={P.tassel} fill={gold}/>
  </g>
 </svg>;
}
