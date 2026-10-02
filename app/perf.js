// ---------- performance: redraw canvases only when what they show has changed ----------
(()=>{
const cueSig=d=>d.cues.join(',')+'|'+d.cp+'|'+(d.loop?d.loop.in+','+d.loop.out+','+d.loop.on:'')+'|'+(d.mem||[]).join(',');
// overview: the playhead moves a pixel every few hundred ms, so redraw on a pixel change (or a state change), at most every 500 ms otherwise
const dr0=Deck.prototype.draw;Deck.prototype.draw=function(t,dur){const c=this.cv;if(!c)return;const w=c.clientWidth,now=performance.now();
 const sig=Math.round(dur?t/dur*w*2:0)+'|'+w+'|'+c.clientHeight+'|'+dur+'|'+cueSig(this)+'|'+(this.peaks?this.peaks.length:0)+'|'+this.tk+'|'+this.bpm+'|'+this.first+'|'+S.wf+'|'+(this._phrTk||'');
 if(sig===this._ovSig&&now-(this._ovT||0)<500)return;this._ovSig=sig;this._ovT=now;dr0.call(this,t,dur)};
// zoomed waveform: a stopped deck is only redrawn when something on it changes
const zd0=Deck.prototype.zdraw;Deck.prototype.zdraw=function(t){const c=this.zc;if(!c)return;const now=performance.now();
 if(this.a.paused&&!this.jd&&!this._scrOn){const st=this.stem||{};const sig=t+'|'+(S.zoomSec||10)+'|'+c.clientWidth+'|'+c.clientHeight+'|'+this.a.playbackRate+'|'+this.bpm+'|'+this.first+'|'+cueSig(this)+'|'+(this.fp?this.fp.length:0)+'|'+this.tk+'|'+!!this.master+'|'+!!this.syncOn+'|'+(st.bass?1:0)+(st.vocal?1:0)+(st.inst?1:0);
  if(sig===this._zSig&&now-(this._zT||0)<1000)return;this._zSig=sig;this._zT=now}else this._zSig=null;
 zd0.call(this,t)};
// jog display: 30 frames a second is plenty for the platter marker, nothing while it stands still
const jg0=Deck.prototype.jog;Deck.prototype.jog=function(t){if(!this.jg)return;
 const sig=(this.a.paused?t.toFixed(3):Math.round(t*30))+'|'+this.bpm+'|'+this.rate.toFixed(4)+'|'+this.dur;if(sig===this._jSig)return;this._jSig=sig;jg0.call(this,t)};
})();
