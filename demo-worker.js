/* Pi Explorer browser engine. No network or native-server dependencies. */
'use strict';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function encodeLetters(digits,scheme='mod26',alignment=0){
 const step=scheme==='ascii'?3:2,length=Math.max(0,Math.floor((digits.length-alignment)/step)),out=new Uint8Array(length);
 for(let j=0,i=alignment;j<length;j++,i+=step){let value=(digits.charCodeAt(i)-48)*10+digits.charCodeAt(i+1)-48;if(step===3)value=value*10+digits.charCodeAt(i+2)-48;
  out[j]=scheme==='mod26'?65+value%26:scheme==='a1z26'?(value>=1&&value<=26?64+value:46):(value>=32&&value<=126?value:46);}
 return new TextDecoder().decode(out);
}
function encodeBits(digits,rule='threshold'){
 const out=new Uint8Array(digits.length);for(let i=0;i<digits.length;i++){const v=digits.charCodeAt(i)-48;out[i]=(rule==='parity'?v%2:v>=5)?49:48;}return new TextDecoder().decode(out);
}
async function findColorShapes(digits,rows,widths,limit,cancelled){
 const h=rows.length,w=rows[0].length,cells=[];let anchor={text:'',y:0,x:0};
 rows.forEach((row,y)=>{for(const match of row.matchAll(/[0-9]+/g))if(match[0].length>anchor.text.length)anchor={text:match[0],y,x:match.index};[...row].forEach((v,x)=>{if(v!=='?')cells.push([y,x,v]);});});
 if(!anchor.text)throw Error('Paint at least one digit color.');const found=[];let at=0,checks=0;
 while((at=digits.indexOf(anchor.text,at))>=0){if(cancelled())throw Error('Cancelled');for(const width of widths){const start=at-anchor.y*width-anchor.x;if(start<0||start+(h-1)*width+w>digits.length||start%width+w>width)continue;if(cells.every(([y,x,v])=>digits[start+y*width+x]===v))found.push({index:start,position:start+1,width,height:h,shapeWidth:w});}at++;if(found.length>=limit&&widths.length===1)break;if(++checks%2048===0)await pause();}
 found.sort((a,b)=>a.index-b.index||a.width-b.width);return[found.slice(0,limit),found.length>limit];
}
function findMatches(data,query,limit=300){const matches=[];let at=0;while(matches.length<limit){const p=data.indexOf(query,at);if(p<0)return[matches,false];matches.push(p);at=p+1;}return[matches,data.indexOf(query,at)>=0];}
async function findShapes(digits,rows,widths,rule='threshold',limit=60,progress=()=>{},cancelled=()=>false,base=0){
 if(!rows.length||rows.length>24)throw Error('Choose a shape of 1–24 rows.');const h=rows.length,w=rows[0].length,n=digits.length;
 if(w<1||w>24||rows.some(row=>row.length!==w||/[^01?]/.test(row))||!rows.some(row=>/[01]/.test(row)))throw Error('Invalid pixel pattern.');
 widths=[...new Set(widths)].filter(v=>Number.isInteger(v)&&v>=w&&v<=4096).sort((a,b)=>a-b);if(!widths.length)throw Error('Row width must fit the shape.');
 const length=Math.ceil(n/32)+2,source=new Uint32Array(length),masks=new Map();
 for(let i=0;i<n;i++){const v=digits.charCodeAt(i)-48;if(rule==='parity'?v%2:v>=5)source[i>>>5]|=1<<(i&31);}
 for(const row of new Set(rows)){
  const mask=new Uint32Array(length);
  for(let j=0;j<length;j++){let value=0xffffffff;for(let x=0;x<w;x++){if(row[x]==='?')continue;const a=source[j]||0,b=source[j+1]||0,part=x===0?a:(a>>>x)|(b<<(32-x));value&=row[x]==='1'?part:~part;if(!value)break;}mask[j]=value>>>0;}
  masks.set(row,mask);await pause();if(cancelled())throw Error('Search cancelled');
 }
 const output=[];
 for(let wi=0;wi<widths.length;wi++){
  if(cancelled())throw Error('Search cancelled');const stride=widths[wi],valid=n-(h-1)*stride-w+1;
  progress(wi/widths.length,'Searching row width '+stride);if(valid<=0)continue;
  const rowInfo=rows.map((row,y)=>{const offset=y*stride;return{mask:masks.get(row),word:offset>>>5,shift:offset&31};});
  const words=Math.ceil(valid/32);
  for(let j=0;j<words;j++){
   let candidates=0xffffffff;
   for(const {mask,word,shift} of rowInfo){const a=mask[j+word]||0,b=mask[j+word+1]||0;candidates&=shift===0?a:(a>>>shift)|(b<<(32-shift));if(!candidates)break;}
   if(j===words-1&&valid%32)candidates&=(2**(valid%32)-1);
   candidates>>>=0;
   while(candidates){const bit=31-Math.clz32(candidates&-candidates),index=j*32+bit;candidates=(candidates&(candidates-1))>>>0;
    if((index+base)%stride+w<=stride){output.push({index,position:index+1,width:stride,height:h,shapeWidth:w});if(output.length>=limit)return[output.sort((a,b)=>a.index-b.index||a.width-b.width),true];}}
  }
  await pause();
 }
 return[output.sort((a,b)=>a.index-b.index||a.width-b.width),false];
}
async function statistics(digits){
 const counts=Array(10).fill(0),n=digits.length;let run=0,last='',longest={digit:'',length:0,position:0};
 for(let i=0;i<n;i++){const c=digits[i];counts[c.charCodeAt(0)-48]++;run=c===last?run+1:1;last=c;if(run>longest.length)longest={digit:c,length:run,position:i-run+2};}
 const entropy=counts.reduce((s,v)=>v?s-v/n*Math.log2(v/n):s,0),chiSquare=n?counts.reduce((s,v)=>s+(v-n/10)**2/(n/10),0):0;
 let sha256='Unavailable in this browser context';if(globalThis.crypto?.subtle){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(digits));sha256=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
 return{counts,entropy,chiSquare,longestRun:longest,sha256,count:n};
}

