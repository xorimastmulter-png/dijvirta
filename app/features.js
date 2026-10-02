/* DIJVIRTA — rekordbox-style features, loaded after the main script and built on its globals (D, S, LIB, ctx, Deck, ...):
   1 key analysis + Key Shift / Key Sync   2 saved hot cues, memory cues, loops and beat grid per track
   3 Beat FX unit                          4 Automix
   5 more Color FX                         6 library: history, My Tag, colours, intelligent playlists, key column
   7 beat grid editing + phrase markers    8 16-slot sampler */
'use strict';

// ---------- storage ----------
const rbGet=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}};
const rbPut=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const RB={meta:rbGet('dijvirta-meta',{}),cues:rbGet('dijvirta-cues',{}),hist:rbGet('dijvirta-hist',[]),ipl:rbGet('dijvirta-ipl',[])};
const rbTk=e=>e.id||('demo:'+e.n);
const rbMeta=tk=>RB.meta[tk]||(RB.meta[tk]={});
let rbMT=0;const rbSaveMeta=()=>{clearTimeout(rbMT);rbMT=setTimeout(()=>rbPut('dijvirta-meta',RB.meta),300)};
const rbEsc=v=>esc(String(v==null?'':v));

// ---------- 1. key analysis ----------
const RB_KEYS=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const rbCam=k=>{const maj=k.m?(k.n+3)%12:k.n;return (maj*7+7)%12+1};
const rbKeyTxt=k=>k?rbCam(k)+(k.m?'A':'B')+' '+RB_KEYS[k.n]+(k.m?'m':''):'';
const rbKeyOrd=k=>k?rbCam(k)*2+(k.m?0:1):999;
const rbCompat=(a,b)=>{if(!a||!b)return false;const x=rbCam(a),y=rbCam(b),dd=Math.min((x-y+12)%12,(y-x+12)%12);return a.m===b.m?dd<=1:dd===0};
const rbParseCam=s=>{const m=/^\s*(1[0-2]|[1-9])\s*([AB])\s*$/i.exec(s||'');if(!m)return null;const c=+m[1],maj=(((c-8)*7)%12+12)%12;return m[2].toUpperCase()==='A'?{n:(maj+9)%12,m:1}:{n:maj,m:0}};
function rbFFT(re,im){const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
 for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a),h=len>>1;
  for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<h;j++){const k=i+j+h,vr=re[k]*cr-im[k]*ci,vi=re[k]*ci+im[k]*cr;re[k]=re[i+j]-vr;im[k]=im[i+j]-vi;re[i+j]+=vr;im[i+j]+=vi;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}}}
// chromagram of up to 2 minutes from the middle of the track, matched against Krumhansl major/minor profiles
function rbDetectKey(buf){
 const sr=buf.sampleRate,a=buf.getChannelData(0),b=buf.numberOfChannels>1?buf.getChannelData(1):a;
 const ds=Math.max(1,Math.floor(sr/11025)),fs=sr/ds,N=4096,total=Math.floor(a.length/ds),len=Math.min(total,Math.floor(fs*120)),st=Math.max(0,Math.floor((total-len)/2));
 const x=new Float32Array(len);for(let i=0;i<len;i++){let s=0;const o=(st+i)*ds;for(let j=0;j<ds;j++)s+=a[o+j]+b[o+j];x[i]=s/(2*ds)}
 const win=new Float32Array(N);for(let i=0;i<N;i++)win[i]=.5-.5*Math.cos(2*Math.PI*i/N);
 const re=new Float32Array(N),im=new Float32Array(N),kLo=Math.ceil(60*N/fs),kHi=Math.min(N/2-1,Math.floor(2100*N/fs)),pc=new Int8Array(N/2),chroma=new Float64Array(12);
 for(let k=kLo;k<=kHi;k++)pc[k]=((Math.round(69+12*Math.log2(k*fs/N/440))%12)+12)%12;
 for(let o=0;o+N<=len;o+=N){for(let i=0;i<N;i++){re[i]=x[o+i]*win[i];im[i]=0}rbFFT(re,im);
  const fr=new Float64Array(12);for(let k=kLo;k<=kHi;k++)fr[pc[k]]+=Math.sqrt(re[k]*re[k]+im[k]*im[k]);
  let m=0;for(let p=0;p<12;p++)if(fr[p]>m)m=fr[p];if(m>0)for(let p=0;p<12;p++)chroma[p]+=fr[p]/m}
 const MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],MIN=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
 const corr=(p,r)=>{let mx=0,my=0;for(let i=0;i<12;i++){mx+=chroma[i];my+=p[i]}mx/=12;my/=12;let sxy=0,sx=0,sy=0;for(let i=0;i<12;i++){const dx=chroma[i]-mx,dy=p[(i-r+12)%12]-my;sxy+=dx*dy;sx+=dx*dx;sy+=dy*dy}return sxy/(Math.sqrt(sx*sy)||1)};
 let best=-2,key={n:0,m:0};for(let r=0;r<12;r++){const c1=corr(MAJ,r),c2=corr(MIN,r);if(c1>best){best=c1;key={n:r,m:0}}if(c2>best){best=c2;key={n:r,m:1}}}
 return key}

// ---------- audio: pitch shifter (Key Shift, Pitch FX), per-deck FX buses ----------
const RB_PS=`class PS extends AudioWorkletProcessor{static get parameterDescriptors(){return[{name:'ratio',defaultValue:1,minValue:.25,maxValue:4,automationRate:'k-rate'}]}
constructor(){super();this.N=16384;this.b=[new Float32Array(16384),new Float32Array(16384)];this.w=0;this.p=0;this.W=3072}
process(I,O,P){const i=I[0],o=O[0];if(!o||!o.length)return true;const r=P.ratio[0],N=this.N,W=this.W,L=o[0].length;
for(let k=0;k<L;k++){for(let c=0;c<o.length;c++){this.b[c][this.w]=i&&i.length?(i[c]||i[0])[k]:0}
if(Math.abs(r-1)<1e-4){for(let c=0;c<o.length;c++)o[c][k]=this.b[c][this.w]}
else{this.p=(this.p+1-r+W)%W;const d1=this.p,d2=(this.p+W/2)%W,g1=1-Math.abs(2*this.p/W-1),g2=1-g1;
for(let c=0;c<o.length;c++){const B=this.b[c],rd=d=>{const pos=this.w-d+N,i0=Math.floor(pos),f=pos-i0;return B[i0%N]*(1-f)+B[(i0+1)%N]*f};o[c][k]=rd(d1)*g1+rd(d2)*g2}}
this.w=(this.w+1)%N}return true}}registerProcessor('dj-pshift',PS);`;
let rbPSok=false,rbSmpG=null,rbIRbuf=null;
const rbIR=(sec,dec)=>{const L=Math.floor(ctx.sampleRate*sec),b=ctx.createBuffer(2,L,ctx.sampleRate);for(let c=0;c<2;c++){const x=b.getChannelData(c);for(let i=0;i<L;i++)x[i]=(Math.random()*2-1)*Math.pow(1-i/L,dec)}return b};
function rbFxP(d){let s=0;for(const k in d.fxPitch||{})s+=d.fxPitch[k];return s}
function rbApplyPitch(d){const n=d.n,s=(d.keyShift||0)+(d.cfxPitch||0)+rbFxP(d);if(n&&n.ps)n.ps.parameters.get('ratio').setValueAtTime(Math.pow(2,s/12),ctx.currentTime)}
function rbInsertPS(d){const n=d.n;if(!n||n.ps||!rbPSok)return;
 const ps=new AudioWorkletNode(ctx,'dj-pshift',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
 try{n.mainG.disconnect(n.trim)}catch(e){}n.mainG.connect(ps);ps.connect(n.trim);n.ps=ps;rbApplyPitch(d)}
function rbInitAudio(){setTimeout(()=>rbHpRoute(),0);
 rbSmpG=ctx.createGain();rbSmpG.gain.value=($('#sv')?+$('#sv').value:80)/100;rbSmpG.connect(master);
 try{ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([RB_PS],{type:'text/javascript'}))).then(()=>{rbPSok=true;D.forEach(rbInsertPS)}).catch(e=>console.warn('pitch worklet',e))}catch(e){console.warn(e)}}
const rbBoot0=boot;boot=function(){const first=!ctx;rbBoot0();if(first&&ctx)rbInitAudio()};
function rbSetupDeck(d){const n=d.n;if(!n||n.dry)return;
 const G=v=>{const g=ctx.createGain();g.gain.value=v;return g},F=(t,f,q)=>{const x=ctx.createBiquadFilter();x.type=t;x.frequency.value=f;if(q)x.Q.value=q;return x};
 try{n.f.disconnect(n.vol)}catch(e){}
 n.dry=G(1);n.cg=G(1);n.f.connect(n.dry);n.dry.connect(n.cg);n.cg.connect(n.vol);          // dry path (Trans / Filter / Crush / Sweep act here)
 n.csF=F('highpass',250);n.csC=ctx.createConvolver();n.csC.buffer=rbIRbuf||(rbIRbuf=rbIR(3.5,2.5));n.csW=G(0);  // Color FX: Space
 n.f.connect(n.csF);n.csF.connect(n.csC);n.csC.connect(n.csW);n.csW.connect(n.vol);
 n.cdIn=G(0);n.cdD=ctx.createDelay(2);n.cdBP=F('bandpass',1500,1.2);n.cdFb=G(.62);n.cdW=G(0);  // Color FX: Dub Echo
 n.f.connect(n.cdIn);n.cdIn.connect(n.cdD);n.cdD.connect(n.cdBP);n.cdBP.connect(n.cdFb);n.cdFb.connect(n.cdD);n.cdBP.connect(n.cdW);n.cdW.connect(n.vol);
 n.ccS=ctx.createWaveShaper();n.ccW=G(0);n.ccBits=0;n.f.connect(n.ccS);n.ccS.connect(n.ccW);n.ccW.connect(n.vol);  // Color FX: Crush
 n.swO=ctx.createOscillator();n.swO.type='square';n.swA=G(0);n.swO.connect(n.swA);n.swA.connect(n.cg.gain);n.swO.start();  // Color FX: Sweep gate
 rbInsertPS(d);d.mix()}
const rbWire0=Deck.prototype.wire;Deck.prototype.wire=function(){rbWire0.call(this);rbSetupDeck(this)};
if(ctx)D.forEach(rbSetupDeck);

// ---------- 5. Color FX ----------
document.querySelectorAll('[data-k=cfx]').forEach(s=>s.insertAdjacentHTML('beforeend','<option value="space">Space</option><option value="dub">Dub Echo</option><option value="sweep">Sweep</option><option value="crush">Crush</option><option value="pitch">Pitch</option>'));
const rbMix0=Deck.prototype.mix;
Deck.prototype.mix=function(){rbMix0.call(this);const n=this.n;if(!n||!n.dry)return;
 const sel=this.c('cfx'),cf=sel?sel.value:'filter',f0=+this.c('flt').value/100,a=Math.abs(f0),bl=this.bpm?60/(this.bpm*this.rate):.5;
 n.csW.gain.value=cf==='space'?a*1.3:0;n.csF.type=f0<0?'lowpass':'highpass';n.csF.frequency.value=f0<0?4000:250;
 n.cdIn.gain.value=cf==='dub'?a:0;n.cdW.gain.value=cf==='dub'?.9:0;n.cdD.delayTime.value=Math.min(1.9,bl*.75);n.cdBP.frequency.value=f0<0?700:2400;
 const bits=cf==='crush'&&a>.02?Math.max(2,Math.round(12-a*10)):0;
 if(bits!==n.ccBits){n.ccBits=bits;if(bits){const L=2048,c=new Float32Array(L),q=Math.pow(2,bits-1);for(let i=0;i<L;i++)c[i]=Math.round((i/(L-1)*2-1)*q)/q;n.ccS.curve=c}}
 n.ccW.gain.value=bits?Math.min(1,a*1.5):0;
 const sweep=cf==='sweep'&&a>.02;n.swO.frequency.value=2/bl;n.swA.gain.value=sweep?a/2:0;
 n.cg.gain.value=bits?1-Math.min(.95,a*1.2):sweep?1-a/2:1;
 if(sweep){if(f0<0){n.f.type='lowpass';n.f.frequency.value=22000*Math.pow(.03,a)}else{n.f.type='highpass';n.f.frequency.value=20*Math.pow(300,a)}n.f.Q.value=6}
 const cp=cf==='pitch'?Math.round(f0*12):0;if(cp!==(this.cfxPitch||0)){this.cfxPitch=cp;rbApplyPitch(this)}};

// ---------- 3. Beat FX ----------
const BFX_LIST=['Delay','Echo','Ping Pong','Spiral','Reverb','Trans','Filter','Flanger','Phaser','Pitch','Roll','Slip Roll','Vinyl Brake','Helix'];
const BFX_BEATS=[1/16,1/8,1/4,1/2,3/4,1,2,4,8,16],BFX_BL=['1/16','1/8','1/4','1/2','3/4','1','2','4','8','16'];
const BFX_TAIL=['Delay','Echo','Ping Pong','Spiral','Reverb','Helix'],BFX_WET=BFX_TAIL.concat(['Flanger','Phaser']);
const BFX=Object.assign({fx:1,beat:5,ch:'M',lvl:.5},S.bfx||{},{on:false});if(BFX.ch!=='M'&&!D[+BFX.ch])BFX.ch='M';
const rbSaveBfx=()=>{S.bfx={fx:BFX.fx,beat:BFX.beat,ch:BFX.ch,lvl:BFX.lvl};save()};
const rbBl=d=>d.bpm?60/(d.bpm*d.rate):.5;
const rbTargets=()=>BFX.ch==='M'?D.slice():[D[+BFX.ch]].filter(Boolean);
const BFX_SPEC={get fx(){return BFX_LIST[BFX.fx]},get beat(){return BFX.beat},get lvl(){return BFX.lvl}};
// every deck has one effect slot per user: 'beat' (Beat FX unit) and 'pad' (Pad FX pads), each with its own send / return
function rbSlot(d,key){const n=d.n;if(!n.fxs)n.fxs={};let s=n.fxs[key];
 if(!s){s=n.fxs[key]={In:ctx.createGain(),Out:ctx.createGain(),nodes:[],timed:[],built:null};s.In.gain.value=0;s.Out.gain.value=0;n.f.connect(s.In);s.Out.connect(n.vol)}return s}
function rbFxClear(d,key){const n=d.n;if(!n||!n.dry||!n.fxs||!n.fxs[key])return;const s=n.fxs[key];
 s.nodes.forEach(x=>{try{x.stop&&x.stop()}catch(e){}try{x.disconnect()}catch(e){}});s.nodes=[];s.timed=[];s.built=null;s.transG=s.depth=null;
 try{s.In.disconnect()}catch(e){}s.In.gain.value=0;s.Out.gain.value=0;n.dry.gain.value=1}
function rbFxBuild(d,key,spec){rbFxClear(d,key);const s=rbSlot(d,key),In=s.In,Out=s.Out,n=d.n,Nn=[],T=[],beat=()=>BFX_BEATS[spec.beat]*rbBl(d);
 const G=v=>{const g=ctx.createGain();g.gain.value=v;Nn.push(g);return g};
 const dly=(fbv,filt)=>{const dl=ctx.createDelay(8),fb=G(fbv);Nn.push(dl);dl.delayTime.value=Math.min(7.9,beat());T.push(()=>dl.delayTime.setTargetAtTime(Math.min(7.9,beat()),ctx.currentTime,.05));
  In.connect(dl);if(filt){const f=ctx.createBiquadFilter();f.type=filt[0];f.frequency.value=filt[1];Nn.push(f);dl.connect(f);f.connect(fb)}else dl.connect(fb);fb.connect(dl);dl.connect(Out)};
 const lfo=(depth,target,div)=>{const o=ctx.createOscillator(),g=G(depth);Nn.push(o);o.frequency.value=1/(beat()*(div||1));T.push(()=>o.frequency.setTargetAtTime(1/(beat()*(div||1)),ctx.currentTime,.05));o.connect(g);g.connect(target);o.start();return g};
 switch(spec.fx){
  case 'Delay':dly(.3);break;
  case 'Echo':dly(.62,['lowpass',3500]);break;
  case 'Spiral':dly(.78,['highpass',500]);break;
  case 'Helix':dly(.85,['lowpass',6000]);break;
  case 'Ping Pong':{const l=ctx.createDelay(8),r=ctx.createDelay(8),pl=ctx.createStereoPanner(),pr=ctx.createStereoPanner(),fb=G(.55);Nn.push(l,r,pl,pr);pl.pan.value=-1;pr.pan.value=1;
   const upd=()=>{const x=Math.min(7.9,beat());l.delayTime.setTargetAtTime(x,ctx.currentTime,.05);r.delayTime.setTargetAtTime(x,ctx.currentTime,.05)};l.delayTime.value=r.delayTime.value=Math.min(7.9,beat());T.push(upd);
   In.connect(l);l.connect(pl);pl.connect(Out);l.connect(r);r.connect(pr);pr.connect(Out);r.connect(fb);fb.connect(l);break}
  case 'Reverb':{const c=ctx.createConvolver();c.buffer=rbIRbuf||(rbIRbuf=rbIR(3.5,2.5));Nn.push(c);In.connect(c);c.connect(Out);break}
  case 'Filter':{const f=ctx.createBiquadFilter();f.type='bandpass';f.Q.value=3;f.frequency.value=1800;Nn.push(f);In.connect(f);f.connect(Out);s.depth=lfo(1500,f.frequency);break}
  case 'Flanger':{const dl=ctx.createDelay(.05),fb=G(.7);Nn.push(dl);dl.delayTime.value=.005;In.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(Out);lfo(.004,dl.delayTime,4);break}
  case 'Phaser':{let p=In;for(let i=0;i<6;i++){const a=ctx.createBiquadFilter();a.type='allpass';a.frequency.value=600+i*400;Nn.push(a);lfo(500,a.frequency,4);p.connect(a);p=a}p.connect(Out);break}
  case 'Trans':{const o=ctx.createOscillator(),g=G(0);o.type='square';Nn.push(o);o.frequency.value=1/beat();T.push(()=>o.frequency.setTargetAtTime(1/beat(),ctx.currentTime,.05));o.connect(g);g.connect(n.dry.gain);o.start();s.transG=g;break}
 }
 s.nodes=Nn;s.timed=T;s.built=spec.fx}
function rbFxApply(d,key,spec,on){const n=d.n;if(!n||!n.dry)return;const name=spec.fx,L=spec.lvl,t=ctx.currentTime;
 if(on&&(!n.fxs||!n.fxs[key]||n.fxs[key].built!==name))rbFxBuild(d,key,spec);const s=n.fxs&&n.fxs[key];
 if(s&&BFX_WET.includes(name)){s.In.gain.setTargetAtTime(on?1:0,t,.01);s.Out.gain.setTargetAtTime(on||BFX_TAIL.includes(name)?L:0,t,.02)}
 if(s&&name==='Filter'){s.In.gain.value=on?1:0;s.Out.gain.value=on?1:0;n.dry.gain.value=on?1-L:1;if(s.depth)s.depth.gain.value=300+L*2500}
 if(s&&name==='Trans'){n.dry.gain.value=on?1-L/2:1;if(s.transG)s.transG.gain.value=on?L/2:0}
 if(name==='Pitch'){d.fxPitch=d.fxPitch||{};d.fxPitch[key]=on?Math.round((L*2-1)*12):0;rbApplyPitch(d)}
 if(name==='Roll'||name==='Slip Roll'||name==='Helix'){
  if(on&&!d._roll&&d.a.src&&d.bpm){d._roll=1;d._slip0=d.slip;if(name==='Slip Roll')d.slip=1;d.slipStart();const i=d.snap(d.a.currentTime);d.loop={in:i,out:i+BFX_BEATS[spec.beat]*60/d.bpm,on:true,beats:0,roll:1};d.ui()}
  else if(!on&&d._roll){d._roll=0;d.loop=null;d.slipEnd();d.slip=d._slip0;d.ui()}}
 if(name==='Vinyl Brake'&&on!==!!d.braking)d.brake(on);
 if(name==='Half Speed'||name==='Double Speed'){d.bend=on?(name==='Half Speed'?-.5:1):0;d.setRate()}}
const rbBfxClear=d=>rbFxClear(d,'beat');
function rbBfxApply(d,on){rbFxApply(d,'beat',BFX_SPEC,on)}
function rbBfxToggle(v){boot();BFX.on=v==null?!BFX.on:!!v;const tg=rbTargets();D.forEach(d=>{if(!BFX.on||!tg.includes(d))rbBfxApply(d,false)});if(BFX.on)tg.forEach(d=>rbBfxApply(d,true));rbBfxUI()}
function rbBfxSet(i){const was=BFX.on;if(was)rbBfxToggle(false);D.forEach(rbBfxClear);BFX.fx=(i+BFX_LIST.length)%BFX_LIST.length;rbSaveBfx();if(was)rbBfxToggle(true);rbBfxUI();toast('Beat FX: '+BFX_LIST[BFX.fx])}
function rbBfxBeat(dir){BFX.beat=Math.max(0,Math.min(BFX_BEATS.length-1,BFX.beat+dir));rbSaveBfx();rbBfxUI()}
function rbBfxCh(v){const was=BFX.on;if(was)rbBfxToggle(false);BFX.ch=v;rbSaveBfx();if(was)rbBfxToggle(true);rbBfxUI()}
function rbBfxLevel(v){BFX.lvl=v;rbSaveBfx();if(BFX.on)rbTargets().forEach(d=>rbBfxApply(d,true));rbBfxUI(1)}
setInterval(()=>D.forEach(d=>{if(d.n&&d.n.fxs)Object.values(d.n.fxs).forEach(s=>s.timed.forEach(f=>f()))}),400);
const rbBfxEl=document.createElement('section');rbBfxEl.id='bfx';rbBfxEl.className='bfx';
rbBfxEl.innerHTML=`<b>BEAT FX</b><select id="bfxSel" title="Effect">${BFX_LIST.map((x,i)=>`<option value="${i}">${x}</option>`).join('')}</select>
<button id="bfxL" title="Beat ◀">◀</button><span id="bfxB"></span><button id="bfxR" title="Beat ▶">▶</button>
<select id="bfxCh" title="Channel">${D.map((d,i)=>`<option value="${i}">CH ${'ABCD'[i]}</option>`).join('')}<option value="M">MASTER</option></select>
<label>LEVEL/DEPTH <input type="range" id="bfxLv" min="0" max="100"></label><button id="bfxOn">ON</button>`;
$('#fx').after(rbBfxEl);
function rbBfxUI(keepLv){$('#bfxSel').value=BFX.fx;$('#bfxB').textContent=BFX_BL[BFX.beat]+' beat';$('#bfxCh').value=BFX.ch;if(!keepLv)$('#bfxLv').value=Math.round(BFX.lvl*100);$('#bfxOn').classList.toggle('on',BFX.on)}
$('#bfxSel').onchange=e=>rbBfxSet(+e.target.value);$('#bfxL').onclick=()=>rbBfxBeat(-1);$('#bfxR').onclick=()=>rbBfxBeat(1);
$('#bfxCh').onchange=e=>rbBfxCh(e.target.value);$('#bfxLv').oninput=e=>rbBfxLevel(e.target.value/100);$('#bfxOn').onclick=()=>rbBfxToggle();
rbBfxUI();

