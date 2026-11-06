export type PreloaderMilestoneId='document'|'interface'|'typography'|'media'|'resources';
export interface PreloaderMilestone{readonly id:PreloaderMilestoneId;readonly label:string;readonly weight:number}
export interface PreloaderSignals{document:boolean;interface:boolean;typography:boolean;resources:boolean;media:{done:number;total:number}}
export const PRELOADER_MILESTONES:readonly PreloaderMilestone[];
export function mediaFraction(signals:PreloaderSignals):number;
export function milestoneFraction(signals:PreloaderSignals,id:PreloaderMilestoneId):number;
export function progressTarget(signals:PreloaderSignals):number;
export function currentMilestone(signals:PreloaderSignals):PreloaderMilestone|null;
export function easeProgress(display:number,target:number,elapsedMs:number):number;
export function displayPercent(display:number):number;
