// Each metric gets its own accent and glyph so cards are distinguishable at a glance.
// Colours identify the signal only; they never mean good or bad.
const glyphs={
 heart:'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
 pulse:'M3 12h4l2-5 4 10 2-5h6',
 drop:'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z',
 wave:'M2 12c2 0 2-5 4-5s2 10 4 10 2-10 4-10 2 10 4 10 2-5 4-5',
 moon:'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',
 bolt:'M13 2 5 13h6l-1 9 8-11h-6z',
 wind:'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h8',
 thermo:'M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z M12 9v7',
 scale:'M4 20h16l-2-13H6z M9 11a3 3 0 0 1 6 0 M12 11l1.5-1.5',
 percent:'M19 5 5 19 M7 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
 muscle:'M6 9v6 M18 9v6 M3 11v2 M21 11v2 M6 12h12',
 steps:'M8 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z M7 16h3v3a1.5 1.5 0 0 1-3 0z M16 7c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z M15 20h3',
 flame:'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
 clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
 star:'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z'
};
const styles={
 resting_hr:['#e5484d','heart'],heart_rate:['#e2577f','pulse'],spo2:['#2f7bea','drop'],hrv:['#8b5cf6','wave'],hrv_sdnn:['#a35ef0','wave'],
 recovery:['#169b67','bolt'],respiratory_rate:['#0e9fb3','wind'],skin_temperature:['#ee7a30','thermo'],
 sleep:['#4f5bd5','moon'],sleep_deep:['#3a46b8','moon'],sleep_rem:['#9466ea','moon'],sleep_light:['#5e8fe8','moon'],sleep_awake:['#e3962f','clock'],
 sleep_performance:['#5a62d6','star'],sleep_efficiency:['#3f7fe0','clock'],sleep_consistency:['#7a6fe3','clock'],sleep_needed:['#5f6fe0','moon'],sleep_debt:['#d9774a','clock'],sleep_disturbances:['#9b77d4','pulse'],nap:['#7385ec','moon'],
 weight:['#56688d','scale'],body_fat:['#d4802c','percent'],lean_mass:['#0f8f84','muscle'],steps:['#d99a0b','steps'],active_energy:['#ef5a2a','flame'],
 strain:['#f0612e','bolt'],energy_burned:['#e8743b','flame']
};
export function metricStyle(kind){const [accent,glyph]=styles[kind]||['#64748b','pulse'];return {accent,glyph:glyphs[glyph]}}
export function metricIcon(kind){return `<span class="metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${metricStyle(kind).glyph}"/></svg></span>`}
// Neutral comparison of the latest reading with the 30-day mean of daily means.
export function metricDelta(latest,mean){const a=Number(latest),b=Number(mean);if(!Number.isFinite(a)||!Number.isFinite(b)||!b)return null;const pct=(a-b)/Math.abs(b)*100;if(Math.abs(pct)<1)return {direction:'flat',label:'Steady',title:'Within 1% of your 30-day average'};const size=Math.abs(pct)<10?Math.abs(pct).toFixed(1).replace(/\.0$/,''):Math.round(Math.abs(pct));return {direction:pct>0?'up':'down',label:`${pct>0?'↑':'↓'} ${size}%`,title:`${size}% ${pct>0?'above':'below'} your 30-day average`}}
