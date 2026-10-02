// ---------- web TEST version: the full program for 10 minutes, then it asks to download the Windows version ----------
(()=>{
const LIMIT=10*60*1000,KEY='dijvirta-test',DAY=24*3600*1000;
const lang=(new URLSearchParams(location.search).get('lang')||S.lang||'en').slice(0,2);
const TXT={
 hy:{left:'TEST',end:'Թեստի 10 րոպեն ավարտվեց',sub:'Ներբեռնիր DIJVIRTA-ն Windows-ի համար՝ առանց ժամանակի սահմանափակման։',dl:'Ներբեռնել DIJVIRTA',again:'Նոր թեստ հասանելի կլինի 24 ժամից'},
 ru:{left:'ТЕСТ',end:'10 минут теста закончились',sub:'Скачай DIJVIRTA для Windows — без ограничения по времени.',dl:'Скачать DIJVIRTA',again:'Новый тест будет доступен через 24 часа'},
 en:{left:'TEST',end:'Your 10-minute test is over',sub:'Download DIJVIRTA for Windows to keep playing with no time limit.',dl:'Download DIJVIRTA',again:'A new test is available after 24 hours'}}[lang]||null;
const L=TXT||{left:'TEST',end:'Your 10-minute test is over',sub:'Download DIJVIRTA for Windows to keep playing with no time limit.',dl:'Download DIJVIRTA',again:'A new test is available after 24 hours'};
let st=null;try{st=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
if(!st||Date.now()-st.start>DAY){st={start:Date.now()};try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}}
// things that only exist in the Windows app
document.head.insertAdjacentHTML('beforeend','<style>.set:has(#rbImp){display:none}#demoT{position:fixed;right:10px;bottom:10px;z-index:50;font:700 13px/1 "Segoe UI",sans-serif;padding:7px 12px;border-radius:999px;background:#C6FF3D;color:#0A0A0F;box-shadow:0 6px 20px rgba(0,0,0,.5)}#demoT.low{background:#ff4d6d;color:#fff}#demoEnd{position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:rgba(10,10,15,.92);backdrop-filter:blur(6px);padding:16px}#demoEnd>div{max-width:440px;text-align:center;display:grid;gap:14px;color:#EEEEF5;font:500 15px/1.5 "Segoe UI",sans-serif}#demoEnd h2{margin:0;font-size:26px}#demoEnd a{justify-self:center;padding:13px 22px;border-radius:12px;background:#C6FF3D;color:#0A0A0F;font-weight:800;text-decoration:none}#demoEnd small{color:#9A9AAE}</style>');
const badge=document.createElement('div');badge.id='demoT';document.body.appendChild(badge);
let over=false;
function end(){if(over)return;over=true;D.forEach(d=>{try{d.a.pause()}catch(e){}});try{master.gain.value=0}catch(e){}
 const o=document.createElement('div');o.id='demoEnd';o.innerHTML=`<div><svg viewBox="126 56 128 84" width="84" height="56" style="justify-self:center"><circle cx="168" cy="98" r="38" fill="#6C5CE7"/><circle cx="212" cy="98" r="38" fill="#C6FF3D" fill-opacity=".92"/><path d="M190 65 A38 38 0 0 1 190 131 A38 38 0 0 1 190 65 Z" fill="#0A0A0F"/></svg><h2>${L.end}</h2><p style="margin:0">${L.sub}</p><a href="../?lang=${lang}#download" target="_top">${L.dl}</a><small>${L.again}</small></div>`;document.body.appendChild(o)}
// nothing plays once the test is over
D.forEach(d=>d.a.addEventListener('play',()=>{if(over)d.a.pause()}));const tg=Deck.prototype.toggle;Deck.prototype.toggle=function(){if(over)return;return tg.apply(this,arguments)};
function tick(){const left=Math.max(0,LIMIT-(Date.now()-st.start)),m=Math.floor(left/60000),s=Math.floor(left/1000)%60;
 badge.textContent=L.left+' '+m+':'+String(s).padStart(2,'0');badge.classList.toggle('low',left<60000);
 try{parent.postMessage({dijvirtaTest:left},'*')}catch(e){}
 if(!left)end()}
tick();setInterval(tick,1000);
})();