// ---------- Pad FX: two banks (PAD FX1 / PAD FX2) of 16 slots like rekordbox; 8 pads on screen at a time,
// the "9-16" button (or SHIFT on the controller) shows the second half. Right-click a pad to change its effect. ----------
const PAD_LIST=BFX_LIST.concat(['Half Speed','Double Speed']);
const rbP=(fx,beat,lvl)=>({fx,beat,lvl:lvl||.5});
const PADFX_DEF=[rbP('Delay',4),rbP('Echo',5),rbP('Reverb',5),rbP('Vinyl Brake',5),rbP('Roll',2),rbP('Roll',1),rbP('Half Speed',5),rbP('Double Speed',5),
 rbP('Echo',3),rbP('Echo',4),rbP('Filter',8,.7),rbP('Trans',3),rbP('Flanger',6),rbP('Phaser',6),rbP('Spiral',3),rbP('Helix',5),
 rbP('Roll',0),rbP('Roll',1),rbP('Roll',2),rbP('Roll',3),rbP('Slip Roll',0),rbP('Slip Roll',1),rbP('Slip Roll',2),rbP('Slip Roll',3),
 rbP('Ping Pong',3),rbP('Ping Pong',4),rbP('Pitch',5,.75),rbP('Pitch',5,.25),rbP('Delay',2),rbP('Delay',3),rbP('Echo',6),rbP('Reverb',5,.8)];
let PADFX=PADFX_DEF.map((p,i)=>Object.assign({},(Array.isArray(S.padfx)&&S.padfx[i])||p));
const rbPadLbl=p=>p.fx+(['Vinyl Brake','Half Speed','Double Speed','Reverb','Pitch'].includes(p.fx)?'':' '+BFX_BL[p.beat]);
const rbPadBase=d=>((d.pfxBank||0)*2+(d.pfxHi?1:0))*8;
function rbPadFxUI(){D.forEach(d=>{const base=rbPadBase(d);d.el.querySelectorAll('[data-fx]').forEach(b=>{const n=+b.dataset.fx,p=PADFX[base+n];
  b.firstChild.textContent=p.fx;b.lastChild.textContent=(rbPadLbl(p)===p.fx?'':BFX_BL[p.beat]+' beat · ')+'#'+(base%16+n+1);b.title='Hold to play the effect. Right-click to change it.';b.classList.toggle('on',d._padFx===base+n)});
 const h=d.el.querySelector('.pfxpage');if(h){h.textContent=d.pfxHi?'9-16':'1-8';h.classList.toggle('on',!!d.pfxHi)}
 const bk=d.el.querySelector('.pfxbank');if(bk)bk.textContent='PAD FX'+((d.pfxBank||0)+1)})}
function rbPadFx(d,i,on){boot();const p=PADFX[i];if(!p)return;
 if(on){if(d._padFx!=null&&d._padFx!==i)rbPadFx(d,d._padFx,false);d._padFx=i;rbFxApply(d,'pad',p,true)}
 else{if(d._padFx!==i)return;rbFxApply(d,'pad',p,false);d._padFx=null}rbPadFxUI()}
async function rbPadEdit(i){const p=PADFX[i];
 const r=await rbForm('PAD FX'+(Math.floor(i/16)+1)+' — slot '+(i%16+1),[{k:'fx',label:'Effect',type:'select',opts:PAD_LIST.map(x=>[x,x]),val:p.fx},{k:'beat',label:'Beat',type:'select',opts:BFX_BL.map((x,k)=>[k,x]),val:p.beat},
  {k:'lvl',label:'Level / depth',type:'select',opts:[[.25,'25%'],[.5,'50%'],[.75,'75%'],[1,'100%']],val:p.lvl},{k:'reset',label:'Reset all Pad FX to default',type:'check',val:false}]);
 if(!r)return;D.forEach(d=>{if(d._padFx!=null)rbPadFx(d,d._padFx,false)});
 if(r.reset)PADFX=PADFX_DEF.map(x=>Object.assign({},x));else PADFX[i]={fx:r.fx,beat:+r.beat,lvl:+r.lvl};
 D.forEach(d=>rbFxClear(d,'pad'));S.padfx=PADFX;save();rbPadFxUI();toast(r.reset?'Pad FX reset':'PAD FX'+(Math.floor(i/16)+1)+' slot '+(i%16+1)+': '+rbPadLbl(PADFX[i]))}
D.forEach(d=>{const pan=d.el.querySelector('[data-p=padfx]');
 pan.insertAdjacentHTML('beforebegin','<div class="pfxbar" data-p="padfx"><small class="pfxbank">PAD FX1</small><button class="pfxpage" title="Show slots 9-16 (SHIFT on the controller)">1-8</button></div>');
 d.el.querySelector('.pfxpage').onclick=()=>{d.pfxHi=!d.pfxHi;rbPadFxUI()};
 d.el.querySelectorAll('[data-fx]').forEach(b=>{const n=+b.dataset.fx;
  b.onpointerdown=e=>{if(e.button>0)return;rbPadFx(d,rbPadBase(d)+n,true)};
  b.onpointerup=b.onpointerleave=b.onpointercancel=()=>{if(d._padFx!=null&&d._padFx%8===n)rbPadFx(d,d._padFx,false)};
  b.oncontextmenu=e=>{e.preventDefault();rbPadEdit(rbPadBase(d)+n)}})});
rbPadFxUI();
D.forEach(d=>d.el.querySelectorAll('[data-fx]').forEach(b=>{const i=+b.dataset.fx;
 b.onpointerdown=e=>{if(e.button>0)return;rbPadFx(d,i,true,b)};
 b.onpointerup=b.onpointerleave=b.onpointercancel=()=>{if(b.classList.contains('on'))rbPadFx(d,i,false,b)};
 b.oncontextmenu=e=>{e.preventDefault();rbPadEdit(i)}}));
rbPadFxUI();

// ---------- decks: key display, Key Shift / Key Sync, beat grid editing, sampler & key pads ----------
const KS_PADS=[1,2,3,4,-1,-2,-3,-4];
const rbKsTxt=v=>(v>0?'+':'')+v;
function rbEffKey(d){const k=d.tk&&(RB.meta[d.tk]||{}).key;if(!k)return null;const s=(d.keyShift||0)+(d.cfxPitch||0)+rbFxP(d)+(d.kl?0:12*Math.log2(d.rate||1));return{n:((k.n+Math.round(s))%12+12)%12,m:k.m}}
function rbSetKs(d,v){boot();d.keyShift=Math.max(-12,Math.min(12,Math.round(v)));rbApplyPitch(d);if(d.keyShift&&!rbPSok)toast('Key shift starts in a moment (audio engine loading)');rbDeckUI(d)}
function rbKeySync(d){const k=rbEffKey(d);if(!k){toast('Key not analyzed yet');return}
 const o=D.find(x=>x!==d&&x.master&&rbEffKey(x))||D.find(x=>x!==d&&!x.a.paused&&rbEffKey(x))||D.find(x=>x!==d&&rbEffKey(x));if(!o){toast('Load a second track with a key first');return}
 const ok=rbEffKey(o),target=ok.m===k.m?ok.n:(k.m?(ok.n+9)%12:(ok.n+3)%12),diff=((target-k.n)%12+18)%12-6;
 rbSetKs(d,(d.keyShift||0)+diff);toast('Key Sync → '+rbKeyTxt(rbEffKey(d)))}
const rbSmpName=i=>{const s=RB_SLOTS[i];return s.name||'—'};
function rbDeckDom(d){
 d.el.querySelector('.bk').insertAdjacentHTML('beforeend','<small class="keyd" data-k="keyd"></small>');
 const pnl=d.el.querySelector('.pnl'),sel=d.q('mode');
 sel.insertAdjacentHTML('beforeend','<option value="sampler">SAMPLER</option><option value="key">KEY SHIFT</option>');
 pnl.insertAdjacentHTML('beforeend',`<div class="pads" data-p="sampler" hidden>${[0,1,2,3,4,5,6,7].map(n=>`<button data-sp="${n}"><b>${(d.i%2)*8+n+1}</b><span></span></button>`).join('')}</div>
<div class="pads" data-p="key" hidden>${KS_PADS.map((v,n)=>`<button data-kp="${n}"><b>${rbKsTxt(v)}</b><span>semitone</span></button>`).join('')}</div>`);
 d.el.insertAdjacentHTML('beforeend',`<div class="row rbx"><small>KEY</small><button data-ks="-1" title="Key shift −1 semitone">♭</button><span data-k="ksv">0</span><button data-ks="1" title="Key shift +1 semitone">♯</button><button data-ks="sync" title="Match the key of the other deck">KEY SYNC</button><button data-ks="0" title="Original key">RESET</button>
<small>GRID</small><button data-g="l" title="Move beat grid earlier (10 ms)">◀</button><button data-g="r" title="Move beat grid later (10 ms)">▶</button><button data-g="here" title="Set the first downbeat (1.1) at the playhead">1.1 HERE</button>
<small>BPM</small><button data-g="b-" title="−0.1 BPM (Shift: −0.01)">−</button><button data-g="b+" title="+0.1 BPM (Shift: +0.01)">+</button><button data-g="x2">×2</button><button data-g="h2">÷2</button></div>`);
 d.el.querySelectorAll('[data-ks]').forEach(b=>b.onclick=()=>{const v=b.dataset.ks;if(v==='sync')rbKeySync(d);else rbSetKs(d,v==='0'?0:(d.keyShift||0)+(+v))});
 d.el.querySelectorAll('[data-kp]').forEach(b=>b.onclick=()=>{const v=KS_PADS[+b.dataset.kp];rbSetKs(d,d.keyShift===v?0:v)});
 d.el.querySelectorAll('[data-sp]').forEach(b=>{b.onpointerdown=()=>rbSmpPlay((d.i%2)*8+ +b.dataset.sp)});
 d.el.querySelectorAll('[data-g]').forEach(b=>b.onclick=e=>{if(!d.a.src){toast('Load a track first');return}const g=b.dataset.g,st=e.shiftKey?.01:.1;
  if(!d.bpm&&g!=='here'){toast('Tap or detect a BPM first');return}
  if(g==='l')d.first-=.01;else if(g==='r')d.first+=.01;else if(g==='here')d.first=d.a.currentTime;
  else if(g==='b-')d.bpm=Math.max(40,Math.round((d.bpm-st)*100)/100);else if(g==='b+')d.bpm=Math.min(300,Math.round((d.bpm+st)*100)/100);
  else if(g==='x2')d.bpm=Math.min(300,d.bpm*2);else if(g==='h2')d.bpm=Math.max(40,d.bpm/2);
  if(d.bpm&&d.first>60/d.bpm)d.first%=60/d.bpm;if(d.tk){rbMeta(d.tk).gridHand=1;rbSaveMeta()}if(d.tk&&g[0]!=='l'&&g!=='r'&&g!=='here'){rbMeta(d.tk).bpm=d.bpm;rbSaveMeta();renderLib()}})}
D.forEach(rbDeckDom);
function rbDeckUI(d){const k=rbEffKey(d),el=d.q('keyd');if(el){el.textContent=k?rbKeyTxt(k):(d.tk&&d.buf?'key…':'');const o=D.find(x=>x!==d&&!x.a.paused&&rbEffKey(x));el.classList.toggle('kc',!!(k&&o&&rbCompat(k,rbEffKey(o))))}
 const v=d.q('ksv');if(v)v.textContent=rbKsTxt(d.keyShift||0);
 d.el.querySelectorAll('[data-kp]').forEach(b=>b.classList.toggle('on',d.keyShift===KS_PADS[+b.dataset.kp]));
 d.el.querySelectorAll('[data-sp]').forEach(b=>{const i=(d.i%2)*8+ +b.dataset.sp,s=RB_SLOTS[i];b.lastChild.textContent=rbSmpName(i);b.classList.toggle('on',!!s.src);b.style.setProperty('--pc',s.loop?'#C6FF3D':'#6C5CE7')})}
setInterval(()=>D.forEach(rbDeckUI),300);
// phrase markers every 8 bars and memory cue markers on the zoomed waveform
const rbZ0=Deck.prototype.zdraw;Deck.prototype.zdraw=function(t){rbZ0.call(this,t);const c=this.zc;if(!c||!this.fp)return;
 const w=c.clientWidth,h=c.clientHeight,g=c.getContext('2d'),win=this.zoomSec||12,pps=w/win;
 if(this.bpm){const bl=60/this.bpm;g.font='bold 10px sans-serif';for(let k=Math.max(0,Math.ceil((t-win/2-this.first)/bl));;k++){const x=(this.first+k*bl-t)*pps+w/2;if(x>w)break;if(k%32===0){g.fillStyle='rgba(198,255,61,.85)';g.fillRect(x,0,3,h);g.fillText('BAR '+(k/4+1),x+5,h-3)}}}
 g.fillStyle='#ff3b3b';(this.mem||[]).forEach(v=>{const x=(v-t)*pps+w/2;if(x<-10||x>w+10)return;g.beginPath();g.moveTo(x-6,h);g.lineTo(x+6,h);g.lineTo(x,h-9);g.fill()})};

// ---------- 2. saved cues / loops / grid per track + key analysis on load ----------
const rbLoadTo0=loadTo;loadTo=function(i,e){if(!e||!D[i])return;D[i]._nextTk=rbTk(e);return rbLoadTo0(i,e)};
const rbLoad0=Deck.prototype.loadBlob;
Deck.prototype.loadBlob=async function(blob,name,known){const tk=this._nextTk||('file:'+name);this._nextTk=null;this.tk=null;this._saved=null;this._histTk=null;this.keyShift=0;rbApplyPitch(this);
 await rbLoad0.call(this,blob,name,known);this.tk=tk;rbRestore(this);rbKeyForDeck(this);rbDeckUI(this);rbSeparate(this)};
function rbRestore(d){const c=RB.cues[d.tk],m=RB.meta[d.tk]||{};if(m.bpm)d.bpm=m.bpm;
 if(c){d.cues=Array.from({length:8},(_,i)=>c.c&&c.c[i]!=null?c.c[i]:null);d.mem=(c.m||[]).slice();d.cp=c.cp||0;if(c.bpm)d.bpm=c.bpm;if(c.first!=null)d.first=c.first;if(c.loop)d.loop={in:c.loop.in,out:c.loop.out,on:false,beats:0};d.ui();toast('Cues restored: '+d.q('title').textContent)}
 d._saved=rbCueJson(d)}
const rbCueJson=d=>JSON.stringify({c:d.cues,m:d.mem,cp:d.cp,bpm:d.bpm,first:d.first,loop:d.loop&&d.loop.out!=null?{in:d.loop.in,out:d.loop.out}:null});
setInterval(()=>{let ch=0;D.forEach(d=>{if(!d.tk||!d.dur||d._saved==null||d._roll)return;const s=rbCueJson(d);if(s!==d._saved){d._saved=s;RB.cues[d.tk]=JSON.parse(s);ch=1}});if(ch)rbPut('dijvirta-cues',RB.cues)},1500);
function rbKeyForDeck(d){const tk=d.tk;if(!tk)return;const m=rbMeta(tk);if(m.key||!d.buf)return;
 setTimeout(()=>{if(d.tk!==tk||!d.buf)return;m.key=rbDetectKey(d.buf);rbSaveMeta();rbDeckUI(d);renderLib()},30)}
// analyse keys of library tracks in the background while nothing is playing
let rbBusy=false;
const rbTimeout=(p,ms)=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);
setInterval(async()=>{if(rbBusy||D.some(d=>!d.a.paused))return;const e=LIB.find(e=>!(RB.meta[rbTk(e)]||{}).key&&!e._kfail);if(!e)return;rbBusy=true;
 try{const buf=await rbTimeout((async()=>{const blob=e.file||(e.path?await (await fetch(rbFileUrl(e.path))).blob():demoWav(e.bpm,[110,98][e.demo]));return new OfflineAudioContext(2,1,44100).decodeAudioData(await blob.arrayBuffer())})(),30000);rbMeta(rbTk(e)).key=rbDetectKey(buf);rbSaveMeta();renderLib()}catch(x){e._kfail=1}
 rbBusy=false},2500);
// history
D.forEach(d=>d.a.addEventListener('play',()=>{if(d.tk&&d._histTk!==d.tk){d._histTk=d.tk;RB.hist.unshift({tk:d.tk,t:Date.now()});if(RB.hist.length>500)RB.hist.length=500;rbPut('dijvirta-hist',RB.hist);if(libF==='hist')renderLib()}}));

// ---------- dialog (Electron has no window.prompt) ----------
const rbDlg=document.createElement('dialog');rbDlg.id='rbDlg';document.body.appendChild(rbDlg);
function rbForm(title,fields){return new Promise(res=>{
 rbDlg.innerHTML=`<form method="dialog"><h3>${rbEsc(title)}</h3>${fields.map(f=>`<label class="rbf"><span>${rbEsc(f.label)}</span>${f.type==='select'?`<select name="${f.k}">${f.opts.map(o=>`<option value="${rbEsc(o[0])}"${String(o[0])===String(f.val)?' selected':''}>${rbEsc(o[1])}</option>`).join('')}</select>`:f.type==='check'?`<input type="checkbox" name="${f.k}"${f.val?' checked':''}>`:`<input name="${f.k}" value="${rbEsc(f.val)}" placeholder="${rbEsc(f.ph||'')}">`}</label>`).join('')}<div class="row"><button value="ok" class="on">OK</button><button value="cancel">Cancel</button></div></form>`;
 rbDlg.onclose=()=>{if(rbDlg.returnValue!=='ok'){res(null);return}const o={};fields.forEach(f=>{const el=rbDlg.querySelector(`[name="${f.k}"]`);o[f.k]=f.type==='check'?el.checked:el.value});res(o)};
 rbDlg.returnValue='';rbDlg.showModal();const first=rbDlg.querySelector('input,select');if(first)first.focus()})}

// ---------- 6. library ----------
const RB_COLS=['transparent','#ff5fa2','#ff4040','#ff9f1c','#ffe23d','#3ddc84','#35d6e6','#3d7bff','#9b59ff'];
function rbIplMatch(p,e){const m=RB.meta[rbTk(e)]||{},bpm=m.bpm||e.bpm||0,k=m.key;
 if(p.bmin&&bpm<+p.bmin)return false;if(p.bmax&&bpm>+p.bmax)return false;
 if(p.key){const want=rbParseCam(p.key);if(want){if(!k)return false;if(p.compat?!rbCompat(k,want):rbCam(k)!==rbCam(want)||k.m!==want.m)return false}}
 if(+p.rmin&&(m.r||0)<+p.rmin)return false;if(p.tag&&!(m.tags||'').toLowerCase().includes(p.tag.toLowerCase()))return false;if(+p.col&&m.col!==+p.col)return false;return true}
const rbRefKey=()=>{const d=D.find(x=>!x.a.paused&&rbEffKey(x));return d?rbEffKey(d):null};
const RB_HEAD=[['col','●'],['n','Track Title'],['a','Artist'],['g','Genre'],['bpm','BPM'],['key','Key'],['r','Rating'],['dur','Time'],['tags','My Tag'],[null,'Load to deck']];
$('#lib thead tr').innerHTML=RB_HEAD.map(([k,l])=>k?`<th data-sort="${k}" data-label="${rbEsc(tr(l))}" style="cursor:pointer">${rbEsc(tr(l))}</th>`:`<th>${rbEsc(tr(l))}</th>`).join('');
document.querySelectorAll('#lib thead [data-sort]').forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(libSort.key===k)libSort.dir*=-1;else{libSort.key=k;libSort.dir=1}renderLib()});
renderLib=function(){const tb=$('#rows');if(!tb)return;tb.innerHTML='';const ref=rbRefKey();
 let list;
 if(libF==='hist'){list=[];const seen=new Set();RB.hist.forEach(h=>{if(seen.has(h.tk))return;seen.add(h.tk);const i=LIB.findIndex(e=>rbTk(e)===h.tk);if(i>=0)list.push({e:LIB[i],i})})}
 else list=LIB.map((e,i)=>({e,i})).filter(({e})=>{if(libF.startsWith('dir:'))return e.dir===libF.slice(4);if(e.dir)return false;const real=e.file||e.path;if(libF==='demo'&&real)return false;if(libF==='imp'&&!real)return false;
  if(libF.startsWith('pl:')){const pl=PLAYLISTS.find(p=>p.name===libF.slice(3));if(!pl||!e.id||!pl.ids.includes(e.id))return false}
  if(libF.startsWith('ipl:')){const p=RB.ipl[+libF.slice(4)];if(!p||!rbIplMatch(p,e))return false}return true});
 list.forEach(x=>x.m=RB.meta[rbTk(x.e)]||{});
 if(libQ)list=list.filter(({e,m})=>(e.n+' '+e.a+' '+(e.g||'')+' '+(m.tags||'')+' '+rbKeyTxt(m.key)).toLowerCase().includes(libQ));
 if(libSort.key&&libF!=='hist'){const k=libSort.key,val=({e,m})=>k==='key'?rbKeyOrd(m.key):k==='r'?(m.r||0):k==='bpm'?(m.bpm||e.bpm||0):k==='tags'?(m.tags||'').toLowerCase():k==='col'?(m.col||99):typeof e[k]==='string'?(e[k]||'').toLowerCase():(e[k]||0);
  list=list.slice().sort((A,B)=>{const a=val(A),b=val(B);return(a>b?1:a<b?-1:0)*libSort.dir})}
 document.querySelectorAll('#lib thead [data-sort]').forEach(th=>th.textContent=th.dataset.label+(libSort.key===th.dataset.sort?(libSort.dir>0?' ▲':' ▼'):''));
 list.forEach(({e,i,m})=>{const tr=document.createElement('tr');tr.dataset.i=i;if(i===sel)tr.className='sel';
  const bpm=m.bpm||e.bpm,kc=ref&&m.key&&rbCompat(m.key,ref);
  const del=(e.file||e.path)&&e.id&&!e.dir?`<button data-del title="Remove from library">✕</button>`:'',plb=e.id?`<button data-pl title="Add to playlist">＋</button>`:'';
  tr.innerHTML=`<td class="cdot"><i data-col style="--dc:${RB_COLS[m.col||0]}" title="Colour"></i></td><td>${rbEsc(e.n)}</td><td>${rbEsc(e.a)}</td><td>${rbEsc(e.g||'')}</td><td>${bpm?bpm.toFixed(2):'…'}</td><td class="${kc?'kc':''}">${m.key?rbKeyTxt(m.key):'…'}</td><td class="st">${[1,2,3,4,5].map(n=>`<i data-r="${n}">${n<=(m.r||0)?'★':'☆'}</i>`).join('')}</td><td>${e.dur?fmt2(e.dur):'…'}</td><td class="tag" data-tag title="My Tag">${m.tags?rbEsc(m.tags):'<span class="ph">+ tag</span>'}</td><td>${D.map((x,k)=>`<button data-l="${k}">${k+1}</button>`).join(' ')} ${plb}${del}</td>`;
  const mm=()=>rbMeta(rbTk(e)),stop=ev=>ev.stopPropagation();
  tr.onclick=()=>{sel=i;renderLib()};tr.ondblclick=()=>loadTo(0,e);
  tr.querySelectorAll('[data-r]').forEach(x=>x.onclick=ev=>{stop(ev);const M=mm(),r=+x.dataset.r;M.r=M.r===r?0:r;e.r=M.r;rbSaveMeta();renderLib()});
  tr.querySelector('[data-col]').onclick=ev=>{stop(ev);const M=mm();M.col=((M.col||0)+1)%RB_COLS.length;rbSaveMeta();renderLib()};
  tr.querySelector('[data-tag]').onclick=async ev=>{stop(ev);const r=await rbForm('My Tag — '+e.n,[{k:'t',label:'Tags (comma separated)',val:m.tags||'',ph:'warm-up, vocal, peak time'}]);if(r){mm().tags=r.t.trim();rbSaveMeta();renderLib()}};
  tr.querySelectorAll('[data-l]').forEach(b=>b.onclick=ev=>{stop(ev);loadTo(+b.dataset.l,e)});
  const pb=tr.querySelector('[data-pl]');if(pb)pb.onclick=async ev=>{stop(ev);if(!PLAYLISTS.length){toast('Create a playlist first');return}
   const r=await rbForm('Add to playlist',[{k:'p',label:'Playlist',type:'select',opts:PLAYLISTS.map(p=>[p.name,p.name]),val:PLAYLISTS[0].name}]);const pl=r&&PLAYLISTS.find(p=>p.name===r.p);if(!pl)return;if(e.dir&&typeof rbCollect==='function')rbCollect([e]);if(!pl.ids.includes(e.id))pl.ids.push(e.id);idbPutPlaylist(pl);toast('Added to '+pl.name)};
  const db=tr.querySelector('[data-del]');if(db)db.onclick=ev=>{stop(ev);idbDeleteTrack(e.id);const k=LIB.indexOf(e);if(k>-1)LIB.splice(k,1);renderLib()};
  tb.appendChild(tr)})};
