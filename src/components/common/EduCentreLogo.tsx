import {useId,type CSSProperties} from 'react';
import {EDUCENTRE_EMBLEM as P,EDUCENTRE_LOGO_VIEWBOX,EDUCENTRE_WORDMARK} from './educentre-logo-paths';

const NAVY='#071d42';

/**
 * Vector EduCentre logo traced from the brand master. Parts are grouped (book, monogram, cap, tassel, wordmark)
 * so the preloader can choreograph them; on its own it renders as the static logo.
 * `sweep` adds a light band clipped to the logo shapes, used only by the animated intro.
 */
export function EduCentreLogo({className='',title='EduCentre',sweep=false}:{className?:string;title?:string;sweep?:boolean}){
 const uid='ec'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
 const sheen=`url(#${uid}-sheen)`,word=`url(#${uid}-word)`;
 const part=(n:string)=>sweep?`${uid}-${n}`:undefined;
 return <svg className={'ec-logo '+className} viewBox={EDUCENTRE_LOGO_VIEWBOX} fillRule="evenodd" role="img" aria-label={title}>
  <defs>
   <linearGradient id={`${uid}-sheen`} gradientUnits="userSpaceOnUse" x1="250" y1="0" x2="850" y2="0"><stop offset="0" stopColor="#b08341"/><stop offset=".32" stopColor="#d4ae68"/><stop offset=".5" stopColor="#ebd29b"/><stop offset=".68" stopColor="#d5b06a"/><stop offset="1" stopColor="#ad8040"/></linearGradient>
   <linearGradient id={`${uid}-word`} gradientUnits="userSpaceOnUse" x1="400" y1="660" x2="1090" y2="835"><stop offset="0" stopColor="#c9a25c"/><stop offset=".55" stopColor="#be9550"/><stop offset="1" stopColor="#a97f3f"/></linearGradient>
  </defs>
  <g className="ec-logo-emblem">
   <g className="ec-logo-book">
    <path id={part('base')} d={P.bookBase} fill={NAVY} pathLength={1}/>
    <g className="ec-logo-page ec-logo-page-l"><path id={part('pl')} d={P.pageLeft} fill={sheen} pathLength={1}/></g>
    <g className="ec-logo-page ec-logo-page-r"><path id={part('pr')} d={P.pageRight} fill={sheen} pathLength={1}/></g>
   </g>
   <g className="ec-logo-mono"><path id={part('mono')} d={P.monogram} fill={NAVY} pathLength={1}/></g>
   <g className="ec-logo-cap">
    <path id={part('board')} d={P.capBoard} fill={NAVY} pathLength={1}/>
    <path id={part('band')} d={P.capBand} fill={sheen} pathLength={1}/>
    <g className="ec-logo-tassel"><path id={part('tassel')} d={P.tassel} fill={sheen} pathLength={1}/></g>
   </g>
  </g>
  <g className="ec-logo-word">{EDUCENTRE_WORDMARK.map((glyph,i)=><path key={i} id={part('w'+i)} d={glyph.d} fill={glyph.tone==='navy'?NAVY:word} style={{'--i':i} as CSSProperties}/>)}</g>
  {sweep&&<>
   <clipPath id={`${uid}-clip`} clipRule="evenodd">{['base','pl','pr','mono','board','band','tassel',...EDUCENTRE_WORDMARK.map((_,i)=>'w'+i)].map(n=><use key={n} href={`#${uid}-${n}`}/>)}</clipPath>
   <linearGradient id={`${uid}-light`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff8e6" stopOpacity="0"/><stop offset=".5" stopColor="#fff6dc" stopOpacity=".78"/><stop offset="1" stopColor="#fff8e6" stopOpacity="0"/></linearGradient>
   <g clipPath={`url(#${uid}-clip)`} aria-hidden="true"><rect className="ec-logo-sweep" x="-320" y="-40" width="230" height="920" fill={`url(#${uid}-light)`}/></g>
  </>}
 </svg>;
}
