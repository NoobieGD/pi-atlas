import {Transport} from './transport.js';
import {Sound} from './sfx.js';
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('en-US'),sound=new Sound();
const state={count:0,view:'digits',scheme:'mod26',alignment:0,rule:'threshold',cols:100,scale:1,tx:30,ty:55};
let transport,viewport,key='',ready=false,jobId=null,jobGeneration=0,lastPayload=null,nextCursor=null,nextAfterWidth=-1,matches=[],selected=null,frame=0,hoverTimer,connectionGeneration=0;
const canvas=$('canvas'),ctx=canvas.getContext('2d'),wrap=$('canvasWrap');let W=1,H=1;
function notice(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('toast').hidden=true,5500);}
function geometry(){return state.view==='colors'||state.view==='binary'?[12,12]:[13,22];}
function total(){return state.view==='text'?Math.max(0,Math.floor((state.count-state.alignment)/(state.scheme==='ascii'?3:2))):state.count;}
function refreshKey(){key=[transport?.status?.datasetId||'demo',state.view,state.scheme,state.rule,state.alignment].join(':');viewport?.cache.clear();if(viewport)viewport.tile=null;draw();}
function draw(){if(!frame)frame=requestAnimationFrame(render);}
function render(){
 frame=0;const dpr=Math.min(devicePixelRatio||1,2);W=wrap.clientWidth;H=wrap.clientHeight;
 if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#151719';ctx.fillRect(0,0,W,H);
 const [cw,ch]=geometry(),sx=cw*state.scale,sy=ch*state.scale;
 if(ready)viewport.draw(ctx,state,W,H,cw,ch,key);
 const visibleFirst=Math.max(0,Math.floor(-state.ty/sy))*state.cols;
 const visibleLast=(Math.ceil((H-state.ty)/sy)+1)*state.cols;
 function highlight(m,active){
  const mText=m.mode==='text',viewText=state.view==='text';
  if(viewText&&mText&&(m.scheme!==state.scheme||m.alignment!==state.alignment))return;
  let at=m.index,length=m.length||1;
  if(mText&&!viewText){const step=m.scheme==='ascii'?3:2;at=m.index*step+m.alignment;length*=step;}
  else if(!mText&&viewText){const step=state.scheme==='ascii'?3:2;at=Math.floor((m.index-state.alignment)/step);length=Math.max(1,Math.ceil(length/step));}
  if(at<0||at>visibleLast||at+length+(m.height||0)*state.cols<visibleFirst)return;
  ctx.fillStyle=active?'#c6d9f038':'#86b9f01c';ctx.strokeStyle=active?'#d2e4fb':'#789bbd80';ctx.lineWidth=active?1.5:1;
  if(m.width&&state.view==='binary'&&state.cols===m.width){
   const x=state.tx+(at%state.cols)*sx,y=state.ty+Math.floor(at/state.cols)*sy;
   ctx.fillRect(x,y,m.shapeWidth*sx,m.height*sy);ctx.strokeRect(x,y,m.shapeWidth*sx,m.height*sy);return;
  }
  for(let remaining=length;remaining>0;){
   const n=Math.min(remaining,state.cols-at%state.cols),x=state.tx+(at%state.cols)*sx,y=state.ty+Math.floor(at/state.cols)*sy;
   if(y+sy>=0&&y<=H){ctx.fillRect(x,y,Math.max(2,n*sx),Math.max(2,sy));ctx.strokeRect(x,y,Math.max(2,n*sx),Math.max(2,sy));}
   at+=n;remaining-=n;
  }
 }
 for(const m of matches)if(m!==selected)highlight(m,false);
 if(selected)highlight(selected,true);
 $('zoomLabel').textContent=Math.round(state.scale*100)+'%';
 $('lod').textContent=(viewport?.detail(sx,state.view)||'Loading').toLowerCase();
 $('loadingTile').hidden=!viewport?.pending;
 const index=Math.max(0,Math.floor(-state.ty/sy))*state.cols+Math.max(0,Math.floor(-state.tx/sx));
 $('position').textContent='Position '+fmt(index+1);
}
function zoom(factor,x=W/2,y=H/2){const next=Math.max(.035,Math.min(22,state.scale*factor)),ratio=next/state.scale;state.tx=x-(x-state.tx)*ratio;state.ty=y-(y-state.ty)*ratio;state.scale=next;draw();}
function clampPan(){const [cw,ch]=geometry();state.tx=Math.min(W-24,Math.max(-state.cols*cw*state.scale+24,state.tx));state.ty=Math.min(H-24,Math.max(-Math.ceil(total()/state.cols)*ch*state.scale+24,state.ty));}
function setView(view){state.view=view;for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('selected',b.dataset.view===view);$('encodingNote').textContent=view==='text'?'Pairs: value % 26 → A–Z; A1Z26: 01–26 → A–Z, other pairs → dot. ASCII: 032–126 → printable characters, other triples → dot. Offset selects the starting digit.':view==='binary'?'Pixels use the chosen threshold or parity rule. Width changes the image formed by consecutive digits. Pixel searches can test several widths.':view==='colors'?'Each digit maps to one of ten colors. Color searches match the corresponding digit sequence exactly.':'Positions are 1-based digits after the decimal point. Smooth glyph, fine glyph, microglyph and row overview levels preserve visual continuity.';refreshKey();}
async function connect(base,file){
 const generation=++connectionGeneration,candidate=new Transport(base),started=performance.now();
 try{
  const status=await candidate.init(file);
  if(generation!==connectionGeneration){candidate.close();return;}
  transport?.close();transport=candidate;jobGeneration++;jobId=null;ready=true;state.count=status.count;
  viewport=new PiViewport(path=>candidate.request(path),draw);
  $('digitCount').textContent=fmt(status.count);
  $('datasetBadge').textContent=fmt(status.count)+' digits'+(status.demo?' · sample':status.localFile?' · local':'');
  $('engine').textContent=status.scanner+(status.localFile?'':' · '+status.threads+' thread(s)');
  $('jobLabel').textContent=status.demo?'100K sample ready.':status.localFile?'Local file opened.':'Dataset connected.';
  $('coverage').textContent=status.demo?'Open your digits file to explore all 27.18 billion.':status.localFile?'Your file stays here. Only visible tiles are read. Large searches stream through bounded chunks.':'Visible tiles load on demand. Full-file searches run on the server.';
  $('searchButton').disabled=false;$('cancel').hidden=true;$('continue').hidden=true;$('progress').value=0;
  matches=[];selected=null;renderResults();refreshKey();
  console.info('Dataset ready:',status.count,'digits in',Math.round(performance.now()-started),'ms');
  return true;
 }catch(e){candidate.close();throw e;}
}
function readPayload(){const mode=$('searchMode').value;const p={mode,query:$('query').value,scheme:state.scheme,alignment:state.alignment,rule:state.rule,width:state.cols};if(mode==='shape'){p.rows=$('pattern').value.trim().split(/\r?\n/);const w=p.rows[0]?.length||0;if(!p.rows.length||p.rows.length>24||w<1||w>24||p.rows.some(r=>r.length!==w||/[^01?]/.test(r))||!p.rows.some(r=>/[01]/.test(r)))throw Error('Use 1–24 equal-width rows of 0, 1 and ? with at least one filled constraint.');p.sweep=$('sweep').checked;p.minWidth=+$('minWidth').value;p.maxWidth=+$('maxWidth').value;if(p.sweep&&(p.maxWidth-Math.max(w,p.minWidth)+1>(transport.status.maxWidthSweep||64)||p.maxWidth<p.minWidth))throw Error('Choose a width range of at most '+(transport.status.maxWidthSweep||64)+' widths.');}return p;}
async function runSearch(continuation=false){if(!ready||jobId)return;let payload;try{payload=continuation?{...lastPayload,cursor:nextCursor,afterWidth:nextAfterWidth}:readPayload();}catch(e){notice(e.message);return;}if(!continuation){lastPayload={...payload};matches=[];selected=null;nextCursor=null;renderResults();}const generation=++jobGeneration;const activeTransport=transport;$('searchButton').disabled=true;$('continue').hidden=true;$('cancel').hidden=false;$('progress').value=0;$('jobLabel').textContent='Submitting search…';sound.play('search');
 try{const reply=await activeTransport.request('search',payload);if(generation!==jobGeneration)return;jobId=reply.id;for(;;){await new Promise(r=>setTimeout(r,350));if(generation!==jobGeneration)return;const job=await activeTransport.request('job/'+jobId);$('jobLabel').textContent=job.message||job.status;$('progress').value=job.progress||0;if(['done','error','cancelled'].includes(job.status)){if(job.status==='error')throw Error(job.error||'Search failed');if(job.status==='done'){
 const seen=new Set(matches.map(m=>m.index+':'+(m.width||'')));for(const m of job.matches||[]){const k=m.index+':'+(m.width||'');if(!seen.has(k)&&matches.length<2000){matches.push({...m,mode:payload.mode,scheme:payload.scheme,alignment:payload.alignment,rule:payload.rule});seen.add(k);}}
 nextCursor=job.nextCursor??null;nextAfterWidth=job.nextAfterWidth??-1;$('continue').hidden=nextCursor===null||matches.length>=2000;renderResults();const seconds=Number(job.seconds||0).toFixed(3);$('coverage').textContent=transport.status.demo?`Sample only: ${fmt(state.count)} digits. ${job.capped?'Result page full. Continue to find more.':'Sample search complete.'} ${seconds}s.`:`${job.cacheHit?'Cached result · ':''}${job.complete?'Reached the end of the dataset.':job.capped?'Result page full. Continue to retain overlapping matches.':'Partial scan; time budget reached. Continue from the saved cursor.'} ${job.scanned!==undefined?'Checked through '+fmt(job.scanned)+' '+(payload.mode==='text'?'encoded characters':'digit positions')+'. ':''}${seconds}s${matches.length>=2000?' UI limit: 2,000 matches. Download JSON or refine the query.':''}`;if(matches.length)sound.play('found');
 }break;}}
 }catch(e){$('jobLabel').textContent='Search could not finish.';notice(e.message);$('coverage').textContent='No full-dataset conclusion can be drawn from a failed search.';}finally{if(generation===jobGeneration){jobId=null;$('searchButton').disabled=false;$('cancel').hidden=true;}}}
