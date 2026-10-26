// Re-encode photos before they leave the device: fixes orientation, accepts large phone photos
// and HEIC (where the browser can decode it), and drops EXIF metadata such as GPS location.
const MAX_INPUT=40*1024*1024;
async function decode(file){
 try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch{}
 // Safari can display HEIC in <img> even where createImageBitmap(Blob) fails.
 const url=URL.createObjectURL(file);
 try{const img=new Image();img.decoding='async';img.src=url;await img.decode();return img}
 catch{throw Error(/hei[cf]/i.test(file.type+file.name)?'This browser can’t open HEIC photos. Choose the photo from your iPhone, or export it as JPEG first.':'This photo could not be opened. Choose a JPG, PNG, WebP or HEIC photo.')}
 finally{URL.revokeObjectURL(url)}
}
export function isImageFile(file){return !!file&&(/^image\//.test(file.type)||/\.(hei[cf]|jpe?g|png|webp)$/i.test(file.name||''))}
export async function prepareImage(file,{maxSide=2048,quality=.88}={}){
 if(!isImageFile(file))throw Error('Choose a photo: JPG, PNG, WebP or HEIC.');
 if(!file.size||file.size>MAX_INPUT)throw Error('Choose a photo under 40 MB.');
 const image=await decode(file),width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
 if(!width||!height)throw Error('This photo could not be opened. Try another photo.');
 const scale=Math.min(1,maxSide/Math.max(width,height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close?.();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob)throw Error('This photo could not be prepared. Try another photo.');
 return new File([blob],(file.name||'photo').replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
}
export async function photoDataURL(file,options){const prepared=await prepareImage(file,options);return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('This photo could not be read.'));reader.readAsDataURL(prepared)})}
