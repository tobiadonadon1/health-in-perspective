// CSV for spreadsheets. Cells a spreadsheet would run as a formula (=, +, -, @) are prefixed with an apostrophe.
export function toCSV(rows){
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 const cell=v=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s};
 return [keys.join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
}
