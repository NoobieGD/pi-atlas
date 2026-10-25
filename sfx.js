// Original synthesized effects: no downloads, media licenses, or external requests.
export class Sound {
 constructor(){this.enabled=localStorage.getItem('pi-atlas-sound')==='1';this.context=null;}
 toggle(){this.enabled=!this.enabled;localStorage.setItem('pi-atlas-sound',this.enabled?'1':'0');if(this.enabled)this.play('tap');return this.enabled;}
 play(kind='tap'){if(!this.enabled)return;try{this.context??=new(window.AudioContext||window.webkitAudioContext)();this.context.resume();const t=this.context.currentTime,notes=kind==='found'?[440,660,880]:kind==='search'?[220,330]:[kind==='zoom'?390:520];notes.forEach((f,i)=>{const o=this.context.createOscillator(),g=this.context.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t+i*.055);g.gain.linearRampToValueAtTime(.035,t+i*.055+.008);g.gain.exponentialRampToValueAtTime(.0001,t+i*.055+.14);o.connect(g);g.connect(this.context.destination);o.start(t+i*.055);o.stop(t+i*.055+.15);});}catch{}}
}
