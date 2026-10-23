// Small, warm editorial accents, distinct from the Xeyo brand mark.
export function journalBloom(size='small'){
 const colors=['#f7a263','#efa17f','#d7a8cc','#b7a2db','#94bfc3','#a9c99a','#d2d887','#f4c36e'];
 return `<span class="journal-bloom bloom-${size}" aria-hidden="true"><svg viewBox="0 0 80 80" focusable="false">${colors.map((c,i)=>`<ellipse cx="40" cy="22" rx="9" ry="19" fill="${c}" transform="rotate(${i*45} 40 40)"/>`).join('')}<circle cx="40" cy="40" r="9" fill="#fff2cb"/><circle cx="40" cy="40" r="4" fill="#dd8c56"/></svg></span>`;
}
