// ---------- Folders: browse the computer's music folders in the library (like rekordbox Explorer) ----------
// Files are only read, never moved or deleted. Tracks added to the Collection keep their file path (no copy).
(()=>{if(!window.djfs)return;
// previews of folder tracks made before this fix were drawn from the demo beat (32 s): drop them so they are redrawn
{let ch=0;for(const k in RB.meta){const m=RB.meta[k];if(k.startsWith('path:')&&m.wfDur===32){delete m.wf2;delete m.wfFirst;delete m.wfDur;ch=1}}if(ch)rbSaveMeta()}
const pathId=p=>'path:'+p.toLowerCase();
const parseName=f=>{const b=f.replace(/\.[^.]+$/,''),m=b.match(/^(.+?)\s+[-–]\s+(.+)$/);return m?{a:m[1].trim(),n:m[2].trim()}:{a:'',n:b}};
// rekordbox's analysed BPM + beat grid, by file path (and by file name for imported copies)
let RBG={},RBN={};
const rbGridFor=(p,name)=>{if(p){const g=RBG[p.toLowerCase()];if(g)return g}const n=(name||(p||'').split(/[\\/]/).pop()||'').toLowerCase();return n&&RBN[n]||null};
const rbGridLib=()=>{let ch=0;LIB.forEach(e=>{const g=rbGridFor(e.path,e.file&&e.file.name);if(!g)return;e.bpm=g.bpm;const m=RB.meta[rbTk(e)];if(m&&m.bpm!==g.bpm){m.bpm=g.bpm;ch=1}});if(ch)rbSaveMeta();renderLib()};
if(djfs.rbGrids)djfs.rbGrids().then(g=>{RBG=g||{};for(const k in RBG){const n=k.split('\\').pop(),g=RBG[k];if(!(n in RBN))RBN[n]=g;else if(RBN[n]&&(RBN[n].bpm!==g.bpm||Math.abs(RBN[n].first-g.first)>.02))RBN[n]=null}rbGridLib();setTimeout(rbGridLib,3000)});
const rbLB=Deck.prototype.loadBlob;Deck.prototype.loadBlob=async function(blob,name,known){const p=this._rbPath;this._rbPath=null;
 const g=rbGridFor(p,blob&&blob.name);this._rbGrid=!!g;await rbLB.call(this,blob,name,g?g.bpm:known);
 if(g&&this.dur){this.bpm=g.bpm;this.first=g.first;if(this.tk){const m=rbMeta(this.tk);m.bpm=g.bpm;rbSaveMeta()}this.ui();D.forEach(x=>x.setRate())}};
const entry=(f,dir)=>{const id=pathId(f.path),m=RB.meta[id]||{},nm=parseName(f.name),g=rbGridFor(f.path);if(g&&m.bpm&&m.bpm!==g.bpm)m.bpm=g.bpm;return{n:nm.n,a:nm.a,g:'',bpm:g?g.bpm:m.abpm||0,dur:m.dur||0,path:f.path,id,dir}};
// load: read the file from disk just before it goes onto the deck
const rbLoadToF=loadTo;loadTo=async function(i,e){if(!e||!D[i])return;D[i]._rbPath=e.path||null;if(e.file||!e.path)return rbLoadToF(i,e);
 try{const r=await fetch(rbFileUrl(e.path));if(!r.ok)throw 0;const b=await r.blob();return rbLoadToF(i,Object.assign({},e,{file:new File([b],e.path.split(/[\\/]/).pop(),{type:b.type})}))}
 catch(x){toast("Can't open this file: "+e.path)}};
// sidebar tree
$('#lib aside').insertAdjacentHTML('beforeend','<div class="fold"><b>FOLDERS</b><div id="fTree"></div></div>');
const node=(d,depth)=>{const el=document.createElement('div');el.className='fn';
 el.innerHTML=`<div class="fr" style="padding-left:${depth*10}px"><i class="fx">▸</i><button class="fb" data-f="dir:${rbEsc(d.path)}" title="${rbEsc(d.path)}">${rbEsc(d.name)}</button><s class="fa" title="Add every song in this folder and its subfolders to the Collection">＋</s></div><div class="fk" hidden></div>`;
 const kids=el.querySelector('.fk'),arrow=el.querySelector('.fx');let loaded=false;
 const expand=async open=>{if(open&&!loaded){loaded=true;const r=await djfs.list(d.path);r.dirs.forEach(c=>kids.appendChild(node(c,depth+1)));if(!r.dirs.length)arrow.style.visibility='hidden'}kids.hidden=!open;arrow.textContent=open?'▾':'▸'};
 arrow.onclick=ev=>{ev.stopPropagation();expand(kids.hidden)};
 el.querySelector('.fb').onclick=()=>{rbOpenDir(d.path);expand(true)};
 el.querySelector('.fa').onclick=ev=>{ev.stopPropagation();rbAddFolder(d)};
 return el};
{const s=$('.srch');if(s){s.insertAdjacentHTML('beforeend','<button id="libBig" title="Enlarge / restore the library">⤢</button>');$('#libBig').onclick=()=>document.documentElement.classList.toggle('libbig')}}
djfs.roots().then(rs=>{const t=$('#fTree');rs.forEach(r=>t.appendChild(node(r,0)))});
let rbDirNow='';
async function rbOpenDir(p){rbDirNow=p;const r=await djfs.list(p);if(rbDirNow!==p)return;
 for(let k=LIB.length-1;k>=0;k--)if(LIB[k].dir)LIB.splice(k,1);sel=-1;
 r.files.forEach(f=>LIB.push(entry(f,p)));libF='dir:'+p;
 document.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x.dataset.f===libF));renderLib();
 toast(r.error?"Can't open this folder":r.files.length+' songs · '+p.split(/[\\/]/).filter(Boolean).pop())}