let rbRefTxt='';setInterval(()=>{const k=rbKeyTxt(rbRefKey());if(k!==rbRefTxt){rbRefTxt=k;renderLib()}},2000);
Object.keys(RB.meta).forEach(tk=>{const e=LIB.find(x=>rbTk(x)===tk);if(e&&RB.meta[tk].r)e.r=RB.meta[tk].r});
$('#newPl').onclick=async()=>{const r=await rbForm('New playlist',[{k:'n',label:'Name',val:''}]);const n=r&&r.n.trim();if(!n)return;
 if(PLAYLISTS.some(p=>p.name===n)){toast('A playlist with that name already exists');return}const p={name:n,ids:[]};PLAYLISTS.push(p);idbPutPlaylist(p);renderPlLib()};
const rbBindF=b=>b.onclick=()=>{libF=b.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x===b));renderLib()};
$('#lib aside [data-f="imp"]').insertAdjacentHTML('afterend','<button data-f="hist">History</button>');rbBindF($('#lib aside [data-f="hist"]'));
$('#newPl').insertAdjacentHTML('afterend','<div id="iplBox"></div><button id="newIpl">+ Intelligent playlist</button><div class="amx"><button id="amx" title="Plays the list below from the selected track, mixing each track into the next">AUTOMIX</button><select id="amxT" title="Crossfade length"><option value="5">5 s</option><option value="10">10 s</option><option value="20">20 s</option><option value="30">30 s</option></select></div>');
function rbRenderIpl(){$('#iplBox').innerHTML=RB.ipl.map((p,k)=>`<button data-f="ipl:${k}" class="ipl">⚡ ${rbEsc(p.name)} <s data-dipl="${k}" title="Delete">✕</s></button>`).join('');
 $('#iplBox').querySelectorAll('[data-f]').forEach(rbBindF);
 $('#iplBox').querySelectorAll('[data-dipl]').forEach(x=>x.onclick=ev=>{ev.stopPropagation();RB.ipl.splice(+x.dataset.dipl,1);rbPut('dijvirta-ipl',RB.ipl);if(libF.startsWith('ipl:'))libF='all';rbRenderIpl();renderLib()})}
$('#newIpl').onclick=async()=>{const r=await rbForm('Intelligent playlist',[{k:'name',label:'Name',val:'',ph:'Peak time 124-128'},{k:'bmin',label:'BPM from',val:'',ph:'120'},{k:'bmax',label:'BPM to',val:'',ph:'130'},
 {k:'key',label:'Key (Camelot)',val:'',ph:'8A'},{k:'compat',label:'Include compatible keys',type:'check',val:true},{k:'rmin',label:'Minimum rating',type:'select',opts:[[0,'any'],[1,'★'],[2,'★★'],[3,'★★★'],[4,'★★★★'],[5,'★★★★★']],val:0},
 {k:'tag',label:'My Tag contains',val:''},{k:'col',label:'Colour',type:'select',opts:[[0,'any'],[1,'pink'],[2,'red'],[3,'orange'],[4,'yellow'],[5,'green'],[6,'aqua'],[7,'blue'],[8,'purple']],val:0}]);
 if(!r||!r.name.trim())return;RB.ipl.push(Object.assign(r,{name:r.name.trim()}));rbPut('dijvirta-ipl',RB.ipl);rbRenderIpl();toast('Intelligent playlist created')};
rbRenderIpl();

// ---------- 4. Automix (decks A and B) ----------
const AM={on:false,cur:0,fading:false,ready:false,pos:0,list:[]};
$('#amxT').value=String(S.amT||10);$('#amxT').onchange=e=>{S.amT=+e.target.value;save()};
const rbAmUI=()=>$('#amx').classList.toggle('on',AM.on);
const rbList=()=>[...document.querySelectorAll('#rows tr')].map(r=>LIB[+r.dataset.i]).filter(Boolean);
async function rbLoadWait(i,e){AM.ready=false;loadTo(i,e);const tk=rbTk(e),t0=Date.now();while(Date.now()-t0<20000){await new Promise(r=>setTimeout(r,200));if(D[i].tk===tk&&D[i].dur){if(AM.on)AM.ready=true;return true}}return false}
async function rbAutomix(on){AM.on=!!on;AM.fading=false;rbAmUI();if(!AM.on){toast('Automix OFF');return}
 boot();AM.list=rbList();if(!AM.list.length){toast('Library is empty');AM.on=false;rbAmUI();return}
 const A=D[0],B=D[1];
 if(A.a.src&&!A.a.paused)AM.cur=0;else if(B.a.src&&!B.a.paused)AM.cur=1;else AM.cur=-1;
 if(AM.cur>=0){const k=AM.list.findIndex(e=>rbTk(e)===D[AM.cur].tk);AM.pos=k>=0?k:Math.max(0,AM.list.indexOf(LIB[sel]))-1}
 else{AM.cur=0;AM.pos=Math.max(0,AM.list.indexOf(LIB[sel]));await rbLoadWait(0,AM.list[AM.pos]);if(!AM.on)return;$('#xf').value=-100;xfade();A.a.currentTime=A.cp||0;A.a.play().catch(()=>{})}
 toast('Automix ON');const nx=AM.list[AM.pos+1];if(nx)rbLoadWait(1-AM.cur,nx)}
setInterval(()=>{if(!AM.on)return;const c=D[AM.cur],o=D[1-AM.cur];if(!c||!o)return;
 if(!AM.fading){if(c.a.paused||!c.dur)return;const rem=c.dur-c.a.currentTime,T=+S.amT||10;
  if(rem<=T&&AM.ready&&o.a.paused){AM.fading=true;AM.ready=false;AM.fs=performance.now();AM.T=Math.max(1,Math.min(T,rem));if(c.bpm&&o.bpm)o.sync();o.a.currentTime=o.cp||0;o.a.play().catch(()=>{})}}
 else{const p=Math.min(1,(performance.now()-AM.fs)/(AM.T*1000));$('#xf').value=Math.round(AM.cur===0?-100+200*p:100-200*p);xfade();
  if(p>=1){c.a.pause();AM.fading=false;AM.cur=1-AM.cur;AM.pos++;const nx=AM.list[AM.pos+1];if(nx)rbLoadWait(1-AM.cur,nx);else toast('Automix: last track')}}},100);
$('#amx').onclick=()=>rbAutomix(!AM.on);

// ---------- 8. 16-slot sampler ----------
const RB_SLOTS=Array.from({length:16},(_,i)=>({name:i<8?SMPN[i]:'',synth:i<8,buf:null,blob:null,loop:false,src:null}));
$('#smp').innerHTML=RB_SLOTS.map((s,i)=>`<button class="slot" data-slot="${i}"><b>${i+1}</b><span></span></button>`).join('')+
 '<div class="smpv"><label>Sampler volume <input type="range" id="sv" min="0" max="100" value="80"></label><small>Click: play (loop slots start/stop) · Right-click: load file / loop / clear · Drop an audio file on a slot</small></div>';
$('#sv').oninput=()=>{if(rbSmpG)rbSmpG.gain.value=$('#sv').value/100};
function rbSmpUI(){document.querySelectorAll('#smp .slot').forEach(b=>{const s=RB_SLOTS[+b.dataset.slot];b.lastChild.textContent=s.name||'— empty —';b.classList.toggle('has',!!(s.buf||s.synth));b.classList.toggle('loop',s.loop);b.classList.toggle('on',!!s.src)});D.forEach(rbDeckUI)}
function rbSmpPlay(i){boot();const s=RB_SLOTS[i];if(!s)return;
 if(!s.buf){if(s.synth){hit(i);return}rbSmpPick(i);return}
 if(s.src){try{s.src.stop()}catch(e){}s.src=null;if(s.loop){rbSmpUI();return}}
 const src=ctx.createBufferSource();src.buffer=s.buf;src.loop=s.loop;
 if(s.loop){const m=D.find(d=>d.master&&d.bpm)||D.find(d=>!d.a.paused&&d.bpm);if(m){const bpm=m.bpm*m.rate,beats=Math.pow(2,Math.max(0,Math.round(Math.log2(s.buf.duration*bpm/60))));src.playbackRate.value=s.buf.duration/(beats*60/bpm)}}
 src.connect(rbSmpG||master);src.start();s.src=src;src.onended=()=>{if(s.src===src){s.src=null;rbSmpUI()}};rbSmpUI()}
const rbSmpFile=document.createElement('input');rbSmpFile.type='file';rbSmpFile.accept='audio/*';rbSmpFile.hidden=true;document.body.appendChild(rbSmpFile);
function rbSmpPick(i){rbSmpFile.onchange=()=>{const f=rbSmpFile.files[0];rbSmpFile.value='';if(f)rbSmpLoad(i,f)};rbSmpFile.click()}
function rbSmpSave(i){const s=RB_SLOTS[i];idbOpen().then(db=>{const st=db.transaction('samples','readwrite').objectStore('samples');if(s.blob)st.put({slot:i,name:s.name,loop:s.loop,blob:s.blob});else st.delete(i)}).catch(()=>{})}
async function rbSmpLoad(i,file,quiet){const s=RB_SLOTS[i];try{s.buf=await new OfflineAudioContext(2,1,44100).decodeAudioData(await file.arrayBuffer());s.blob=file;s.synth=false;if(!quiet){s.name=(file.name||'sample').replace(/\.[^.]+$/,'').slice(0,20);rbSmpSave(i)}rbSmpUI()}catch(e){toast("Can't read this file. Try MP3, WAV or M4A.")}}
document.querySelectorAll('#smp .slot').forEach(b=>{const i=+b.dataset.slot;
 b.onpointerdown=e=>{if(e.button===0)rbSmpPlay(i)};
 b.oncontextmenu=async e=>{e.preventDefault();const s=RB_SLOTS[i];const r=await rbForm('Sampler slot '+(i+1),[{k:'a',label:'Action',type:'select',opts:[['load','Load audio file…'],['loop',s.loop?'Loop: OFF (one-shot)':'Loop: ON'],['clear','Clear slot']],val:'load'}]);if(!r)return;
  if(r.a==='load')rbSmpPick(i);else if(r.a==='loop'){s.loop=!s.loop;if(s.src){try{s.src.stop()}catch(x){}s.src=null}rbSmpSave(i);rbSmpUI()}else{if(s.src)try{s.src.stop()}catch(x){}Object.assign(s,{name:'',synth:false,buf:null,blob:null,loop:false,src:null});rbSmpSave(i);rbSmpUI()}};
 b.ondragover=e=>e.preventDefault();b.ondrop=e=>{e.preventDefault();e.stopPropagation();const f=e.dataTransfer.files[0];if(f)rbSmpLoad(i,f)}});
idbOpen().then(db=>{const rq=db.transaction('samples','readonly').objectStore('samples').getAll();rq.onsuccess=()=>(rq.result||[]).forEach(r=>{const s=RB_SLOTS[r.slot];if(!s)return;s.name=r.name;s.loop=!!r.loop;rbSmpLoad(r.slot,r.blob,true)})}).catch(()=>{});
rbSmpUI();

// ---------- pads & controller (MIDI) ----------
const rbPadEl0=padEl;padEl=function(i,mode,n){const d=D[i];if(mode==='sampler')return d.el.querySelector(`[data-sp="${n}"]`);if(mode==='key')return d.el.querySelector(`[data-kp="${n}"]`);return rbPadEl0(i,mode,n)};
[0,1,2,3].forEach(i=>{const di=()=>deckIdx(i),d=()=>D[di()],L='Deck '+'ABCD'[i]+(i<2?'/'+'ABCD'[i+2]:'')+' ';
 add('ksup'+i,L+'Key shift +1',{press:()=>d()&&rbSetKs(d(),(d().keyShift||0)+1)});
 add('ksdn'+i,L+'Key shift −1',{press:()=>d()&&rbSetKs(d(),(d().keyShift||0)-1)});
 add('ksync'+i,L+'Key Sync',{press:()=>d()&&rbKeySync(d())});
 add('ksreset'+i,L+'Key shift reset',{press:()=>d()&&rbSetKs(d(),0)});
 add('pmsampler'+i,L+'Pad mode button: SAMPLER',{press:()=>setPadMode(di(),'sampler'),led:()=>!!d()&&d().q('mode').value==='sampler'});
 add('pmkey'+i,L+'Pad mode button: KEY SHIFT',{press:()=>setPadMode(di(),'key'),led:()=>!!d()&&d().q('mode').value==='key'});
 for(let n=0;n<8;n++){
  add('smp'+i+'_'+n,L+'Sampler pad '+(n+1),{press:()=>{setPadMode(di(),'sampler');rbSmpPlay((di()%2)*8+n)},led:()=>{const s=RB_SLOTS[(di()%2)*8+n];return!!(s&&(s.src||s.buf||s.synth))}});
  add('ks'+i+'_'+n,L+'Key shift pad '+(n+1)+' ('+rbKsTxt(KS_PADS[n])+')',{press:()=>{setPadMode(di(),'key');const x=d();if(x)rbSetKs(x,x.keyShift===KS_PADS[n]?0:KS_PADS[n])},led:()=>!!d()&&d().keyShift===KS_PADS[n]})}});
{const a=MIDI_ACTIONS.find(x=>x.id==='bfx');if(a){a.label='Beat FX ON/OFF';a.press=()=>rbBfxToggle();a.led=()=>BFX.on}
 const l=MIDI_ACTIONS.find(x=>x.id==='bfxlvl');if(l){l.label='Beat FX LEVEL/DEPTH';l.cc=v=>{rbBfxLevel(v)}}}
add('bfxsel','Beat FX select (next effect)',{press:()=>rbBfxSet(BFX.fx+1)});
add('bfxselp','Beat FX select (previous effect)',{press:()=>rbBfxSet(BFX.fx-1)});
add('bfxbl','Beat FX beat ◀',{press:()=>rbBfxBeat(-1)});
add('bfxbr','Beat FX beat ▶',{press:()=>rbBfxBeat(1)});
add('bfxch','Beat FX channel (next)',{press:()=>{const o=D.map((_,i)=>String(i)).concat('M');rbBfxCh(o[(o.indexOf(BFX.ch)+1)%o.length])}});
add('amx','Automix ON/OFF',{press:()=>rbAutomix(!AM.on),led:()=>AM.on});
// Beat FX channel lever: each position sends its own note (on while selected); neither on = MASTER
const rbLever=[0,0];
function rbLeverSet(k,v){rbLever[k]=v;clearTimeout(rbLever.t);rbLever.t=setTimeout(()=>{const ch=rbLever[0]&&!rbLever[1]?String(deckIdx(0)):rbLever[1]&&!rbLever[0]?String(deckIdx(1)):'M';if(ch!==BFX.ch)rbBfxCh(ch)},30)}
add('bfxlva','Beat FX channel lever: position 1',{press:()=>rbLeverSet(0,1),release:()=>rbLeverSet(0,0)});
add('bfxlvb','Beat FX channel lever: position 2',{press:()=>rbLeverSet(1,1),release:()=>rbLeverSet(1,0)});
// RELEASE FX: everything off at once, echo tails fade out naturally
function rbReleaseFx(){rbBfxToggle(false);D.forEach(d=>{if(d._padFx!=null)rbPadFx(d,d._padFx,false);const f=d.c('flt');if(f&&+f.value!==0){f.value=0;f.dispatchEvent(new Event('input',{bubbles:true}))}
 d.fxOn=[0,0,0];if(d.braking)d.brake(false)});document.querySelectorAll('.fxu [data-e].on').forEach(b=>b.classList.remove('on'));toast('RELEASE FX')}
add('relfx','RELEASE FX (all effects off)',{press:()=>rbReleaseFx()});
// FLX4 / DDJ-400: SAMPLER button + pads, KEY SHIFT (SHIFT+SAMPLER) + pads, Beat FX select and beat buttons
function rbFlx4Patch(m){[0,1].forEach(i=>{const p=i?9:7;if(m['pmslicer'+i]){m['pmsampler'+i]=m['pmslicer'+i];delete m['pmslicer'+i]}m['pmkey'+i]={kind:'note',ch:i,num:0x6F};
  for(let k=0;k<8;k++){delete m['slc'+i+'_'+k];m['smp'+i+'_'+k]={kind:'note',ch:p,num:0x30+k};m['ks'+i+'_'+k]={kind:'note',ch:p,num:0x70+k}}});
 m.bfxsel={kind:'note',ch:4,num:0x63};m.bfxbl={kind:'note',ch:4,num:0x4A};m.bfxbr={kind:'note',ch:4,num:0x4B};
 m.hmix={kind:'cc',ch:6,num:0x0C};m.hlv={kind:'cc',ch:6,num:0x0D};m.mv={kind:'cc',ch:6,num:0x08};
 m.bfxlva={kind:'note',ch:4,num:0x10};m.bfxlvb={kind:'note',ch:5,num:0x11};m.relfx={kind:'note',ch:6,num:0x63};return m}  // CH SELECT lever, RELEASE FX (recorded)  // HEADPHONES MIXING / LEVEL, MASTER LEVEL (recorded from a DDJ-FLX4)
rbFlx4Patch(FLX4_MAP);
if(S.midiVer===FLX4_VER&&S.midi&&S.midi.play0&&S.midi.play0.kind==='note'&&S.midi.play0.num===0x0B){rbFlx4Patch(S.midi);S.midiVer=FLX4_VER+1;save()}
if(S.midiVer>FLX4_VER&&S.midi&&S.midi.play0&&S.midi.play0.num===0x0B&&!S.midi.hmix&&!S.midi.hlv){S.midi.hmix=FLX4_MAP.hmix;S.midi.hlv=FLX4_MAP.hlv;save()}
if(S.midiVer>FLX4_VER&&S.midi&&S.midi.play0&&S.midi.play0.num===0x0B&&!S.midi.mv){S.midi.mv=FLX4_MAP.mv;save()}
if(S.midiVer>FLX4_VER&&S.midi&&S.midi.play0&&S.midi.play0.num===0x0B&&!S.midi.bfxlva){S.midi.bfxlva=FLX4_MAP.bfxlva;S.midi.bfxlvb=FLX4_MAP.bfxlvb;S.midi.relfx=FLX4_MAP.relfx;save()}

