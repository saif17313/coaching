// Progress for the EduCentre preloader is derived only from loading milestones the browser can actually report.
// Nothing here advances on a timer: if a milestone has not happened, its share of the bar stays empty.
export const PRELOADER_MILESTONES=Object.freeze([
 Object.freeze({id:'document',label:'Receiving page',weight:.2}),
 Object.freeze({id:'interface',label:'Starting interface',weight:.25}),
 Object.freeze({id:'typography',label:'Loading typography',weight:.1}),
 Object.freeze({id:'media',label:'Loading images',weight:.25}),
 Object.freeze({id:'resources',label:'Finishing resources',weight:.2})
]);

/** Share of visible images that have settled (loaded or failed). Unknown until images exist or the page has fully loaded. */
export function mediaFraction(signals){
 const {done=0,total=0}=signals.media??{};
 if(total>0)return Math.min(1,Math.max(0,done/total));
 return signals.resources?1:0;
}

export function milestoneFraction(signals,id){return id==='media'?mediaFraction(signals):signals[id]?1:0;}

export function progressTarget(signals){
 const value=PRELOADER_MILESTONES.reduce((sum,m)=>sum+m.weight*milestoneFraction(signals,m.id),0);
 return Math.min(1,Math.max(0,Math.round(value*1e4)/1e4));
}

/** The first milestone still outstanding, with an image count while media is loading; null once everything has settled. */
export function currentMilestone(signals){
 const next=PRELOADER_MILESTONES.find(m=>milestoneFraction(signals,m.id)<1);
 if(!next)return null;
 const total=signals.media?.total??0;
 return next.id==='media'&&total>0?{...next,label:`${next.label} ${Math.min(signals.media.done,total)}/${total}`}:next;
}

/**
 * Moves the displayed value toward the measured target without ever passing it or moving backwards.
 * Exponential approach for a natural settle, a small floor so it never crawls, and a speed cap so nothing jumps.
 */
export function easeProgress(display,target,elapsedMs){
 const dt=Math.max(0,Math.min(elapsedMs,100));
 if(!(target>display))return display;
 const gap=target-display;
 let step=gap*(1-Math.exp(-dt/320));
 step=Math.max(step,Math.min(gap,dt*.00012));
 step=Math.min(step,dt*.0011);
 const next=display+step;
 return target-next<.0015?target:next;
}

/** Whole percentage for display. 100 is reserved for genuine completion. */
export function displayPercent(display){return display>=1?100:Math.min(99,Math.floor(display*100));}