// Collection: keep the path, not a copy of the file
window.rbCollect=async list=>{const add=[];list.forEach(e=>{if(LIB.some(x=>!x.dir&&x.id===e.id))return;const c={n:e.n,a:e.a,g:e.g||'',bpm:e.bpm||0,dur:e.dur||0,path:e.path,id:e.id};LIB.push(c);add.push(c)});
 if(!add.length)return 0;try{const db=await idbOpen();await new Promise(res=>{const tx=db.transaction('tracks','readwrite'),st=tx.objectStore('tracks');add.forEach(c=>st.put({id:c.id,name:c.n,artist:c.a,genre:c.g,bpm:c.bpm,dur:c.dur,path:c.path}));tx.oncomplete=tx.onerror=res})}catch(x){}
 renderLib();return add.length};
async function rbAddFolder(d){toast('Looking for songs in '+d.name+'…');const fs=await djfs.scan(d.path);const n=await rbCollect(fs.map(f=>entry(f)));toast(n+' songs added to the Collection'+(fs.length>n?' ('+(fs.length-n)+' were already there)':''))}
// background analysis of BPM / length / key for the open folder and path tracks, only while nothing plays
let rbDirT=0;setInterval(async()=>{if(rbBusy||D.some(d=>!d.a.paused))return;const e=LIB.find(e=>e.path&&!e.dur&&!e._kfail&&(e.dir?libF==='dir:'+e.dir:true));if(!e)return;rbBusy=true;
 try{const buf=await rbTimeout(fetch(rbFileUrl(e.path)).then(r=>r.arrayBuffer()).then(ab=>new OfflineAudioContext(2,1,44100).decodeAudioData(ab)),30000);const m=rbMeta(e.id);
  m.dur=buf.duration;m.abpm=detectBpm(buf);if(!m.key)m.key=rbDetectKey(buf);rbSaveMeta();LIB.forEach(x=>{if(x.id===e.id){x.dur=m.dur;x.bpm=x.bpm||m.abpm}});
  if(!e.dir)idbPutTrack({id:e.id,name:e.n,artist:e.a,genre:e.g||'',bpm:e.bpm,dur:e.dur,path:e.path});
  if(Date.now()-rbDirT>1500){rbDirT=Date.now();renderLib()}}catch(x){e._kfail=1}
 rbBusy=false},700);