function renderResults(){const fragment=document.createDocumentFragment();matches.forEach((m,i)=>{const b=document.createElement('button'),label=document.createElement('span'),detail=document.createElement('small');label.textContent=fmt(m.position);detail.textContent=m.width?'width '+m.width:m.mode==='text'?'char '+fmt(m.unitPosition):'→';b.append(label,detail);b.classList.toggle('active',m===selected);b.onclick=()=>goToMatch(m);fragment.append(b);});$('results').replaceChildren(fragment);$('resultCount').textContent=fmt(matches.length)+' results';$('downloadResults').disabled=!matches.length;}
function focusIndex(index){index=Math.max(0,Math.min(total()-1,index));const [cw,ch]=geometry();state.scale=state.view==='colors'||state.view==='binary'?1.3:1;state.tx=70-(index%state.cols)*cw*state.scale;state.ty=H*.44-Math.floor(index/state.cols)*ch*state.scale;draw();}
function goToMatch(m){selected=m;renderResults();state.scheme=m.scheme;state.alignment=m.alignment;state.rule=m.rule;$('scheme').value=state.scheme;$('alignment').value=state.alignment;$('rule').value=state.rule;if(m.width){state.cols=m.width;$('cols').value=m.width;}setView(m.mode==='shape'?'binary':m.mode==='colors'?'colors':m.mode==='text'?'text':'digits');focusIndex(m.index);sound.play('tap');if(innerWidth<681)wrap.scrollIntoView({behavior:'smooth',block:'center'});}
function editor(){const rows=$('pattern').value.trim().split(/\r?\n/),w=rows[0]?.length||0,grid=$('pixelEditor');grid.replaceChildren();if(w<1||w>24||rows.length>24||rows.some(r=>r.length!==w||/[^01?]/.test(r)))return;grid.style.gridTemplateColumns=`repeat(${w},20px)`;rows.forEach((row,y)=>[...row].forEach((v,x)=>{const b=document.createElement('button');b.type='button';b.dataset.value=v;b.textContent=v==='?'?'?':'';b.setAttribute('aria-label',`Row ${y+1}, column ${x+1}: ${v}`);b.onclick=()=>{const a=rows.map(r=>[...r]);a[y][x]={'0':'1','1':'?','?':'0'}[v];$('pattern').value=a.map(r=>r.join('')).join('\n');editor();sound.play('tap');};grid.append(b);}));}
function modeChanged(){const mode=$('searchMode').value;$('encodingOptions').open=mode==='text'||mode==='shape';$('sequenceControls').hidden=mode==='shape';$('shapeControls').hidden=mode!=='shape';$('palette').hidden=mode!=='colors';$('queryLabel').firstChild.textContent=mode==='text'?'Your text':mode==='colors'?'Color IDs (0–9)':'Your sequence';if(mode==='text'&&/^\d+$/.test($('query').value))$('query').value='PI';else if(mode!=='text'&&/[^\d,\s]/.test($('query').value))$('query').value='12345';setView(mode==='shape'?'binary':mode);}
const palette=['#ef5350','#ff9e40','#f6d85d','#78cb70','#39bba0','#42b9d5','#5486e8','#a67ce8','#e578b3','#e4e7ee'];palette.forEach((color,n)=>{const b=document.createElement('button');b.type='button';b.textContent=n;b.style.background=color;b.title='Append color '+n;b.onclick=()=>{$('query').value+=n;sound.play('tap');};$('palette').append(b);});
$('searchForm').onsubmit=e=>{e.preventDefault();runSearch();};$('continue').onclick=()=>runSearch(true);$('cancel').onclick=async()=>{if(jobId)try{await transport.request('search/cancel',{id:jobId});$('jobLabel').textContent='Cancelling after the current bounded scan block…';}catch(e){notice(e.message);}};
$('searchMode').onchange=modeChanged;$('pattern').oninput=editor;$('heart').onclick=()=>{$('pattern').value='?11?11?\n1111111\n1111111\n?11111?\n??111??\n???1???';editor();};$('clearPattern').onclick=()=>{$('pattern').value=Array(5).fill('00000').join('\n');editor();};
$('imageInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024){notice('Use an image smaller than 10 MiB.');return;}try{const bitmap=await createImageBitmap(file),c=document.createElement('canvas');c.width=8;c.height=8;const cx=c.getContext('2d');cx.fillStyle='#000';cx.fillRect(0,0,8,8);cx.drawImage(bitmap,0,0,8,8);bitmap.close();const data=cx.getImageData(0,0,8,8).data;const rows=Array.from({length:8},(_,y)=>Array.from({length:8},(_,x)=>{const at=(y*8+x)*4;return data[at]*.2126+data[at+1]*.7152+data[at+2]*.0722>=128?'1':'0';}).join(''));$('pattern').value=rows.join('\n');editor();notice('8×8 pattern imported locally. The source image is not uploaded.');}catch{notice('This image could not be decoded. Try PNG or JPEG.');}};
for(const id of ['scheme','alignment','rule'])$(id).onchange=()=>{state.scheme=$('scheme').value;state.alignment=+$('alignment').value;state.rule=$('rule').value;if(state.scheme!=='ascii'&&state.alignment===2){state.alignment=0;$('alignment').value='0';}refreshKey();};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{setView(b.dataset.view);sound.play('tap');});$('cols').onchange=()=>{state.cols=Math.max(1,Math.min(4096,Math.trunc(+$('cols').value)||100));$('cols').value=state.cols;draw();};
$('zoomIn').onclick=()=>{zoom(1.3);sound.play('zoom');};$('zoomOut').onclick=()=>zoom(1/1.3);$('reset').onclick=()=>{state.scale=1;state.tx=30;state.ty=55;draw();};$('jumpForm').onsubmit=e=>{e.preventDefault();const digit=Number($('jump').value.replace(/[, ]/g,''));if(!Number.isSafeInteger(digit)||digit<1||digit>state.count){notice('Enter a digit position from 1 to '+fmt(state.count));return;}const index=state.view==='text'?Math.floor((digit-1-state.alignment)/(state.scheme==='ascii'?3:2)):digit-1;selected={index,length:1,mode:state.view,scheme:state.scheme,alignment:state.alignment};focusIndex(index);};
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-Math.max(-150,Math.min(150,e.deltaY))*.004),e.clientX-r.left,e.clientY-r.top);},{passive:false});
const pointers=new Map();let gesture,pointerStart=null,pointerMoved=false;function pointerGeometry(){const a=[...pointers.values()];return{x:a.reduce((s,p)=>s+p.x,0)/a.length,y:a.reduce((s,p)=>s+p.y,0)/a.length,d:a.length>1?Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y):0};}canvas.onpointerdown=e=>{pointerStart={x:e.clientX,y:e.clientY};pointerMoved=false;canvas.focus();canvas.setPointerCapture(e.pointerId);const r=canvas.getBoundingClientRect();pointers.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top});gesture=pointerGeometry();};canvas.onpointermove=e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(pointers.has(e.pointerId)){if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>4)pointerMoved=true;pointers.set(e.pointerId,{x,y});const next=pointerGeometry();state.tx+=next.x-gesture.x;state.ty+=next.y-gesture.y;if(next.d&&gesture.d)zoom(next.d/gesture.d,next.x,next.y);gesture=next;clampPan();draw();return;}clearTimeout(hoverTimer);hoverTimer=setTimeout(async()=>{if(!ready)return;const [cw,ch]=geometry(),col=Math.floor((x-state.tx)/(cw*state.scale)),row=Math.floor((y-state.ty)/(ch*state.scale)),index=row*state.cols+col;if(row<0||col<0||col>=state.cols||index>=total())return;const ownKey=key;try{const q=new URLSearchParams({start:index,count:1,mode:state.view,scheme:state.scheme,rule:state.rule,alignment:state.alignment});const d=await transport.request('digits?'+q);if(ownKey===key)$('hover').textContent=(state.view==='text'?'CHARACTER ':'DIGIT ')+fmt(index+1)+' · '+JSON.stringify(d.data);}catch{}},130);};function release(e){if(e.type==='pointerup'&&!pointerMoved&&pointers.size===1){const r=canvas.getBoundingClientRect(),[cw,ch]=geometry(),col=Math.floor((e.clientX-r.left-state.tx)/(cw*state.scale)),row=Math.floor((e.clientY-r.top-state.ty)/(ch*state.scale)),index=row*state.cols+col;if(row>=0&&col>=0&&col<state.cols&&index<total()){selected={index,position:index+1,length:1,mode:state.view==='binary'?'shape':state.view,scheme:state.scheme,alignment:state.alignment};draw();}}pointers.delete(e.pointerId);gesture=pointers.size?pointerGeometry():null;}canvas.onpointerup=release;canvas.onpointercancel=release;canvas.onkeydown=e=>{const moves={ArrowLeft:[60,0],ArrowRight:[-60,0],ArrowUp:[0,60],ArrowDown:[0,-60]};if(moves[e.key]){e.preventDefault();state.tx+=moves[e.key][0];state.ty+=moves[e.key][1];clampPan();draw();}else if(e.key==='+'||e.key==='=')zoom(1.2);else if(e.key==='-')zoom(1/1.2);};
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}$('screenshot').onclick=()=>canvas.toBlob(b=>{if(b)save(b,'pi-atlas.png');});$('downloadResults').onclick=()=>save(new Blob([JSON.stringify({dataset:transport.status,query:lastPayload,matches,nextCursor,nextAfterWidth,positions:'1-based digits after decimal; index is 0-based in the selected encoding'},null,2)],{type:'application/json'}),'pi-search-results.json');
function soundLabel(){$('sound').textContent=sound.enabled?'Sound on':'Sound off';}$('sound').onclick=()=>{sound.toggle();soundLabel();};soundLabel();$('settings').onclick=()=>{$('apiUrl').value=transport?.base||'';$('connectionError').textContent='';$('connection').showModal();};$('closeSettings').onclick=()=>$('connection').close();$('connectionForm').onsubmit=async e=>{e.preventDefault();let base=$('apiUrl').value.trim().replace(/\/+$/,'');try{if(base){const url=new URL(base);if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Enter only an origin, such as https://api.example.com (without /api).');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Use HTTPS for a public server. HTTP is allowed only on localhost.');base=url.origin;}if(jobId)await transport.request('search/cancel',{id:jobId});await connect(base);localStorage.setItem('pi-atlas-api',base);$('connection').close();notice(base?'Connected to the hosted database.':'Local demo connected.');}catch(error){$('connectionError').textContent=error.message;}};
new ResizeObserver(draw).observe(wrap);document.fonts.ready.then(()=>{viewport?.resetGlyphs();draw();});editor();$('searchButton').disabled=true;draw();
async function start(){
 const local=location.protocol!=='file:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const configured=window.PI_CONFIG?.apiBase||'';
 const saved=window.PI_CONFIG?.requirePublicBackend?'':(localStorage.getItem('pi-atlas-api')||'');
 const base=local&&!window.PI_CONFIG?.requirePublicBackend?location.origin:(configured||saved);
 if(!base&&window.PI_CONFIG?.requirePublicBackend){await connect('');$('jobLabel').textContent='Public backend not configured.';$('coverage').textContent='This is the 100K sample. Set the permanent HTTPS API in config.js before publishing the full dataset.';return;}
 try{await connect(base);}catch(error){
  await connect('');$('jobLabel').textContent='Server unavailable. Sample opened.';
  $('coverage').textContent='Use Open digits file for your full dataset, or choose another server in Connection.';
  if(base)notice('Server unavailable. You can still open your local digits file.');
 }
}
$('openFile').onclick=()=>$('digitFile').click();
$('digitFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 $('jobLabel').textContent='Opening '+file.name+'…';
 try{if(jobId)await transport.request('search/cancel',{id:jobId});await connect('',file);state.tx=30;state.ty=55;draw();}
 catch(error){notice(error.message);}
};
start();
