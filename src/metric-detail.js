import {escapeHTML as esc,metricSeries,chartNow,dateLocale} from './domain.js';
import {formatValue} from './metrics.js';
import {metricSummary} from './profile/domain.js';
import {metricExplanation} from './metric-explanations.js';

// Use elapsed time, not array position: wearable readings may be irregular.
export function nearestPoint(rows,time){
 if(!rows.length)return -1;
 let low=0,high=rows.length-1;
 while(low<high){const mid=(low+high)>>1;if(Date.parse(rows[mid].observed_at)<time)low=mid+1;else high=mid;}
 if(low>0&&time-Date.parse(rows[low-1].observed_at)<=Date.parse(rows[low].observed_at)-time)return low-1;
 return low;
}
export function chartRows(readings,reading,days,now=chartNow()){
 return metricSeries(readings.filter(r=>r.value!=null&&r.source===reading.source&&r.unit===reading.unit),reading.kind,days,now);
}
export function openMetricDetail({metric:m,reading:r,readings,showModal,heading}){
 const info=metricExplanation(m.kind);
 const explain=`<section class="metric-explainer"><span class="eyebrow">Understand your ${m.name.toLowerCase()}</span><h3>What this means</h3><p>${esc(info.meaning)}</p><p class="metric-context">${esc(info.context)}</p><a href="${info.url}" target="_blank" rel="noopener">${info.source} ↗</a></section>`;
 if(!r){showModal(`${heading(m.name,'Your signals')}<div class="empty"><h3>No measurement yet.</h3><p>Connect a source or import measured data to see your trend.</p><button class="btn light" data-action="to-integrations">Manage connections ↗</button></div>${explain}`);return;}
 showModal(`${heading(m.name,esc(r.source)+' / Your trend')}<div id="metric-explorer"></div>${explain}`);
 const host=document.querySelector('#metric-explorer');let period=30;
 function draw(){
  const rows=chartRows(readings,r,period),stats=metricSummary(rows,{days:period});
  const values=rows.map(x=>Number(x.value)),min=Math.min(...values),max=Math.max(...values),span=max-min||Math.max(1,Math.abs(min)*.1);
  const start=Date.parse(rows[0]?.observed_at),duration=Date.parse(rows.at(-1)?.observed_at)-start;
  const x=(row)=>rows.length===1?300:24+(Date.parse(row.observed_at)-start)/(duration||1)*552;
  const y=v=>168-(v-min)/span*122;
  const points=rows.map(row=>`${x(row)},${y(Number(row.value))}`).join(' ');
  host.innerHTML=`<div class="metric-readout" aria-live="off"><div><span id="metric-point-date" class="eyebrow"></span><div id="metric-point-value" class="figure-number"></div></div><div id="metric-point-comparison" class="point-comparison"></div></div><div class="metric-periods" role="group" aria-label="Trend period">${[7,30,90].map(d=>`<button data-period="${d}" aria-pressed="${d===period}">${d} days</button>`).join('')}</div>${rows.length?`<div class="interactive-trend" style="--trend-color:${m.stroke}"><svg viewBox="0 0 600 206" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="detail-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${m.stroke}" stop-opacity=".24"/><stop offset="1" stop-color="${m.stroke}" stop-opacity="0"/></linearGradient></defs>${[46,107,168].map(h=>`<line x1="24" x2="576" y1="${h}" y2="${h}" class="trend-gridline"/>`).join('')}<line x1="24" x2="576" y1="${y(stats.mean)}" y2="${y(stats.mean)}" class="trend-mean"/>${rows.length>1?`<path d="M${x(rows[0])} 194 L${points.replaceAll(' ',' L')} L${x(rows.at(-1))} 194 Z" fill="url(#detail-trend-fill)"/><polyline points="${points}" class="trend-line"/>`:''}<line id="trend-crosshair" y1="20" y2="194"/><circle id="trend-point-halo" r="10"/><circle id="trend-point" r="4"/></svg><div class="trend-interaction" role="slider" tabindex="0" aria-label="${esc(m.name)} history" aria-valuemin="1" aria-valuemax="${rows.length}" aria-orientation="horizontal" aria-describedby="trend-help"></div></div><div class="trend-axis"><span>${date(rows[0])}</span><span>${date(rows.at(-1))}</span></div><p id="trend-help" class="trend-hint">Move across the chart to explore · Use ← → on your keyboard</p>`:'<div class="chart-empty">No measurements in this period. Try a longer range.</div>'}<div class="detail-stats"><div><span>${period}-day average</span><strong>${stats.mean===null?'—':formatValue(stats.mean,m.kind)} <small>${esc(r.unit)}</small></strong></div><div><span>Recorded days</span><strong>${stats.days}<small> / ${period}</small></strong></div><div><span>Daily range</span><strong>${stats.min===null?'—':formatValue(stats.min,m.kind)+' – '+formatValue(stats.max,m.kind)}</strong></div></div><details class="chart-method"><summary>About this chart</summary><p>Points show individual readings from ${esc(r.source)}. The dashed line is the average of daily means in this period. Every recorded UTC day counts equally; missing days are excluded.</p></details>`;
  host.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=+b.dataset.period;draw();host.querySelector(`[data-period="${period}"]`).focus()});
  let selected=rows.length-1;
  const surface=host.querySelector('.trend-interaction');
  function select(index){
   selected=Math.max(0,Math.min(index,rows.length-1));const row=rows[selected];
   host.querySelector('#metric-point-date').textContent=row?date(row,true):'No reading';
   host.querySelector('#metric-point-value').innerHTML=(row?formatValue(row.value,m.kind):'—')+`<small> ${esc(r.unit)}</small>`;
   const delta=row?Number(row.value)-stats.mean:0;
   host.querySelector('#metric-point-comparison').textContent=row?(formatValue(Math.abs(delta),m.kind)==='0'?'At your period average':`${formatValue(Math.abs(delta),m.kind)} ${r.unit} ${delta>0?'above':'below'} average`):'';
   if(!row)return;
   host.querySelector('#trend-crosshair').setAttribute('x1',x(row));host.querySelector('#trend-crosshair').setAttribute('x2',x(row));
   for(const id of ['trend-point','trend-point-halo']){const point=host.querySelector('#'+id);point.setAttribute('cx',x(row));point.setAttribute('cy',y(+row.value));}
   surface.setAttribute('aria-valuenow',String(selected+1));surface.setAttribute('aria-valuetext',`${date(row,true)}, ${formatValue(row.value,m.kind)} ${r.unit}`);
  }
  select(selected);
  if(!surface)return;
  const point=e=>{const rect=surface.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,((e.clientX-rect.left)/rect.width*600-24)/552));select(nearestPoint(rows,start+ratio*duration));};
  surface.onpointermove=point;surface.onpointerdown=e=>{if(e.button!==0)return;surface.focus({preventScroll:true});surface.setPointerCapture(e.pointerId);point(e)};
  surface.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();select(e.key==='Home'?0:e.key==='End'?rows.length-1:selected+(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1));}};
 }
 draw();
}
function date(row,full=false){return new Date(row.observed_at).toLocaleDateString(dateLocale,{timeZone:'UTC',month:full?'long':'short',day:'numeric',...(full?{year:'numeric'}:{})});}
