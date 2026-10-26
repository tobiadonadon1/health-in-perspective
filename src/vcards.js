// Visual cards: one saturated colour field per metric and a data-driven line drawing per signal.
// Line art is 1px white; one accent dot marks today. Every shape is drawn from the person's own readings.
import {formatValue} from './metrics.js';
import {dailyMeans} from './insights.js';
import {escapeHTML as esc} from './domain.js';

// Colour identifies the signal, never a judgement. Light palettes carry near-black text.
const palette={recovery:'forest',hrv:'lagoon',hrv_sdnn:'lagoon',resting_hr:'dusk',heart_rate:'dusk',spo2:'citrus',respiratory_rate:'amber',skin_temperature:'citrus',sleep:'noir',sleep_deep:'noir',sleep_rem:'lagoon',sleep_light:'dusk',sleep_awake:'amber',sleep_performance:'forest',sleep_efficiency:'lagoon',sleep_consistency:'dusk',sleep_needed:'noir',sleep_debt:'amber',sleep_disturbances:'dusk',nap:'lagoon',steps:'citrus',active_energy:'amber',weight:'dusk',body_fat:'amber',lean_mass:'forest'};
export const paletteFor=kind=>palette[kind]||'dusk';
const lightPalettes=new Set(['citrus','amber','sand']);
export const isLightPalette=name=>lightPalettes.has(name);
const visualKind={recovery:'rings',hrv:'rings',hrv_sdnn:'rings',sleep_performance:'rings',sleep_efficiency:'rings',sleep_consistency:'rings',spo2:'waves',respiratory_rate:'arc',skin_temperature:'arc',sleep:'stack',sleep_deep:'bars',sleep_rem:'bars',sleep_light:'bars',nap:'bars',steps:'bars',active_energy:'bars'};
export const visualFor=kind=>visualKind[kind]||'line';

