// Random-access ZIP reader for very large exports (Apple Health archives are often several GB).
// Reads only the central directory into memory, then streams one entry at a time.
import {Inflate} from 'fflate';
const u16=(v,o)=>v.getUint16(o,true),u32=(v,o)=>v.getUint32(o,true),u64=(v,o)=>Number(v.getBigUint64(o,true));
async function bytes(file,start,end){return new DataView(await file.slice(start,end).arrayBuffer())}
export async function zipEntries(file){
 const tail=Math.min(file.size,65557),view=await bytes(file,file.size-tail,file.size);let eocd=-1;
 for(let i=tail-22;i>=0;i--)if(u32(view,i)===0x06054b50){eocd=i;break}
 if(eocd<0)throw Error('This ZIP archive is incomplete. Download the export again, or choose export.xml.');
 let count=u16(view,eocd+10),size=u32(view,eocd+12),offset=u32(view,eocd+16);
 if(count===0xffff||size===0xffffffff||offset===0xffffffff){
  const locator=eocd-20;if(locator<0||u32(view,locator)!==0x07064b50)throw Error('This ZIP archive could not be read.');
  const at=u64(view,locator+8),record=await bytes(file,at,at+56);if(u32(record,0)!==0x06064b50)throw Error('This ZIP archive could not be read.');
  count=u64(record,32);size=u64(record,40);offset=u64(record,48);
 }
 if(offset+size>file.size)throw Error('This ZIP archive is incomplete. Download the export again.');
 const cd=await bytes(file,offset,offset+size),names=new TextDecoder(),entries=[];
 for(let p=0,n=0;n<count&&p+46<=cd.byteLength;n++){
  if(u32(cd,p)!==0x02014b50)throw Error('This ZIP archive could not be read.');
  const nameLength=u16(cd,p+28),extraLength=u16(cd,p+30),commentLength=u16(cd,p+32);
  const entry={name:names.decode(new Uint8Array(cd.buffer,cd.byteOffset+p+46,nameLength)),method:u16(cd,p+10),compressedSize:u32(cd,p+20),size:u32(cd,p+24),headerOffset:u32(cd,p+42)};
  // Zip64 stores oversized values in extra field 0x0001, in a fixed order.
  for(let e=p+46+nameLength,end=e+extraLength;e+4<=end;){const id=u16(cd,e),length=u16(cd,e+2);if(id===1){let q=e+4;for(const key of ['size','compressedSize','headerOffset'])if(entry[key]===0xffffffff){entry[key]=u64(cd,q);q+=8}}e+=4+length}
  entries.push(entry);p+=46+nameLength+extraLength+commentLength;
 }
 return entries;
}
// Calls onChunk(Uint8Array) with decompressed data. Memory stays bounded by the chunk size.
export async function readEntry(file,entry,onChunk,onProgress=()=>{}){
 if(![0,8].includes(entry.method))throw Error('This ZIP archive uses an unsupported compression method. Unzip it and choose export.xml.');
 const header=await bytes(file,entry.headerOffset,entry.headerOffset+30);if(u32(header,0)!==0x04034b50)throw Error('This ZIP archive could not be read.');
 const start=entry.headerOffset+30+u16(header,26)+u16(header,28),reader=file.slice(start,start+entry.compressedSize).stream().getReader();
 let failure=null,read=0;const inflate=entry.method===8?new Inflate((chunk)=>{try{onChunk(chunk)}catch(e){failure||=e}}):null;
 while(true){const {done,value}=await reader.read();if(failure)break;if(done){inflate?.push(new Uint8Array(0),true);break}read+=value.length;if(inflate)inflate.push(value,false);else onChunk(value);if(failure)break;onProgress(read/(entry.compressedSize||1))}
 if(failure){await reader.cancel().catch(()=>{});throw failure}
}
