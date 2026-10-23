// A restrained clinical pulse accent, separate from the supplied Xeyo logo.
export function journalBloom(size='small'){
 return `<span class="journal-bloom bloom-${size}" aria-hidden="true"><svg viewBox="0 0 80 80" focusable="false"><path class="pulse-frame" d="M22 10h36a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12H22a12 12 0 0 1-12-12V22a12 12 0 0 1 12-12Z"/><path class="pulse-trace" d="M21 41h11l6-15 8 28 6-13h8"/><circle class="pulse-terminal" cx="60" cy="41" r="2.6"/></svg></span>`;
}
