// Sample data for exploring Xeyo before connecting a source. It is generated in the browser, labelled
// "Sample data" everywhere it appears, never saved, and only offered while an account has no readings.
export const DEMO_SOURCE='Sample data';
const DAY=86400000;
const signals=[
 ['resting_hr','bpm',58,3,0],['hrv','ms',62,9,0],['spo2','%',97.2,.6,1],['respiratory_rate','breaths/min',14.8,.5,1],
 ['skin_temperature','°C',33.6,.25,2],['recovery','%',68,14,0],['sleep_performance','%',84,7,0],['sleep_efficiency','%',91,3,0],
 ['sleep_awake','min',42,12,0],['steps','',8400,2600,0],['active_energy','kcal',520,140,0]
];
const wave=(i,k)=>Math.sin(i*1.7+k*2.3)*.6+Math.sin(i*.45+k)*.4;
export function demoReadings(now=Date.now(),days=30){
 const rows=[],at=i=>{const d=new Date(now-i*DAY);d.setHours(7,0,0,0);return d.toISOString()};
 for(let i=0;i<days;i++){
  signals.forEach(([kind,unit,base,spread,decimals],k)=>{const value=Math.max(0,base+wave(i,k)*spread);rows.push({id:`demo-${kind}-${i}`,kind,unit,value:+value.toFixed(decimals),source:DEMO_SOURCE,observed_at:at(i)})});
  const deep=1.4+wave(i,20)*.3,rem=1.8+wave(i,21)*.35,light=4.3+wave(i,22)*.5;
  for(const [kind,value] of [['sleep_deep',deep],['sleep_rem',rem],['sleep_light',light],['sleep',deep+rem+light]])rows.push({id:`demo-${kind}-${i}`,kind,unit:'hours',value:+value.toFixed(2),source:DEMO_SOURCE,observed_at:at(i)});
 }
 rows.push({id:'demo-weight',kind:'weight',unit:'kg',value:71.4,source:DEMO_SOURCE,observed_at:at(2)});
 return rows.sort((a,b)=>b.observed_at.localeCompare(a.observed_at));
}
