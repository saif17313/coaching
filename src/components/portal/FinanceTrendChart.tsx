'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {friendlyError,managementRead,periodLabel,taka} from '@/client/management-api';

type Month={period:string;billedMinor:string;collectedMinor:string;refundedMinor:string;expensesMinor:string;netMinor:string};
type Trend={months:Month[];totals:Omit<Month,'period'>};
// Validated categorical order (dataviz validator, light surface): indigo, teal, amber — all checks pass.
const SERIES=[{key:'billedMinor',label:'Billed',color:'#5a62c4'},{key:'collectedMinor',label:'Collected',color:'#0a8f7e'},{key:'expensesMinor',label:'Expenses',color:'#b06d1a'}] as const;
const short=(period:string)=>{const [y,m]=period.split('-').map(Number);const label=new Date(Date.UTC(y,m-1,1)).toLocaleString('en-US',{month:'short',timeZone:'UTC'});return m===1?`${label} ’${String(y).slice(2)}`:label;};
const compact=(minor:number)=>{const t=minor/100;return '৳'+(t>=1e5?(t/1e5).toFixed(t>=1e6?0:1)+'L':t>=1e3?(t/1e3).toFixed(t>=1e4?0:1)+'k':String(Math.round(t)));};
function niceMax(value:number){if(value<=0)return 100;const step=10**Math.floor(Math.log10(value)),n=value/step;return (n<=1?1:n<=2?2:n<=5?5:10)*step;}
/** Rounded-top bar anchored to the baseline: 4px radius on the data end only. */
function bar(x:number,y:number,w:number,h:number){const r=Math.min(4,w/2,h);return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`;}

export function FinanceTrendChart(){
 const [data,setData]=useState<Trend|null>(null),[error,setError]=useState(''),[active,setActive]=useState<number|null>(null),[width,setWidth]=useState(720);
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{const controller=new AbortController();managementRead<Trend>('finance-trend',{months:12},'teacher',controller.signal).then(setData).catch(e=>{if(!controller.signal.aborted)setError(friendlyError((e as Error).message));});return()=>controller.abort();},[]);
 useEffect(()=>{const element=host.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(280,Math.round(entry.contentRect.width))));observer.observe(element);return()=>observer.disconnect();},[data]);
 const chart=useMemo(()=>{
  if(!data)return null;
  const months=data.months,height=240,pad={top:14,right:8,bottom:28,left:52},plotW=width-pad.left-pad.right,plotH=height-pad.top-pad.bottom;
  const max=niceMax(Math.max(0,...months.flatMap(m=>SERIES.map(s=>Number(m[s.key])))));
  const band=plotW/months.length,groupW=Math.min(band*.74,54),barW=Math.max(3,(groupW-2*(SERIES.length-1))/SERIES.length);
  const ticks=[0,.25,.5,.75,1].map(f=>({value:max*f,y:pad.top+plotH*(1-f)}));
  const labelEvery=band<34?3:band<48?2:1;
  return {months,height,pad,plotH,band,groupW,barW,max,ticks,labelEvery,empty:months.every(m=>SERIES.every(s=>m[s.key]==='0'))};
 },[data,width]);
 const net=data?BigInt(data.totals.netMinor):0n;
 return <section className="premium-surface finance-trend" aria-labelledby="finance-trend-title">
  <div className="premium-section-title"><div><h3 id="finance-trend-title">12-month finance trend</h3><p>Dues billed, payments collected and office expenses per month, across every batch.</p></div></div>
  {error?<p className="premium-error" role="alert">{error}</p>:!data||!chart?<div className="portal-loading" role="status">Loading finance trend…</div>:<>
   <dl className="finance-trend-stats">
    <div><dt>Collected</dt><dd>{taka(data.totals.collectedMinor)}</dd></div>
    <div><dt>Billed</dt><dd>{taka(data.totals.billedMinor)}</dd></div>
    <div><dt>Expenses</dt><dd>{taka(data.totals.expensesMinor)}</dd></div>
    <div><dt>Net cash</dt><dd data-tone={net<0n?'negative':'positive'}>{taka(data.totals.netMinor)}</dd><small>Collected − refunds − expenses</small></div>
   </dl>
   <ul className="finance-trend-legend" aria-label="Chart legend">{SERIES.map(s=><li key={s.key}><i style={{background:s.color}} aria-hidden="true"/>{s.label}</li>)}</ul>
   <div className="finance-trend-plot" ref={host} onMouseLeave={()=>setActive(null)}>
    {chart.empty?<p className="finance-trend-empty">No billing, collections or expenses recorded in the last 12 months yet.</p>:
    <svg width={width} height={chart.height} role="img" aria-label={`Grouped bar chart of billed, collected and expenses for ${periodLabel(chart.months[0].period)} to ${periodLabel(chart.months.at(-1)!.period)}. A table view follows.`}>
     {chart.ticks.map(t=><g key={t.value}><line x1={chart.pad.left} x2={width-chart.pad.right} y1={t.y} y2={t.y} className={t.value===0?'baseline':'grid'}/><text x={chart.pad.left-8} y={t.y} dy="0.32em" textAnchor="end">{compact(t.value)}</text></g>)}
     {chart.months.map((m,i)=>{const x0=chart.pad.left+i*chart.band,gx=x0+(chart.band-chart.groupW)/2;return <g key={m.period} className={active===i?'is-active':active!==null?'is-dim':''}>
      <rect className="hit" x={x0} y={chart.pad.top} width={chart.band} height={chart.plotH} tabIndex={0} role="button" aria-label={`${periodLabel(m.period)}: billed ${taka(m.billedMinor)}, collected ${taka(m.collectedMinor)}, expenses ${taka(m.expensesMinor)}, net ${taka(m.netMinor)}`} onMouseEnter={()=>setActive(i)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)}/>
      {SERIES.map((s,k)=>{const v=Number(m[s.key]),h=v>0?Math.max(1.5,v/chart.max*chart.plotH):0;return h?<path key={s.key} d={bar(gx+k*(chart.barW+2),chart.pad.top+chart.plotH-h,chart.barW,h)} fill={s.color}/>:null;})}
      {i%chart.labelEvery===0&&<text className="xlabel" x={x0+chart.band/2} y={chart.height-8} textAnchor="middle">{short(m.period)}</text>}
     </g>;})}
    </svg>}
    {active!==null&&!chart.empty&&(()=>{const m=chart.months[active],left=Math.min(Math.max(chart.pad.left+(active+.5)*chart.band,90),width-90);return <div className="finance-trend-tip" style={{left}} role="status">
     <strong>{periodLabel(m.period)}</strong>{SERIES.map(s=><span key={s.key}><i style={{background:s.color}} aria-hidden="true"/>{s.label}<b>{taka(m[s.key])}</b></span>)}{m.refundedMinor!=='0'&&<span>Refunds<b>{taka(m.refundedMinor)}</b></span>}<span className="net">Net<b>{taka(m.netMinor)}</b></span></div>;})()}
   </div>
   <details className="finance-trend-table"><summary>View as table</summary><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Month</th><th>Billed</th><th>Collected</th><th>Refunds</th><th>Expenses</th><th>Net</th></tr></thead><tbody>{data.months.map(m=><tr key={m.period}><td>{periodLabel(m.period)}</td><td>{taka(m.billedMinor)}</td><td>{taka(m.collectedMinor)}</td><td>{taka(m.refundedMinor)}</td><td>{taka(m.expensesMinor)}</td><td>{taka(m.netMinor)}</td></tr>)}</tbody></table></div></details>
  </>}
 </section>;
}
