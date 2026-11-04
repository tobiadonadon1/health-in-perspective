// AES-256-GCM sealing for stored provider tokens. The key is TOKEN_ENCRYPTION_KEY (32 bytes, base64), never in code.
const b64=a=>{let s='';for(const x of a)s+=String.fromCharCode(x);return btoa(s)};
const unb64=v=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
export function createSealer(base64Key){
 let key;const cryptoKey=async()=>{if(key)return key;const bytes=unb64(base64Key||'');if(bytes.length!==32)throw Error('Invalid encryption configuration');key=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);return key};
 return {
  async seal(value){const iv=crypto.getRandomValues(new Uint8Array(12));const out=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptoKey(),new TextEncoder().encode(JSON.stringify(value)));return b64(iv)+'.'+b64(new Uint8Array(out))},
  async unseal(value){const [iv,cipher]=String(value).split('.').map(unb64);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await cryptoKey(),cipher)))},
 };
}
