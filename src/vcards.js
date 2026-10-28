// Metric cards on the shared system: a white card, the person's last 14 days drawn in neutral ink, and the orange
// accent only on the latest point. Two drawings only: a line inside the usual range, or bars for amounts.
import {formatValue} from './metrics.js';
import {dailyMeans} from './insights.js';
import {escapeHTML as esc,dateLocale} from './domain.js';
import {trendChart} from './charts.js';

const WINDOW=14;
// Nightly amounts and daily counts are bars; sleep is bars split into stages; every other signal is a line.
const barKinds=new Set(['sleep_deep','sleep_rem','sleep_light','sleep_awake','nap','sleep_debt','sleep_disturbances','steps','active_energy','energy_burned','strain']);

const round=n=>Math.round(n*10)/10;
const avg=values=>values.reduce((s,n)=>s+n,0)/values.length;
// Dots are HTML so they stay round over a stretched drawing.
const dot=(x,y)=>`<i class="vdot" style="left:${round(x)}%;top:${round(y)}%"></i>`;
// Catmull-Rom through the points, as cubic Béziers: smooth, and it passes through every reading.
function smooth(points){let d=`M${round(points[0][0])} ${round(points[0][1])}`;for(let i=0;i<points.length-1;i++){const p0=points[i-1]||points[i],p1=points[i],p2=points[i+1],p3=points[i+2]||p2;d+=` C${round(p1[0]+(p2[0]-p0[0])/6)} ${round(p1[1]+(p2[1]-p0[1])/6)} ${round(p2[0]-(p3[0]-p1[0])/6)} ${round(p2[1]-(p3[1]-p1[1])/6)} ${round(p2[0])} ${round(p2[1])}`}return d}
const plot=(inner,label,extra='')=>`<span class="vplot"><svg class="vline" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${inner}</svg>${extra}</span>`;
// The dates under a drawing: the first day shown, the window, and the latest ("Today" or "Last night").
const dayText=(day,now,today)=>day===new Date(now).toISOString().slice(0,10)?today:new Date(day+'T12:00:00Z').toLocaleDateString(dateLocale,{timeZone:'UTC',month:'short',day:'numeric'});
const scaleRow=(list,{now,today})=>`<span class="vscale"><span>${dayText(list[0].day,now,today)}</span><span>${WINDOW} days</span><span>${dayText(list.at(-1).day,now,today)}</span></span>`;

// The daily values inside the person's usual range (mean ± one standard deviation), latest point in orange.
function line(days,ctx){
 const values=days.map(d=>d.value),mean=avg(values),sd=Math.sqrt(avg(values.map(v=>(v-mean)**2)));
 const lo=Math.min(...values,mean-sd),hi=Math.max(...values,mean+sd),span=hi-lo||1,y=v=>84-(v-lo)/span*68,x=i=>3+i/(days.length-1)*94,pts=days.map((d,i)=>[x(i),y(d.value)]);
 return plot(`<rect x="0" y="${round(y(mean+sd))}" width="100" height="${round(y(mean-sd)-y(mean+sd))}" class="band"/><path d="${smooth(pts)}" class="trace"/>`,ctx.label,dot(...pts.at(-1)))+scaleRow(days,ctx);
}
// One bar per day; only the latest is orange. Sleep splits each bar into deep, REM and light when stages exist.
function bars(days,{stages,readings,source,...ctx}){
 const top=Math.max(...days.map(d=>d.value))||1,w=100/days.length,stage=(kind,day)=>readings.find(r=>r.kind===kind&&r.source===source&&r.observed_at.slice(0,10)===day)?.value;
 const shapes=days.map((d,i)=>{const h=d.value/top*92,x=i*w+w*.2,bw=w*.6,latest=i===days.length-1?' today':'';
  const parts=stages?['sleep_deep','sleep_rem','sleep_light'].map(k=>Number(stage(k,d.day))||0):[],sum=parts.reduce((s,n)=>s+n,0);
  if(!sum)return `<rect x="${round(x)}" y="${round(100-h)}" width="${round(bw)}" height="${round(h)}" class="bar${latest}"/>`;
  let y=100;return parts.map((p,j)=>{const ph=p/sum*h;y-=ph;return `<rect x="${round(x)}" y="${round(y)}" width="${round(bw)}" height="${round(Math.max(0,ph-.8))}" class="stage s${j}${latest}"/>`}).join('')}).join('');
 return plot(shapes,ctx.label)+scaleRow(days,ctx);
}

