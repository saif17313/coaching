/** Decorative CSS-only dimensional artwork. No remote fonts, tracking or WebGL dependency. */
export function SiteOrbital({brand}:{brand:string}){
 return <div className="musa-orbit" aria-hidden="true">
  <div className="musa-orbit-glow"/>
  <div className="musa-orbit-scene">
   <div className="musa-orbit-ring musa-orbit-ring-one"/>
   <div className="musa-orbit-ring musa-orbit-ring-two"/>
   <div className="musa-orbit-ring musa-orbit-ring-three"/>
   <div className="musa-orbit-core"><span className="musa-orbit-core-mark">✦</span><strong>{brand}</strong><small>EXPLORE · LEARN · GROW</small></div>
   <span className="musa-orbit-satellite musa-orbit-satellite-one">✧</span>
   <span className="musa-orbit-satellite musa-orbit-satellite-two">✦</span>
   <span className="musa-orbit-satellite musa-orbit-satellite-three">◈</span>
  </div>
  <div className="musa-orbit-ground"/>
 </div>;
}
