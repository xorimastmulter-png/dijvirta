
(()=>{
const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
// deterministic "tracks": energy per 10 ms column for two decks at 124 BPM
function track(seed,n,kickEvery){const r=(()=>{let s=seed;return()=>((s=Math.imul(s^s>>>15,1|s)+0x6D2B79F5|0,(s>>>0)/4294967296))})();
  const lo=new Float32Array(n),mi=new Float32Array(n),hi=new Float32Array(n),bl=60/124*100;
  let m=.3,h=.2;for(let i=0;i<n;i++){const ph=(i%bl)/bl,kick=Math.exp(-ph*9),sect=.55+.45*Math.sin(i/1500+seed);
    m+= (r()-.5)*.08;m=Math.min(.75,Math.max(.12,m));h+=(r()-.5)*.1;h=Math.min(.6,Math.max(.05,h));
    const off=((i/bl)|0)%kickEvery===kickEvery-1&&ph>.5?0:1;
    lo[i]=Math.min(1,kick*.95*sect*off+.08);mi[i]=m*(.6+.4*sect)*(.7+.3*Math.exp(-((ph+.5)%1)*6));hi[i]=h*(.5+.5*r())*(ph>.45&&ph<.6?1.6:1)}
  return{lo,mi,hi}}
const N=24000,T=[track(7,N,16),track(19,N,8)];
const cv=document.getElementById('wave'),g=cv.getContext('2d');
const hudA=document.getElementById('hudA'),hudB=document.getElementById('hudB');
function size(){const r=devicePixelRatio||1;cv.width=Math.round(cv.clientWidth*r);cv.height=Math.round(cv.clientHeight*r)}
size();addEventListener('resize',size);
const bl=60/124,first=[.12,.12];let t0=performance.now();
function lane(tr,t,y,h,w,firstBeat){const pps=w/9,mid=y+h/2;
  for(let x=0;x<w;x++){const i=Math.floor((t+(x-w/2)/pps)*100);if(i<0||i>=N)continue;
    const lo=tr.lo[i],mi=tr.mi[i],hi=tr.hi[i],a=Math.max(lo,mi,hi),m=a||1;
    const R=60+195*Math.pow(lo/m,1.2),G=40+215*Math.pow(mi/m,1.6)*.85,B=70+185*Math.pow(hi/m,1.3);
    g.fillStyle=`rgb(${R|0},${G|0},${B|0})`;g.fillRect(x,mid-a*h*.44,1,Math.max(1,a*h*.88))}
  const k0=Math.floor((t-4.5/1*9/9*1-firstBeat)/bl)-1;
  for(let k=Math.floor((t-5-firstBeat)/bl);k<=Math.ceil((t+5-firstBeat)/bl);k++){const x=w/2+(firstBeat+k*bl-t)*pps;if(x<0||x>w)continue;const bar=((k%4)+4)%4===0;
    g.fillStyle=bar?'rgba(255,255,255,.7)':'rgba(255,255,255,.25)';g.fillRect(Math.round(x),y,1,h);
    if(bar){g.fillStyle='#ff2d2d';g.beginPath();g.moveTo(x-4,y);g.lineTo(x+4,y);g.lineTo(x,y+5);g.fill()}}}
function frame(now){const r=devicePixelRatio||1,w=cv.width/r,h=cv.height/r;g.setTransform(r,0,0,r,0,0);g.fillStyle='#000';g.fillRect(0,0,w,h);
  const t=still?24:((now-t0)/1000)%200+20,lh=(h-40)/2;
  lane(T[0],t,6,lh,w,first[0]);lane(T[1],t-16*bl*4/4*2,lh+12,lh,w,first[1]);
  g.fillStyle='#fff';g.fillRect(w/2-1,0,2,h-30);
  const bars=(tt)=>{const bi=Math.floor((tt-.12)/bl);return(Math.floor(bi/4)+1)+'.'+(((bi%4)+4)%4+1)+' Bars'};
  hudA.textContent=bars(t);hudB.textContent=bars(t-32*bl);
  if(!still)requestAnimationFrame(frame)}
requestAnimationFrame(frame);

})();