const windowDays=(rows,now)=>dailyMeans(rows,{days:WINDOW,now});
export function metricVisual(m,rows,{readings=[],now=Date.now()}={}){
 const days=windowDays(rows,now);if(!days.length)return '';
 if(days.length<2)return `<span class="vsingle">One recorded day in the last ${WINDOW}</span>`;
 const ctx={label:`${m.name}: ${days.length} of the last ${WINDOW} days recorded`,readings,source:rows[0]?.source,now,today:m.group==='sleep'?'Last night':'Today',stages:m.kind==='sleep'};
 return m.kind==='sleep'||barKinds.has(m.kind)?bars(days,ctx):line(days,ctx);
}

const arrow='<svg viewBox="0 0 24 24"><path d="M6 18 18 6 M7 6h11v11"/></svg>';
const footHTML=(foot,tag='span')=>`<${tag} class="vcard-foot">${foot.filter(Boolean).map(f=>`<span>${f}</span>`).join('')}</${tag}>`;
// One card. `badge` is already-escaped HTML (the change, "Unusual · …", or "Last 20 Aug"); `caption` and `status`
// say the same in words; `foot` holds the 30-day average (and the source when it differs from the page's).
export function vcard({m,r,rows,badge='',caption='',status='',foot=[],cells=[],hero=false,stale=false,readings=[],empty=''}){
 if(hero)return heroCard({m,r,rows,badge,caption,foot,cells});
 const visual=r?metricVisual(m,rows,{readings})||`<span class="vsingle">No readings in the last ${WINDOW} days</span>`:`<span class="vsingle">${esc(empty)}</span>`;
 return `<button class="card vcard ${stale?'is-stale':''}" data-metric="${m.kind}" aria-label="${esc(m.name)}${r?`: ${formatValue(r.value,m.kind)} ${esc(m.unit)}`:''}${status?`, ${esc(status)}`:''}. Open details"><span class="card-head"><span class="marker" aria-hidden="true"></span><span class="vcard-title">${esc(m.name)}</span><span class="spacer"></span><span class="vcard-arrow" aria-hidden="true">${arrow}</span></span><span class="vcard-value"><span class="stat"><b>${r?formatValue(r.value,m.kind):'—'}</b>${m.unit?`<small>${esc(m.unit)}</small>`:''}</span>${badge}</span>${caption?`<span class="stat-caption">${caption}</span>`:''}<span class="vcard-visual">${visual}</span>${footHTML(foot)}</button>`;
}
// The focal card on Vitals speaks the Home trend's language: the last 14 days against the usual range.
function heroCard({m,r,rows,badge,caption,foot,cells}){
 const days=windowDays(rows,Date.now()),id=`vhero-${m.kind}`;
 const chart=days.length>=2?`<div class="vcard-trend">${trendChart(days,{label:`${m.name} over the last ${days.length} recorded days`,format:v=>formatValue(v,m.kind)})}</div><div class="legend"><span><i class="t-accent"></i>Above your ${WINDOW}-day average</span><span><i class="band-key"></i>Your usual range</span></div>`:`<span class="vsingle">Your trend appears once there are two days of readings.</span>`;
 return `<section class="card dark vcard is-hero" aria-labelledby="${id}"><div class="card-head"><span class="marker" aria-hidden="true"></span><h2 id="${id}">${esc(m.name)} <span class="muted">· ${WINDOW} days</span></h2><span class="spacer"></span>${badge}<button class="icon-btn small" data-metric="${m.kind}" aria-label="Open ${esc(m.name)} details">${arrow}</button></div><div class="vcard-value"><div class="stat"><b>${formatValue(r.value,m.kind)}</b>${m.unit?`<small>${esc(m.unit)}</small>`:''}</div></div>${caption?`<span class="stat-caption">${caption}</span>`:''}${chart}${cells.length?`<div class="vcard-cells">${cells.map(([k,v])=>`<span><small>${k}</small><b>${v}</b></span>`).join('')}</div>`:''}${footHTML(foot,'div')}</section>`;
}
