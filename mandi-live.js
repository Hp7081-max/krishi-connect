/* Krishi Connect — real mandi prices (Agmarknet via /api/mandi/prices).
   Load AFTER the main app script. If the server has no DATA_GOV_API_KEY or data.gov.in is down,
   this file changes nothing and the old demo prices stay (with their "demo" label). */
(function(){
  "use strict";
  if(window.KrishiMandiLive) return;
  var miss=[];
  if(typeof S==="undefined"||!S) miss.push("S");
  if(typeof CROPS==="undefined") miss.push("CROPS");
  if(typeof demoNote!=="function") miss.push("demoNote");
  if(typeof refreshMandi!=="function") miss.push("refreshMandi");
  if(typeof render!=="function") miss.push("render");
  if(typeof save!=="function") miss.push("save");
  if(typeof esc!=="function") miss.push("esc");
  if(miss.length){ console.warn("[mandi-live.js] not started — missing in app:",miss.join(", ")); return; }

  var origNote=window.demoNote, REFRESH_MS=30*60*1000, STALE_MS=3*24*60*60*1000, info=null;

  function en(){ return S.lang==="en"; }
  function anyReal(){ return CROPS.some(function(c){ var p=S.prices[c.key]; return p&&p.real; }); }

  /* the yellow note: honest "live" label when real prices are loaded, otherwise the old demo note */
  window.demoNote=function(kind){
    if(kind==="forecast"||!anyReal()) return origNote.apply(this,arguments);
    var d=info&&info.date?info.date:"";
    var txt=en()
      ? "📡 Live mandi prices (Agmarknet / data.gov.in)"+(d?" · latest data: "+d:"")+" · median of reporting mandis"
      : "📡 असली मंडी भाव (Agmarknet / data.gov.in)"+(d?" · ताज़ा डेटा: "+d:"")+" · मंडियों का मध्य भाव";
    return '<div style="margin:6px 0"><span class="tag green" style="white-space:normal;border-radius:12px;line-height:1.4">'+esc(txt)+'</span></div>';
  };

  function token(){ try{ return localStorage.getItem("krishi_token"); }catch(e){ return null; } }
  function stateName(){
    var v=String((S.me&&S.me.village)||"Uttar Pradesh").split(",");
    return (v[1]||v[0]||"Uttar Pradesh").trim();
  }

  function apply(data, source){
    var now=Date.now(), latest="";
    if(!S.realHist) S.realHist={};
    CROPS.forEach(function(c){
      var r=data[c.key], p=S.prices[c.key]; if(!r||!p) return;
      var h=S.realHist[c.key]||(S.realHist[c.key]=[]);
      if(!h.length||h[h.length-1].date!==r.date) h.push({date:r.date,modal:r.modal});
      else h[h.length-1].modal=r.modal;
      if(h.length>14) h.shift();
      var series=h.map(function(x){ return x.modal; });
      if(series.length<2) series=[r.modal,r.modal];
      p.now=r.modal; p.hist=series; p.real=true; p.realAt=now; p.src=r;
      if(r.date>latest) latest=r.date;
    });
    info={date:latest, source:source};
    labels(true);
  }
  function labels(real){
    try{
      if(real){ STR.hi.mandi_live="मंडी भाव (असली)"; STR.en.mandi_live="Mandi rate (live)"; }
      else { STR.hi.mandi_live="डेमो मंडी भाव"; STR.en.mandi_live="Demo mandi rate"; }
    }catch(e){}
  }

  function expireOld(){
    var changed=false, now=Date.now();
    CROPS.forEach(function(c){
      var p=S.prices[c.key];
      if(p&&p.real&&(!p.realAt||now-p.realAt>STALE_MS)){ p.real=false; changed=true; }
    });
    if(changed&&!anyReal()) labels(false);
    return changed;
  }

  function load(){
    if(typeof fetch!=="function") return Promise.resolve();
    var base=(window.KrishiAPI&&window.KrishiAPI.baseUrl)||window.location.origin, tk=token();
    var ctrl=new AbortController(), timer=setTimeout(function(){ ctrl.abort(); },25000);
    return fetch(base+"/api/mandi/prices?state="+encodeURIComponent(stateName()),{
      headers:tk?{"Authorization":"Bearer "+tk}:{}, signal:ctrl.signal
    }).then(function(r){ return r.json(); }).then(function(j){
      clearTimeout(timer);
      if(j&&j.success&&j.data){ apply(j.data,j.source); save(); }
      else if(expireOld()) save();
    }).catch(function(){ clearTimeout(timer); if(expireOld()) save(); }).then(function(){
      var busy=false; try{ busy=(typeof uiBusy==="function")&&uiBusy(); }catch(e){}
      if(busy) refreshMandi(); else { try{ render(); }catch(e){} }
    });
  }

  if(anyReal()) labels(true);
  load();
  setInterval(load,REFRESH_MS);
  window.KrishiMandiLive={reload:load};
})();