const round=n=>Math.round(n*10)/10;
const scale=(values,lo=12,hi=88)=>{const min=Math.min(...values),max=Math.max(...values),span=max-min||1;return v=>hi-(v-min)/span*(hi-lo)};
const dot=(x,y,cls='live')=>`<i class="vdot ${cls}" style="left:${round(x)}%;top:${round(y)}%"></i>`;
// Catmull-Rom through the points, as cubic Béziers: smooth, and it passes through every reading.
function smooth(points){if(points.length<2)return '';let d=`M${round(points[0][0])} ${round(points[0][1])}`;for(let i=0;i<points.length-1;i++){const p0=points[i-1]||points[i],p1=points[i],p2=points[i+1],p3=points[i+2]||p2;d+=` C${round(p1[0]+(p2[0]-p0[0])/6)} ${round(p1[1]+(p2[1]-p0[1])/6)} ${round(p2[0]-(p3[0]-p1[0])/6)} ${round(p2[1]-(p3[1]-p1[1])/6)} ${round(p2[0])} ${round(p2[1])}`}return d}
const stretch=(inner,label)=>`<svg class="vline" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${inner}</svg>`;
const glow=id=>`<defs><filter id="${id}" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

// Today's value as a ring among the last days: concentric on small cards, a stacked column on the hero.
function rings(days,{hero,kind,label}){
 const values=days.map(d=>d.value),min=Math.min(...values),max=Math.max(...values),norm=v=>max>min?(v-min)/(max-min):.5,id='g-'+kind;
 if(hero){const list=days.slice(-14),step=136/Math.max(1,list.length-1);
  const shapes=list.map((d,i)=>{const rx=12+norm(d.value)*34,cy=14+i*step,last=i===list.length-1;return `<ellipse cx="50" cy="${round(cy)}" rx="${round(rx)}" ry="${round(rx*.2)}" class="${last?'ring today':'ring'}"/>${last?`<circle cx="50" cy="${round(cy+rx*.2)}" r="2.6" class="live-dot" filter="url(#${id})"/>`:''}`}).join('');
  return `<svg class="vfixed" viewBox="0 0 100 160" role="img" aria-label="${esc(label)}">${glow(id)}<line x1="50" x2="50" y1="6" y2="154" class="axis"/>${shapes}</svg><span class="vscale"><span>${list.length} days ago</span><span>Today</span></span>`}
 // Small cards: one ring per day in a row, its height set by the value; today carries the accent.
 const list=days.slice(-9),gap=100/list.length;
 const shapes=list.map((d,i)=>{const ry=6+norm(d.value)*14,cx=gap/2+i*gap,last=i===list.length-1;return `<ellipse cx="${round(cx)}" cy="22" rx="${round(gap*.62)}" ry="${round(ry)}" class="${last?'ring today':'ring'}"/>${last?`<circle cx="${round(cx)}" cy="${round(22-ry)}" r="2.4" class="live-dot" filter="url(#${id})"/>`:''}`}).join('');
 return `<svg class="vfixed" viewBox="0 0 100 44" role="img" aria-label="${esc(label)}">${glow(id)}${shapes}</svg>`;
}
// The 30-day curve with two softer echoes; white dots at the low and the high, the accent at today.
function waves(days,{label}){
 const y=scale(days.map(d=>d.value),22,78),x=i=>days.length===1?50:4+i/(days.length-1)*92,pts=days.map((d,i)=>[x(i),y(d.value)]);
 const echo=(dx,dy)=>smooth(pts.map(([a,b])=>[a+dx,b+dy]));
 const values=days.map(d=>d.value),lo=values.indexOf(Math.min(...values)),hi=values.indexOf(Math.max(...values));
 return stretch(`<path d="${echo(0,8)}" class="echo"/><path d="${echo(0,-8)}" class="echo"/><path d="${smooth(pts)}" class="trace"/>`,label)+dot(...pts[lo],'mark')+dot(...pts[hi],'mark')+dot(...pts.at(-1));
}
// A thin line with a soft area below and a glowing endpoint.
function line(days,{label}){
 const y=scale(days.map(d=>d.value)),x=i=>days.length===1?50:3+i/(days.length-1)*94,pts=days.map((d,i)=>[x(i),y(d.value)]),path=smooth(pts);
 return stretch(`<path d="${path} L${round(pts.at(-1)[0])} 100 L${round(pts[0][0])} 100Z" class="area"/><path d="${path}" class="trace"/>`,label)+dot(...pts.at(-1));
}
// The person's own 30-day range as a dotted arc; the accent shows where today sits in it.
function arc(days,{kind,label}){
 const values=days.map(d=>d.value),min=Math.min(...values),max=Math.max(...values),today=values.at(-1),t=max>min?(today-min)/(max-min):.5,id='g-'+kind;
 const at=f=>{const a=Math.PI*(1-f);return [60+48*Math.cos(a),58-48*Math.sin(a)]};
 const ticks=Array.from({length:13},(_,i)=>{const [cx,cy]=at(i/12);return `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(.8+i/12*1.8)}" class="tick"/>`}).join('');
 const [px,py]=at(t);
 return `<svg class="vfixed" viewBox="0 0 120 66" role="img" aria-label="${esc(label)}">${glow(id)}<path d="M12 58 A48 48 0 0 1 108 58" class="ring"/>${ticks}<circle cx="${round(px)}" cy="${round(py)}" r="3" class="live-dot" filter="url(#${id})"/></svg><span class="vscale"><span>${formatValue(min,kind)} low</span><span>30-day range</span><span>${formatValue(max,kind)} high</span></span>`;
}
// Nights as stacked stage bars (deep, REM, light) when stages exist; a plain bar otherwise.
function stack(days,{readings,source,label}){
 const list=days.slice(-14),stage=(kind,day)=>readings.find(r=>r.kind===kind&&r.source===source&&r.observed_at.slice(0,10)===day)?.value;
 const top=Math.max(...list.map(d=>d.value))||1,w=100/list.length;
 const bars=list.map((d,i)=>{const parts=['sleep_deep','sleep_rem','sleep_light'].map(k=>Number(stage(k,d.day))||0),sum=parts.reduce((s,n)=>s+n,0),h=d.value/top*78,x=i*w+w*.18,bw=w*.64;
  if(!sum)return `<rect x="${round(x)}" y="${round(96-h)}" width="${round(bw)}" height="${round(h)}" class="bar"/>`;
  let y=96;return parts.map((p,j)=>{const ph=p/sum*h;y-=ph;return `<rect x="${round(x)}" y="${round(y)}" width="${round(bw)}" height="${round(ph)}" class="stage s${j}"/>`}).join('')}).join('');
 const last=list.at(-1);return stretch(bars,label)+dot((list.length-1)*w+w/2,96-last.value/top*78);
}
function bars(days,{label}){
 const list=days.slice(-14),top=Math.max(...list.map(d=>d.value))||1,w=100/list.length;
 return stretch(list.map((d,i)=>`<rect x="${round(i*w+w*.2)}" y="${round(96-d.value/top*78)}" width="${round(w*.6)}" height="${round(d.value/top*78)}" class="${i===list.length-1?'bar today':'bar'}"/>`).join(''),label)+dot((list.length-1)*w+w/2,96-list.at(-1).value/top*78);
}
// A wireframe orb for the measurement count; decorative, so hidden from assistive technology.
export function orb(id='orb'){
 const meridians=[40,30,18,6].map(rx=>`<ellipse cx="50" cy="50" rx="${rx}" ry="40" class="ring"/>`).join(''),parallels=[[50,40,12],[34,34,8],[66,34,8]].map(([cy,rx,ry])=>`<ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" class="ring"/>`).join('');
 return `<svg class="vfixed" viewBox="0 0 100 100" aria-hidden="true">${glow(id)}${meridians}${parallels}<circle cx="50" cy="50" r="3" class="live-dot" filter="url(#${id})"/></svg>`;
}

