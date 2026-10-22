export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateMeal(m){if(!String(m.name||'').trim())throw Error('Give this meal a name.');for(const k of ['calories','protein','carbs','fat'])if(m[k]===null||m[k]===undefined||String(m[k]).trim()===''||!Number.isFinite(Number(m[k]))||Number(m[k])<0||Number(m[k])>10000)throw Error('Enter valid, nonnegative nutrition values.');return {...m,name:String(m.name).slice(0,200),calories:+m.calories,protein:+m.protein,carbs:+m.carbs,fat:+m.fat};}
export function totals(meals){return meals.reduce((a,m)=>{for(const k of ['calories','protein','carbs','fat'])a[k]+=+m[k]||0;return a},{calories:0,protein:0,carbs:0,fat:0})}
export function scaleFood(food,grams){if(!Number.isFinite(+grams)||+grams<=0||+grams>5000)throw Error('Choose a portion between 1 and 5,000 g.');return validateMeal({name:food.name,...Object.fromEntries(['calories','protein','carbs','fat'].map(k=>[k,Math.round(food[k]*grams/100*10)/10])),source:food.source,grams:+grams})}
export function validateUpload(file){if(file.size>10*1024*1024)throw Error('Choose a file smaller than 10 MB.');if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use PDF, JPG, PNG or WebP.');return true}
export function localDay(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

export function validateLabResult(input){
 const marker=String(input.marker||'').trim(),unit=String(input.unit||'').trim();
 if(!marker||marker.length>120)throw Error('Enter the test name from your report.');
 if(!unit||unit.length>40)throw Error('Enter the unit printed on your report.');
 const number=(v,optional=false)=>{if(v===null||v===undefined||String(v).trim()===''){if(optional)return null;throw Error('Enter a numeric result.')}const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e9)throw Error('Enter a valid, nonnegative lab value.');return n};
 const value=number(input.value),reference_low=number(input.reference_low,true),reference_high=number(input.reference_high,true);
 if(reference_low!==null&&reference_high!==null&&reference_low>reference_high)throw Error('The lower reference limit must not exceed the upper limit.');
 const collected_on=String(input.collected_on||'');const d=new Date(collected_on+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(collected_on)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==collected_on||collected_on>localDay())throw Error('Choose a valid collection date, no later than today.');
 const laboratory=String(input.laboratory||'').trim(),notes=String(input.notes||'').trim();
 if(laboratory.length>160||notes.length>2000)throw Error('Laboratory name or notes are too long.');
 return {marker,unit,value,collected_on,reference_low,reference_high,laboratory,notes};
}
export function labRangeStatus(row){if(row.reference_low!==null&&row.reference_low!==undefined&&row.value<row.reference_low)return 'Below reference';if(row.reference_high!==null&&row.reference_high!==undefined&&row.value>row.reference_high)return 'Above reference';if(row.reference_low!=null||row.reference_high!=null)return 'Within reference';return 'No reference range'}
export function metricSeries(rows,kind,days=90,now=Date.now()){return rows.filter(r=>r.kind===kind&&Number.isFinite(Number(r.value))&&Date.parse(r.observed_at)>=now-days*86400000&&Date.parse(r.observed_at)<=now).sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at))}