// ---------- stems: split each loaded track into vocal / bass / instrumental in a background worker ----------
// STFT (4096, hop 1024). Bass = everything below ~120 Hz. Vocal = centre-panned, phase-aligned, harmonic (not percussive)
// energy in the voice band. Instrumental = the rest, so the three stems always add up to the original track.
const RB_SEP=`
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
 for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a),h=len>>1;for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<h;j++){const k=i+j+h,vr=re[k]*cr-im[k]*ci,vi=re[k]*ci+im[k]*cr;re[k]=re[i+j]-vr;im[k]=im[i+j]-vi;re[i+j]+=vr;im[i+j]+=vi;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}}}
function med(a,n){for(let i=1;i<n;i++){const v=a[i];let j=i-1;while(j>=0&&a[j]>v){a[j+1]=a[j];j--}a[j+1]=v}return a[n>>1]}
onmessage=e=>{const{L,R,sr}=e.data,N=4096,H=1024,K=N/2,len=L.length,TH=4,W=2*TH+1,FH=4;
 const win=new Float32Array(N);for(let i=0;i<N;i++)win[i]=.5-.5*Math.cos(2*Math.PI*i/N);
 const out=[0,1,2].map(()=>[new Float32Array(len),new Float32Array(len)]);
 const kB0=Math.floor(90*N/sr),kB1=Math.ceil(160*N/sr),kV0=Math.floor(150*N/sr),kV1=Math.ceil(9000*N/sr);
 const bassW=new Float32Array(K+1),vb=new Float32Array(K+1);
 for(let k=0;k<=K;k++){const f=k*sr/N;bassW[k]=f<=90?1:f>=160?0:.5+.5*Math.cos(Math.PI*(f-90)/70);vb[k]=f<150||f>9000?0:f<250?(f-150)/100:f>7000?(9000-f)/2000:1}
 const ring=[];for(let i=0;i<W;i++)ring.push(null);
 const re=new Float32Array(N),im=new Float32Array(N),tv=new Float32Array(W),fv=new Float32Array(2*FH+1);
 const frames=Math.ceil((len+N)/H)+TH;let lastP=-1;
 const oRe=new Float32Array(N),oIm=new Float32Array(N);
 for(let t=0;t<frames;t++){
  // analysis of frame t (starts at t*H-N), packed stereo FFT: z = L + iR
  const st=t*H-N;let fr=null;
  if(st<len){for(let i=0;i<N;i++){const p=st+i,w=win[i];re[i]=p>=0&&p<len?L[p]*w:0;im[i]=p>=0&&p<len?R[p]*w:0}fft(re,im);
   const lr=new Float32Array(K+1),li=new Float32Array(K+1),rr=new Float32Array(K+1),ri=new Float32Array(K+1),mm=new Float32Array(K+1);
   for(let k=0;k<=K;k++){const k2=(N-k)%N,ar=re[k],ai=im[k],br=re[k2],bi=-im[k2];lr[k]=(ar+br)/2;li[k]=(ai+bi)/2;rr[k]=(ai-bi)/2;ri[k]=-(ar-br)/2;const mr=lr[k]+rr[k],mi=li[k]+ri[k];mm[k]=Math.sqrt(mr*mr+mi*mi)}
   fr={st,lr,li,rr,ri,mm}}
  ring.shift();ring.push(fr);const c=ring[TH];if(!c)continue;
  // masks for the centre frame
  const V=new Float32Array(K+1);
  for(let k=kV0;k<=kV1&&k<K;k++){if(!vb[k])continue;
   let n=0;for(let j=0;j<W;j++)tv[n++]=ring[j]?ring[j].mm[k]:0;const hm=med(tv,n);
   n=0;for(let j=-FH;j<=FH;j++){const q=k+j;fv[n++]=q>=0&&q<=K?c.mm[q]:0}const pm=med(fv,n);
   const harm=hm*hm/(hm*hm+pm*pm+1e-12);
   const a2=c.lr[k]*c.lr[k]+c.li[k]*c.li[k],b2=c.rr[k]*c.rr[k]+c.ri[k]*c.ri[k],rab=c.lr[k]*c.rr[k]+c.li[k]*c.ri[k];
   const sim=Math.max(0,2*rab/(a2+b2+1e-12)),pan=Math.abs(a2-b2)/(a2+b2+1e-12);
   V[k]=vb[k]*(1-bassW[k])*Math.pow(sim,3)*Math.pow(1-pan,2)*Math.min(1,harm*2)}
  // synthesis: 0 vocal, 1 bass, 2 instrumental; packed inverse FFT y = SL + i SR
  for(let s=0;s<3;s++){
   for(let k=0;k<=K;k++){const m=s===0?V[k]:s===1?bassW[k]:Math.max(0,1-V[k]-bassW[k]);
    const sLr=c.lr[k]*m,sLi=c.li[k]*m,sRr=c.rr[k]*m,sRi=c.ri[k]*m;
    oRe[k]=sLr-sRi;oIm[k]=sLi+sRr;if(k>0&&k<K){oRe[N-k]=sLr+sRi;oIm[N-k]=-sLi+sRr}}
   for(let i=0;i<N;i++)oIm[i]=-oIm[i];fft(oRe,oIm);
   const oL=out[s][0],oR=out[s][1];for(let i=0;i<N;i++){const p=c.st+i;if(p<0||p>=len)continue;const w=win[i]/(N*1.5);oL[p]+=oRe[i]*w;oR[p]+=-oIm[i]*w}}
  const pr=Math.floor(t/frames*100);if(pr!==lastP&&pr%5===0){lastP=pr;postMessage({progress:pr})}}
 postMessage({done:true,stems:out},out.flat().map(x=>x.buffer))};`;
let rbSepURL=null;
function rbWav(l,r,sr){const n=l.length,b=new ArrayBuffer(44+n*4),v=new DataView(b),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
 w(0,'RIFF');v.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*4,true);
 let o=44;for(let i=0;i<n;i++){v.setInt16(o,Math.max(-1,Math.min(1,l[i]))*32767,true);v.setInt16(o+2,Math.max(-1,Math.min(1,r[i]))*32767,true);o+=4}return b}
function rbSeparate(d){if(S.autoStems===false||!d.buf||!d.tk)return;const tk=d.tk,buf=d.buf,st=d.q('stemst');
 if(d._sepW)d._sepW.terminate();if(!rbSepURL)rbSepURL=URL.createObjectURL(new Blob([RB_SEP],{type:'text/javascript'}));
 const w=new Worker(rbSepURL);d._sepW=w;
 const L=buf.getChannelData(0).slice(),R=(buf.numberOfChannels>1?buf.getChannelData(1):buf.getChannelData(0)).slice();
 w.onmessage=e=>{if(d.tk!==tk){w.terminate();return}
  if(e.data.progress!=null){if(st&&!d.stems)st.textContent='separating '+e.data.progress+'%';return}
  w.terminate();d._sepW=null;const s=e.data.stems,names=['vocals.wav','bass.wav','instrumental.wav'];
  const files=s.map((x,i)=>new File([rbWav(x[0],x[1],buf.sampleRate)],names[i],{type:'audio/wav'}));
  d.loadStems(files);if(st)st.textContent='vocal · bass · instrumental ✓'};
 w.onerror=e=>{console.warn('stem separation',e);if(st)st.textContent='';w.terminate();d._sepW=null};
 if(st)st.textContent='separating 0%';w.postMessage({L,R,sr:buf.sampleRate},[L.buffer,R.buffer])}
// stems also go through the key-shift / pitch processor
const rbStems0=Deck.prototype.loadStems;Deck.prototype.loadStems=function(files){rbStems0.call(this,files);const n=this.n;
 if(n&&n.ps&&this.stems)Object.values(this.stems).forEach(x=>{try{x.g.disconnect()}catch(e){}x.g.connect(n.ps)})};

// ---------- headphones on the controller: DJ controllers (DDJ-FLX4 etc.) are one 4-channel sound card,
// master on channels 1-2 and the headphone jack on channels 3-4. The CUE mix goes there through its own 4-channel output.
let rbHp=null;
async function rbCtrlOut(){const l=await navigator.mediaDevices.enumerateDevices();
 return l.find(d=>d.kind==='audiooutput'&&d.deviceId!=='default'&&d.deviceId!=='communications'&&/DDJ|FLX|XDJ|Pioneer|Numark|Hercules|Traktor|Kontrol|Denon|Reloop|Mixtrack|Inpulse/i.test(d.label))}
let rbHpQ=Promise.resolve();
function rbHpRoute(){rbHpQ=rbHpQ.then(rbHpRoute1).catch(e=>console.warn(e));return rbHpQ}  // one at a time, never two outputs
async function rbHpRoute1(){if(!ctx||!hpEl||!hpEl.srcObject)return;
 const dev=!S.hp&&S.hp4!==false?await rbCtrlOut():null;
 if(rbHp&&(!dev||rbHp.id!==dev.deviceId)){try{rbHp.c.close()}catch(e){}rbHp=null}
 if(!dev||rbHp){rbHpUI();return}
 try{const c=new AudioContext({latencyHint:'interactive',sinkId:dev.deviceId}),dst=c.destination;
  if(dst.maxChannelCount<4){c.close();toast('Headphone channels 3-4 are not available on '+dev.label);rbHpUI();return}
  dst.channelCount=4;dst.channelCountMode='explicit';dst.channelInterpretation='discrete';
  const s=c.createMediaStreamSource(hpEl.srcObject),sp=c.createChannelSplitter(2),m=c.createChannelMerger(4);
  s.connect(sp);sp.connect(m,0,2);sp.connect(m,1,3);m.connect(dst);if(c.state==='suspended')c.resume();
  rbHp={c,id:dev.deviceId,label:dev.label};hpEl.pause();toast('Headphones: '+dev.label.replace(/\s*\(.*\)$/,'')+' (CUE)')}
 catch(e){console.warn('headphone route',e);toast("Can't open the controller's headphone output")}
 rbHpUI()}
function rbHpUI(){const el=$('#hpStat');if(el)el.textContent=rbHp?'🎧 '+rbHp.label.replace(/\s*\(.*\)$/,''):S.hp?'🎧 settings device':'🎧 not set'}
const rbApplyAudio0=applyAudio;applyAudio=function(){rbApplyAudio0();rbHpRoute()};
if(navigator.mediaDevices)navigator.mediaDevices.addEventListener('devicechange',()=>rbHpRoute());
document.querySelectorAll('[data-cue]').forEach(b=>b.onclick=()=>{boot();if(!S.hp&&!rbHp){rbHpRoute().then(()=>{if(!rbHp)toast('Choose a headphones output in Settings')});return}
 const d=D[+b.dataset.cue];if(!d)return;d.cue=!d.cue;b.classList.toggle('on',d.cue);if(d.n)d.n.pfl.gain.value=d.cue?1:0});
$('.hp>small').insertAdjacentHTML('afterend','<small id="hpStat"></small>');
$('[data-s=hp]').closest('.set').insertAdjacentHTML('afterend','<div class="set"><span>Headphones on the DJ controller (channels 3-4), when no headphone device is chosen above</span><input type="checkbox" id="hp4"></div>');
$('#hpStat').insertAdjacentHTML('afterend','<button id="hpTest" title="Beeps in the headphones only (4 s)">🎧 TEST</button>');
$('#hpTest').onclick=async()=>{boot();await rbHpRoute();const beep=(c,dst,chs)=>{const o=c.createOscillator(),g=c.createGain(),m=c.createChannelMerger(dst.channelCount);o.frequency.value=880;g.gain.value=0;o.connect(g);chs.forEach(k=>g.connect(m,0,k));m.connect(dst);
  const t=c.currentTime;for(let i=0;i<8;i++){g.gain.setValueAtTime(.2,t+i*.5);g.gain.setValueAtTime(0,t+i*.5+.2)}o.start(t);o.stop(t+4.1);setTimeout(()=>m.disconnect(),4300)};
 if(rbHp){beep(rbHp.c,rbHp.c.destination,[2,3]);toast('Beeps → '+rbHp.label.replace(/\s*\(.*\)$/,'')+' headphones (channels 3-4)')}
 else if(S.hp){const c=new AudioContext({sinkId:S.hp});beep(c,c.destination,[0,1]);setTimeout(()=>c.close(),4500);toast('Beeps → headphone device from Settings')}
 else toast('No headphone output: connect the controller or choose one in Settings')};
$('#hp4').checked=S.hp4!==false;$('#hp4').onchange=e=>{S.hp4=e.target.checked;save();rbHpRoute()};
rbHpUI();

// ---------- BEAT SYNC ----------
// Precise beat grid: the kick (bass) onsets of the whole track are matched against a comb at each candidate tempo
// (0.005 BPM steps around the rough value); the strongest one gives the exact BPM and, from its phase, the first beat.
function rbBeatGrid(buf,rough){const sr=buf.sampleRate,a=buf.getChannelData(0),b=buf.numberOfChannels>1?buf.getChannelData(1):a,fps=200,hop=Math.floor(sr/fps),n=Math.floor(a.length/hop);
 const aL=1-Math.exp(-2*Math.PI*150/sr),env=new Float32Array(n);let l=0;
 for(let f=0;f<n;f++){let m=0;for(let j=0;j<hop;j++){const i=f*hop+j;l+=aL*((a[i]+b[i])/2-l);const v=Math.abs(l);if(v>m)m=v}env[f]=m}
 const on=new Float32Array(n);for(let f=1;f<n;f++)on[f]=Math.max(0,env[f]-env[f-1]);
 const idx=[],w=[];for(let f=1;f<n-1;f++)if(on[f]>0&&on[f]>=on[f-1]&&on[f]>=on[f+1]){idx.push(f/fps);w.push(on[f])}
 let best={s:-1};for(let bpm=rough-.75;bpm<=rough+.75;bpm+=.005){const bl=60/bpm;let re=0,im=0;
  for(let k=0;k<idx.length;k++){const ph=2*Math.PI*idx[k]/bl;re+=w[k]*Math.cos(ph);im+=w[k]*Math.sin(ph)}const s=re*re+im*im;if(s>best.s)best={s,bpm,re,im}}
 const bl=60/best.bpm;let first=(Math.atan2(best.im,best.re)/(2*Math.PI))*bl;first=((first%bl)+bl)%bl;
 return{bpm:Math.round(best.bpm*100)/100,first}}
const RB_RANGES=[6,8,10,16,25,50];
// like rekordbox: one MASTER deck leads, synced decks follow it and the master's tempo is never changed by sync
function rbMasterUI(){D.forEach(x=>{const b=x.q('mst');if(b)b.classList.toggle('on',!!x.master)})}
function rbSetMaster(d){D.forEach(x=>x.master=x===d);rbMasterUI()}
function rbSyncRef(d){const m=D.find(x=>x.master&&x.bpm&&x.a.src);if(m)return m===d?null:m;
 const o=D.find(x=>x!==d&&!x.a.paused&&x.bpm)||D.find(x=>x!==d&&x.bpm&&x.a.src);if(o)rbSetMaster(o);return o||null}
setInterval(()=>{const m=D.find(x=>x.master);if(m&&(m.a.paused||!m.a.src)){const n=D.find(x=>x!==m&&x.syncOn&&!x.a.paused&&x.bpm);if(n){n.syncOn=false;n.bend=0;n.setRate();rbSetMaster(n);rbSyncUI()}}},500);
function rbPhase(d){return(d.a.currentTime-d.first)/(60/d.bpm)}
// match tempo (half / double time allowed, tempo range widened if needed); returns the tempo multiplier or 0
function rbMatchTempo(d,o,quiet){const target=o.bpm*o.rate*(1+(o.bend||0)*0);let best=null;
 // same tempo when it is reachable (≤35 % change); half / double time only for tracks that are really far apart
 const n1=target/d.bpm-1;if(Math.abs(n1)<=.35)best={need:n1,mul:1};
 else for(const mul of[1,2,.5]){const need=target*mul/d.bpm-1;if(!best||Math.abs(need)<Math.abs(best.need))best={need,mul}}
 // half / double time: re-read the track's tempo as the double / half (the beat grid keeps every beat), so both decks show the same BPM
 if(best.mul!==1&&!d._rbGrid){d.bpm=Math.round(d.bpm/best.mul*100)/100;if(d.tk){const m=rbMeta(d.tk);m.bpm=d.bpm;rbSaveMeta()}best.mul=1;if(!quiet)toast('Deck '+'ABCD'[d.i]+' tempo read as '+d.bpm.toFixed(1)+' BPM')}
 if(Math.abs(best.need)*100>S.range){const r=RB_RANGES.find(x=>x>=Math.abs(best.need)*100+.01);if(!r){if(!quiet)toast('BPM too far apart to sync');return 0}
  S.range=r;save();const el=document.querySelector('[data-s=range]');if(el)el.value=r;D.forEach(x=>x.setRate());if(!quiet)toast('Tempo range ±'+r+'%')}
 d._syncT=target*best.mul;const v=Math.round(best.need/(S.range/100)*1000*10)/10;if(Math.abs(+d.q('pitch').value-v)>.05){d.q('pitch').value=v}d.setRate();return best.mul}
// while synced the tempo is exactly the master's (the slider only moves in steps)
{const sr0=Deck.prototype.setRate;Deck.prototype.setRate=function(){sr0.call(this);if(this.syncOn&&this._syncT&&this.bpm){const r0=this.rate;this.rate=this._syncT/this.bpm;if(Math.abs(this.rate-r0)<.01){const r=Math.max(.0625,Math.min(4,this.rate*(1+this.bend)));this.a.playbackRate=r;if(this.stems)Object.values(this.stems).forEach(x=>x.el.playbackRate=r)}else this.rate=r0}}}
// offset to the reference in beats: with 'bar' sync the first beats of the bars land together (±2 beats), otherwise just the nearest beat
function rbBarErr(o,d,mul){let x=rbPhase(o)*mul-rbPhase(d);if(S.syncBar!==false&&mul===1)return((x%4)+6)%4-2;return x-Math.round(x)}
Deck.prototype.sync=function(){lastDeck=this.i;
 if(this.syncOn){this.syncOn=false;this.bend=0;this.setRate();rbSyncUI();toast('SYNC '+'ABCD'[this.i]+' off');return}
 // like rekordbox: the deck whose SYNC is pressed follows; MASTER moves to the other deck (a playing one first)
 if(this.master){const other=D.find(x=>x!==this&&x.a.src&&x.bpm&&!x.a.paused)||D.find(x=>x!==this&&x.a.src&&x.bpm);if(other){if(other.syncOn){other.syncOn=false;other.bend=0;other.setRate()}rbSetMaster(other)}else{toast('Load a track on another deck first');return}}
 const o=rbSyncRef(this);if(!this.bpm||!o){toast('Load two tracks with a BPM first');return}
 const mul=rbMatchTempo(this,o);if(!mul)return;this.syncMul=mul;this.syncOn=true;
 if(this.a.src&&o.a.src){let e=rbBarErr(o,this,mul);if(Math.abs(e)>.01)this.a.currentTime=Math.max(0,this.a.currentTime+e*60/this.bpm)}
 rbSyncUI();toast('SYNC '+'ABCD'[this.i]+' → '+'ABCD'[o.i]+'  '+(this.bpm*this.rate).toFixed(2)+' BPM'+(mul!==1?(mul>1?'  (double time)':'  (half time)'):''))};
// while SYNC is on: follow the reference tempo and pull the beats together with a small, inaudible speed correction
setInterval(()=>D.forEach(d=>{if(!d.syncOn)return;const o=rbSyncRef(d);if(!o||!d.bpm){return}
 const mul=rbMatchTempo(d,o,true);if(!mul){d.syncOn=false;rbSyncUI();return}d.syncMul=mul;
 if(d.a.paused||o.a.paused||d._roll||d.jd||d.braking){if(d.bend&&!d.braking&&!d.jd){d.bend=0;d.setRate()}return}
 let e=rbPhase(o)*mul-rbPhase(d);e-=Math.round(e);if(d._se!=null&&Math.abs(e-d._se)>.15&&(d._glitch=(d._glitch||0)+1)<4)return;d._glitch=0;d._se=d._se==null?e:d._se*.7+e*.3;const se=d._se;  // smoothed, the media clock jitters a little
 // a clear offset is fixed in one step; only tiny drift is pulled in slowly (≤0.5 %, not audible as a tempo change)
 if(Math.abs(se)>.12&&Date.now()-(d._jumpT||0)>900){d.a.currentTime=Math.max(0,d.a.currentTime+e*60/d.bpm);d.bend=0;d._se=0;d._jumpT=Date.now();d.setRate()}
 else{const want=Math.abs(se)<.005||Date.now()-(d._jumpT||0)<700?0:Math.max(-.02,Math.min(.02,Math.round(se*.25/.0025)*.0025));
  // every speed change makes the time-stretcher re-sync, so change it rarely and in coarse steps
  if(want!==d.bend&&Date.now()-(d._bendT||0)>500){d.bend=want;d._bendT=Date.now();d.setRate()}}}),100);
// a synced deck that starts playing locks onto the beat immediately
// MP3 seeking is not sample exact, so check again after each jump (up to 3 times)
function rbSyncOnPlay(d,tries){if(!d.syncOn)return;tries=tries||0;setTimeout(()=>{const o=rbSyncRef(d);if(!o||o.a.paused||!d.bpm||!o.bpm||d.a.paused)return;let e=rbBarErr(o,d,d.syncMul||1);
 if(Math.abs(e)>.02){d.a.currentTime=Math.max(0,d.a.currentTime+e*60/d.bpm);d._se=0;d._jumpT=Date.now();if(tries<3)rbSyncOnPlay(d,tries+1)}},tries?350:60)}
D.forEach(d=>d.a.addEventListener('play',()=>rbSyncOnPlay(d)));
function rbSyncUI(){D.forEach(d=>{const b=d.q('sync');if(b)b.classList.toggle('on',!!d.syncOn)})}
{const a=MIDI_ACTIONS.find(x=>/^sync[0-3]$/.test(x.id)&&x.id==='sync0');MIDI_ACTIONS.filter(x=>/^sync[0-3]$/.test(x.id)).forEach(x=>{const i=+x.id.slice(4);x.led=()=>{const d=D[deckIdx(i)];return!!(d&&d.syncOn)}})}
// moving the tempo fader takes the deck out of SYNC
MIDI_ACTIONS.filter(x=>/^pitch[0-3]$/.test(x.id)).forEach(x=>{const cc0=x.cc,i=+x.id.slice(5);x.cc=v=>{const d=D[deckIdx(i)];if(d&&d.syncOn){d.syncOn=false;d.bend=0;rbSyncUI()}cc0(v)}});
D.forEach(d=>d.q('pitch').addEventListener('pointerdown',()=>{if(d.syncOn){d.syncOn=false;d.bend=0;d.setRate();rbSyncUI()}}));
// precise BPM and first beat for a freshly loaded track (unless the grid was set by hand or saved)
function rbGridEstimate(d){if(!d.buf||!d.bpm||d._rbGrid)return;const m=RB.meta[d.tk]||{},c=RB.cues[d.tk];if(m.gridHand||(c&&c.gridOk))return;
 const tk=d.tk;setTimeout(()=>{if(d.tk!==tk||d._rbGrid)return;const g=rbBeatGrid(d.buf,d.bpm);d.bpm=g.bpm;d.first=g.first;const mm=rbMeta(tk);mm.bpm=g.bpm;rbSaveMeta();
  d._saved=null;const cc=RB.cues[tk]||(RB.cues[tk]={c:[],m:[],cp:0});cc.bpm=g.bpm;cc.first=g.first;cc.gridOk=1;rbPut('dijvirta-cues',RB.cues);d._saved=rbCueJson(d);renderLib()},60)}
const rbRestore0=rbRestore;rbRestore=function(d){rbRestore0(d);rbGridEstimate(d)};

