import test from 'node:test';
import assert from 'node:assert/strict';
import {PRELOADER_MILESTONES,progressTarget,currentMilestone,easeProgress,displayPercent,mediaFraction} from '../src/client/preloader-progress.mjs';
const none=()=>({document:false,interface:false,typography:false,resources:false,media:{done:0,total:0}});
const all=()=>({document:true,interface:true,typography:true,resources:true,media:{done:4,total:4}});
test('milestone weights cover the whole bar exactly once',()=>{
 assert.equal(Math.round(PRELOADER_MILESTONES.reduce((s,m)=>s+m.weight,0)*1e6),1e6);
 assert.equal(new Set(PRELOADER_MILESTONES.map(m=>m.id)).size,PRELOADER_MILESTONES.length);
});
test('target only reflects milestones that have actually happened',()=>{
 assert.equal(progressTarget(none()),0);
 assert.equal(progressTarget(all()),1);
 assert.equal(progressTarget({...none(),document:true,interface:true}),.45);
 assert.equal(progressTarget({...none(),media:{done:1,total:4}}),.0625);
 // With no images on screen yet, media stays empty until the page reports a full load.
 assert.equal(mediaFraction({...none(),media:{done:0,total:0}}),0);
 assert.equal(mediaFraction({...none(),resources:true}),1);
 assert.equal(mediaFraction({...none(),media:{done:9,total:3}}),1);
});
test('status names the first outstanding milestone and counts images',()=>{
 assert.equal(currentMilestone(none()).id,'document');
 assert.equal(currentMilestone({...all(),typography:false}).id,'typography');
 assert.equal(currentMilestone({...all(),media:{done:2,total:5}}).label,'Loading images 2/5');
 assert.equal(currentMilestone(all()),null);
});
test('displayed progress is monotonic, never overshoots and never jumps',()=>{
 let display=0;const seen=[];
 for(const [target,dt] of [[.45,16],[.45,16],[.3,16],[1,16],[1,100],[1,5000]]){const next=easeProgress(display,target,dt);assert.ok(next>=display,'never moves backwards');assert.ok(next<=Math.max(display,target),'never passes the measured target');assert.ok(next-display<=.11+1e-9,'speed is capped per frame');seen.push(next);display=next;}
 assert.equal(easeProgress(.5,.5,16),.5);
 assert.equal(easeProgress(.6,.2,16),.6);
 let d=0,frames=0;while(d<1&&frames<1000){d=easeProgress(d,1,16);frames++;}
 assert.equal(d,1,'reaches completion exactly');
 assert.ok(frames>=55,'a full sweep takes at least ~0.9s at 60fps');
 assert.ok(frames<240,'and settles within a few seconds');
});
test('100% is shown only on genuine completion',()=>{
 assert.equal(displayPercent(0),0);
 assert.equal(displayPercent(.999),99);
 assert.equal(displayPercent(1),100);
});