if(typeof self!=='undefined'&&typeof self.postMessage==='function'){
 let file=null,offset=0,count=0,digits='',jobs=new Map();
 const post=job=>self.postMessage({type:'job',job:{...job,cancel:undefined}});
 const read=async(start,n)=>file?await file.slice(offset+start,offset+Math.min(count,start+n)).text():digits.slice(start,start+n);
 const encoded=(raw,mode,scheme,rule)=>mode==='text'?encodeLetters(raw,scheme,0):mode==='binary'?encodeBits(raw,rule):raw;
 async function tile(p){
  const step=p.mode==='text'?(p.scheme==='ascii'?3:2):1,a=p.mode==='text'?(+p.alignment||0):0;
  const total=Math.max(0,Math.floor((count-a)/step)),n=+p.rows*(+p.cols);
  if(n>450000)throw Error('View is too large. Zoom in.');
  const first=(+p.rowStart*(+p.gridWidth)+(+p.colStart)),last=((+p.rowStart+(p.rows-1)*p.rowStep)*p.gridWidth+(+p.colStart)+(p.cols-1)*p.colStep);
  if((last-first+1)*step>64*1024*1024)throw Error('View span is too large. Zoom in.');
  const raw=await read(a+first*step,Math.max(0,Math.min(count-a-first*step,(last-first+1)*step))),source=encoded(raw,p.mode,p.scheme,p.rule),out=new Uint8Array(n);out.fill(32);
  for(let r=0;r<p.rows;r++)for(let c=0;c<p.cols;c++){
   const at=r*p.rowStep*p.gridWidth+c*p.colStep,index=first+at;
   if(index<total&&at<source.length)out[r*p.cols+c]=source.charCodeAt(at);
  }
  return{...p,total,data:new TextDecoder().decode(out)};
 }
 async function search(job,p){
  const searchCount=Math.min(count,p.searchDigits??count);
  const started=performance.now(),budget=8000,limit=p.allResults?Math.min(p.pageSize||(['shape','colorShape'].includes(p.mode)?500:5000),['shape','colorShape'].includes(p.mode)?5000:50000):(['shape','colorShape'].includes(p.mode)?60:300);
  try{
   let query=String(p.query||'').trim(),scheme=p.scheme||'mod26',rule=p.rule||'threshold',alignment=+p.alignment||0;
   if(p.mode==='colors')query=query.replace(/[,\s]/g,'');
   if(p.mode==='text'&&scheme!=='ascii')query=query.toUpperCase();
   if(!['digits','colors','text','shape','colorShape'].includes(p.mode))throw Error('Unknown search mode');
   if(!['shape','colorShape'].includes(p.mode)&&(!query||query.length>2048||/[^\x20-\x7e]/.test(query)))throw Error('Use 1–2,048 ASCII characters.');
   if(['digits','colors'].includes(p.mode)&&/[^0-9]/.test(query))throw Error('Enter digits 0–9.');
   const text=p.mode==='text',step=text?(scheme==='ascii'?3:2):1,total=Math.max(0,Math.floor((searchCount-(text?alignment:0))/step));
   const start=Math.min(total,Math.max(0,Math.trunc(p.cursor||0))),matches=[];let end=start,nextWidth=-1;
   if(['shape','colorShape'].includes(p.mode)){
    const rows=p.rows,w=rows?.[0]?.length,h=rows?.length;
    if(!h||h>24||!w||w>24||rows.some(r=>r.length!==w||(p.mode==='colorShape'?/[^0-9?]/:/[^01?]/).test(r))||!rows.some(r=>(p.mode==='colorShape'?/[0-9]/:/[01]/).test(r)))throw Error('Use an equal-width pattern of 0, 1 and ?.');
    const widths=p.sweep?Array.from({length:Math.max(0,(+p.maxWidth)-Math.max(w,+p.minWidth)+1)},(_,i)=>Math.max(w,+p.minWidth)+i):[+p.width];
    if(!widths.length||widths.length>64||widths.some(v=>!Number.isInteger(v)||v<w||v>4096))throw Error('Use up to 64 valid row widths.');
    const block=256*1024,halo=(h-1)*Math.max(...widths)+w-1;
    for(let lo=start;lo<searchCount;lo+=block){
     if(job.cancel)throw Error('Cancelled');if(performance.now()-started>budget)break;
     const hi=Math.min(searchCount,lo+block),raw=await read(lo,Math.min(searchCount-lo,hi-lo+halo)),found=[];
     for(let wi=0;wi<widths.length;wi++){
      const [part]=p.mode==='colorShape'?await findColorShapes(raw,rows,[widths[wi]],limit+2,()=>job.cancel):await findShapes(raw,rows,[widths[wi]],rule,limit+2,()=>{},()=>job.cancel,lo);
      found.push(...part.filter(m=>m.index<hi-lo).map(m=>({...m,index:m.index+lo,position:m.index+lo+1})));
      job.progress=(lo+(hi-lo)*(wi+1)/widths.length)/Math.max(searchCount,1);job.message='Searching width '+widths[wi]+' · '+(lo/searchCount*100).toFixed(2)+'%';post(job);
     }
     found.sort((a,b)=>a.index-b.index||a.width-b.width);
     matches.push(...found.filter(m=>m.index>start||m.width>(p.afterWidth??-1)).slice(0,limit+1-matches.length));end=hi;
     if(matches.length>limit)break;
    }
    nextWidth=matches.length>limit?matches[limit-1].width:-1;
   }else{
    const candidates=Math.max(0,total-query.length+1),block=Math.floor(4*1024*1024/step);
    for(let lo=start;lo<candidates;lo+=block){
     if(job.cancel)throw Error('Cancelled');if(performance.now()-started>budget)break;
     const hi=Math.min(candidates,lo+block),raw=await read((text?alignment:0)+lo*step,(hi-lo+query.length-1)*step),source=encoded(raw,text?'text':'digits',scheme,rule);
     let at=0;while(matches.length<=limit&&(at=source.indexOf(query,at))>=0&&lo+at<hi){matches.push({index:lo+at,position:(lo+at)*step+(text?alignment:0)+1,unitPosition:lo+at+1,length:query.length});at++;}
     end=hi;job.progress=hi/Math.max(1,candidates);job.message='Scanned '+Math.min(total,hi+query.length-1).toLocaleString()+' of '+total.toLocaleString()+' positions';post(job);
     if(matches.length>limit)break;await pause();
    }
    if(end>=candidates)end=total;
   }
   if(job.cancel)throw Error('Cancelled');
   const capped=matches.length>limit,page=matches.slice(0,limit),next=capped?(['shape','colorShape'].includes(p.mode)?page.at(-1).index:page.at(-1).index+1):end<total?end:null;
   Object.assign(job,{searchDigits:searchCount,datasetDigits:count,status:'done',matches:page,capped,nextCursor:next,nextAfterWidth:nextWidth,complete:next===null,query,scanned:end,totalUnits:total,rangeStart:start,seconds:(performance.now()-started)/1000,progress:next===null?1:job.progress,message:next===null?'Search complete':capped?'Result page full. Continue to find more.':'Time budget reached. Continue to search the rest.'});post(job);
  }catch(e){Object.assign(job,{status:job.cancel?'cancelled':'error',message:e.message,error:e.message});post(job);}
 }
 self.onmessage=async({data:{id,cmd,args={}}})=>{
  try{let result;
   if(cmd==='init'){digits=args.digits;file=null;offset=0;count=digits.length;result={count};}
   else if(cmd==='initFile'){
    const candidate=args.file,head=await candidate.slice(0,64).text(),tail=await candidate.slice(Math.max(0,candidate.size-4096)).text();
    const off=head.startsWith('3.')?2:0,trim=tail.length-tail.trimEnd().length,n=candidate.size-off-trim;
    if(!Number.isSafeInteger(n)||n<1||!head.slice(off).startsWith('14159265358979323846264338327950288419716939937510'.slice(0,Math.min(n,50))))throw Error('This is not a raw decimal pi file. Use digits, optionally starting with 3.');
    file=candidate;offset=off;count=n;digits='';result={count,name:file.name};
   }else if(cmd==='digits'){
    const mode=args.mode||'digits',step=mode==='text'?(args.scheme==='ascii'?3:2):1,a=mode==='text'?(+args.alignment||0):0,total=Math.max(0,Math.floor((count-a)/step)),start=Math.max(0,Math.min(total,+args.start||0)),n=Math.min(4096,+args.count||50,total-start);
    result={data:encoded(await read(a+start*step,n*step),mode,args.scheme,args.rule),start,total};
   }else if(cmd==='tile')result=await tile(args);
   else if(cmd==='search'){
    if([...jobs.values()].some(j=>j.status==='running'))throw Error('Wait for the current search.');
    const job={id:crypto.randomUUID(),status:'running',progress:0,message:'Searching…',cancel:false};jobs.set(job.id,job);
    for(const [key,j]of jobs)if(jobs.size>24&&j.status!=='running')jobs.delete(key);
    result={id:job.id};setTimeout(()=>search(job,args),0);
   }else if(cmd==='cancelSearch'){const job=jobs.get(args.id);if(job)job.cancel=true;result={ok:true};}
   else if(cmd==='stats')result={count,available:false};
   else throw Error('Unknown operation');
   self.postMessage({id,result});
  }catch(e){self.postMessage({id,error:e.message});}
 };
}