// ---------- library preview: 3-band overview (bass / mid / high) with bar grid of the selected track,
// click it to listen in the headphones only ----------
const RB_PW=600;const rbPrevCache={};let rbPrevTk=null,rbPrevT=0;
$('.srch').insertAdjacentHTML('beforeend','<div id="pvw" title="Selected track. Click to listen in the headphones from that point."><canvas id="pvc"></canvas><span id="pvl"></span><button id="pvs" title="Stop preview" hidden>■</button></div>');
const rbB64=u8=>{let s='';for(let i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return btoa(s)},rbUnB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function rbPrevAnalyse(e){const tk=rbTk(e),m=rbMeta(tk);if(m.wf2)return{wf:rbUnB64(m.wf2),first:m.wfFirst||0};if(rbPrevCache[tk])return rbPrevCache[tk];
 const blob=e.file||(e.path?await (await fetch(rbFileUrl(e.path))).blob():demoWav(e.bpm,[110,98][e.demo])),buf=await new OfflineAudioContext(2,1,44100).decodeAudioData(await blob.arrayBuffer());
 const sr=buf.sampleRate,a=buf.getChannelData(0),b=buf.numberOfChannels>1?buf.getChannelData(1):a,n=a.length,hop=Math.ceil(n/RB_PW);
 const aL=1-Math.exp(-2*Math.PI*140/sr),aH=1-Math.exp(-2*Math.PI*2500/sr),W=new Float32Array(RB_PW*3),fps=Math.floor(sr/100),low=new Float32Array(Math.ceil(n/fps));
 // RMS per column and band (peaks would make every column look full), each band scaled to its own loudest column
 let l1=0,l2=0;for(let i=0;i<n;i++){const x=(a[i]+b[i])/2;l1+=aL*(x-l1);l2+=aH*(x-l2);const c=Math.floor(i/hop)*3,lo=l1,mi=l2-l1,hi=x-l2;
  W[c]+=lo*lo;W[c+1]+=mi*mi;W[c+2]+=hi*hi;const f=(i/fps)|0,al=Math.abs(l1);if(al>low[f])low[f]=al}
 for(let i=0;i<W.length;i++)W[i]=Math.sqrt(W[i]/hop);
 const wf=new Uint8Array(RB_PW*3);for(let bd=0;bd<3;bd++){let mx=0;for(let c=bd;c<W.length;c+=3)if(W[c]>mx)mx=W[c];for(let c=bd;c<W.length;c+=3)wf[c]=Math.min(255,Math.round(Math.pow(W[c]/(mx||1),1.4)*255))}
 // first downbeat: the beat phase where the bass hits hardest
 let first=0;const bpm=(m.bpm||e.bpm||0);if(bpm){const bl=60/bpm;let best=-1;for(let ph=0;ph<bl;ph+=.01){let s=0;for(let t=ph;t<low.length/100;t+=bl)s+=low[Math.round(t*100)]||0;if(s>best){best=s;first=ph}}}
 const c=RB.cues[tk];if(c&&c.first!=null)first=c.first;
 delete m.wf;m.wf2=rbB64(wf);m.wfFirst=first;m.wfDur=buf.duration;rbSaveMeta();return rbPrevCache[tk]={wf,first}}
function rbPrevDraw(e,data){const cv=$('#pvc'),w=cv.clientWidth,h=cv.clientHeight,r=devicePixelRatio||1;if(!w)return;if(cv.width!==Math.round(w*r)){cv.width=Math.round(w*r);cv.height=Math.round(h*r)}
 const g=cv.getContext('2d');g.setTransform(r,0,0,r,0,0);g.clearRect(0,0,w,h);if(!e||!data)return;
 const m=RB.meta[rbTk(e)]||{},dur=e.dur||m.wfDur||0,bpm=m.bpm||e.bpm||0,wf=data.wf,mid=h/2;
 for(let x=0;x<w;x++){const i=Math.min(RB_PW-1,Math.floor(x/w*RB_PW))*3,lo=wf[i]/255,mi=wf[i+1]/255,hi=wf[i+2]/255;
  // highs and mids in the background, bass on top so kicks, drops and breakdowns stand out
  g.fillStyle='rgba(255,255,255,.28)';g.fillRect(x,mid-hi*mid*.95,1,hi*h*.95);g.fillStyle='rgba(255,176,32,.55)';g.fillRect(x,mid-mi*mid*.8,1,mi*h*.8);g.fillStyle='#4d88ff';g.fillRect(x,mid-lo*mid*.9,1,Math.max(1,lo*h*.9))}
 if(bpm&&dur){const bar=240/bpm;for(let k=0,t=data.first;t<dur;k++,t+=bar){const x=t/dur*w;g.fillStyle=k%8===0?'rgba(198,255,61,.9)':'rgba(255,255,255,.18)';g.fillRect(x,0,k%8===0?1.5:1,h)}}
 if(rbPrevEl&&rbPrevTk===rbTk(e)&&!rbPrevEl.paused&&dur){g.fillStyle='#ff3b3b';g.fillRect(rbPrevEl.currentTime/dur*w-1,0,2,h)}}
let rbPrevCur=null,rbPrevData=null;
async function rbPrevShow(){const e=LIB[sel];const l=$('#pvl');if(!e){rbPrevCur=null;rbPrevDraw(null);l.textContent='';return}
 if(rbPrevCur===e){rbPrevDraw(e,rbPrevData);return}rbPrevCur=e;rbPrevData=null;rbPrevDraw(null);
 const m=RB.meta[rbTk(e)]||{},bpm=m.bpm||e.bpm;l.textContent=[e.n,bpm?bpm.toFixed(1)+' BPM':'',m.key?rbKeyTxt(m.key):'',e.dur?fmt2(e.dur):''].filter(Boolean).join('  ·  ')+'  — analysing…';
 const my=++rbPrevT;await new Promise(r=>setTimeout(r,180));if(my!==rbPrevT)return;
 try{const d=await rbPrevAnalyse(e);if(rbPrevCur!==e)return;rbPrevData=d;l.textContent=l.textContent.replace('  — analysing…','');rbPrevDraw(e,d)}catch(x){l.textContent=e.n+'  — can’t read this file'}}
const rbRenderLib0=renderLib;renderLib=function(){rbRenderLib0();rbPrevShow()};
// preview playback goes only to the headphone (CUE) bus
let rbPrevEl=null,rbPrevSrc=null,rbPrevUrl=null;
$('#pvc').onclick=ev=>{const e=rbPrevCur;if(!e)return;boot();if(!S.hp&&!rbHp){toast('Preview plays in the headphones: connect the controller or choose a headphones output in Settings');return}
 const tk=rbTk(e),frac=Math.max(0,Math.min(1,ev.offsetX/ev.target.clientWidth));
 if(!rbPrevEl){rbPrevEl=new Audio();rbPrevSrc=ctx.createMediaElementSource(rbPrevEl);const g=ctx.createGain();g.gain.value=.9;rbPrevSrc.connect(g);g.connect(cueBus);rbPrevEl.onended=()=>{$('#pvs').hidden=true}}
 const go=()=>{rbPrevEl.currentTime=frac*(rbPrevEl.duration||0);rbPrevEl.play().catch(()=>{});$('#pvs').hidden=false};
 if(rbPrevTk!==tk){if(rbPrevUrl)URL.revokeObjectURL(rbPrevUrl);rbPrevUrl=URL.createObjectURL(e.file||demoWav(e.bpm,[110,98][e.demo]));rbPrevEl.src=rbPrevUrl;rbPrevTk=tk;rbPrevEl.addEventListener('loadedmetadata',go,{once:true})}else go()};
$('#pvs').onclick=()=>{if(rbPrevEl)rbPrevEl.pause();$('#pvs').hidden=true;rbPrevDraw(rbPrevCur,rbPrevData)};
setInterval(()=>{if(rbPrevEl&&!rbPrevEl.paused)rbPrevDraw(rbPrevCur,rbPrevData)},200);
addEventListener('resize',()=>rbPrevDraw(rbPrevCur,rbPrevData));

// ---------- DDJ-FLX4: corrections from Pioneer's own mapping (rekordbox\MidiMappings\DDJ-FLX4.midi.csv) ----------
[0,1,2,3].forEach(i=>{const di=()=>deckIdx(i),d=()=>D[di()],L='Deck '+'ABCD'[i]+(i<2?'/'+'ABCD'[i+2]:'')+' ';
 add('memdel'+i,L+'Delete memory cue (at / before the playhead)',{press:()=>{const x=d();if(!x||!x.mem.length)return;const t=x.a.currentTime;let k=x.mem.findIndex(v=>Math.abs(v-t)<.5);if(k<0)k=x.mem.reduce((b,v,j)=>v<=t?j:b,-1);if(k>=0){x.mem.splice(k,1);toast('Memory cue deleted')}}});
 add('jogb'+i,L+'Jog wheel top, not touched (pitch bend)',{rel:v=>{const x=d();if(x)jogNudge(x,v)}});
 add('callLl'+i,L+'Loop ½ (CUE/LOOP CALL ◀ while looping)',{press:()=>{const x=d();if(x&&x.loop&&x.loop.on&&Date.now()-(x._callT||0)>120)tapEl(x.q('lhalf'),1)}});
 add('callRl'+i,L+'Loop ×2 (CUE/LOOP CALL ▶ while looping)',{press:()=>{const x=d();if(x&&x.loop&&x.loop.on&&Date.now()-(x._callT||0)>120)tapEl(x.q('ldbl'),1)}});
 for(let n=0;n<8;n++)add('smpstop'+i+'_'+n,L+'Sampler pad '+(n+1)+' stop (SHIFT)',{press:()=>{const s=RB_SLOTS[(di()%2)*8+n];if(s&&s.src){try{s.src.stop()}catch(e){}s.src=null;rbSmpUI()}}})});
// CALL ◀▶ send both the memory-call and the loop-size message; remember when the call action ran so the loop one does not double up
MIDI_ACTIONS.filter(a=>/^call[LR][0-3]$/.test(a.id)).forEach(a=>{const p=a.press,i=+a.id.slice(5);a.press=()=>{const x=D[deckIdx(i)];if(x)x._callT=Date.now();p()}});
let rbMasterCue=false;add('mastercue','MASTER CUE (master in the headphones)',{press:()=>{rbMasterCue=!rbMasterCue;applyHp();toast('MASTER CUE '+(rbMasterCue?'ON':'OFF'))},led:()=>rbMasterCue});
const rbApplyHp0=applyHp;applyHp=function(){rbApplyHp0();if(ctx&&rbMasterCue)mixCue.gain.value=1};
function rbFlx4Official(m){const n=(ch,num)=>({kind:'note',ch,num}),c=(ch,num)=>({kind:'cc',ch,num});
 [0,1].forEach(i=>{m['stut'+i]=n(i,0x0E);m['start'+i]=n(i,0x48);m['mst'+i]=n(i,0x5C);m['trange'+i]=n(i,0x60);m['tap'+i]=n(i,0x68);m['memdel'+i]=n(i,0x3E);m['mem'+i]=n(i,0x3D);
  m['callLl'+i]=n(i,0x12);m['callRl'+i]=n(i,0x13);delete m['lhalf'+i];delete m['ldbl'+i];m['lex'+i]=n(i,0x50);m['jogb'+i]=c(i,0x23);m['jogfast'+i]=c(i,0x29);
  for(let k=0;k<8;k++)m['smpstop'+i+'_'+k]=n(i?10:8,0x30+k)});
 m.relfx=n(4,0x43);m.bfxselp=n(4,0x64);m.mastercue=n(6,0x63);return m}
rbFlx4Official(FLX4_MAP);
if(S.midi&&S.midi.play0&&S.midi.play0.num===0x0B&&S.midi.cue0&&S.midi.cue0.num===0x0C&&!S.flx4Official){rbFlx4Official(S.midi);S.flx4Official=1;save()}

// ---------- RELEASE FX (SHIFT + BEAT FX ON): like rekordbox, all effects off and the selected channel leaves with an echo / brake ----------
function rbReleaseFx(){boot();const type=S.relfx||'echo',tg=rbTargets().filter(d=>d.a.src&&!d.a.paused);
 rbBfxToggle(false);D.forEach(d=>{if(d._padFx!=null)rbPadFx(d,d._padFx,false);const f=d.c('flt');if(f&&+f.value!==0){f.value=0;f.dispatchEvent(new Event('input',{bubbles:true}))}d.fxOn=[0,0,0];if(d.syncOn){d.syncOn=false;d.bend=0;d.setRate()}});
 document.querySelectorAll('.fxu [data-e].on').forEach(b=>b.classList.remove('on'));rbSyncUI();
 tg.forEach(d=>{if(type==='brake'||type==='backspin'){d.brake(true);return}
  const spec={fx:'Echo',beat:S.relfxBeat!=null?S.relfxBeat:5,lvl:.85},n=d.n;rbFxApply(d,'rel',spec,true);const bl=60/(d.bpm*d.rate||120);
  setTimeout(()=>{const s=n.fxs&&n.fxs.rel;if(s)s.In.gain.setTargetAtTime(0,ctx.currentTime,.02);n.dry.gain.setTargetAtTime(0,ctx.currentTime,.03);
   setTimeout(()=>{d.a.pause();n.dry.gain.cancelScheduledValues(0);n.dry.gain.value=1;setTimeout(()=>rbFxClear(d,'rel'),8000)},200)},bl*1000)});
 toast('RELEASE FX'+(tg.length?' — '+(type==='echo'?'echo out':'brake')+' '+tg.map(d=>'ABCD'[d.i]).join(' '):''))}

// ---------- import settings, FX and sampler from rekordbox 6 on this computer ----------
if(!RB_RANGES.includes(100))RB_RANGES.push(100);
{const r=document.querySelector('[data-s=range]');if(r&&![...r.options].some(o=>o.value==='100'))r.insertAdjacentHTML('beforeend','<option value="100">100 (WIDE)</option>')}
const RB_RBFX=['Delay','Echo','Ping Pong','Spiral','Reverb','Trans','Flanger','Phaser','Pitch','Slip Roll','Roll','Vinyl Brake','Helix'];
const rbFileUrl=p=>'file:///'+p.replace(/\\/g,'/').split('/').map((s,i)=>i===0?s:encodeURIComponent(s)).join('/');
async function rbImportRekordbox(appData){appData=appData||window.DJ_APPDATA;if(!appData){toast('rekordbox folder not found');return[]}
 const base=appData.replace(/\\/g,'/')+'/Pioneer/rekordbox6/',done=[];
 const get=async f=>{try{const r=await fetch(rbFileUrl(base+f));if(!r.ok)return null;return new DOMParser().parseFromString(await r.text(),'text/xml')}catch(e){return null}};
 const val=(doc,name)=>{const e=doc&&doc.querySelector('VALUE[name="'+name+'"]');return e?e.getAttribute('val'):null};
 const play=await get('PlaySettings.xml');
 if(play){const tr=+val(play,'TempoRange0');if(tr){S.range=RB_RANGES.slice().sort((a,b)=>a-b).find(x=>x>=tr)||100;const el=document.querySelector('[data-s=range]');if(el)el.value=S.range;D.forEach(d=>d.setRate());done.push('tempo range ±'+S.range+'%'+(S.range>=100?' (WIDE)':''))}
  const mv=+val(play,'MastarVol0');if(mv){$('#mv').value=Math.round(mv*100);applyMaster();done.push('master volume '+Math.round(mv*100)+'%')}}
 const gen=await get('rekordbox3.settings');
 if(gen){const mt=val(gen,'Player0_MasterTempo');if(mt!=null){S.keylock=mt==='1';D.forEach(d=>d.setKL(S.keylock));done.push('key lock (master tempo) '+(S.keylock?'on':'off'))}
  const q=val(gen,'Player1_Quantize');if(q!=null){S.quant=q==='1';document.querySelectorAll('[data-k=q]').forEach(b=>b.classList.toggle('on',S.quant));done.push('quantize '+(S.quant?'on':'off'))}}
 const fx=await get('FxUnitSettings.xml');
 if(fx){const s=fx.querySelector('SINGLE_FXUNIT_ID_1'),f=s?+s.getAttribute('fx'):NaN,nm=RB_RBFX[f];
  // SINGLE_BEAT_1 uses attribute names like 0="5" that an XML parser rejects, so read it from the raw text
  let raw='';try{raw=await (await fetch(rbFileUrl(base+'FxUnitSettings.xml'))).text()}catch(e){}
  const sb=(raw.match(/<SINGLE_BEAT_1([^>]*)\/>/)||[])[1]||'',bm=sb.match(new RegExp('\\s'+f+'="(\\d+)"'));
  if(nm&&BFX_LIST.includes(nm)){const b=bm?+bm[1]:NaN;BFX.fx=BFX_LIST.indexOf(nm);if(b>=0&&b<BFX_BEATS.length)BFX.beat=b;rbSaveBfx();D.forEach(rbBfxClear);rbBfxUI();done.push('Beat FX '+nm+' '+BFX_BL[BFX.beat]+' beat')}
  const rl=fx.querySelector('RELEASE_FXUNIT_ID_1');if(rl){const t=+rl.getAttribute('relfx');S.relfx=['brake','backspin','echo'][t]||'echo';const bi=+rl.getAttribute('beatIndex'+t);if(bi>=0&&bi<BFX_BEATS.length)S.relfxBeat=bi;done.push('Release FX '+S.relfx.toUpperCase())}}
 const smp=await get('SamplerSettings1.xml');
 if(smp){const g=smp.querySelector('PROPERTIES > VALUE[name="gain"]');if(g){$('#sv').value=+g.getAttribute('val');$('#sv').dispatchEvent(new Event('input'))}
  let ok=0;for(const t of smp.querySelectorAll('SamplerSet > Track')){const i=+t.getAttribute('idx');if(!(i>=0&&i<16))continue;const u=t.getAttribute('url'),name=t.getAttribute('name')||'sample';
   try{const r=await fetch(rbFileUrl(u));if(!r.ok)continue;const blob=await r.blob(),ext=(u.match(/\.[a-z0-9]+$/i)||['.wav'])[0];
    const s=RB_SLOTS[i];s.name=name.slice(0,20);s.loop=t.getAttribute('loop')==='1';s.buf=await new OfflineAudioContext(2,1,44100).decodeAudioData(await blob.arrayBuffer());s.blob=new File([blob],name+ext);s.synth=false;rbSmpSave(i);ok++}catch(e){}}
  rbSmpUI();done.push(ok+' sampler sounds')}
 save();return done}
$('[data-s=range]').closest('.set').insertAdjacentHTML('beforebegin','<div class="set"><span>rekordbox on this computer: import tempo range, key lock, quantize, Beat FX, Release FX and sampler sounds</span><button id="rbImp">Import from rekordbox</button></div>');
$('#rbImp').onclick=async()=>{toast('Importing from rekordbox…');const d=await rbImportRekordbox();toast(d.length?'Imported: '+d.join(', '):'Nothing found to import')};

// ---------- rekordbox-style zoomed waveforms ----------
// Drawn on a real-time scale shared by all decks, so synced tracks show their beat lines exactly on top of each other.
// RGB colouring (bass red, mids green, highs blue), a line on every beat, red marks on every bar, a BAR.BEAT counter.
if(!S.zoomSec)S.zoomSec=10;
document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{const dir=+b.dataset.zoom.split(':')[1];S.zoomSec=Math.max(2,Math.min(40,dir>0?S.zoomSec*1.3:S.zoomSec/1.3));save()});
const RB_PC=['#3ddc84','#3ddc84','#b45cff','#b45cff','#3ddc84','#b45cff','#3ddc84','#ff9f1c'];
const RB_SW=8192,RB_SH=96;
function rbStrip(d){const st=d.stem,fb=d.fb,fp=d.fp,key=d.tk+'|'+fp.length+'|'+(fb?1:0)+(st.bass?1:0)+(st.vocal?1:0)+(st.inst?1:0);if(d._strip&&d._strip.key===key)return d._strip;
 const n=fp.length,H=RB_SH,mid=H/2,cv=[];
 for(let c0=0;c0<n;c0+=RB_SW){const cw=Math.min(RB_SW,n-c0),el=document.createElement('canvas');el.width=cw;el.height=H;const x2=el.getContext('2d'),im=x2.createImageData(cw,H),px=im.data;
  for(let x=0;x<cw;x++){const i=c0+x;let lo,mi,hi;if(fb){lo=fb[0][i]*(st.bass?.15:1);mi=fb[1][i]*(st.vocal?.25:1);hi=fb[2][i]*(st.inst?.25:1)}else{lo=mi=hi=fp[i]}
   const a=Math.max(lo,mi,hi),m=a||1,R=Math.min(255,60+195*Math.pow(lo/m,1.2))|0,G=Math.min(255,40+215*Math.pow(mi/m,1.6)*.85)|0,B=Math.min(255,70+185*Math.pow(hi/m,1.3))|0;
   const y0=Math.max(0,Math.floor(mid-a*mid*.92)),y1=Math.min(H,Math.max(y0+1,Math.ceil(mid+a*mid*.92)));
   for(let y=y0;y<y1;y++){const p=(y*cw+x)*4;px[p]=R;px[p+1]=G;px[p+2]=B;px[p+3]=255}}
  x2.putImageData(im,0,0);cv.push(el)}
 return d._strip={key,cv}}Deck.prototype.zdraw=function(t){const c=this.zc;if(!c)return;const w=c.clientWidth,h=c.clientHeight,r=devicePixelRatio||1;
 if(c.width!==Math.round(w*r)){c.width=Math.round(w*r);c.height=Math.round(h*r)}
 const g=c.getContext('2d');g.setTransform(r,0,0,r,0,0);g.fillStyle='#000';g.fillRect(0,0,w,h);if(!this.fp){g.fillStyle='#fff';g.fillRect(w/2-1,0,2,h);return}
 const rate=(this.a.playbackRate||1),pps=w/(S.zoomSec||10),X=tt=>w/2+(tt-t)/rate*pps,mid=h/2,fb=this.fb,fp=this.fp,st=this.stem,l=this.loop;
 if(l&&l.out!=null){g.fillStyle=l.on?'rgba(255,159,28,.28)':'rgba(255,159,28,.1)';g.fillRect(X(l.in),0,X(l.out)-X(l.in),h)}
 // the coloured waveform is rendered once per track into strips (one column per 10 ms) and only copied each frame
 const S2=rbStrip(this),i0=Math.max(0,Math.floor((t-w/2/pps*rate)*100)),i1=Math.min(fp.length,Math.ceil((t+w/2/pps*rate)*100)+1),sc=pps/rate/100;
 g.imageSmoothingEnabled=sc<1;
 for(let k=0;k<S2.cv.length;k++){const c0=k*RB_SW,c1=c0+S2.cv[k].width,a0=Math.max(i0,c0),a1=Math.min(i1,c1);if(a1<=a0)continue;
  g.drawImage(S2.cv[k],a0-c0,0,a1-a0,RB_SH,X(a0/100),0,(a1-a0)*sc,h)}
 g.imageSmoothingEnabled=true;
 if(this.bpm){const bl=60/this.bpm,k0=Math.floor((t-(S.zoomSec*rate)/2-this.first)/bl),k1=Math.ceil((t+(S.zoomSec*rate)/2-this.first)/bl);
  for(let k=k0;k<=k1;k++){const x=X(this.first+k*bl);if(x<-2||x>w+2)continue;const bar=((k%4)+4)%4===0;
   g.fillStyle=bar?'rgba(255,255,255,.75)':'rgba(255,255,255,.3)';g.fillRect(Math.round(x),0,1,h);
   if(bar){g.fillStyle='#ff2d2d';g.beginPath();g.moveTo(x-4,0);g.lineTo(x+4,0);g.lineTo(x,5);g.fill();g.beginPath();g.moveTo(x-4,h);g.lineTo(x+4,h);g.lineTo(x,h-5);g.fill()}}
  const bi=Math.floor((t-this.first)/bl+1e-6),bar=Math.floor(bi/4)+(bi>=0?1:0),beat=((bi%4)+4)%4+1;
  g.font='bold 12px "Segoe UI",sans-serif';g.fillStyle='#3ab4ff';g.textAlign='right';g.fillText((bi<0?'-':'')+Math.abs(bar)+'.'+beat+'Bars',w/2-6,13);g.textAlign='left'}
 this.cues.forEach((v,i)=>{if(v==null)return;const x=X(v);if(x<-20||x>w+20)return;g.fillStyle=RB_PC[i];g.fillRect(x-1,0,2,h);g.fillRect(x,0,12,12);g.fillStyle='#000';g.font='bold 10px sans-serif';g.fillText('ABCDEFGH'[i],x+2,10)});
 g.fillStyle='#ff3b3b';(this.mem||[]).forEach(v=>{const x=X(v);if(x<-10||x>w+10)return;g.beginPath();g.moveTo(x-6,h);g.lineTo(x+6,h);g.lineTo(x,h-9);g.fill()});
 g.fillStyle='#fff';g.fillRect(w/2-1,0,2,h)};