// controller browsing like rekordbox: BACK (SHIFT + browse press) jumps to the tree on the left,
// the browse knob moves through Collection / playlists / folders, press opens the folder (press again = into its songs)
let rbTreeFocus=false,rbTreeK=0;
const treeItems=()=>[...document.querySelectorAll('#lib aside [data-f]')].filter(b=>b.offsetParent!==null);
const treeShow=()=>{const it=treeItems();document.querySelectorAll('#lib aside .tf').forEach(x=>x.classList.remove('tf'));if(!rbTreeFocus||!it.length)return;rbTreeK=Math.max(0,Math.min(it.length-1,rbTreeK));it[rbTreeK].classList.add('tf');it[rbTreeK].scrollIntoView({block:'nearest'})};
const setTree=on=>{rbTreeFocus=on;if(on){const it=treeItems(),k=it.findIndex(b=>b.classList.contains('on'));rbTreeK=k<0?0:k}treeShow();document.querySelector('#lib').classList.toggle('treefocus',on)};
const act=id=>MIDI_ACTIONS.find(a=>a.id===id);
{const a=act('browse');if(a){const f=a.rel;a.rel=x=>{if(!rbTreeFocus)return f(x);rbTreeK+=x>0?1:-1;treeShow()}}}
// browse press: songs → folder tree; tree → opens the folder and goes into its songs (load with the LOAD buttons)
{const a=act('bpress');if(a){a.label='Browse knob press (folders ↔ songs)';a.press=()=>{if(!rbTreeFocus){setTree(true);return}const b=treeItems()[rbTreeK];if(!b)return;
 const wasOn=b.classList.contains('on');if(!wasOn)b.click();else if(b.classList.contains('fb')){const x=b.parentNode.querySelector('.fx');const k=b.closest('.fn').querySelector('.fk');if(k&&k.hidden&&x)x.click()}
 setTree(false);sel=-1;const want=b.dataset.f;let n=0;const go=()=>{if(libF===want||++n>40){libMove(1);return}setTimeout(go,100)};go()}}}
{const a=act('bback');if(a){a.label='Browse knob press with SHIFT (BACK: folder tree / track list)';a.press=()=>{setTree(!rbTreeFocus);toast(rbTreeFocus?'Folders: turn the knob, press to open':'Songs')}}}
document.addEventListener('click',e=>{if(rbTreeFocus&&e.target.closest&&e.target.closest('#rows'))setTree(false)});
document.head.insertAdjacentHTML('beforeend','<style>#lib aside .tf{outline:2px solid var(--B);outline-offset:-2px}#lib.treefocus #rows tr.sel td{opacity:.6}.fold{margin-top:8px;border-top:1px solid var(--ln);padding-top:6px}.fold>b{font-size:10px;letter-spacing:.12em;color:var(--mu);padding:0 6px}#fTree{display:flex;flex-direction:column;gap:1px;margin-top:3px}.fr{display:flex;align-items:center;gap:2px}.fr .fx{font-style:normal;width:14px;text-align:center;cursor:pointer;color:var(--mu);font-size:11px;flex:none}.fr .fb{flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:transparent!important;padding:3px 5px!important;font-size:11.5px!important}.fr .fb.on{background:rgba(108,92,231,.26)!important;color:#fff}.fr .fa{text-decoration:none;cursor:pointer;color:var(--mu);padding:0 5px;opacity:0;flex:none}.fr:hover .fa{opacity:1}.fr .fa:hover{color:var(--B)}.lib aside{overflow-y:auto}</style>');
})();