// ---------- three languages: Armenian, English, Russian ----------
const I18N={
hy:{nav_feat:'Հնարավորություններ',nav_test:'Թեստ',nav_dl:'Ներբեռնել',
 h1:'DJ ծրագիր Windows-ի համար՝ <em>մաքուր միքսի</em> համար',cta_dl:'Ներբեռնել Windows-ի համար',cta_test:'Փորձել 10 րոպե',
 lede:'Չորս դեկ, ճշգրիտ BEAT SYNC, RGB ալիքներ, Beat FX ու Pad FX, sampler և պանակներով գրադարան։ Միացրու քո DJ պուլտը ու սկսիր նվագել։',
 look_k:'Ծրագիրը',look_h:'Ամեն ինչ մեկ էկրանին',look_p:'Ալիքները վերևում, դեկերն ու միքսերը մեջտեղում, գրադարանը ներքևում։ Կոմպակտ դասավորություն, որ աշխատի նաև նոութբուքի էկրանին։',
 n1:'դեկ՝ A, B, C, D',n2:'pad ռեժիմ',n3:'sampler սլոտ',n4:'Beat FX էֆեկտ',
 f_k:'Հնարավորություններ',f_h:'Այն, ինչ պետք է DJ-ին',
 f1:'Միքս ու SYNC',f1l:['<b>BEAT SYNC</b>․ SYNC սեղմած դեկը միանում է մյուսին, MASTER-ը փոխանցվում է','Phase meter՝ միլիվայրկյաններով','Tempo range ±6, 10, 16, 50%, Key Lock, Key Sync','Ճշգրիտ loop-եր, SLIP, REV, Vinyl scratch ձայնով'],
 f2:'Ալիքներ ու վերլուծություն',f2l:['RGB ալիքներ՝ բաս, միջին, բարձր հաճախականություններ','Բիթգրիդ, բարերի համար, ֆրազների գոտիներ՝ INTRO, VERSE, CHORUS, OUTRO','BPM-ի և key-ի ավտոմատ վերլուծություն, Camelot նշում','Համատեղելի key-երի ընդգծում գրադարանում'],
 f3:'Էֆեկտներ ու պադեր',f3l:['<b>Beat FX</b>՝ Delay, Echo, Spiral, Reverb, Trans, Flanger, Phaser, Roll','<b>Pad FX 1 ու 2</b>, Color FX, Smart CFX, Smart Fader','HOT CUE, BEAT LOOP, BEAT JUMP, SAMPLER, KEY SHIFT, KEYBOARD','Vocal, Bass, Instrumental-ի առանձին անջատում'],
 f4:'Գրադարան ու պուլտ',f4l:['<b>Պանակներ</b>՝ համակարգչի երաժշտությունը ուղիղ գրադարանում','Պլեյլիստներ, խելացի պլեյլիստներ, Automix','DJ պուլտեր MIDI և HID-ով, Learn ռեժիմ, լույսեր','Ականջակալ՝ պուլտի 3–4 ալիքներով'],
 t_k:'Թեստ',t_h:'Փորձիր DIJVIRTA-ն հենց բրաուզերում',t_p:'Ամբողջական ծրագիրը 10 րոպեով։ Նվագիր դեմո երգերը կամ բեռնիր քո ֆայլերը, միացրու MIDI պուլտը Chrome-ում կամ Edge-ում։',
 t_left:'Մնաց',t_note:'Լավագույնը համակարգչի էկրանին՝ 1280px-ից լայն',t_full:'Բացել ամբողջ էկրանով',t_go:'Սկսել թեստը',t_info:'Թեստը սկսվում է առաջին բացելուց և տևում է 10 րոպե։ Նոր թեստ՝ 24 ժամից։',t_over:'Ավարտված',
 d_k:'Ներբեռնել',d_h:'Տեղադրիր երեք քայլով',s1:'Ներբեռնիր',s1p:'Սեղմիր ներքևի կոճակը և պահիր <span class="kbd">DIJVIRTA-Setup.exe</span> ֆայլը։',s2:'Տեղադրիր',s2p:'Բացիր ֆայլը և սեղմիր Install։ Ծրագիրը կավելանա Start մենյու և աշխատասեղան։',s3:'Միացրու պուլտը',s3p:'Միացրու DJ պուլտը USB-ով և բացիր DIJVIRTA-ն։ Պուլտը կճանաչվի ինքնաշխատ։',
 d_btn:'Ներբեռնել DIJVIRTA',m_v:'Տարբերակ',m_s:'Չափ',m_o:'Համակարգ',m_k:'Թարմացնելիս կարգավորումները, cue-երը և գրադարանը պահպանվում են'},
en:{nav_feat:'Features',nav_test:'Test',nav_dl:'Download',
 h1:'DJ software for Windows, built for <em>clean mixing</em>',cta_dl:'Download for Windows',cta_test:'Try it for 10 minutes',
 lede:'Four decks, precise BEAT SYNC, RGB waveforms, Beat FX and Pad FX, a sampler and a folder-based library. Plug in your DJ controller and start playing.',
 look_k:'The app',look_h:'Everything on one screen',look_p:'Waveforms on top, decks and mixer in the middle, library at the bottom. A compact layout that also fits a laptop screen.',
 n1:'decks: A, B, C, D',n2:'pad modes',n3:'sampler slots',n4:'Beat FX effects',
 f_k:'Features',f_h:'What a DJ needs',
 f1:'Mixing and SYNC',f1l:['<b>BEAT SYNC</b>: the deck you sync follows the other one, and MASTER moves over','Phase meter in milliseconds','Tempo range ±6, 10, 16, 50%, Key Lock, Key Sync','Sample-accurate loops, SLIP, REV, vinyl scratch with sound'],
 f2:'Waveforms and analysis',f2l:['RGB waveforms: bass, mids and highs','Beat grid, bar counter and phrase bands: INTRO, VERSE, CHORUS, OUTRO','Automatic BPM and key detection with Camelot notation','Compatible keys highlighted in the library'],
 f3:'Effects and pads',f3l:['<b>Beat FX</b>: Delay, Echo, Spiral, Reverb, Trans, Flanger, Phaser, Roll','<b>Pad FX 1 and 2</b>, Color FX, Smart CFX, Smart Fader','HOT CUE, BEAT LOOP, BEAT JUMP, SAMPLER, KEY SHIFT, KEYBOARD','Mute vocals, bass or instrumental separately'],
 f4:'Library and controllers',f4l:['<b>Folders</b>: your computer’s music right in the library','Playlists, intelligent playlists, Automix','MIDI and HID DJ controllers, Learn mode, LED feedback','Headphone cue on the controller’s outputs 3–4'],
 t_k:'Test',t_h:'Try DIJVIRTA right in your browser',t_p:'The full program for 10 minutes. Play the demo tracks or load your own files, and connect a MIDI controller in Chrome or Edge.',
 t_left:'Left',t_note:'Works best on a computer screen wider than 1280px',t_full:'Open full screen',t_go:'Start the test',t_info:'The test starts when you first open it and lasts 10 minutes. A new test is available after 24 hours.',t_over:'Finished',
 d_k:'Download',d_h:'Install in three steps',s1:'Download',s1p:'Click the button below and save <span class="kbd">DIJVIRTA-Setup.exe</span>.',s2:'Install',s2p:'Open the file and click Install. DIJVIRTA is added to the Start menu and the desktop.',s3:'Connect your controller',s3p:'Plug your DJ controller in over USB and open DIJVIRTA. The controller is detected automatically.',
 d_btn:'Download DIJVIRTA',m_v:'Version',m_s:'Size',m_o:'System',m_k:'Updating keeps your settings, cues and library'},
ru:{nav_feat:'Возможности',nav_test:'Тест',nav_dl:'Скачать',
 h1:'DJ-программа для Windows для <em>чистого сведения</em>',cta_dl:'Скачать для Windows',cta_test:'Попробовать 10 минут',
 lede:'Четыре деки, точный BEAT SYNC, RGB-волны, Beat FX и Pad FX, сэмплер и библиотека с папками. Подключи свой DJ-контроллер и начинай играть.',
 look_k:'Программа',look_h:'Всё на одном экране',look_p:'Волны сверху, деки и микшер посередине, библиотека внизу. Компактная раскладка, которая помещается и на экране ноутбука.',
 n1:'деки: A, B, C, D',n2:'режимов пэдов',n3:'слотов сэмплера',n4:'эффектов Beat FX',
 f_k:'Возможности',f_h:'Всё, что нужно диджею',
 f1:'Сведение и SYNC',f1l:['<b>BEAT SYNC</b>: дека, на которой нажат SYNC, подстраивается под другую, MASTER переходит','Фазометр в миллисекундах','Диапазон темпа ±6, 10, 16, 50%, Key Lock, Key Sync','Точные лупы, SLIP, REV, винил-скретч со звуком'],
 f2:'Волны и анализ',f2l:['RGB-волны: бас, середина и верх','Бит-сетка, счётчик тактов и фразы: INTRO, VERSE, CHORUS, OUTRO','Автоматический анализ BPM и тональности, нотация Camelot','Совместимые тональности подсвечиваются в библиотеке'],
 f3:'Эффекты и пэды',f3l:['<b>Beat FX</b>: Delay, Echo, Spiral, Reverb, Trans, Flanger, Phaser, Roll','<b>Pad FX 1 и 2</b>, Color FX, Smart CFX, Smart Fader','HOT CUE, BEAT LOOP, BEAT JUMP, SAMPLER, KEY SHIFT, KEYBOARD','Отдельное отключение вокала, баса и инструментала'],
 f4:'Библиотека и контроллеры',f4l:['<b>Папки</b>: музыка с компьютера прямо в библиотеке','Плейлисты, умные плейлисты, Automix','DJ-контроллеры MIDI и HID, режим Learn, подсветка кнопок','Наушники через выходы 3–4 контроллера'],
 t_k:'Тест',t_h:'Попробуй DIJVIRTA прямо в браузере',t_p:'Полная программа на 10 минут. Играй демо-треки или загрузи свои файлы, подключи MIDI-контроллер в Chrome или Edge.',
 t_left:'Осталось',t_note:'Лучше всего на экране компьютера шире 1280px',t_full:'Открыть на весь экран',t_go:'Начать тест',t_info:'Тест начинается при первом открытии и длится 10 минут. Новый тест — через 24 часа.',t_over:'Закончен',
 d_k:'Скачать',d_h:'Установка в три шага',s1:'Скачай',s1p:'Нажми кнопку ниже и сохрани файл <span class="kbd">DIJVIRTA-Setup.exe</span>.',s2:'Установи',s2p:'Открой файл и нажми Install. Программа появится в меню «Пуск» и на рабочем столе.',s3:'Подключи контроллер',s3p:'Подключи DJ-контроллер по USB и открой DIJVIRTA. Контроллер определится автоматически.',
 d_btn:'Скачать DIJVIRTA',m_v:'Версия',m_s:'Размер',m_o:'Система',m_k:'При обновлении настройки, cue-точки и библиотека сохраняются'}};