// ---------- song structure (approximate phrase analysis) on the overview: INTRO / UP / VERSE / CHORUS / BRIDGE / OUTRO ----------
const RB_PHC={INTRO:'#d9453a',UP:'#9b5cff',VERSE:'#4a5bff',CHORUS:'#35c24a',BRIDGE:'#e6c229',OUTRO:'#6aa8d8'};
function rbPhrases(d){if(!d.fb||!d.bpm||!d.dur)return null;const bl=60/d.bpm,len=32*bl,fb=d.fb,n=fb[0].length,E=[];
 for(let s=d.first;s<d.dur;s+=len){const a=Math.max(0,Math.floor(s*100)),b=Math.min(n,Math.floor((s+len)*100));let e=0,cnt=0;for(let i=a;i<b;i++){e+=fb[0][i]*1.3+fb[1][i];cnt++}if(cnt)E.push({s,e:Math.min(d.dur,s+len),v:e/cnt})}
 if(E.length<2)return null;const mx=Math.max(...E.map(x=>x.v))||1;E.forEach(x=>x.v/=mx);
 E.forEach((x,i)=>{x.label=x.v>=.78?'CHORUS':x.v>=.5?'VERSE':i<2?'INTRO':i>=E.length-2?'OUTRO':'BRIDGE'});
 for(let i=0;i<E.length;i++){if(E[i].label!=='CHORUS'&&E[i+1]&&E[i+1].label==='CHORUS'&&i>0&&E[i].v>E[i-1].v)E[i].label='UP';if(i===0&&E[i].label!=='CHORUS')E[i].label='INTRO'}
 if(E[0].s>0.5)E.unshift({s:0,e:E[0].s,label:'INTRO'});
 const out=[];E.forEach(x=>{const p=out[out.length-1];if(p&&p.label===x.label)p.e=x.e;else out.push({s:x.s,e:x.e,label:x.label})});return out}
const rbDraw0=Deck.prototype.draw;Deck.prototype.draw=function(t,dur){rbDraw0.call(this,t,dur);const c=this.cv;if(!dur)return;
 if(this._phrTk!==this.tk+'|'+this.bpm+'|'+this.first){this._phrTk=this.tk+'|'+this.bpm+'|'+this.first;this.phr=rbPhrases(this)}
 if(!this.phr)return;const w=c.clientWidth,h=c.clientHeight,g=c.getContext('2d'),bh=Math.min(11,Math.max(7,h*.3));
 g.font='bold 8.5px "Segoe UI",sans-serif';for(const p of this.phr){const x0=p.s/dur*w,x1=p.e/dur*w;g.fillStyle=RB_PHC[p.label];g.fillRect(x0,h-bh,Math.max(1,x1-x0-1),bh);
  if(x1-x0>34){g.fillStyle='#fff';g.fillText(p.label,x0+3,h-2)}}
 g.fillStyle='#fff';g.fillRect(t/dur*w-1,0,2,h)};

// ---------- every DDJ-FLX4 control from Pioneer's official mapping ----------
// PAD FX2 mode on screen (same pads, second bank)
D.forEach(d=>{const sel=d.q('mode');if(![...sel.options].some(o=>o.value==='padfx2'))sel.querySelector('option[value=padfx]').insertAdjacentHTML('afterend','<option value="padfx2">PAD FX2</option>');
 if(![...sel.options].some(o=>o.value==='keyboard'))sel.insertAdjacentHTML('beforeend','<option value="keyboard">KEYBOARD</option>');
 sel.addEventListener('change',()=>{const v=sel.value;if(v==='padfx2'||v==='padfx'){d.pfxBank=v==='padfx2'?1:0;d.el.querySelectorAll('[data-p=padfx]').forEach(x=>x.hidden=false)}
  rbPadFxUI()})});
// KEYBOARD mode: pads play from hot cue A (or the cue point) at 8 pitches; the key pads show the semitones
const KB_SEMI=[0,2,4,5,7,9,11,12];
function rbKeyboard(d,n){if(!d||!d.a.src)return;boot();const t=d.cues.find(x=>x!=null);d.a.currentTime=t!=null?t:d.cp;rbSetKs(d,KB_SEMI[n]);d.a.play().catch(()=>{})}
// SMART CFX: one button gives both channel knobs a richer colour effect; SELECT cycles the effect
const SCFX=['space','dub','sweep','crush','pitch','noise','flanger','phaser'];let rbSmartCfx=false;
function rbSmartCfxSet(on){rbSmartCfx=on;D.forEach(d=>{const s=d.c('cfx');if(!s)return;s.value=on?(S.scfx||'space'):'filter';s.dispatchEvent(new Event('input',{bubbles:true}))});toast('SMART CFX '+(on?'ON — '+(S.scfx||'space').toUpperCase():'OFF'))}
// SMART FADER: moving the crossfader syncs the incoming track and swaps the bass
let rbSmartFader=false;
const rbXf0=xfade;xfade=function(){rbXf0();if(!rbSmartFader||D.length<2)return;const x=+$('#xf').value/100,A=D[0],B=D[1];
 const lo=(d,v)=>{const el=d.c('lo');if(!el)return;el.value=Math.round(v);d.mix()};lo(A,x>0?-100*x:0);lo(B,x<0?100*x:0);
 if(Math.abs(x)<.95){const inc=x>0?B:A,out=x>0?A:B;if(inc.a.src&&out.a.src&&!inc.a.paused&&!out.a.paused&&!inc.syncOn&&inc.bpm&&out.bpm){inc.sync()}}};
// jog top touch = scratch: the track stops while the platter is held, the jog moves it, it continues on release
function rbJogTouch(d,on){if(!d||!d.a.src)return;if(on){d._scr=!d.a.paused;if(d._scr)d.a.pause()}else{if(d._scr)d.a.play().catch(()=>{});d._scr=false}}
[0,1,2,3].forEach(i=>{const di=()=>deckIdx(i),d=()=>D[di()],L='Deck '+'ABCD'[i]+(i<2?'/'+'ABCD'[i+2]:'')+' ';
 add('pmpadfx2'+i,L+'Pad mode button: PAD FX2',{press:()=>setPadMode(di(),'padfx2'),led:()=>!!d()&&d().q('mode').value==='padfx2'});
 add('pmkeyb'+i,L+'Pad mode button: KEYBOARD',{press:()=>setPadMode(di(),'keyboard'),led:()=>!!d()&&d().q('mode').value==='keyboard'});
 add('jogtouch'+i,L+'Jog wheel touch (scratch)',{press:()=>rbJogTouch(d(),true),release:()=>rbJogTouch(d(),false)});
 add('fsplay'+i,L+'Fader start: play',{press:()=>{const x=d();if(x&&x.a.src&&x.a.paused)x.toggle()}});
 add('fscue'+i,L+'Fader start: back to cue',{press:()=>{const x=d();if(x&&x.a.src){x.a.pause();x.a.currentTime=x.cp}}});
 add('pitchs'+i,L+'Tempo slider with SHIFT',{cc:v=>{const a=MIDI_ACTIONS.find(y=>y.id==='pitch'+i);if(a)a.cc(v)}});
 for(let n=0;n<8;n++){
  const pad=(bank,hi)=>({press:()=>{const x=d();if(!x)return;setPadMode(di(),bank?'padfx2':'padfx');x.pfxBank=bank;x.pfxHi=hi;rbPadFx(x,(bank*2+hi)*8+n,true)},
   release:()=>{const x=d();if(x&&x._padFx!=null&&x._padFx%8===n)rbPadFx(x,x._padFx,false)},led:()=>{const x=d();return!!x&&x._padFx===(bank*2+hi)*8+n}});
  const a=MIDI_ACTIONS.find(y=>y.id==='pfx'+i+'_'+n);if(a)Object.assign(a,pad(0,0));
  add('pfxs'+i+'_'+n,L+'PAD FX1 slot '+(n+9)+' (SHIFT + pad)',pad(0,1));
  add('pfx2'+i+'_'+n,L+'PAD FX2 slot '+(n+1),pad(1,0));
  add('pfx2s'+i+'_'+n,L+'PAD FX2 slot '+(n+9)+' (SHIFT + pad)',pad(1,1));
  add('kb'+i+'_'+n,L+'KEYBOARD pad '+(n+1),{press:()=>{setPadMode(di(),'keyboard');rbKeyboard(d(),n)},led:()=>{const x=d();return!!x&&x.q('mode').value==='keyboard'&&x.keyShift===KB_SEMI[n]}})}});
add('scfx','SMART CFX on/off',{press:()=>rbSmartCfxSet(!rbSmartCfx),led:()=>rbSmartCfx});
add('scfxsel','SMART CFX select',{press:()=>{S.scfx=SCFX[(SCFX.indexOf(S.scfx||'space')+1)%SCFX.length];save();if(rbSmartCfx)rbSmartCfxSet(true);else toast('SMART CFX: '+S.scfx.toUpperCase())}});
add('sfader','SMART FADER on/off',{press:()=>{rbSmartFader=!rbSmartFader;if(!rbSmartFader)D.slice(0,2).forEach(d=>{const el=d.c('lo');if(el){el.value=0;d.mix()}});toast('SMART FADER '+(rbSmartFader?'ON':'OFF'))},led:()=>rbSmartFader});
add('bpress','Browse knob press (load onto the free deck)',{press:()=>{const e=LIB[sel];if(!e){toast('Select a track first');return}const free=D.findIndex(d=>!d.a.src||d.a.paused);loadTo(free<0?0:free,e)}});
add('bback','Browse knob press with SHIFT (next library view)',{press:()=>{const b=[...document.querySelectorAll('#lib aside [data-f]')],k=b.findIndex(x=>x.classList.contains('on'));const nx=b[(k+1)%b.length];if(nx)nx.click()}});
add('bzoom','Browse knob with SHIFT (waveform zoom)',{rel:x=>{S.zoomSec=Math.max(2,Math.min(40,S.zoomSec*(x>0?1.15:1/1.15)));save()}});
add('related','Related tracks (SHIFT + LOAD 1)',{press:()=>{const d=D.find(x=>!x.a.paused&&x.tk)||D.find(x=>x.tk);if(!d){toast('Load a track first');return}const k=rbEffKey(d),bpm=d.bpm*d.rate;
 libQ='';$('#q').value='';RB.ipl=RB.ipl.filter(p=>p.name!=='Related');RB.ipl.push({name:'Related',bmin:(bpm*.94).toFixed(1),bmax:(bpm*1.06).toFixed(1),key:k?rbCam(k)+(k.m?'A':'B'):'',compat:true});rbPut('dijvirta-ipl',RB.ipl);rbRenderIpl();
 const b=document.querySelector('#iplBox [data-f="ipl:'+(RB.ipl.length-1)+'"]');if(b)b.click();toast('Related tracks: '+bpm.toFixed(0)+' BPM'+(k?' · '+rbKeyTxt(k):''))}});
add('libview','Enlarge / restore the library (SHIFT + LOAD 2)',{press:()=>document.documentElement.classList.toggle('libbig')});
add('bfxauto','Beat FX auto beat (SHIFT + BEAT ◀)',{press:()=>{BFX.beat=5;rbSaveBfx();rbBfxUI();toast('Beat FX: 1 beat')}});
add('bfxtap','Beat FX tap (SHIFT + BEAT ▶)',{press:()=>{const d=D[lastDeck];if(d){d.tap();toast('TAP '+(d.bpm?d.bpm.toFixed(1):''))}}});
function rbFlx4All(m){const n=(ch,num)=>({kind:'note',ch,num}),c=(ch,num)=>({kind:'cc',ch,num});
 [0,1].forEach(i=>{const p=i?9:7,ps=i?10:8;m['pmpadfx2'+i]=n(i,0x6B);m['pmkeyb'+i]=n(i,0x69);m['jogtouch'+i]=n(i,0x36);m['fsplay'+i]=n(i,0x66);m['fscue'+i]=n(i,0x52);m['pitchs'+i]=c(i,0x05);
  for(let k=0;k<8;k++){m['pfxs'+i+'_'+k]=n(ps,0x10+k);m['pfx2'+i+'_'+k]=n(p,0x50+k);m['pfx2s'+i+'_'+k]=n(ps,0x50+k);m['kb'+i+'_'+k]=n(p,0x40+k)}});
 m.scfx=n(6,0x00);m.scfxsel=n(6,0x08);m.sfader=n(6,0x01);m.bpress=n(6,0x41);m.bback=n(6,0x42);m.bzoom=c(6,0x64);m.related=n(6,0x68);m.libview=n(6,0x7A);m.bfxauto=n(4,0x66);m.bfxtap=n(4,0x6B);return m}
rbFlx4All(FLX4_MAP);
if(S.midi&&S.midi.play0&&S.midi.play0.num===0x0B&&S.midi.cue0&&S.midi.cue0.num===0x0C&&!S.flx4All){rbFlx4All(S.midi);S.flx4All=1;save()}
document.head.insertAdjacentHTML('beforeend','<style>.pfxbar{display:flex;align-items:center;gap:6px;margin-bottom:2px}.pfxbar small{font-size:9.5px;letter-spacing:.08em;color:var(--mu)}.pfxbar button{padding:0 6px!important;font-size:9.5px!important}.libbig .rig,.libbig .wfs,.libbig #fx,.libbig #bfx{display:none!important}</style>');

$('#xf').oninput=()=>xfade();

// ---------- rekordbox behaviour ----------
// HOT CUE on a stopped deck: plays from the hot cue while held, back to the hot cue on release (on a playing deck it jumps and keeps playing)
const rbHot0=Deck.prototype.hot;
Deck.prototype.hot=function(i,clear){if(clear||!this.a.src||this.cues[i]==null||!this.a.paused){this._hotHold=null;return rbHot0.call(this,i,clear)}
 lastDeck=this.i;boot();this.a.currentTime=this.cues[i];this._hotHold=i;this.a.play().catch(()=>{});this.ui()};
