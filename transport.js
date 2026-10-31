export class Transport {
 constructor(base=''){this.base=base.replace(/\/+$/,'');this.pending=new Map();this.jobs=new Map();this.searches=new Map();this.next=0;}
 startWorker(){
  this.worker=window.PI_WORKER?new Worker(URL.createObjectURL(new Blob([window.PI_WORKER],{type:'text/javascript'}))):new Worker(new URL('demo-worker.js?v=color8',document.baseURI));
  this.worker.onmessage=({data})=>{if(data.type==='job'){this.jobs.set(data.job.id,data.job);return;}const p=this.pending.get(data.id);if(p){this.pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);}};
  this.worker.onerror=()=>{for(const p of this.pending.values())p.reject(Error('Worker failed. Open Pi Atlas.html for the self-contained version.'));this.pending.clear();};
 }
 async init(file){
  if(file){this.startWorker();const info=await this.rpc('initFile',{file});this.status={count:info.count,datasetId:file.name+':'+file.size+':'+file.lastModified,label:file.name,localFile:true,demo:false,scanner:'Local file · streamed',threads:1,maxWidthSweep:64};return this.status;}
  if(this.base){const health=await this.request('health');if(health.ok===false)throw Error('API health check failed');this.status=await this.request('status');this.status.instance=health.instance;if(!Number.isSafeInteger(this.status.count)||this.status.count<1)throw Error('API dataset is unavailable');return this.status;}
  const demo=window.PI_DEMO||await Promise.all([fetch(new URL('demo/pi-100000.txt',document.baseURI)).then(r=>{if(!r.ok)throw Error('Missing sample file');return r.text();}),fetch(new URL('demo/manifest.json',document.baseURI)).then(r=>r.json())]).then(([digits,meta])=>({digits,meta}));
  this.startWorker();await this.rpc('init',{digits:demo.digits.trim().replace(/^3\./,'')});this.meta=demo.meta;this.status={count:demo.meta.count,label:'100K sample',demo:true,scanner:'Browser worker',threads:1,maxWidthSweep:64};return this.status;
 }
 rpc(cmd,args={}){const id=++this.next;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,cmd,args});});}
 async request(path,payload){
  if(this.base){const response=await fetch(this.base+'/api/'+path,{cache:'no-store',method:payload===undefined?'GET':'POST',headers:payload===undefined?{}:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload),keepalive:path==='search/cancel',signal:AbortSignal.timeout(path==='status'||path==='health'?4000:20000)});let data;try{data=await response.json();}catch{throw Error('Server unavailable (HTTP '+response.status+').');}if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Server error '+response.status);return data;}
  if(path==='status')return this.status;if(path==='stats')return this.meta?.stats||{count:this.status.count};
  if(path.startsWith('job/')&&path.endsWith('/continue')){
   const id=path.split('/')[1],old=this.jobs.get(id),entry=this.searches.get(id);if(!entry||!old||old.status!=='done')throw Error('Previous result page unavailable');
   const params={...entry.payload,cursor:old.nextCursor,afterWidth:old.nextAfterWidth??-1};const reply=await this.rpc('search',params);
   this.searches.set(reply.id,{payload:params,page:entry.page+1});this.searches.delete(id);this.jobs.delete(id);return reply;
  }
  if(path.startsWith('job/')){const id=path.slice(4),entry=this.searches.get(id);return {...(this.jobs.get(id)||{status:'queued',progress:0,message:'Starting…'}),page:entry?.page||0};}
  if(path==='search/cancel')return this.rpc('cancelSearch',payload);
  if(path==='search'){const reply=await this.rpc('search',payload);this.searches.set(reply.id,{payload,page:0});return reply;}
  const [cmd,query='']=path.split('?');return this.rpc(cmd,Object.fromEntries(new URLSearchParams(query)));
 }
 close(){this.worker?.terminate();for(const p of this.pending.values())p.reject(Error('Connection changed'));this.pending.clear();}
}
