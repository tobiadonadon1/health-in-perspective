// Sample data for exploring Xeyo before connecting a source. It is generated in the browser, labelled
// "Sample data" everywhere it appears, never saved, and only offered while an account has no readings.
export const DEMO_SOURCE='Sample data';
const DAY=86400000;
const signals=[
 ['resting_hr','bpm',58,3,0],['hrv','ms',62,9,0],['spo2','%',97.2,.6,1],['respiratory_rate','breaths/min',14.8,.5,1],
 ['skin_temperature','°C',33.6,.25,2],['recovery','%',68,14,0],['sleep_performance','%',84,7,0],['sleep_efficiency','%',91,3,0],
 ['sleep_awake','min',42,12,0],['steps','',8400,2600,0],['active_energy','kcal',520,140,0],
 ['strain','',11.6,3.4,1],['heart_rate','bpm',66,4,0],['energy_burned','kcal',2480,320,0]
];
const wave=(i,k)=>Math.sin(i*1.7+k*2.3)*.6+Math.sin(i*.45+k)*.4;
export function demoReadings(now=Date.now(),days=30){
 const rows=[],at=i=>{const d=new Date(now-i*DAY);d.setHours(7,0,0,0);return d.toISOString()};
 for(let i=0;i<days;i++){
  signals.forEach(([kind,unit,base,spread,decimals],k)=>{const value=Math.max(0,base+wave(i,k)*spread);rows.push({id:`demo-${kind}-${i}`,kind,unit,value:+value.toFixed(decimals),source:DEMO_SOURCE,observed_at:at(i)})});
  const deep=1.45+wave(i,20)*.3,rem=1.85+wave(i,21)*.35,light=4.6+wave(i,22)*.55;
  for(const [kind,value] of [['sleep_deep',deep],['sleep_rem',rem],['sleep_light',light],['sleep',deep+rem+light]])rows.push({id:`demo-${kind}-${i}`,kind,unit:'hours',value:+value.toFixed(2),source:DEMO_SOURCE,observed_at:at(i)});
 }
 // A weigh-in every four days, drifting down a little, so the weight card has a trend to show.
 for(let w=0;w<8;w++)rows.push({id:`demo-weight-${w}`,kind:'weight',unit:'kg',value:+(71.4+w*.18+wave(w,30)*.15).toFixed(1),source:DEMO_SOURCE,observed_at:at(2+w*4)});
 return rows.sort((a,b)=>b.observed_at.localeCompare(a.observed_at));
}
// Today's meals and a week of moods for the Home cards while exploring. They are never saved or listed for editing.
export function demoMeals(now=Date.now()){
 const at=h=>{const d=new Date(now);d.setHours(h,0,0,0);return d.toISOString()};
 return [['Greek yogurt with berries and granola','Breakfast',340,26,36,9,8],['Chicken wrap','Lunch',520,34,48,18,13],['Salmon, rice and greens','Dinner',640,42,58,24,19]].map(([name,meal_type,calories,protein,carbs,fat,h],i)=>({id:`demo-meal-${i}`,name,meal_type,calories,protein,carbs,fat,created_at:at(h),source:DEMO_SOURCE}));
}
export function demoJournal(now=Date.now()){
 const day=i=>{const d=new Date(now-i*DAY);return d.toLocaleDateString('en-CA')};
 return ['good','okay','great','good','low','good'].map((mood,i)=>({id:`demo-note-${i}`,logged_on:day(i+1),mood,content:'Sample check-in'}));
}