function rbHotRelease(d,i){if(d&&d._hotHold===i){d._hotHold=null;d.a.pause();d.a.currentTime=d.cues[i];d.ui()}}
MIDI_ACTIONS.filter(a=>/^hot[0-3]_\d$/.test(a.id)).forEach(a=>{const i=+a.id[3],n=+a.id[5];a.release=()=>rbHotRelease(D[deckIdx(i)],n)});
MIDI_ACTIONS.filter(a=>/^pad[0-3]_\d$/.test(a.id)).forEach(a=>{const i=+a.id[3],n=+a.id[5],r0=a.release;a.release=()=>{const d=D[deckIdx(i)];if(d&&d.q('mode').value==='hot')rbHotRelease(d,n);else if(r0)r0()}});
D.forEach(d=>d.el.querySelectorAll('[data-h]').forEach(b=>{const n=+b.dataset.h;b.onclick=null;b.onpointerdown=e=>{if(e.button===0)d.hot(n,e.shiftKey)};['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>rbHotRelease(d,n)))}));
// AUTO CUE: a freshly loaded track (no saved cue) gets its CUE on the first beat, like rekordbox
const rbRestore1=rbRestore;rbRestore=function(d){rbRestore1(d);const c=RB.cues[d.tk];if(!(c&&c.cp)){setTimeout(()=>{if(!d.cp&&d.a.paused&&d.a.currentTime<.05){const t=Math.max(0,d.first||0);d.cp=t;d.a.currentTime=t;d.ui()}},200)}};
// LOAD LOCK: loading onto a playing deck needs a second press within 2 s
if(S.loadLock==null)S.loadLock=true;
const rbLoadTo1=loadTo;loadTo=function(i,e){const d=D[i];if(S.loadLock&&d&&d.a.src&&!d.a.paused&&!(AM&&AM.on)){if(d._lockT&&Date.now()-d._lockT<2000){d._lockT=0;return rbLoadTo1(i,e)}d._lockT=Date.now();toast('Deck '+'ABCD'[i]+' is playing — press LOAD again to replace the track');return}return rbLoadTo1(i,e)};
$('[data-s=range]').closest('.set').insertAdjacentHTML('afterend','<div class="set"><span>Load lock (a playing deck needs a second LOAD press)</span><input type="checkbox" id="loadLock"></div>');
$('#loadLock').checked=S.loadLock;$('#loadLock').onchange=e=>{S.loadLock=e.target.checked;save()};

// ---------- phase meter (like rekordbox): beat-in-bar boxes for every deck and the offset to the MASTER in milliseconds ----------
const rbZd0=Deck.prototype.zdraw;
Deck.prototype.zdraw=function(t){rbZd0.call(this,t);const c=this.zc;if(!c||!this.bpm||!this.fp)return;const g=c.getContext('2d'),h=c.clientHeight;
 const bi=Math.floor((t-this.first)/(60/this.bpm)+1e-6),b=((bi%4)+4)%4;
 for(let k=0;k<4;k++){g.fillStyle=k===b?(k===0?'#ff3b3b':'#fff'):'rgba(255,255,255,.18)';g.fillRect(8+k*13,h-10,11,6)}
 g.font='bold 10px "Segoe UI",sans-serif';g.textAlign='left';
 if(this.master){g.fillStyle='#ffb020';g.fillText('MASTER',62,h-4);return}
 const m=D.find(x=>x.master&&x!==this&&x.bpm&&x.a.src);if(!m||!this.a.src||m.a.paused||this.a.paused)return;
 const mul=this.syncMul||1,x=rbBarErr(m,this,mul),ms=x*60/(this.bpm*this.rate)*1000,a=Math.abs(ms);
 g.fillStyle=a<12?'#3ddc84':a<35?'#ffd23f':'#ff4d4d';
 const bar=Math.round(Math.abs(x))>=1?' ('+(x>0?'+':'−')+Math.round(Math.abs(x))+' beat)':'';
 g.fillText((ms>0?'behind ':'ahead ')+Math.round(a)+' ms'+bar,62,h-4)};
$('[data-s=range]').closest('.set').insertAdjacentHTML('afterend','<div class="set"><span>SYNC lines up bars too (the "1" of both tracks lands together)</span><input type="checkbox" id="syncBar"></div>');
$('#syncBar').checked=S.syncBar!==false;$('#syncBar').onchange=e=>{S.syncBar=e.target.checked;save()};

// ---------- pad modes in rekordbox order, plus SEQ. CALL, ACTIVE CENSOR and MEMORY CUE ----------
const RB_MODES=[['hot','HOT CUE'],['padfx','PAD FX'],['slicer','SLICER'],['jump','BEAT JUMP'],['loop','BEAT LOOP'],['keyboard','KEYBOARD'],['key','KEY SHIFT'],['seq','SEQ. CALL'],['censor','ACT. CENSR'],['memory','MEMORY CUE'],['padfx2','PAD FX2'],['sampler','SAMPLER']];
// SEQ. CALL: drum patterns (kick k, snare s, hat h, clap c; 16 steps) played in time with the MASTER deck
const SEQ=[['HOUSE',{k:'x...x...x...x...',h:'..x...x...x...x.',c:'....x.......x...'}],['TECHNO',{k:'x...x...x...x...',h:'x.x.x.x.x.x.x.x.',c:'....x.......x...'}],
 ['HIP-HOP',{k:'x.....x...x.....',s:'....x.......x...',h:'x.x.x.x.x.x.x.x.'}],['TRAP',{k:'x......x..x.....',s:'........x.......',h:'xxxxxxxxxxxxxxxx'}],
 ['AFRO',{k:'x...x...x...x...',c:'...x..x...x..x..',h:'..x...x...x...x.'}],['REGGAETON',{k:'x...x...x...x...',s:'...x..x....x..x.'}],
 ['CLAP ROLL',{c:'............xxxx',k:'x...x...x...x...'}],['HATS',{h:'xxxxxxxxxxxxxxxx'}]];
let rbSeq=null;  // {n, step, next}
function rbDrum(type,when){const out=rbSmpG||master,g=ctx.createGain();g.connect(out);
 const noise=(dur,f,ty,vol)=>{const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*dur),ctx.sampleRate),x=b.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=(Math.random()*2-1)*Math.pow(1-i/x.length,2);
  const s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),gg=ctx.createGain();fl.type=ty;fl.frequency.value=f;gg.gain.value=vol;s.buffer=b;s.connect(fl);fl.connect(gg);gg.connect(g);s.start(when)};
 if(type==='k'){const o=ctx.createOscillator(),e=ctx.createGain();o.frequency.setValueAtTime(150,when);o.frequency.exponentialRampToValueAtTime(42,when+.25);e.gain.setValueAtTime(.9,when);e.gain.exponentialRampToValueAtTime(.001,when+.35);o.connect(e);e.connect(g);o.start(when);o.stop(when+.4)}
 if(type==='s'){noise(.18,1800,'bandpass',.7);const o=ctx.createOscillator(),e=ctx.createGain();o.type='triangle';o.frequency.value=190;e.gain.setValueAtTime(.4,when);e.gain.exponentialRampToValueAtTime(.001,when+.12);o.connect(e);e.connect(g);o.start(when);o.stop(when+.15)}
 if(type==='h')noise(.05,8000,'highpass',.35);
 if(type==='c')noise(.12,1300,'bandpass',.8)}
function rbSeqToggle(n){boot();if(rbSeq&&rbSeq.n===n){rbSeq=null;toast('SEQ. CALL off');rbSeqUI();return}
 const m=D.find(d=>d.master&&!d.a.paused&&d.bpm)||D.find(d=>!d.a.paused&&d.bpm);rbSeq={n,step:-1,next:0,m};toast('SEQ. CALL: '+SEQ[n][0]+(m?' — in time with deck '+'ABCD'[m.i]:' — 120 BPM'));rbSeqUI()}
setInterval(()=>{if(!rbSeq||!ctx)return;const m=rbSeq.m&&!rbSeq.m.a.paused?rbSeq.m:null,bpm=m?m.bpm*m.rate:120,st=60/bpm/4,now=ctx.currentTime;
 if(rbSeq.step<0){if(m){const p=rbPhase(m)*4,f=p-Math.floor(p);rbSeq.step=((Math.floor(p)+1)%16+16)%16;rbSeq.next=now+(1-f)*st}else{rbSeq.step=0;rbSeq.next=now+.05}}
 while(rbSeq.next<now+.12){const pat=SEQ[rbSeq.n][1];for(const k in pat)if(pat[k][rbSeq.step]==='x')rbDrum(k,rbSeq.next);rbSeq.step=(rbSeq.step+1)%16;rbSeq.next+=st}},25);
// ACTIVE CENSOR: hold to censor, the track keeps running underneath (slip); pads 5-8 censor for a fixed number of beats
const CENS=[['MUTE'],['ECHO'],['BRAKE'],['LOW CUT'],['MUTE',.5],['MUTE',1],['MUTE',2],['MUTE',4]];
function rbCensor(d,n,on){if(!d||!d.a.src||!d.n)return;boot();const[type,beats]=CENS[n],n_=d.n,t=ctx.currentTime;
 const set=v=>{if(type==='MUTE')n_.dry.gain.setTargetAtTime(v?0:1,t,.005);if(type==='LOW CUT'){n_.f.type='highpass';n_.f.frequency.setTargetAtTime(v?1200:20,t,.01);if(!v)setTimeout(()=>d.mix(),60)}
  if(type==='ECHO'){if(v){rbFxApply(d,'cens',{fx:'Echo',beat:4,lvl:.9},true);n_.dry.gain.setTargetAtTime(0,t+.02,.01)}else{rbFxApply(d,'cens',{fx:'Echo',beat:4,lvl:.9},false);n_.dry.gain.setTargetAtTime(1,t,.005)}}
  if(type==='BRAKE'){if(v){d._cs0=d.slip;d.slip=1;d.slipStart();d.brake(true)}else{d.brake(false);d.slipEnd();d.slip=d._cs0}}};
 if(beats){if(on){set(1);clearTimeout(d._censT);d._censT=setTimeout(()=>set(0),beats*60/(d.bpm*d.rate||120)*1000)}return}set(on?1:0)}
// MEMORY CUE: pad n = memory cue n (empty pad stores the current position, SHIFT + pad deletes)
function rbMemPad(d,n,shift){if(!d||!d.a.src)return;d.mem.sort((a,b)=>a-b);if(shift){if(d.mem[n]!=null){d.mem.splice(n,1);toast('Memory cue deleted')}return}
 if(d.mem[n]==null){const t=d.snap(d.a.currentTime);if(!d.mem.some(x=>Math.abs(x-t)<.1))d.mem.push(t);d.mem.sort((a,b)=>a-b);toast('Memory cue saved')}else d.a.currentTime=d.mem[n]}
function rbSeqUI(){D.forEach(d=>{d.el.querySelectorAll('[data-sq]').forEach(b=>b.classList.toggle('on',!!rbSeq&&rbSeq.n===+b.dataset.sq));
 d.mem.sort((a,b)=>a-b);d.el.querySelectorAll('[data-mc]').forEach(b=>{const v=d.mem[+b.dataset.mc];b.lastChild.textContent=v!=null?fmt2(v):'--:--';b.classList.toggle('on',v!=null)})})}
setInterval(rbSeqUI,500);
D.forEach(d=>{const sel=d.q('mode'),cur=sel.value,pnl=d.el.querySelector('.pnl');
 sel.innerHTML=RB_MODES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');sel.value=cur||'hot';
 const pads=(attr,lab)=>`<div class="pads" data-p="${attr}" hidden>${lab.map((x,n)=>`<button data-${attr==='seq'?'sq':attr==='censor'?'cs':attr==='memory'?'mc':'kbp'}="${n}" style="--pc:${attr==='seq'?'#9b5cff':attr==='censor'?'#ff4d4d':attr==='memory'?'#ff3b3b':'#35d6e6'}"><b>${x[0]}</b><span>${x[1]}</span></button>`).join('')}</div>`;
 pnl.insertAdjacentHTML('beforeend',pads('seq',SEQ.map(s=>[s[0],'pattern']))+pads('censor',CENS.map(c=>[c[0],c[1]?c[1]+' beat':'hold']))+pads('memory',[0,1,2,3,4,5,6,7].map(n=>['MEM '+(n+1),'--:--']))+pads('keyboard',KB_SEMI.map(s=>['+'+s,'semitone'])));
 d.el.querySelectorAll('[data-sq]').forEach(b=>b.onpointerdown=e=>{if(e.button===0)rbSeqToggle(+b.dataset.sq)});
 d.el.querySelectorAll('[data-cs]').forEach(b=>{const n=+b.dataset.cs;b.onpointerdown=e=>{if(e.button)return;b.classList.add('on');rbCensor(d,n,true)};b.onpointerup=b.onpointerleave=b.onpointercancel=()=>{if(!b.classList.contains('on'))return;b.classList.remove('on');if(!CENS[n][1])rbCensor(d,n,false)}});
 d.el.querySelectorAll('[data-mc]').forEach(b=>{b.onpointerdown=e=>{if(e.button===0)rbMemPad(d,+b.dataset.mc,e.shiftKey||!!midiShift)};b.oncontextmenu=e=>{e.preventDefault();rbMemPad(d,+b.dataset.mc,true)}});
 d.el.querySelectorAll('[data-kbp]').forEach(b=>b.onpointerdown=e=>{if(e.button===0)rbKeyboard(d,+b.dataset.kbp)});
 sel.dispatchEvent(new Event('change'))});
const rbPadEl1=padEl;padEl=function(i,mode,n){const d=D[i];const a={seq:'sq',censor:'cs',memory:'mc',keyboard:'kbp'}[mode];if(a)return d.el.querySelector(`[data-${a}="${n}"]`);return rbPadEl1(i,mode,n)};
rbSeqUI();

// each effect slot owns a gain in the dry path (Trans / insert effects work on it), so Beat FX and Pad FX never overwrite each other
rbSlot=(f=>function(d,key){const n=d.n,had=n.fxs&&n.fxs[key],s=f(d,key);if(!had&&!s.Gate){const g=ctx.createGain();if(!n.dryTail)n.dryTail=n.dry;try{n.dryTail.disconnect(n.cg)}catch(e){}n.dryTail.connect(g);g.connect(n.cg);n.dryTail=g;s.Gate=g}return s})(rbSlot);
rbFxClear=(f=>function(d,key){const s=d.n&&d.n.fxs&&d.n.fxs[key],dv=d.n?d.n.dry.gain.value:1;f(d,key);if(s&&s.Gate)s.Gate.gain.value=1;if(d.n)d.n.dry.gain.value=dv})(rbFxClear);
// ---------- rekordbox effect library: BEAT FX, SOUND COLOR FX, SCENE FX and RELEASE FX for the Beat FX unit and the Pad FX ----------
const RB_G0=['Delay','Echo','Spiral','Reverb','Trans','Filter LFO','Flanger','Phaser','Robot','Slip Roll','Roll','Rev Roll','MT Delay','Up Echo','Down Echo','Rev Delay','Pan','Slip Loop'];
const RB_G1=['Crush','Space','Dub Echo','CFX Pitch','HPF','LPF','Sweep','Noise','Gate Comp'];
const RB_G2=['BPF Echo','Noise Rise','Spiral Up','Reverb Up','HPF Echo','LPF Echo','Crush Echo','Spiral Down','Reverb Down'];
const RB_G3=['Rel V.Brake','Rel Echo','Rel Backspin'];
const FX_CATS=[['BEAT FX',RB_G0.concat(['Ping Pong','Helix','Pitch','Vinyl Brake'])],['SOUND COLOR FX',RB_G1],['SCENE FX',RB_G2],['RELEASE FX',RB_G3],['OTHER',['Half Speed','Double Speed']]];
// w: wet send (t: echo / reverb tail), ins: replaces the dry sound while on, ramp: changes over 8 beats while held
const FX_DEF={Delay:{w:1,t:1},Echo:{w:1,t:1},'Ping Pong':{w:1,t:1},Spiral:{w:1,t:1},Reverb:{w:1,t:1},Helix:{w:1,t:1,roll:2},Flanger:{w:1},Phaser:{w:1},Robot:{w:1},
 'MT Delay':{w:1,t:1},'Up Echo':{w:1,t:1},'Down Echo':{w:1,t:1},'Rev Delay':{w:1,t:1},Space:{w:1,t:1},'Dub Echo':{w:1,t:1},'BPF Echo':{w:1,t:1},'Spiral Up':{w:1,t:1},'Spiral Down':{w:1,t:1},
 Noise:{w:1,noIn:1},'Noise Rise':{w:1,noIn:1},Filter:{ins:1},'Filter LFO':{ins:1},Pan:{ins:1},Crush:{ins:1},HPF:{ins:1},LPF:{ins:1},Sweep:{ins:1},'Gate Comp':{ins:1},
 'HPF Echo':{ins:1,t:1},'LPF Echo':{ins:1,t:1},'Crush Echo':{ins:1,t:1},'Reverb Up':{ins:1,t:1},'Reverb Down':{ins:1,t:1},
 Trans:{trans:1},Pitch:{pitch:1},'CFX Pitch':{pitch:2},Roll:{roll:1},'Slip Roll':{roll:2},'Rev Roll':{roll:2},'Slip Loop':{roll:2},'Vinyl Brake':{brake:1},'Half Speed':{speed:-.5},'Double Speed':{speed:1},
 'Rel V.Brake':{rel:'brake'},'Rel Echo':{rel:'echo'},'Rel Backspin':{rel:'backspin'}};
const FX_NOBEAT=['Reverb','Space','Crush','HPF','LPF','Noise','CFX Pitch','Pitch','Vinyl Brake','Half Speed','Double Speed','Robot','Rel V.Brake'];
const FX_LABEL=n=>({'Filter LFO':'FILTER LFO','CFX Pitch':'PITCH','Noise':'NOISE (CFX)','Noise Rise':'NOISE (RMX)','Rel V.Brake':'V.BRAKE','Rel Echo':'ECHO','Rel Backspin':'BACKSPIN','Vinyl Brake':'VINYL BRAKE'}[n]||n.toUpperCase());
const rbCurve=bits=>{const L=2048,c=new Float32Array(L),q=Math.pow(2,bits-1);for(let i=0;i<L;i++)c[i]=Math.round((i/(L-1)*2-1)*q)/q;return c};
let rbNoiseBuf=null;
rbFxBuild=function(d,key,spec){rbFxClear(d,key);const s=rbSlot(d,key),In=s.In,Out=s.Out,n=d.n,Nn=[],T=[],E=[],L=spec.lvl,beat=()=>BFX_BEATS[spec.beat]*rbBl(d),bar8=()=>8*rbBl(d);
 const G=v=>{const g=ctx.createGain();g.gain.value=v;Nn.push(g);return g},F=(t,f,q)=>{const x=ctx.createBiquadFilter();x.type=t;x.frequency.value=f;if(q)x.Q.value=q;Nn.push(x);return x};
 const echo=(src,fbv,filt,mult)=>{const dl=ctx.createDelay(8),fb=G(fbv);Nn.push(dl);const tm=()=>Math.min(7.9,beat()*(mult||1));dl.delayTime.value=tm();T.push(()=>dl.delayTime.setTargetAtTime(tm(),ctx.currentTime,.05));
  src.connect(dl);let f=null;if(filt){f=F(filt[0],filt[1],filt[2]);dl.connect(f);f.connect(fb)}else dl.connect(fb);fb.connect(dl);dl.connect(Out);return f};
 const lfo=(depth,target,div,type)=>{const o=ctx.createOscillator(),g=G(depth);o.type=type||'sine';Nn.push(o);o.frequency.value=1/(beat()*(div||1));T.push(()=>o.frequency.setTargetAtTime(1/(beat()*(div||1)),ctx.currentTime,.05));o.connect(g);g.connect(target);o.start();return g};
 const ramp=(param,a,b)=>E.push(()=>{const t=ctx.currentTime;param.cancelScheduledValues(t);param.setValueAtTime(a,t);param.exponentialRampToValueAtTime(b,t+bar8())});
 const conv=()=>{const c=ctx.createConvolver();c.buffer=rbIRbuf||(rbIRbuf=rbIR(3.5,2.5));Nn.push(c);return c};
 const noise=()=>{if(!rbNoiseBuf){rbNoiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const x=rbNoiseBuf.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=Math.random()*2-1}
  const b=ctx.createBufferSource();b.buffer=rbNoiseBuf;b.loop=true;b.start();Nn.push(b);return b};
 const shaper=()=>{const w=ctx.createWaveShaper();w.curve=rbCurve(Math.max(2,Math.round(11-L*9)));Nn.push(w);return w};
 switch(spec.fx){
  case 'Delay':echo(In,.3);break;
  case 'Echo':case 'Rel Echo':echo(In,.62,['lowpass',3500]);break;
  case 'Spiral':echo(In,.78,['highpass',500]);break;
  case 'Helix':echo(In,.85,['lowpass',6000]);break;
  case 'Rev Delay':echo(In,.55,['lowpass',2200]);{const c=conv(),g=G(.4);In.connect(c);c.connect(g);g.connect(Out)}break;
  case 'MT Delay':echo(In,.3,null,1);echo(In,.3,null,.75);echo(In,.25,null,1.5);break;
  case 'Up Echo':{const f=echo(In,.62,['highpass',200]);ramp(f.frequency,200,6000)}break;
  case 'Down Echo':{const f=echo(In,.62,['lowpass',12000]);ramp(f.frequency,12000,300)}break;
  case 'BPF Echo':{const f=echo(In,.6,['bandpass',400,2]);ramp(f.frequency,400,3500)}break;
  case 'Spiral Up':{const f=echo(In,.8,['highpass',300]);ramp(f.frequency,300,6000)}break;
  case 'Spiral Down':{const f=echo(In,.8,['lowpass',12000]);ramp(f.frequency,12000,400)}break;
  case 'Dub Echo':echo(In,.65,['bandpass',1200,1.2]);break;
  case 'Ping Pong':{const l=ctx.createDelay(8),r=ctx.createDelay(8),pl=ctx.createStereoPanner(),pr=ctx.createStereoPanner(),fb=G(.55);Nn.push(l,r,pl,pr);pl.pan.value=-1;pr.pan.value=1;
   const upd=()=>{const x=Math.min(7.9,beat());l.delayTime.setTargetAtTime(x,ctx.currentTime,.05);r.delayTime.setTargetAtTime(x,ctx.currentTime,.05)};l.delayTime.value=r.delayTime.value=Math.min(7.9,beat());T.push(upd);
   In.connect(l);l.connect(pl);pl.connect(Out);l.connect(r);r.connect(pr);pr.connect(Out);r.connect(fb);fb.connect(l)}break;
  case 'Reverb':{const c=conv();In.connect(c);c.connect(Out)}break;
  case 'Space':{const f=F('highpass',300),c=conv();In.connect(f);f.connect(c);c.connect(Out)}break;
  case 'Robot':{const dl=ctx.createDelay(.05),fb=G(.82);Nn.push(dl);dl.delayTime.value=.0065;In.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(Out)}break;
  case 'Flanger':{const dl=ctx.createDelay(.05),fb=G(.7);Nn.push(dl);dl.delayTime.value=.005;In.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(Out);lfo(.004,dl.delayTime,4)}break;
  case 'Phaser':{let p=In;for(let i=0;i<6;i++){const a=F('allpass',600+i*400);lfo(500,a.frequency,4);p.connect(a);p=a}p.connect(Out)}break;
  case 'Noise':{const f=F('highpass',2500);noise().connect(f);f.connect(Out)}break;
  case 'Noise Rise':{const f=F('highpass',400),g=G(.05);noise().connect(f);f.connect(g);g.connect(Out);ramp(f.frequency,400,9000);ramp(g.gain,.05,1)}break;
  case 'Filter':case 'Filter LFO':{const f=F('bandpass',1800,3);In.connect(f);f.connect(Out);s.depth=lfo(1500,f.frequency)}break;
  case 'Pan':{const p=ctx.createStereoPanner();Nn.push(p);In.connect(p);p.connect(Out);lfo(Math.max(.2,L),p.pan,2)}break;
  case 'Crush':In.connect(shaper()).connect(Out);break;
  case 'HPF':{const f=F('highpass',20*Math.pow(400,Math.max(.1,L)),3);In.connect(f);f.connect(Out)}break;
  case 'LPF':{const f=F('lowpass',22000*Math.pow(.02,Math.max(.1,L)),3);In.connect(f);f.connect(Out)}break;
  case 'Sweep':{const f=F('bandpass',1500,2),g=G(.5);In.connect(f);f.connect(g);g.connect(Out);s.depth=lfo(1200,f.frequency,2);lfo(.5,g.gain,1/4,'square')}break;
  case 'Gate Comp':{const c=ctx.createDynamicsCompressor(),g=G(.5),mk=G(1.8);Nn.push(c);c.threshold.value=-35;c.ratio.value=12;c.attack.value=.003;c.release.value=.08;In.connect(c);c.connect(g);g.connect(mk);mk.connect(Out);lfo(.5,g.gain,1/2,'square')}break;
  case 'HPF Echo':{const f=F('highpass',150,2);In.connect(f);f.connect(Out);ramp(f.frequency,150,4500);echo(In,.6)}break;
  case 'LPF Echo':{const f=F('lowpass',18000,2);In.connect(f);f.connect(Out);ramp(f.frequency,18000,300);echo(In,.6)}break;
  case 'Crush Echo':In.connect(shaper()).connect(Out);echo(In,.6);break;
  case 'Reverb Up':{const f=F('highpass',80);In.connect(f);f.connect(Out);ramp(f.frequency,80,3000);const c=conv(),g=G(.05);In.connect(c);c.connect(g);g.connect(Out);ramp(g.gain,.05,1.6)}break;
  case 'Reverb Down':{const f=F('lowpass',18000);In.connect(f);f.connect(Out);ramp(f.frequency,18000,400);const c=conv();In.connect(c);c.connect(Out)}break;
  case 'Trans':{const o=ctx.createOscillator(),g=G(0);o.type='square';Nn.push(o);o.frequency.value=1/beat();T.push(()=>o.frequency.setTargetAtTime(1/beat(),ctx.currentTime,.05));o.connect(g);g.connect(s.Gate.gain);o.start();s.transG=g}break;
 }
 s.nodes=Nn;s.timed=T;s.engage=E;s.built=spec.fx}
function rbReleaseDeck(d,type,beat){if(!d.a.src||d.a.paused)return;boot();const n=d.n;
 if(type==='brake'){d.brake(true);return}
 const spec={fx:'Echo',beat:beat!=null?beat:5,lvl:.85};rbFxApply(d,'rel',spec,true);const bl=60/(d.bpm*d.rate||120);
 const stop=()=>{const s=n.fxs&&n.fxs.rel;if(s)s.In.gain.setTargetAtTime(0,ctx.currentTime,.02);n.dry.gain.setTargetAtTime(0,ctx.currentTime,.03);
  setTimeout(()=>{d.a.pause();d.bend=0;d.setRate();n.dry.gain.cancelScheduledValues(0);n.dry.gain.value=1;setTimeout(()=>rbFxClear(d,'rel'),8000)},150)};
 if(type==='backspin'){let k=0;const iv=setInterval(()=>{d.bend=Math.max(-.95,(d.bend||0)-.2);d.setRate();if(++k>=5){clearInterval(iv);stop()}},60)}
 else setTimeout(stop,bl*1000)}
rbFxApply=function(d,key,spec,on){const n=d.n;if(!n||!n.dry)return;const name=spec.fx,L=spec.lvl,def=FX_DEF[name]||{},t=ctx.currentTime;
 if(def.rel){if(on)rbReleaseDeck(d,def.rel,spec.beat);return}
 if(on&&(!n.fxs||!n.fxs[key]||n.fxs[key].built!==name))rbFxBuild(d,key,spec);const s=n.fxs&&n.fxs[key];
 if(s&&def.w){s.In.gain.setTargetAtTime(on&&!def.noIn?1:0,t,.01);s.Out.gain.setTargetAtTime(on||def.t?(def.noIn?L:L):0,t,.02)}
 if(s&&def.ins){s.In.gain.setTargetAtTime(on?1:0,t,.005);s.Out.gain.setTargetAtTime(on||def.t?1:0,t,.01);s.Gate.gain.setTargetAtTime(on?0:1,t,.005);if(s.depth)s.depth.gain.value=300+L*2500}
 if(s&&def.trans){s.Gate.gain.value=on?1-L/2:1;if(s.transG)s.transG.gain.value=on?L/2:0}
 if(s&&on)(s.engage||[]).forEach(f=>f());
 if(def.pitch){d.fxPitch=d.fxPitch||{};d.fxPitch[key]=on?Math.round(def.pitch===1?(L*2-1)*12:(L-.5)*24):0;rbApplyPitch(d)}
 if(def.roll){if(on&&!d._roll&&d.a.src&&d.bpm){d._roll=1;d._slip0=d.slip;if(def.roll===2)d.slip=1;d.slipStart();const i=d.snap(d.a.currentTime);d.loop={in:i,out:i+BFX_BEATS[spec.beat]*60/d.bpm,on:true,beats:0,roll:1};d.ui()}
  else if(!on&&d._roll){d._roll=0;d.loop=null;d.slipEnd();d.slip=d._slip0;d.ui()}}
 if(def.brake&&on!==!!d.braking)d.brake(on);
 if(def.speed!=null){d.bend=on?def.speed:0;d.setRate()}}
// Beat FX unit: rekordbox's order first
{const old=BFX_LIST[BFX.fx];BFX_LIST.splice(0,BFX_LIST.length,...FX_CATS[0][1]);BFX.fx=Math.max(0,BFX_LIST.indexOf(old==='Filter'?'Filter LFO':old));
 RB_RBFX.splice(0,RB_RBFX.length,...RB_G0);$('#bfxSel').innerHTML=BFX_LIST.map((x,i)=>`<option value="${i}">${FX_LABEL(x)}</option>`).join('');D.forEach(rbBfxClear);rbBfxUI()}
// Pad FX labels and editor with the four rekordbox categories
rbPadFxUI=function(){D.forEach(d=>{const base=rbPadBase(d);d.el.querySelectorAll('[data-fx]').forEach(b=>{const k=+b.dataset.fx,p=PADFX[base+k],def=FX_DEF[p.fx]||{};
  b.firstChild.textContent=(def.rel?'Ⓡ ':'')+FX_LABEL(p.fx);b.lastChild.textContent=[FX_NOBEAT.includes(p.fx)?'':BFX_BL[p.beat],def.rel?'ON':Math.round(p.lvl*100)].filter(Boolean).join('  ')+'  #'+(base%16+k+1);
  b.title='Hold to play the effect. Right-click to change it.';b.classList.toggle('on',d._padFx===base+k)});
 const h=d.el.querySelector('.pfxpage');if(h){h.textContent=d.pfxHi?'9-16':'1-8';h.classList.toggle('on',!!d.pfxHi)}const bk=d.el.querySelector('.pfxbank');if(bk)bk.textContent='PAD FX'+((d.pfxBank||0)+1)})}
rbForm=function(title,fields){return new Promise(res=>{
 const opt=(o,v)=>`<option value="${rbEsc(o[0])}"${String(o[0])===String(v)?' selected':''}>${rbEsc(o[1])}</option>`;
 rbDlg.innerHTML=`<form method="dialog"><h3>${rbEsc(title)}</h3>${fields.map(f=>`<label class="rbf"><span>${rbEsc(f.label)}</span>${f.type==='select'?`<select name="${f.k}">${f.groups?f.groups.map(([g,os])=>`<optgroup label="${rbEsc(g)}">${os.map(o=>opt(o,f.val)).join('')}</optgroup>`).join(''):f.opts.map(o=>opt(o,f.val)).join('')}</select>`:f.type==='check'?`<input type="checkbox" name="${f.k}"${f.val?' checked':''}>`:`<input name="${f.k}" value="${rbEsc(f.val)}" placeholder="${rbEsc(f.ph||'')}">`}</label>`).join('')}<div class="row"><button value="ok" class="on">OK</button><button value="cancel">Cancel</button></div></form>`;
 rbDlg.onclose=()=>{if(rbDlg.returnValue!=='ok'){res(null);return}const o={};fields.forEach(f=>{const el=rbDlg.querySelector(`[name="${f.k}"]`);o[f.k]=f.type==='check'?el.checked:el.value});res(o)};
 rbDlg.returnValue='';rbDlg.showModal();const first=rbDlg.querySelector('input,select');if(first)first.focus()})}
rbPadEdit=async function(i){const p=PADFX[i];
 const r=await rbForm('PAD FX'+(Math.floor(i/16)+1)+' — slot '+(i%16+1),[{k:'fx',label:'Effect',type:'select',groups:FX_CATS.map(([c,l])=>[c,l.map(x=>[x,FX_LABEL(x)])]),val:p.fx},
  {k:'beat',label:'Beat',type:'select',opts:BFX_BL.map((x,k)=>[k,x]),val:p.beat},{k:'lvl',label:'Level / depth',type:'select',opts:[10,20,30,40,50,60,70,80,90,100].map(v=>[v/100,String(v)]),val:Math.round(p.lvl*10)/10},
  {k:'reset',label:'Reset all Pad FX to default',type:'check',val:false}]);
 if(!r)return;D.forEach(d=>{if(d._padFx!=null)rbPadFx(d,d._padFx,false)});
 if(r.reset)PADFX=PADFX_DEF.map(x=>Object.assign({},x));else PADFX[i]={fx:r.fx,beat:+r.beat,lvl:+r.lvl};
 D.forEach(d=>rbFxClear(d,'pad'));S.padfx=PADFX;save();rbPadFxUI();toast(r.reset?'Pad FX reset':'PAD FX'+(Math.floor(i/16)+1)+' slot '+(i%16+1)+': '+FX_LABEL(PADFX[i].fx))}
rbPadFxUI();
// import the Pad FX from rekordbox (PadFxSettings.xml): group 0 = BEAT FX 0-17, 1 = SOUND COLOR FX 19-27, 2 = SCENE FX 28-, 3 = RELEASE FX 29-31
const rbImpPrev=rbImportRekordbox;
rbImportRekordbox=async function(appData){const done=await rbImpPrev(appData);appData=appData||window.DJ_APPDATA;if(!appData)return done;
 try{const r=await fetch(rbFileUrl(appData.replace(/\\/g,'/')+'/Pioneer/rekordbox6/PadFxSettings.xml'));if(!r.ok)return done;
  const x=new DOMParser().parseFromString(await r.text(),'text/xml');let cnt=0;
  x.querySelectorAll('PADFXINFO_500[deckNo="1"]').forEach(e=>{const mode=+e.getAttribute('modeIndex'),pad=+e.getAttribute('padIndex'),g=+e.getAttribute('fxGroup'),ty=+e.getAttribute('fxType');if(mode>1||!(pad>=0&&pad<16))return;
   const name=g===0?RB_G0[ty]:g===1?RB_G1[ty-19]:g===2?RB_G2[ty-28]:g===3?RB_G3[ty-29]:null;if(!name)return;
   const nu=+e.getAttribute('numerator'),de=+e.getAttribute('denominator'),lv=+e.getAttribute('leveldepth');let beat=5;
   if(nu>0&&de>0){const v=nu/de;let best=1e9;BFX_BEATS.forEach((b,k)=>{const dd=Math.abs(Math.log(b/v));if(dd<best){best=dd;beat=k}})}
   PADFX[mode*16+pad]={fx:name,beat,lvl:lv>=0?lv/100:(g===1?.8:.5)};cnt++});
  if(cnt){S.padfx=PADFX;save();D.forEach(d=>rbFxClear(d,'pad'));rbPadFxUI();done.push(cnt+' Pad FX')}}catch(e){console.warn(e)}
 return done};

// ---------- sample-exact loops ----------
// While a loop is on, the deck plays it from the decoded audio with a looping buffer source (no seeking, so the loop
// starts and ends exactly on the grid); the media element keeps running muted underneath so the UI, slip and sync follow.
function rbLoopPos(d){const L=d._bl;if(!L)return d.a.currentTime;const len=L.end-L.start,el=(ctx.currentTime-L.t0)*L.rate+(L.p0-L.start);return L.start+((el%len)+len)%len}
function rbLoopStop(d,keepPos){const L=d._bl;if(!L)return;const pos=rbLoopPos(d);d._bl=null;try{L.src.stop()}catch(e){}try{L.src.disconnect()}catch(e){}
 try{d.n.src.connect(d.n.mainG)}catch(e){}if(keepPos&&!d.slip&&!d.ghost)d.a.currentTime=pos;rbApplyPitch(d)}
setInterval(()=>{if(!ctx)return;D.forEach(d=>{const l=d.loop,n=d.n,want=!!(n&&n.mainG&&d.buf&&!d._sl&&l&&l.on&&l.out!=null&&l.out-l.in>.02&&!d.a.paused&&!d.reversed);
 if(!want){if(d._bl)rbLoopStop(d,!!(l&&!l.on&&!d.a.paused));return}
 const rate=d.a.playbackRate||1;
 if(!d._bl){let p=d.a.currentTime;if(p<l.in||p>=l.out)p=l.in;const src=ctx.createBufferSource();src.buffer=d.buf;src.loop=true;src.loopStart=l.in;src.loopEnd=l.out;src.playbackRate.value=rate;
  try{n.src.disconnect(n.mainG)}catch(e){}src.connect(n.mainG);src.start(0,p);d._bl={src,start:l.in,end:l.out,t0:ctx.currentTime,p0:p,rate};rbApplyPitch(d);return}
 const L=d._bl;if(L.start!==l.in||L.end!==l.out){const p=rbLoopPos(d);L.src.loopStart=l.in;L.src.loopEnd=l.out;L.start=l.in;L.end=l.out;L.t0=ctx.currentTime;L.p0=(p<l.in||p>=l.out)?l.in:p}
 if(Math.abs(L.rate-rate)>1e-4){const p=rbLoopPos(d);L.src.playbackRate.setValueAtTime(rate,ctx.currentTime);L.rate=rate;L.t0=ctx.currentTime;L.p0=p;rbApplyPitch(d)}
 const p=rbLoopPos(d);if(Math.abs(d.a.currentTime-p)>.08)d.a.currentTime=p})},15);
// with key lock on, the looping buffer would change pitch with the tempo, so the pitch processor compensates
const rbApplyPitch0=rbApplyPitch;rbApplyPitch=function(d){const n=d.n;if(!n||!n.ps){rbApplyPitch0(d);return}
 const s=(d.keyShift||0)+(d.cfxPitch||0)+rbFxP(d),comp=d._bl&&d.kl?1/(d._bl.rate||1):1;n.ps.parameters.get('ratio').setValueAtTime(Math.pow(2,s/12)*comp,ctx.currentTime)};

// 4 BEAT / EXIT like rekordbox: exits an active loop, otherwise always makes a new 4-beat loop from the current beat (not an old saved one)
MIDI_ACTIONS.filter(a=>/^loop[0-3]$/.test(a.id)).forEach(a=>{const i=+a.id.slice(4);a.press=()=>{const x=D[deckIdx(i)];if(!x||!x.a.src)return;
 if(x.loop&&x.loop.on&&x.loop.out!=null){x.loop.on=false;x.slipEnd();x.ui()}else x.setLoop(4)}});
// a loop restored from an earlier session is moved onto the current (refined) beat grid
function rbResnapLoop(d){const l=d.loop;if(!l||l.out==null||!d.bpm)return;const bl=60/d.bpm,k=Math.round((l.in-d.first)/bl),beats=Math.max(1,Math.round((l.out-l.in)/bl));l.in=d.first+k*bl;l.out=l.in+beats*bl;d.ui()}
const rbGridEst0=rbGridEstimate;rbGridEstimate=function(d){rbGridEst0(d);setTimeout(()=>rbResnapLoop(d),150)};
D.forEach(d=>{if(d.loop)rbResnapLoop(d)});

// jog inside an active loop wraps around like rekordbox: going back past the loop start comes in at the loop end, never out of the loop
function rbJogSeek(d,delta){if(!d||!d.a.src)return;const l=d.loop,on=l&&l.on&&l.out!=null&&l.out>l.in;let p=(d._bl?rbLoopPos(d):d.a.currentTime)+delta;
 if(on){const len=l.out-l.in;p=l.in+(((p-l.in)%len)+len)%len}else p=Math.max(0,Math.min(d.dur||1e9,p));
 if(d._bl)rbLoopStop(d,false);d.a.currentTime=p}
MIDI_ACTIONS.filter(a=>/^jog[0-3]$/.test(a.id)).forEach(a=>{const i=+a.id.slice(3);a.rel=x=>rbJogSeek(D[deckIdx(i)],x*.012)});
MIDI_ACTIONS.filter(a=>/^jogfast[0-3]$/.test(a.id)).forEach(a=>{const i=+a.id.slice(7);a.rel=x=>rbJogSeek(D[deckIdx(i)],x*.25)});
jogNudge=function(d,delta){if(!d||!d.a.src)return;if(d.a.paused){rbJogSeek(d,delta*.01);return}
 d.bend=Math.max(-.3,Math.min(.3,delta*.02));d.setRate();clearTimeout(d.jt);d.jt=setTimeout(()=>{d.bend=0;d.setRate()},90)};
D.forEach(d=>{const j=d.jg;let la=0;const ang=e=>{const r=j.getBoundingClientRect();return Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2)};
 j.onpointerdown=e=>{j.setPointerCapture(e.pointerId);d.jd=1;la=ang(e)};
 j.onpointermove=e=>{if(!d.jd)return;const n=ang(e);let a=n-la;if(a>Math.PI)a-=2*Math.PI;if(a<-Math.PI)a+=2*Math.PI;la=n;rbJogSeek(d,a/(2*Math.PI)*1.8)};
 j.onpointerup=j.onpointercancel=()=>d.jd=0});