let LANG='hy';
function setLang(l){LANG=I18N[l]?l:'en';const T=I18N[LANG];document.documentElement.lang=LANG;
 document.querySelectorAll('[data-i]').forEach(el=>{const v=T[el.dataset.i];if(v==null)return;
  if(el.hasAttribute('data-list'))el.innerHTML=v.map(x=>'<li>'+x+'</li>').join('');else if(el.hasAttribute('data-html'))el.innerHTML=v;else el.textContent=v});
 document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===LANG)));
 const f=document.querySelector('#tFull');if(f)f.href='app/?lang='+LANG;
 const fr=document.querySelector('#tView iframe');if(fr&&!fr.src.includes('lang='+LANG))fr.src='app/?lang='+LANG;
 try{localStorage.setItem('dijvirta-site-lang',LANG)}catch(e){}}
{let l=new URLSearchParams(location.search).get('lang');try{l=l||localStorage.getItem('dijvirta-site-lang')}catch(e){}
 l=l||((navigator.language||'').slice(0,2));setLang(['hy','ru','en'].includes(l)?l:'en')}
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>setLang(b.dataset.lang));

// ---------- 10-minute test: the real app in a frame; the app itself keeps the time ----------
const tLeft=document.getElementById('tLeft');
function fmtLeft(ms){const m=Math.floor(ms/60000),s=Math.floor(ms/1000)%60;return m+':'+String(s).padStart(2,'0')}
try{const st=JSON.parse(localStorage.getItem('dijvirta-test')||'null');if(st&&Date.now()-st.start<864e5){const left=Math.max(0,6e5-(Date.now()-st.start));tLeft.textContent=left?fmtLeft(left):I18N[LANG].t_over}}catch(e){}
document.getElementById('tGo').onclick=()=>{const v=document.getElementById('tView');v.innerHTML='<iframe title="DIJVIRTA test" allow="midi; autoplay; fullscreen" src="app/?lang='+LANG+'"></iframe>'};
addEventListener('message',e=>{if(e.data&&typeof e.data.dijvirtaTest==='number'){const l=e.data.dijvirtaTest;tLeft.textContent=l?fmtLeft(l):I18N[LANG].t_over}});
