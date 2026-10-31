/* Krishi Connect — real AI crop-disease check (replaces the random "demo" scan).
   Load AFTER the main app script and voice.js:  <script src="disease-ai.js"></script>
   Needs the server route /api/disease-ai (routes/diseaseAI.js) and GEMINI_API_KEY on Render.
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

  /* shrink the photo to ~1024px JPEG (small upload, but big enough for the AI to see spots) */
  function shrink(file,max){
    return new Promise(function(resolve,reject){
      var url=URL.createObjectURL(file), img=new Image();
      img.onload=function(){
        try{
          var s=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement("canvas");
          c.width=Math.max(1,Math.round(img.width*s)); c.height=Math.max(1,Math.round(img.height*s));
          c.getContext("2d").drawImage(img,0,0,c.width,c.height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg",0.85));
        }catch(e){ reject(e); }
      };
      img.onerror=function(){ URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src=url;
    });
  }

  function callServer(body){
    var base=(window.KrishiAPI&&window.KrishiAPI.baseUrl)||window.location.origin;
    var token=null; try{ token=localStorage.getItem("krishi_token"); }catch(e){}
    var ctrl=new AbortController(), timer=setTimeout(function(){ ctrl.abort(); },60000);
    return fetch(base+"/api/disease-ai",{
      method:"POST",
      headers:Object.assign({"Content-Type":"application/json"},token?{"Authorization":"Bearer "+token}:{}),
      body:JSON.stringify(body),
      signal:ctrl.signal
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        clearTimeout(timer);
        if(!r.ok||!j.success) throw new Error(j.message||L("जाँच नहीं हो पाई। दोबारा कोशिश करें।","Scan failed. Please try again."));
        return j.data;
      });
    },function(e){
      clearTimeout(timer);
      throw new Error(e&&e.name==="AbortError"?L("AI को बहुत देर लगी। दोबारा कोशिश करें।","The AI took too long. Please try again."):L("इंटरनेट या सर्वर की दिक्कत। दोबारा कोशिश करें।","Network or server problem. Please try again."));
    });
  }

  function list(items){
    return '<ul style="margin:4px 0 0;padding-left:18px">'+items.map(function(x){ return "<li>"+esc(x)+"</li>"; }).join("")+"</ul>";
  }

  function resultHTML(d,cropKey){
    var cls=d.status==="healthy"?"alert good":(d.status==="unclear"?"alert":"alert down");
    var ic={healthy:"🌿",disease:"🦠",pest:"🐛",nutrient:"🧪",unclear:"❓"}[d.status]||"🔬";
    var sev={low:L("हल्का","Mild"),medium:L("मध्यम","Moderate"),high:L("गंभीर","Serious")}[d.severity]||"";
    var html='<div class="'+cls+'"><span class="ic">'+ic+'</span><span>'
      +'<b>'+esc(t("dz_result"))+": "+esc(d.name)+'</b>'
      +'<div style="margin:6px 0;display:flex;gap:6px;flex-wrap:wrap">'
      +(d.status!=="unclear"?'<span class="tag">'+esc(t("dz_confidence"))+": "+d.confidence+'%</span>':"")
      +(sev&&d.status!=="healthy"?'<span class="tag '+(d.severity==="high"?"red":"gold")+'">'+esc(sev)+'</span>':"")
      +'</div>';
    if(!d.isPlant) html+='<p>'+esc(L("यह फोटो पौधे की नहीं लग रही। पत्ती या फसल की साफ़ फोटो लें।","This does not look like a plant photo. Take a clear photo of the leaf or crop."))+'</p>';
    if(d.isPlant&&!d.cropMatches) html+='<p><b>⚠️ '+esc(L("फोटो आपकी चुनी फसल से अलग लग रही है","The photo looks different from the crop you picked"))+(d.cropSeen?": "+esc(d.cropSeen):"")+'</b></p>';
    if(d.whatISee) html+='<p>'+esc(d.whatISee)+'</p>';
    if(d.treatment.length) html+='<p><b>'+esc(t("dz_advice"))+':</b>'+list(d.treatment)+'</p>';
    if(d.prevention.length) html+='<p><b>'+esc(L("आगे बचाव","Prevention"))+':</b>'+list(d.prevention)+'</p>';
    if(d.seeExpert) html+='<p><b>👨‍🌾 '+esc(L("पक्का पता करने के लिए अपने KVK / कृषि अधिकारी को फसल दिखाएँ।","Show the crop to your local KVK / agriculture officer to be sure."))+'</b></p>';
    html+='<p class="tiny muted">'+esc(L("दवा की मात्रा हमेशा दवा के लेबल के हिसाब से ही रखें।","Always follow the dose printed on the product label."))+'</p>';
    return html+'</span></div>';
  }

  function errorHTML(msg){
    return '<div class="alert down"><span class="ic">⚠️</span><span><b>'+esc(msg)+'</b></span></div>';
  }

  window.runDiseaseScan=function(){
    var input=$("#dzPhoto"), file=input&&input.files&&input.files[0];
    if(!file){ toast(t("dz_need_photo")); return Promise.resolve(); }
    var cropKey=$("#dzCrop").value, btn=$("#dzScanBtn"), box=$("#dzResult");
    if(btn) btn.setAttribute("disabled","true");
    if(box) box.innerHTML='<div class="alert"><span class="ic">🔬</span><span><b>'+esc(t("dz_scanning"))+'</b></span></div>';
    return shrink(file,1024).then(function(big){
      return callServer({cropKey:cropKey,image:big,lang:S.lang});
    }).then(function(d){
      var prev=$("#dzPrev"), thumb=(prev&&prev.dataset.url)||"";
      if(d.isPlant){
        S.tools.scans.unshift({cropKey:cropKey,name:d.name,advice:d.treatment.join(" • "),conf:d.confidence,photo:thumb,when:Date.now(),ai:true});
        S.tools.scans=S.tools.scans.slice(0,20);
        save();
      }
      var b=$("#dzResult"); if(b) b.innerHTML=resultHTML(d,cropKey);
    }).catch(function(e){
      var b=$("#dzResult"); if(b) b.innerHTML=errorHTML(e&&e.message||L("जाँच नहीं हो पाई।","Scan failed."));
    }).then(function(){
      var b=$("#dzScanBtn"); if(b) b.removeAttribute("disabled");
    });
  };

  window.KrishiDiseaseAI={run:window.runDiseaseScan};
})();