// ---------- vinyl scratch: while the jog top is touched the track sounds at the platter's speed and direction ----------
// An audio worklet reads the decoded track at a variable (also negative) speed that follows the jog position smoothly.
const RB_SCR=`class Scr extends AudioWorkletProcessor{constructor(){super();this.L=null;this.R=null;this.p=0;this.t=0;this.v=0;this.on=false;this.k=1;
this.port.onmessage=e=>{const m=e.data;if(m.L){this.L=m.L;this.R=m.R;this.k=m.sr/sampleRate}if(m.start!=null){this.p=this.t=m.start*this.k*sampleRate;this.v=0;this.on=true;this.ls=m.loop?m.loop[0]*this.k*sampleRate:0;this.le=m.loop?m.loop[1]*this.k*sampleRate:0}if(m.target!=null)this.t=m.target*this.k*sampleRate;if(m.stop)this.on=false}}
process(I,O){const o=O[0];if(!o||!o.length)return true;const n=o[0].length,L=this.L,R=this.R;if(!this.on||!L){for(const c of o)c.fill(0);return true}
const a=1/(0.025*sampleRate),max=6*this.k,N=L.length;for(let i=0;i<n;i++){const err=this.t-this.p;this.v+=(err*a-this.v)*0.02;if(this.v>max)this.v=max;if(this.v<-max)this.v=-max;this.p+=this.v;
let q=this.p;if(this.le>this.ls+2){const len=this.le-this.ls;q=this.ls+(((q-this.ls)%len)+len)%len}else{if(this.p<0)this.p=q=0;if(this.p>N-2)this.p=q=N-2}const i0=q|0,f=q-i0,g=Math.min(1,Math.abs(this.v)/this.k*4);
o[0][i]=(L[i0]*(1-f)+L[i0+1]*f)*g;if(o[1])o[1][i]=(R[i0]*(1-f)+R[i0+1]*f)*g}return true}}registerProcessor('dj-scratch',Scr);`;
let rbScrOk=null;
function rbScrReady(){if(!ctx)return Promise.resolve(false);if(!rbScrOk)rbScrOk=ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([RB_SCR],{type:'text/javascript'}))).then(()=>true).catch(e=>{console.warn('scratch',e);return false});return rbScrOk}
async function rbScrPrepare(d){if(!d.buf||!d.n||(d._scr2&&d._scr2.tk===d.tk))return;if(!await rbScrReady())return;
 if(!d._scr2){const node=new AudioWorkletNode(ctx,'dj-scratch',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});node.connect(d.n.trim);d._scr2={node,tk:null}  /* after mainG: also audible when the track plays from stems (mainG is muted then) */}
 const b=d.buf;d._scr2.node.port.postMessage({L:b.getChannelData(0),R:b.numberOfChannels>1?b.getChannelData(1):b.getChannelData(0),sr:b.sampleRate});d._scr2.tk=d.tk}
// touch: the track stops under the hand and follows the platter; release: it continues (from the slip position with SLIP on)
rbJogTouch=function(d,on){if(!d||!d.a.src)return;boot();
 if(on){d._scrWas=!d.a.paused;if(d.slip)d.slipStart();if(d._bl)rbLoopStop(d,false);d._scrPos=d.a.currentTime;if(d._scrWas)d.a.pause();d._scrOn=true;
  rbScrPrepare(d).then(()=>{if(d._scrOn&&d._scr2){try{d.n.src.disconnect(d.n.mainG)}catch(e){}d._scr2.node.port.postMessage({start:d._scrPos})}})}
 else{d._scrOn=false;if(d._scr2)d._scr2.node.port.postMessage({stop:1});try{d.n.src.connect(d.n.mainG)}catch(e){}
  let p=d._scrPos;const l=d.loop;if(l&&l.on&&l.out>l.in){const len=l.out-l.in;p=l.in+(((p-l.in)%len)+len)%len}d.a.currentTime=Math.max(0,Math.min(d.dur||1e9,p));
  if(d._scrWas){d.a.play().catch(()=>{});if(d.slip)d.slipEnd()}}};
const rbJogSeek0=rbJogSeek;rbJogSeek=function(d,delta){if(d&&d._scrOn){{const l=d.loop,inL=l&&l.on&&l.out>l.in;d._scrPos=inL?d._scrPos+delta*(S.jogScale||.7):Math.max(0,Math.min((d.dur||1e9)-.05,d._scrPos+delta*(S.jogScale||.7)))}if(d._scr2)d._scr2.node.port.postMessage({target:d._scrPos});
  // the (silent, paused) media element follows so the waveform, time and position move with the platter
  if(Date.now()-(d._scrVis||0)>30){d._scrVis=Date.now();const l=d.loop;let v=d._scrPos;if(l&&l.on&&l.out>l.in){const len=l.out-l.in;v=l.in+(((v-l.in)%len)+len)%len}d.a.currentTime=v}return}rbJogSeek0(d,delta)};
// a scratch session lasts while the platter is touched AND while it still spins after release (a flicked platter keeps
// sounding until it stops, like vinyl); turning the platter of a stopped deck also sounds
function rbScrBegin(d){if(d._scrOn)return;boot();d._scrWas=!d.a.paused;if(d.slip)d.slipStart();if(d._bl)rbLoopStop(d,false);d._scrPos=d.a.currentTime;if(d._scrWas)d.a.pause();d._scrOn=true;
 rbScrPrepare(d).then(()=>{if(d._scrOn&&d._scr2){try{d.n.src.disconnect(d.n.mainG)}catch(e){}d._scr2.node.port.postMessage({start:d._scrPos,loop:d.loop&&d.loop.on&&d.loop.out>d.loop.in?[d.loop.in,d.loop.out]:null})}})}
function rbScrEnd(d){if(!d._scrOn)return;d._scrOn=false;if(d._scr2)d._scr2.node.port.postMessage({stop:1});try{d.n.src.connect(d.n.mainG)}catch(e){}
 let p=d._scrPos;const l=d.loop;if(l&&l.on&&l.out>l.in){const len=l.out-l.in;p=l.in+(((p-l.in)%len)+len)%len}d.a.currentTime=Math.max(0,Math.min(d.dur||1e9,p));
 if(d._scrWas){d.a.play().catch(()=>{});if(d.slip)d.slipEnd()}}
function rbScrIdle(d){clearTimeout(d._scrIdleT);d._scrIdleT=setTimeout(()=>{if(d._touch)return;if(Date.now()-(d._lastTick||0)<140){rbScrIdle(d);return}rbScrEnd(d)},150)}
rbJogTouch=function(d,on){if(!d||!d.a.src)return;d._touch=on;if(on){clearTimeout(d._scrIdleT);rbScrBegin(d)}else rbScrIdle(d)};
rbJogSeek=(f=>function(d,delta){if(d&&d._scrOn){d._lastTick=Date.now();if(!d._touch)rbScrIdle(d);return f(d,delta)}return f(d,delta)})(rbJogSeek);
// the platter rim / free spin: pitch bend while playing, but scratch sound while the deck is stopped or a scratch is going on
jogNudge=function(d,delta){if(!d||!d.a.src)return;if(d.a.paused||d._scrOn){if(!d._scrOn)rbScrBegin(d);rbJogSeek(d,delta*.012);return}
 d.bend=Math.max(-.3,Math.min(.3,delta*.02));d.setRate();clearTimeout(d.jt);d.jt=setTimeout(()=>{d.bend=0;d.setRate()},90)};
// jog sensitivity: a quick flick of the FLX4 platter sends ~230 steps; 0.15 makes that about vinyl speed (one turn ≈ 1.8 s of audio)
if(!S.jogScale||S.jogScale===.7)S.jogScale=.15;
$('[data-s=range]').closest('.set').insertAdjacentHTML('afterend','<div class="set"><span>Jog sensitivity (scratch): <b id="jsv"></b></span><input type="range" id="jogSens" min="0.04" max="0.6" step="0.01"></div>');
$('#jogSens').value=S.jogScale;$('#jsv').textContent=Math.round(S.jogScale/.15*100)+'%';$('#jogSens').oninput=e=>{S.jogScale=+e.target.value;$('#jsv').textContent=Math.round(S.jogScale/.15*100)+'%';save()};
// decoded audio goes to the scratch engine as soon as a track has loaded, so the first touch is instant
setInterval(()=>D.forEach(d=>{if(d.buf&&d.n&&d.tk&&(!d._scr2||d._scr2.tk!==d.tk))rbScrPrepare(d)}),1500);

// sync / phase meter read the exact loop position while a loop plays
rbPhase=function(d){return(rbLoopPos(d)-d.first)/(60/d.bpm)};


// watchdog: a roll loop with no pad / Beat FX holding it any more is removed (it must never stay behind)
setInterval(()=>D.forEach(d=>{const bn=BFX_LIST[BFX.fx],bRoll=BFX.on&&FX_DEF[bn]&&FX_DEF[bn].roll&&rbTargets().includes(d);
 if(d._roll&&d._padFx==null&&!bRoll){d._roll=0;d.loop=null;d.slipEnd();d.slip=d._slip0;d.ui()}else if(d.loop&&d.loop.roll&&!d._roll){d.loop=null;d.ui()}}),300);

// ---------- styles ----------
document.head.insertAdjacentHTML('beforeend',`<style>
.pads{grid-template-columns:repeat(4,minmax(0,1fr))}.pads.jump{grid-template-columns:repeat(2,minmax(0,1fr))}
.pads button{min-width:0;overflow:hidden}.pads [data-fx] b{font-size:10px;letter-spacing:0}.pads button b,.pads button span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bfx{display:flex;align-items:center;gap:6px;padding:2px 8px;background:#0d0d0d;flex-wrap:wrap}.bfx>b{color:var(--mu);letter-spacing:.08em;font-size:12px}
.bfx select,.bfx button{padding:2px 6px;font-size:11px}.bfx label{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--mu)}.bfx input{width:120px}
#bfxB{min-width:52px;text-align:center;color:#C6FF3D;font-size:12px}#bfxOn.on{background:#C6FF3D;color:#000;border-color:#C6FF3D}
.keyd{display:block;color:#C6FF3D;font-weight:700;font-size:11px;white-space:nowrap}.keyd.kc{color:#3ddc84}td.kc{color:#3ddc84;font-weight:700}
.rbx small{font-size:9px;color:var(--mu);margin-left:4px}.rbx [data-k=ksv]{min-width:24px;text-align:center;color:#C6FF3D;font-size:11px}
.cdot{width:18px}.cdot i{display:inline-block;width:11px;height:11px;border-radius:50%;background:var(--dc);border:1px solid #555;cursor:pointer;vertical-align:middle}
td.tag{cursor:pointer;color:#C6FF3D;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tag .ph{color:#3a3a3a}
#smp{display:grid;grid-template-columns:repeat(8,1fr);gap:3px}#smp .slot{min-width:0;height:34px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;overflow:hidden;border:1px solid #333;background:#0a0a0f;padding:1px 6px}
#smp .slot b{font-size:9px;color:var(--mu)}#smp .slot span{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}#smp .slot.has{border-color:#6C5CE7}#smp .slot.loop{border-color:#C6FF3D}#smp .slot.on{background:#6C5CE7;color:#fff}
#smp .smpv{grid-column:1/-1;display:flex;gap:12px;align-items:center;font-size:11px;color:var(--mu)}
#rbDlg form{display:flex;flex-direction:column;gap:8px;min-width:300px}#rbDlg h3{margin:0 0 4px}.rbf{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:8px;font-size:12px}.rbf input:not([type=checkbox]),.rbf select{width:100%}
.amx{display:flex;gap:3px;margin-top:4px}#amx{flex:1}#amx.on{background:#C6FF3D;color:#000;border-color:#C6FF3D}
.ipl{display:flex!important;justify-content:space-between;gap:4px}.ipl s{text-decoration:none;opacity:.45}.ipl s:hover{opacity:1;color:#ff4040}
[data-decks="4"] .rbx{flex-wrap:nowrap;overflow-x:auto}[data-decks="4"] .rbx button{padding:1px 4px;font-size:9px}[data-decks="4"] .wfs canvas{height:24px}
</style>`);
renderLib();

// modern compact theme (loaded last so it overrides everything above)
if(!document.getElementById('rbTheme'))document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" id="rbTheme" href="theme.css">');
