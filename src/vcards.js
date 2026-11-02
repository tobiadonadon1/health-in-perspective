// Metric cards on every page speak Home's language: the orange marker and title, the change badge and an arrow in
// the head, a big light number, when it was recorded, then the last 14 days drawn by the same chart as Home's tiles.
import {formatValue} from './metrics.js';
import {dailyMeans} from './insights.js';
import {escapeHTML as esc,dateLocale,localDay} from './domain.js';
import {trendChart,miniChart,chartType} from './charts.js';

const WINDOW=14;
const round=n=>Math.round(n*10)/10;
const windowDays=(rows,now)=>dailyMeans(rows,{days:WINDOW,now});
const single=text=>`<span class="vsingle">${esc(text)}</span>`;
const shortDay=key=>new Date(key+'T12:00:00').toLocaleDateString(dateLocale,{month:'short',day:'numeric'});

// Last night's focal chart on Sleep: one bar per night split into deep, REM and light, last night in colour.
export function metricVisual(m,rows,{readings=[],now=Date.now()}={}){
 const days=windowDays(rows,now);if(!days.length)return '';
 if(days.length<2)return single(`One recorded night in the last ${WINDOW}`);
 const source=rows[0]?.source,top=Math.max(...days.map(d=>d.value))||1,w=100/days.length;
 const stage=(kind,day)=>readings.find(r=>r.kind===kind&&r.source===source&&localDay(new Date(r.observed_at))===day)?.value;
 const shapes=days.map((d,i)=>{const h=d.value/top*92,x=i*w+w*.2,bw=w*.6,latest=i===days.length-1?' today':'';
  const parts=['sleep_deep','sleep_rem','sleep_light'].map(k=>Number(stage(k,d.day))||0),sum=parts.reduce((s,n)=>s+n,0);
  if(!sum)return `<rect x="${round(x)}" y="${round(100-h)}" width="${round(bw)}" height="${round(h)}" class="bar${latest}"/>`;
  let y=100;return parts.map((p,j)=>{const ph=p/sum*h;y-=ph;return `<rect x="${round(x)}" y="${round(y)}" width="${round(bw)}" height="${round(ph)}" class="stage s${j}${latest}"/>`}).join('')}).join('');
 const last=days.at(-1).day===localDay(new Date(now))?'Last night':shortDay(days.at(-1).day);
 return `<span class="vplot"><svg class="vline" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(m.name)}: ${days.length} of the last ${WINDOW} nights recorded">${shapes}</svg></span><span class="vscale"><span>${shortDay(days[0].day)}</span><span>${WINDOW} nights</span><span>${last}</span></span>`;
}

const arrow='<svg viewBox="0 0 24 24"><path d="M6 18 18 6 M7 6h11v11"/></svg>';
const footHTML=foot=>`<div class="vcard-foot">${foot.filter(Boolean).map(f=>`<span>${f}</span>`).join('')}</div>`;
// One card. `badge` is already-escaped HTML (the change, "Unusual · …", or "Last 20 Aug"); `caption` says when it was
// recorded (and the source when it differs from the page's); `status` says the change in words for assistive tech.
export function vcard({m,r,rows,badge='',caption='',status='',foot=[],cells=[],hero=false,stale=false,empty=''}){
 if(hero)return heroCard({m,r,rows,badge,caption,foot,cells});
 const days=windowDays(rows,Date.now()),id=`vcard-${m.kind}`;
 const visual=!r?`<div class="card-empty"><p>${esc(empty)}</p></div>`
  :days.length>=2?miniChart(days,{type:chartType(m.kind),label:`${m.name}, last ${days.length} days`,format:v=>formatValue(v,m.kind),latest:m.group==='sleep'?'Last night':'Today'})
  :single(days.length?`One recorded day in the last ${WINDOW}`:`No readings in the last ${WINDOW} days`);
 return `<section class="card tile vcard ${stale?'is-stale':''}" ${r?'data-card-open':''} aria-labelledby="${id}"><div class="card-head"><span class="marker" aria-hidden="true"></span><h2 id="${id}">${esc(m.name)}</h2><span class="spacer"></span>${badge}<button class="icon-btn small" data-metric="${m.kind}" aria-label="Open ${esc(m.name)} details${status?` (${esc(status)})`:''}">${arrow}</button></div><div class="stat"><b>${r?formatValue(r.value,m.kind):'—'}</b>${m.unit?`<small>${esc(m.unit)}</small>`:''}</div>${caption?`<span class="stat-caption">${caption}</span>`:''}${visual}</section>`;
}
// The focal card on Vitals speaks the Home trend's language: the last 14 days against the usual range.
function heroCard({m,r,rows,badge,caption,foot,cells}){
 const days=windowDays(rows,Date.now()),id=`vhero-${m.kind}`;
 const chart=days.length>=2?`<div class="vcard-trend">${trendChart(days,{label:`${m.name} over the last ${days.length} recorded days`,format:v=>formatValue(v,m.kind)})}</div><div class="legend"><span><i class="t-accent"></i>Above your ${WINDOW}-day average</span><span><i class="band-key"></i>Your usual range</span></div>`:single('Your trend appears once there are two days of readings.');
 return `<section class="card dark vcard is-hero" data-card-open aria-labelledby="${id}"><div class="card-head"><span class="marker" aria-hidden="true"></span><h2 id="${id}">${esc(m.name)} <span class="muted">· ${WINDOW} days</span></h2><span class="spacer"></span>${badge}<button class="icon-btn small" data-metric="${m.kind}" aria-label="Open ${esc(m.name)} details">${arrow}</button></div><div class="vcard-value"><div class="stat"><b>${formatValue(r.value,m.kind)}</b>${m.unit?`<small>${esc(m.unit)}</small>`:''}</div></div>${caption?`<span class="stat-caption">${caption}</span>`:''}${chart}${cells.length?`<div class="vcard-cells">${cells.map(([k,v])=>`<span><small>${k}</small><b>${v}</b></span>`).join('')}</div>`:''}${footHTML(foot)}</section>`;
}