export function metricVisual(m,rows,{hero=false,readings=[],now=Date.now()}={}){
 const days=dailyMeans(rows,{days:30,now});if(!days.length)return '';
 const label=`${days.length} ${days.length===1?'day':'days'} recorded in the last 30`;
 if(days.length<2)return `<span class="vsingle">One recorded day</span>`;
 const kind=visualFor(m.kind),ctx={hero,kind:m.kind,label,readings,source:rows[0]?.source};
 return kind==='rings'?rings(days,ctx):kind==='waves'?waves(days,ctx):kind==='arc'?arc(days,ctx):kind==='stack'?stack(days,ctx):kind==='bars'?bars(days,ctx):line(days,ctx);
}

// One card. `pill` is already-escaped HTML for the status chip (Steady, ↑ 4%, Unusual, Last 20 Aug).
export function vcard({m,r,rows,pill='',foot=[],hero=false,stale=false,readings=[],empty=''}){
 const pal=paletteFor(m.kind);
 return `<button class="vcard pal-${pal} ${isLightPalette(pal)?'tone-light':''} ${hero?'is-hero':''} ${stale?'is-stale':''}" data-metric="${m.kind}" aria-label="${esc(m.name)}${r?`: ${formatValue(r.value,m.kind)} ${esc(m.unit)}`:''}. Open details"><span class="vcard-head"><span class="vcard-label">${esc(m.name)}</span><span class="vcard-arrow" aria-hidden="true">↗</span></span><span class="vcard-value"><b>${r?formatValue(r.value,m.kind):'—'}</b><small>${esc(m.unit)}</small>${pill&&!hero?`<span class="vcard-pills inline">${pill}</span>`:''}</span>${pill&&hero?`<span class="vcard-pills">${pill}</span>`:''}<span class="vcard-visual">${r?metricVisual(m,rows,{hero,readings}):`<span class="vsingle">${esc(empty)}</span>`}</span><span class="vcard-foot">${foot.map(f=>`<span>${f}</span>`).join('')}</span></button>`;
}

// Today as a timeline: wake-up, meals and check-ins at the time they happened, and a marker for now.
export function todayStrip(events,{now=new Date(),from=6,to=24}={}){
 const pos=d=>{const h=d.getHours()+d.getMinutes()/60;return Math.max(0,Math.min(100,(h-from)/(to-from)*100))},nowAt=pos(now),fmt=d=>d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
 const first=events.length?Math.min(...events.map(e=>pos(e.at))):nowAt;
 const ticks=Array.from({length:(to-from)/6+1},(_,i)=>from+i*6).map(h=>`<span style="left:${round((h-from)/(to-from)*100)}%">${String(h%24).padStart(2,'0')}:00</span>`).join('');
 return `<section class="today-strip" aria-label="Today's data"><span class="today-title">Today’s data</span><div class="today-track"><i class="today-span" style="left:${round(first)}%;width:${round(Math.max(0,nowAt-first))}%"></i>${events.map(e=>`<button type="button" class="today-event ${e.kind}" style="left:${round(pos(e.at))}%" title="${esc(e.label)} · ${fmt(e.at)}" aria-label="${esc(e.label)} at ${fmt(e.at)}" ${e.nav?`data-nav="${e.nav}"`:''}></button>`).join('')}<span class="today-now" style="left:${round(nowAt)}%"><b>Now</b></span><div class="today-ticks" aria-hidden="true">${ticks}</div></div><span class="today-legend">${events.length?`${events.length} ${events.length===1?'event':'events'} today`:'Nothing logged yet today'}</span></section>`;
}
