// Replaces the browser's validation bubbles with inline messages in the app's own style.
// Native constraints (required, min, maxlength…) stay the source of truth; only the presentation changes.
export function validationText(el){
 const v=el.validity;
 if(v.valueMissing)return el.type==='checkbox'?'Tick this box to continue.':el.type==='radio'?'Choose one option.':el.type==='file'?'Choose a file.':el.tagName==='SELECT'?'Choose an option.':'This field is required.';
 if(v.typeMismatch)return el.type==='email'?'Enter a valid email address, like name@example.com.':'Check the format of this field.';
 if(v.badInput)return el.type==='number'?'Enter a number.':el.type==='date'?'Enter a complete date.':'Check this value.';
 if(v.tooShort)return `Use at least ${el.minLength} characters.`;
 if(v.tooLong)return `Use at most ${el.maxLength} characters.`;
 if(v.rangeUnderflow)return el.type==='date'?`Choose ${el.min} or later.`:`Enter ${el.min} or more.`;
 if(v.rangeOverflow)return el.type==='date'?'Choose today or an earlier date.':`Enter ${el.max} or less.`;
 if(v.stepMismatch)return el.step&&Number(el.step)>=1?'Enter a whole number.':'Enter a valid number.';
 if(v.patternMismatch)return el.title||'Check the format of this field.';
 return el.validationMessage||'Check this field.';
}
let counter=0;
// The message lives inside the field's own label (or after a radio group), so grid layouts keep it under its field.
function place(el,message){if(el.type==='radio'){(el.closest('fieldset')||el.closest('label')||el).insertAdjacentElement('afterend',message);return}const label=el.closest('label');if(label&&!label.classList.contains('upload-zone')&&el.type!=='checkbox')label.append(message);else (label||el).insertAdjacentElement('afterend',message)}
function clear(el){
 if(!(el instanceof Element))return;
 const group=el.type==='radio'&&el.name&&el.form?[...el.form.querySelectorAll(`[name="${CSS.escape(el.name)}"]`)]:[el];
 for(const field of group){field.removeAttribute('aria-invalid');const id=field.dataset.errorId;if(id){document.getElementById(id)?.remove();delete field.dataset.errorId;field.setAttribute('aria-describedby',(field.getAttribute('aria-describedby')||'').split(' ').filter(x=>x&&x!==id).join(' '));if(!field.getAttribute('aria-describedby'))field.removeAttribute('aria-describedby')}}
}
function show(el){
 clear(el);const id='field-error-'+(++counter),message=document.createElement('span');
 message.id=id;message.className='field-error';message.setAttribute('aria-hidden','true');message.textContent=validationText(el);
 place(el,message);
 el.dataset.errorId=id;el.setAttribute('aria-invalid','true');el.setAttribute('aria-describedby',[el.getAttribute('aria-describedby'),id].filter(Boolean).join(' '));
}
export function installFormErrors(doc=document){
 let focused=false;
 // Preventing the `invalid` event suppresses the native bubble; submission is still blocked.
 doc.addEventListener('invalid',e=>{const el=e.target;e.preventDefault();if(el.type==='radio'&&el.form?.querySelector(`[name="${CSS.escape(el.name)}"][data-error-id]`))return;show(el);if(!focused){focused=true;el.focus();queueMicrotask(()=>{focused=false})}},true);
 for(const type of ['input','change'])doc.addEventListener(type,e=>clear(e.target),true);
}
