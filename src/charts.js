// Small, data-driven chart primitives shared by every page. Each returns an SVG string drawn only from the
// values it is given; colours come from CSS custom properties so light and dark cards reuse the same marks.
import {escapeHTML as esc,dateLocale} from './domain.js';

const round=n=>Math.round(n*100)/100;
const norm=values=>{const min=Math.min(...values),max=Math.max(...values);return v=>max>min?(v-min)/(max-min):.5};

// A share shown as filled dots in a fixed grid, e.g. one macro's part of the day's energy.
export function dotShare(share,{cols=5,rows=4,tone='accent',px=7}={}){
 const total=cols*rows,on=Math.round(Math.max(0,Math.min(100,share))/100*total),step=7;let dots='';
 for(let i=0;i<total;i++){const c=Math.floor(i/rows),r=i%rows;dots+=`<circle cx="${3+c*step}" cy="${3+(rows-1-r)*step}" r="2.3" class="dot ${i<on?'on t-'+tone:'off'}"/>`}
 const w=(cols-1)*step+6,h=(rows-1)*step+6;
 return `<svg class="dot-matrix" viewBox="0 0 ${w} ${h}" style="width:${round(w*px/7)}px;height:${round(h*px/7)}px" aria-hidden="true">${dots}</svg>`;
}

// A thin line through the values, stretched to its box; the stroke keeps its width at any size.
export function sparkline(values,{label='',tone='green'}={}){
 if(values.length<2)return '';const n=norm(values),pts=values.map((v,i)=>`${round(i/(values.length-1)*100)},${round(90-n(v)*80)}`).join(' ');
 return `<svg class="sparkline t-${tone}" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><polyline points="${pts}"/></svg>`;
}

// The Home trend: the person's daily values against their own usual range (mean ± one standard deviation,
// drawn as a striped band) with the days above their average filled in the accent.
export function trendChart(days,{label='',format=v=>v}={}){
 const values=days.map(d=>d.value),mean=values.reduce((s,v)=>s+v,0)/values.length,sd=Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length);
 const lo=mean-sd,hi=mean+sd,min=Math.min(...values,lo),max=Math.max(...values,hi),pad=(max-min||1)*.12,top=max+pad,bottom=min-pad;
 const y=v=>round((top-v)/(top-bottom)*100),x=i=>round(days.length===1?50:i/(days.length-1)*100),line=days.map((d,i)=>`${x(i)},${y(d.value)}`).join(' ');
 const stripes=Array.from({length:180},(_,i)=>{const sx=round(i/179*100),o=round(.25+.75*Math.abs(Math.sin(i*1.37)*Math.cos(i*.21)));return `<line x1="${sx}" x2="${sx}" y1="${y(hi)}" y2="${y(lo)}" style="opacity:${o}"/>`}).join('');
 // About five labelled days, counted back from the latest so today is always marked.
 const every=Math.max(1,Math.ceil(days.length/5)),marks=[];for(let i=days.length-1;i>=0;i-=every)marks.unshift({d:days[i],i});
 const fmt=(day,opts)=>new Date(day+'T12:00:00').toLocaleDateString(dateLocale,opts);
 const gridX=marks.map(({i})=>`<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="100" class="grid"/>`).join('');
 const plot=`<svg class="trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><defs><linearGradient id="band-tone" gradientUnits="userSpaceOnUse" x1="0" x2="100" y1="0" y2="0"><stop offset="0" style="stop-color:var(--band-a)"/><stop offset=".55" style="stop-color:var(--band-b)"/><stop offset="1" style="stop-color:var(--band-c)"/></linearGradient><clipPath id="trend-above"><rect x="0" y="0" width="100" height="${y(mean)}"/></clipPath></defs>${gridX}<g class="band" stroke="url(#band-tone)">${stripes}</g><polygon points="0,${y(mean)} ${line} 100,${y(mean)}" class="above" clip-path="url(#trend-above)"/><polyline points="${line}" class="trace"/></svg>`;
 return `<div class="trend-chart"><div class="trend-plot"><div class="trend-axis" aria-hidden="true"><span style="top:${y(hi)}%">${format(hi)}</span><span style="top:${y(mean)}%">${format(mean)}</span><span style="top:${y(lo)}%">${format(lo)}</span></div>${plot}<i class="trend-now" style="left:${x(days.length-1)}%;top:${y(values.at(-1))}%"></i></div><div class="trend-dates" aria-hidden="true">${marks.map(({d,i})=>`<span style="left:${x(i)}%">${fmt(d.day,{weekday:'short',day:'numeric',month:'short'})}</span>`).join('')}</div></div>`;
}

// A tile's chart: the last days as bars (amounts, from zero) or a line (vitals, scaled to their own range),
// the person's average as a dashed, labelled line, and the first and latest day underneath.
export function miniChart(days,{type='line',label='',format=v=>v}={}){
 if(days.length<2)return '';
 const values=days.map(d=>d.value),mean=values.reduce((s,v)=>s+v,0)/values.length,n=days.length;
 let lo=0,hi=Math.max(...values)*1.12||1;
 if(type==='line'){const min=Math.min(...values),max=Math.max(...values),pad=(max-min||1)*.35;lo=min-pad;hi=max+pad}
 const y=v=>round((hi-v)/(hi-lo)*100),x=i=>round((i+.5)/n*100),w=round(100/n*.56),last=n-1;
 const marks=type==='bars'?days.map((d,i)=>`<rect x="${round(x(i)-w/2)}" y="${y(d.value)}" width="${w}" height="${round(100-y(d.value))}" class="${i===last?'latest':''}"/>`).join(''):`<polyline points="${days.map((d,i)=>`${x(i)},${y(d.value)}`).join(' ')}"/>`;
 const day=d=>new Date(d+'T12:00:00').toLocaleDateString(dateLocale,{month:'short',day:'numeric'}),today=new Date().toISOString().slice(0,10);
 return `<div class="mini-chart ${type}"><div class="mini-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><line x1="0" x2="100" y1="${y(mean)}" y2="${y(mean)}" class="avg"/>${marks}</svg>${type==='line'?`<i class="mini-now" style="left:${x(last)}%;top:${y(values[last])}%"></i>`:''}<span class="mini-avg ${y(mean)<30?'below':''}" style="top:${y(mean)}%">avg ${esc(format(mean))}</span></div><div class="mini-dates"><span>${day(days[0].day)}</span><span>${days[last].day===today?'Today':day(days[last].day)}</span></div></div>`;
}
