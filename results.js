// Keep the result list on disk; only the visible page stays in application RAM.
export class ResultsStore {
 constructor(factory){if(arguments.length===0){try{factory=globalThis.indexedDB;}catch{factory=null;}}this.factory=factory;this.pageSize=200;this.count=0;this.tail=[];this.memory=new Map();this.name='pi-atlas-results-'+Date.now()+'-'+Math.random().toString(36).slice(2);this.opening=null;this.closed=false;}
 async database(){
  if(!this.factory)return null;
  if(!this.opening)this.opening=new Promise((resolve,reject)=>{const request=this.factory.open(this.name,1);request.onupgradeneeded=()=>request.result.createObjectStore('pages');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  return this.opening;
 }
 async write(pages){
  if(!pages.length)return;const db=await this.database();if(this.closed)throw Error('Result store closed');
  if(!db){for(const [key,value] of pages)this.memory.set(key,value);return;}
  await new Promise((resolve,reject)=>{const transaction=db.transaction('pages','readwrite');for(const [key,value] of pages)transaction.objectStore('pages').put(value,key);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||Error('Result storage unavailable'));});
 }
 async append(values){
  const combined=[...this.tail,...values],pages=[];let key=Math.floor(this.count/this.pageSize),at=0;
  for(;at+this.pageSize<=combined.length;at+=this.pageSize)pages.push([key++,combined.slice(at,at+this.pageSize)]);
  await this.write(pages);if(this.closed)throw Error('Result store closed');this.tail=combined.slice(at);this.count+=values.length;
 }
 async page(number){
  if(!Number.isInteger(number)||number<0||number>=Math.ceil(this.count/this.pageSize))return [];
  if(number===Math.floor(this.count/this.pageSize)&&this.tail.length)return this.tail.slice();
  const db=await this.database();if(!db)return this.memory.get(number)||[];
  return new Promise((resolve,reject)=>{const transaction=db.transaction('pages'),request=transaction.objectStore('pages').get(number);request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);});
 }
 async close(){this.closed=true;this.memory.clear();this.tail=[];if(this.opening){try{const db=await this.opening;db.close();this.factory.deleteDatabase(this.name);}catch{}}}
}
