// Keep the stored digital key so existing profiles receive the replacement automatically.
export const representations = [
 {id:'photo',title:'Your own portrait',description:'Your likeness, rendered in the Xeyo style from a photo.',label:'Default'},
 {id:'digital',title:'Vitruvian man',description:'A classical figure, reimagined in the Xeyo palette. No photo needed.'},
 {id:'stats',title:'Just the statistics',description:'Your measurements take the whole stage.'}
];
export function validateProfile(input){
 if(!representations.some(r=>r.id===input.representation))throw Error('Choose how you want to see your dashboard.');
 if(!['woman','man','nonbinary','unspecified'].includes(input.gender))throw Error('Choose a gender option, or prefer not to say.');
 const age=Number(input.age);if(!Number.isInteger(age)||age<18||age>120)throw Error('Enter an age between 18 and 120. Xeyo is currently for adults.');
 return {representation:input.representation,gender:input.gender,age,peer_opt_in:input.peer_opt_in===true,photo_record_id:input.photo_record_id||null};
}
// Each UTC day contributes equally, even when a device reports more frequently.
export function metricSummary(rows,{days=30,now=Date.now()}={}){
 const daily=new Map();
 for(const r of rows){const time=Date.parse(r.observed_at),value=Number(r.value);if(r.value==null||!Number.isFinite(value)||!Number.isFinite(time)||time>now||time<now-days*86400000)continue;const key=new Date(time).toISOString().slice(0,10);const values=daily.get(key)||[];values.push(value);daily.set(key,values)}
 const values=[...daily.values()].map(a=>a.reduce((s,n)=>s+n,0)/a.length);
 return {mean:values.length?values.reduce((s,n)=>s+n,0)/values.length:null,days:values.length,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};
}
