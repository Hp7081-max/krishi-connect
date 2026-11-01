/* Krishi Connect — real AI crop-disease check, v2 (higher accuracy).
   Load AFTER the main app script and voice.js:  <script src="disease-ai.js"></script>
   Needs routes/diseaseAI.js (v2) mounted at /api/disease-ai and GEMINI_API_KEY on Render.

   New in v2:
   - up to 3 photos per scan (close-up leaf + whole plant + affected area)
   - photo-quality check (too dark / too bright / blurry) before anything is sent
   - farmer context sent to the AI: crop stage, since when, how widely spread, recent spray, month, region
   - "not sure" handling: low confidence shows a clear message + which extra photo to take
   - shows the evidence the AI saw and other possible causes (not just one name)
   - Correct / Wrong feedback button (this slowly builds your own test set)
   If anything the app provides is missing, this file does nothing and the old behaviour stays. */
(function(){
  "use strict";
  if(window.KrishiDiseaseAI) return;
  var miss=[];
  if(typeof S==="undefined"||!S) miss.push("S");
  if(typeof STR==="undefined") miss.push("STR");
  if(typeof t!=="function") miss.push("t");
  if(typeof toast!=="function") miss.push("toast");
  if(typeof $!=="function") miss.push("$");
  if(typeof esc!=="function") miss.push("esc");
  if(typeof save!=="function") miss.push("save");
  if(typeof demoNote!=="function") miss.push("demoNote");
  if(typeof runDiseaseScan!=="function") miss.push("runDiseaseScan");
  if(miss.length){ console.warn("[disease-ai.js] not started — missing in app:",miss.join(", ")); return; }

  var origNote=window.demoNote;

  /* ---- tunable settings ---- */
  var MAX_PHOTOS=3;      // photos per scan
  var MAX_SIDE=1280;     // longest side sent to the AI (px). Bigger = more detail, slower upload
  var JPEG_Q=0.88;
  var LOW_CONF=60;       // below this %, the result is shown as "not sure"
  var BLUR_MIN=25;       // sharpness score below this = blurry   (tune with real phone photos)
  var DARK_MAX=35;       // average brightness below this = too dark
  var BRIGHT_MAX=240;    // average brightness above this = washed out

  var picked=[];         // photos chosen so far
  var fresh=false;       // true -> the next pick starts a new set of photos
  var lastScan=null;     // last result, used for feedback

  function isEn(){ return S.lang==="en"; }
  function L(hi,en){ return isEn()?en:hi; }

  /* labels: the page no longer says "demo" */
  try{
    STR.hi.tool_disease="रोग पहचान (AI)"; STR.hi.dz_title="रोग पहचान (AI)"; STR.hi.dz_scanning="AI फोटो देख रहा है…";
    STR.en.tool_disease="Disease detector (AI)"; STR.en.dz_title="Disease detector (AI)"; STR.en.dz_scanning="AI is looking at the photo…";
    ["mr","pa"].forEach(function(k){ if(STR[k]){ delete STR[k].tool_disease; delete STR[k].dz_title; delete STR[k].dz_scanning; } });
  }catch(e){}

  /* the yellow note above the scan box: honest AI note instead of "random sample" */
  window.demoNote=function(kind){
    if(kind!=="scan") return origNote.apply(this,arguments);
    var txt=L("🤖 AI का अनुमान है, पक्की जाँच नहीं। दवा छिड़कने से पहले अपने KVK / कृषि अधिकारी से पूछ लें।",
              "🤖 This is an AI estimate, not a lab test. Check with your local KVK / agriculture officer before spraying anything.");
    return '<div style="margin:6px 0"><span class="tag gold" style="white-space:normal;border-radius:12px;line-height:1.4">'+esc(txt)+'</span></div>';
  };

  /* ---------- photo preparation + quality check ---------- */

  /* sharpness (variance of Laplacian) and average brightness on a small copy of the photo */
  function quality(src){
    var s=Math.min(1,320/Math.max(src.width,src.height));
    var w=Math.max(3,Math.round(src.width*s)), h=Math.max(3,Math.round(src.height*s));
    var c=document.createElement("canvas"); c.width=w; c.height=h;
    var cx=c.getContext("2d"); cx.drawImage(src,0,0,w,h);
    var d=cx.getImageData(0,0,w,h).data, g=new Float32Array(w*h), sum=0, i, x, y, v, n=0, m=0, m2=0;
    for(i=0;i<w*h;i++){ g[i]=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2]; sum+=g[i]; }
    for(y=1;y<h-1;y++){
      for(x=1;x<w-1;x++){
        i=y*w+x; v=4*g[i]-g[i-1]-g[i+1]-g[i-w]-g[i+w];
        n++; m+=v; m2+=v*v;
      }
    }
    var mean=m/n;
    return {blur:m2/n-mean*mean, bright:sum/(w*h)};
  }

  /* -> {data: big JPEG for the AI, thumb: small JPEG for feedback, blur, bright} */
  function prepare(file){
    return new Promise(function(resolve,reject){
      var url=URL.createObjectURL(file), img=new Image();
      img.onload=function(){
        try{
          var s=Math.min(1,MAX_SIDE/Math.max(img.width,img.height)), c=document.createElement("canvas");
          c.width=Math.max(1,Math.round(img.width*s)); c.height=Math.max(1,Math.round(img.height*s));
          c.getContext("2d").drawImage(img,0,0,c.width,c.height);
          var q=quality(c), big=c.toDataURL("image/jpeg",JPEG_Q);
          var ts=Math.min(1,480/Math.max(c.width,c.height)), tc=document.createElement("canvas");
          tc.width=Math.max(1,Math.round(c.width*ts)); tc.height=Math.max(1,Math.round(c.height*ts));
          tc.getContext("2d").drawImage(c,0,0,tc.width,tc.height);
          URL.revokeObjectURL(url);
          resolve({data:big,thumb:tc.toDataURL("image/jpeg",0.7),blur:q.blur,bright:q.bright});
        }catch(e){ URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror=function(){ URL.revokeObjectURL(url); reject(new Error(L("यह फोटो खुल नहीं पाई।","This photo could not be opened."))); };
      img.src=url;
    });
  }

  function qIssue(p){
    if(p.bright<DARK_MAX) return "dark";
    if(p.bright>BRIGHT_MAX) return "bright";
    if(p.blur<BLUR_MIN) return "blur";
    return "";
  }

  /* ---------- server calls ---------- */

  function callApi(path,body,ms){
    var base=(window.KrishiAPI&&window.KrishiAPI.baseUrl)||window.location.origin;
    var token=null; try{ token=localStorage.getItem("krishi_token"); }catch(e){}
    var ctrl=new AbortController(), timer=setTimeout(function(){ ctrl.abort(); },ms||60000);
    return fetch(base+path,{
      method:"POST",
      headers:Object.assign({"Content-Type":"application/json"},token?{"Authorization":"Bearer "+token}:{}),
      body:JSON.stringify(body),
      signal:ctrl.signal
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        clearTimeout(timer);
        if(!r.ok||!j.success) throw new Error(j.message||L("जाँच नहीं हो पाई। दोबारा कोशिश करें।","Scan failed. Please try again."));
        return j.data===undefined?{}:j.data;
      });
    },function(e){
      clearTimeout(timer);
      throw new Error(e&&e.name==="AbortError"?L("AI को बहुत देर लगी। दोबारा कोशिश करें।","The AI took too long. Please try again."):L("इंटरनेट या सर्वर की दिक्कत। दोबारा कोशिश करें।","Network or server problem. Please try again."));
    });
  }

  /* ---------- extra inputs (injected above the scan button) ---------- */

  var FIELD="width:100%;padding:8px 10px;border:1px solid rgba(128,128,128,.45);border-radius:10px;background:transparent;color:inherit;font:inherit;box-sizing:border-box";

  function sel(id,opts){
    return '<select id="'+id+'" style="'+FIELD+'">'+opts.map(function(o){
      return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>';
    }).join("")+'</select>';
  }

  function ctxHTML(){
    return '<div class="tiny muted" style="line-height:1.4">'+esc(L(
        "📸 बेहतर नतीजे के लिए 2-3 फोटो लें: (1) पत्ती की पास से फोटो, (2) पूरा पौधा, (3) जहाँ सबसे ज़्यादा असर है। दिन की रोशनी में, कैमरा स्थिर रखकर।",
        "📸 For better results take 2-3 photos: (1) close-up of the leaf, (2) the whole plant, (3) the worst-affected part. Use daylight and hold the camera steady."))
      +'</div>'
      +'<div id="dzPickInfo" class="tiny"></div>'
      +sel("dzStage",[["",L("फसल की अवस्था (चुनें)","Crop stage (optional)")],["seedling",L("अंकुर / छोटा पौधा","Seedling / young")],["vegetative",L("बढ़वार","Vegetative growth")],["flowering",L("फूल आने का समय","Flowering")],["fruiting",L("फल / दाना बनना","Fruit / grain filling")],["harvest",L("कटाई के पास","Near harvest")]])
      +sel("dzSince",[["",L("दिक्कत कब से है? (चुनें)","Since when? (optional)")],["lt3",L("3 दिन से कम","Less than 3 days")],["d3_7",L("3 से 7 दिन","3 to 7 days")],["gt7",L("एक हफ़्ते से ज़्यादा","More than a week")]])
      +sel("dzSpread",[["",L("कितना फैला है? (चुनें)","How widespread? (optional)")],["few",L("कुछ ही पौधे","A few plants")],["part",L("खेत का एक हिस्सा","One part of the field")],["most",L("ज़्यादातर खेत","Most of the field")]])
      +'<input id="dzSpray" type="text" maxlength="100" placeholder="'+esc(L("हाल में कौन सी दवा/खाद डाली? (चुनें)","Recent spray / fertiliser? (optional)"))+'" style="'+FIELD+'">';
  }

  function ensureUI(){
    try{
      var input=$("#dzPhoto"), btn=$("#dzScanBtn");
      if(!input||!btn||!btn.parentNode) return;
      input.multiple=true;
      if(!input.dataset.dzBound){ input.dataset.dzBound="1"; input.addEventListener("change",onPick); }
      var old=document.getElementById("dzCtxBox");
      if(old&&old.dataset.lang===S.lang) return;
      if(old&&old.parentNode) old.parentNode.removeChild(old);
      var box=document.createElement("div");
      box.id="dzCtxBox"; box.dataset.lang=S.lang;
      box.style.cssText="margin:10px 0;display:grid;gap:8px";
      box.innerHTML=ctxHTML();
      btn.parentNode.insertBefore(box,btn);
      updateInfo();
    }catch(e){ console.warn("[disease-ai.js] UI:",e); }
  }

  function same(a,b){ return a.name===b.name&&a.size===b.size&&a.lastModified===b.lastModified; }

  function onPick(ev){
    var input=ev.target, fl=Array.prototype.slice.call((input&&input.files)||[]), skipped=0;
    if(fresh){ picked=[]; fresh=false; }
    fl.forEach(function(f){
      if(picked.some(function(p){ return same(p,f); })) return;
      if(picked.length>=MAX_PHOTOS){ skipped++; return; }
      picked.push(f);
    });
    if(skipped) toast(L("सिर्फ़ "+MAX_PHOTOS+" फोटो ली जाएँगी।","Only "+MAX_PHOTOS+" photos are used."));
    updateInfo();
  }

  function clearPicked(){ picked=[]; fresh=false; updateInfo(); }

  function updateInfo(){
    var el=document.getElementById("dzPickInfo"); if(!el) return;
    var txt=L("चुनी हुई फोटो: ","Photos selected: ")+picked.length+"/"+MAX_PHOTOS;
    el.innerHTML=esc(txt)+(picked.length?' · <a href="#" onclick="KrishiDiseaseAI.clear();return false;">'+esc(L("हटाएँ","Clear"))+'</a>':"");
  }

  function getCtx(){
    function v(id){ var e=document.getElementById(id); return e?String(e.value||"").trim():""; }
    var u={}; try{ u=S.user||S.profile||S.me||{}; }catch(e){}
    return {stage:v("dzStage"),since:v("dzSince"),spread:v("dzSpread"),spray:v("dzSpray"),
            month:new Date().getMonth()+1,state:u.state||"",district:u.district||u.village||""};
  }

  /* ---------- result screen ---------- */

  function list(items){
    return '<ul style="margin:4px 0 0;padding-left:18px">'+items.map(function(x){ return "<li>"+esc(x)+"</li>"; }).join("")+"</ul>";
  }

  function arr(v){ return Array.isArray(v)?v:[]; }

  function normalize(d){
    d=d||{};
    d.treatment=arr(d.treatment); d.prevention=arr(d.prevention);
    d.evidence=arr(d.evidence); d.alternatives=arr(d.alternatives);
    d.confidence=Math.max(0,Math.min(100,Math.round(Number(d.confidence)||0)));
    return d;
  }

  function resultHTML(d,skippedBad){
    var low=d.status!=="healthy"&&(d.status==="unclear"||d.confidence<LOW_CONF);
    var cls=d.status==="healthy"?"alert good":(d.status==="unclear"?"alert":"alert down");
    var ic={healthy:"🌿",disease:"🦠",pest:"🐛",nutrient:"🧪",stress:"🌡️",unclear:"❓"}[d.status]||"🔬";
    var sev={low:L("हल्का","Mild"),medium:L("मध्यम","Moderate"),high:L("गंभीर","Serious")}[d.severity]||"";
    var title=(low&&d.status!=="unclear"?L("संभावित: ","Possibly: "):"")+d.name;
    var html='<div class="'+cls+'"><span class="ic">'+ic+'</span><span>'
      +'<b>'+esc(t("dz_result"))+": "+esc(title)+'</b>'
      +'<div style="margin:6px 0;display:flex;gap:6px;flex-wrap:wrap">'
      +(d.status!=="unclear"?'<span class="tag">'+esc(t("dz_confidence"))+": "+d.confidence+'%</span>':"")
      +(sev&&d.status!=="healthy"?'<span class="tag '+(d.severity==="high"?"red":"gold")+'">'+esc(sev)+'</span>':"")
      +'</div>';
    if(!d.isPlant) html+='<p>'+esc(L("यह फोटो पौधे की नहीं लग रही। पत्ती या फसल की साफ़ फोटो लें।","This does not look like a plant photo. Take a clear photo of the leaf or crop."))+'</p>';
    if(d.isPlant&&!d.cropMatches) html+='<p><b>⚠️ '+esc(L("फोटो आपकी चुनी फसल से अलग लग रही है","The photo looks different from the crop you picked"))+(d.cropSeen?": "+esc(d.cropSeen):"")+'</b></p>';
    if(d.isPlant&&low){
      html+='<p><b>🔎 '+esc(L("AI को पक्का भरोसा नहीं है।","The AI is not fully sure."))+'</b> '
        +esc(d.photoTip||L("एक और साफ़ फोटो जोड़कर दोबारा जाँचें।","Add one more clear photo and scan again."))+'</p>';
    }else if(d.needMorePhotos&&d.photoTip){
      html+='<p>📸 '+esc(d.photoTip)+'</p>';
    }
    if(d.whatISee) html+='<p>'+esc(d.whatISee)+'</p>';
    if(d.evidence.length) html+='<p><b>'+esc(L("फोटो में क्या दिखा","What the AI saw"))+':</b>'+list(d.evidence)+'</p>';
    if(d.alternatives.length&&d.status!=="healthy"){
      html+='<p><b>'+esc(L("और कौन सी वजह हो सकती है","Other possible causes"))+':</b>'
        +list(d.alternatives.map(function(a){ return a.name+(a.confidence?" ("+a.confidence+"%)":""); }))+'</p>';
    }
    if(d.treatment.length) html+='<p><b>'+esc(t("dz_advice"))+':</b>'+list(d.treatment)+'</p>';
    if(d.prevention.length) html+='<p><b>'+esc(L("आगे बचाव","Prevention"))+':</b>'+list(d.prevention)+'</p>';
    if(d.seeExpert) html+='<p><b>👨‍🌾 '+esc(L("पक्का पता करने के लिए अपने KVK / कृषि अधिकारी को फसल दिखाएँ।","Show the crop to your local KVK / agriculture officer to be sure."))+'</b></p>';
    if(skippedBad>0) html+='<p class="tiny muted">'+esc(L(skippedBad+" धुंधली/अँधेरी फोटो छोड़ दी गई।",skippedBad+" blurry or dark photo(s) were skipped."))+'</p>';
    html+='<p class="tiny muted">'+esc(L("दवा की मात्रा हमेशा दवा के लेबल के हिसाब से ही रखें।","Always follow the dose printed on the product label."))+'</p>';
    if(d.isPlant){
      var b='margin:0 6px 0 0;padding:6px 12px;border:1px solid rgba(128,128,128,.5);border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer';
      html+='<div id="dzFb" style="margin-top:8px"><span class="tiny muted" style="margin-right:6px">'+esc(L("क्या यह जाँच सही थी?","Was this scan right?"))+'</span>'
        +'<button type="button" style="'+b+'" onclick="KrishiDiseaseAI.feedback(\'correct\')">✅ '+esc(L("सही","Right"))+'</button>'
        +'<button type="button" style="'+b+'" onclick="KrishiDiseaseAI.feedback(\'wrong\')">❌ '+esc(L("गलत","Wrong"))+'</button>'
        +'<div class="tiny muted" style="margin-top:4px">'+esc(L("फीडबैक देने पर फोटो हमारे AI को सुधारने के लिए सेव हो सकती है।","If you send feedback, the photo may be saved to improve our AI."))+'</div></div>';
    }
    return html+'</span></div>';
  }

  function errorHTML(msg){
    return '<div class="alert down"><span class="ic">⚠️</span><span><b>'+esc(msg)+'</b></span></div>';
  }

  function qualityHTML(issues){
    var k={}, msgs=[];
    issues.forEach(function(x){ if(x) k[x]=1; });
    if(k.dark) msgs.push(L("फोटो बहुत अँधेरी है","The photo is too dark"));
    if(k.bright) msgs.push(L("फोटो में बहुत ज़्यादा रोशनी है","The photo is too bright"));
    if(k.blur) msgs.push(L("फोटो धुंधली है","The photo is blurry"));
    var bs='margin-top:6px;padding:7px 14px;border:1px solid rgba(128,128,128,.5);border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer';
    return '<div class="alert"><span class="ic">📷</span><span><b>'+esc(L("फोटो साफ़ नहीं है","The photo is not clear enough"))+'</b>'
      +'<p>'+esc(msgs.join(" · "))+'</p>'
      +'<p>'+esc(L("दिन की रोशनी में, पत्ती के पास से, कैमरा स्थिर रखकर दोबारा फोटो लें।","Retake it in daylight, close to the leaf, holding the camera steady."))+'</p>'
      +'<button type="button" style="'+bs+'" onclick="KrishiDiseaseAI.run({force:true})">'+esc(L("फिर भी जाँचें","Scan anyway"))+'</button>'
      +'</span></div>';
  }

  /* ---------- main scan ---------- */

  function run(opts){
    var force=!!(opts&&opts.force===true);
    var input=$("#dzPhoto");
    var files=picked.length?picked.slice():Array.prototype.slice.call((input&&input.files)||[],0,MAX_PHOTOS);
    if(!files.length){ toast(t("dz_need_photo")); return Promise.resolve(); }
    var crop=$("#dzCrop"), cropKey=crop?crop.value:"", cropName="";
    try{ cropName=crop.options[crop.selectedIndex].text; }catch(e){}
    var btn=$("#dzScanBtn"), box=$("#dzResult"), skippedBad=0, thumb="";
    if(btn) btn.setAttribute("disabled","true");
    if(box) box.innerHTML='<div class="alert"><span class="ic">🔬</span><span><b>'+esc(t("dz_scanning"))+'</b></span></div>';
    return Promise.all(files.map(prepare)).then(function(ps){
      var good=ps.filter(function(p){ return !qIssue(p); });
      if(!force&&!good.length){ var e=new Error("quality"); e.quality=ps.map(qIssue); throw e; }
      var use=force?ps:good;
      skippedBad=ps.length-use.length;
      thumb=use[0].thumb;
      return callApi("/api/disease-ai",{
        cropKey:cropKey,cropName:cropName,
        image:use[0].data,
        images:use.map(function(p){ return p.data; }),
        lang:S.lang,ctx:getCtx()
      },60000);
    }).then(function(d){
      d=normalize(d);
      var prev=$("#dzPrev"), thumbUrl=(prev&&prev.dataset.url)||"";
      if(d.isPlant&&S.tools&&S.tools.scans){
        S.tools.scans.unshift({cropKey:cropKey,name:d.name,advice:d.treatment.join(" • "),conf:d.confidence,photo:thumbUrl,when:Date.now(),ai:true});
        S.tools.scans=S.tools.scans.slice(0,20);
        save();
      }
      lastScan={id:d.scanId||"",thumb:thumb,name:d.name,conf:d.confidence,status:d.status,cropKey:cropKey,lang:S.lang,sent:false};
      /* if the AI is unsure, keep the photos so the farmer can ADD one more and scan again */
      fresh=!(d.status==="unclear"||d.needMorePhotos||d.confidence<LOW_CONF);
      var b=$("#dzResult"); if(b) b.innerHTML=resultHTML(d,skippedBad);
    }).catch(function(e){
      var b=$("#dzResult");
      if(e&&e.quality){ fresh=true; if(b) b.innerHTML=qualityHTML(e.quality); }
      else if(b) b.innerHTML=errorHTML(e&&e.message||L("जाँच नहीं हो पाई।","Scan failed."));
    }).then(function(){
      var b=$("#dzScanBtn"); if(b) b.removeAttribute("disabled");
    });
  }

  function sendFeedback(verdict){
    if(!lastScan||lastScan.sent) return;
    var corrected="";
    if(verdict==="wrong"){
      corrected=window.prompt(L("सही बीमारी / समस्या क्या थी? (पता न हो तो खाली छोड़ें)","What was the correct problem? (leave blank if unknown)"),"")||"";
    }
    lastScan.sent=true;
    var fb=document.getElementById("dzFb");
    if(fb) fb.innerHTML='<span class="tiny muted">'+esc(L("धन्यवाद! आपका फीडबैक मिल गया।","Thanks! Feedback received."))+'</span>';
    callApi("/api/disease-ai/feedback",{
      scanId:lastScan.id,verdict:verdict,correctedName:corrected,
      aiName:lastScan.name,aiStatus:lastScan.status,aiConfidence:lastScan.conf,
      cropKey:lastScan.cropKey,lang:lastScan.lang,thumb:lastScan.thumb
    },20000).catch(function(){ /* feedback is best-effort */ });
  }

  window.runDiseaseScan=function(opts){ return run(opts); };
  window.KrishiDiseaseAI={run:run,feedback:sendFeedback,clear:clearPicked};

  /* the scan tool page may be drawn later by the app, so keep checking that our extra inputs exist */
  var pending=false;
  function schedule(){ if(pending) return; pending=true; setTimeout(function(){ pending=false; ensureUI(); },150); }
  function start(){
    ensureUI();
    try{ new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true}); }catch(e){}
  }
  if(document.body) start(); else document.addEventListener("DOMContentLoaded",start);
})();
