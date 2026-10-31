/* Krishi Connect — free voice control (browser Web Speech API, no API key, no cost).
   Load AFTER the main app script:  <script src="/voice.js"></script>
   Whatever you can TAP you can also SAY. Money actions (accept bid, withdraw…) are deliberately not voice-triggered. */
(function(){
  "use strict";
  if(window.KrishiVoice) return;
  /* safety check: if the app's internals are missing, do nothing instead of breaking the page */
  var miss=[];
  if(typeof S==="undefined") miss.push("S");
  if(typeof TABS==="undefined") miss.push("TABS");
  if(typeof CROPS==="undefined") miss.push("CROPS");
  if(typeof t!=="function") miss.push("t");
  if(typeof toast!=="function") miss.push("toast");
  if(typeof $!=="function") miss.push("$");
  if(typeof esc!=="function") miss.push("esc");
  if(typeof inr!=="function") miss.push("inr");
  if(typeof cropName!=="function") miss.push("cropName");
  if(typeof closeModal!=="function") miss.push("closeModal");
  if(typeof STR==="undefined") miss.push("STR");
  if(miss.length){ console.warn("[voice.js] not started — missing in app:",miss.join(", ")); return; }

  /* nicer caption under the home mic (all 4 languages) */
  try{
    STR.hi.mic_b="बोलकर चलाएँ"; STR.hi.mic_s="जैसे — “मौसम खोलो”, “टमाटर का भाव”";
    STR.en.mic_b="Control by voice"; STR.en.mic_s="Try — “weather”, “tomato rate”";
    if(STR.mr){ STR.mr.mic_b="बोलून चालवा"; STR.mr.mic_s="उदा. — “हवामान”, “टोमॅटोचा भाव”"; }
    if(STR.pa){ STR.pa.mic_b="ਬੋਲ ਕੇ ਚਲਾਓ"; STR.pa.mic_s="ਜਿਵੇਂ — “ਮੌਸਮ”, “ਟਮਾਟਰ ਦਾ ਭਾਅ”"; }
  }catch(e){}

  var st=document.createElement("style");
  st.textContent=`/* ---- global voice control ---- */
.kv-fab{position:fixed;right:14px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:95;width:58px;height:58px;border-radius:50%;
  border:0;cursor:pointer;background:var(--marigold);color:#16261D;font-size:26px;display:grid;place-items:center;
  box-shadow:0 6px 18px rgba(0,0,0,.30);touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.kv-fab:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
.kv-fab.live{animation:pulse 1.3s infinite}
@media(prefers-reduced-motion:reduce){.kv-fab.live{animation:none;outline:3px solid var(--marigold);outline-offset:3px}}
body:has(#scrim.on) .kv-fab{bottom:auto;top:70px}
.kv-cap{position:fixed;right:14px;bottom:calc(162px + env(safe-area-inset-bottom,0px));z-index:95;max-width:min(78vw,320px);
  background:#16261D;color:#EFF2EA;padding:8px 12px;border-radius:14px;font-size:13px;display:none;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.kv-cap.on{display:block}
.kv-sheet{position:fixed;inset:0;z-index:94;background:rgba(12,18,14,.55);display:flex;align-items:flex-start;justify-content:center}
body:has(.kv-sheet) .kv-fab{top:auto;bottom:calc(96px + env(safe-area-inset-bottom,0px))}
.kv-card{background:var(--card);color:var(--ink);width:min(520px,100%);border-radius:0 0 18px 18px;padding:calc(16px + env(safe-area-inset-top,0px)) 18px 16px;
  max-height:calc(100vh - 190px);overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.kv-card b{font-size:17px}
.kv-card p{margin:10px 0 6px;font-size:14px;line-height:1.6}
.kv-card ul{margin:6px 0 12px;padding-left:20px;font-size:14px;line-height:1.8}
.kv-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;font-size:14px}
.kv-row button,.kv-x{border:1px solid var(--line);background:transparent;color:inherit;border-radius:999px;padding:6px 14px;cursor:pointer;font-size:14px}
.kv-x{width:100%;margin-top:6px;padding:10px;background:var(--marigold);color:#16261D;border:0;font-weight:700}`;
  document.head.appendChild(st);

window.KrishiVoice=(function(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const LANG={hi:"hi-IN",en:"en-IN",mr:"mr-IN",pa:"pa-IN"};
  let rec=null, fab=null, cap=null, sheet=null, muted=false;
  try{ muted = localStorage.getItem("kv_mute")==="1"; }catch(e){}

  /* ---- small messages (4 languages) ---- */
  const MSG={
    hi:{tap:"बोलकर चलाएँ", no:"समझ नहीं आया — “मदद” बोलकर देखें", open:l=>`${l} खोल रहे हैं`,
        nosup:"इस ब्राउज़र में आवाज़ नहीं चलती — Chrome में खोलें", denied:"माइक की अनुमति दें (एड्रेस बार के 🔒 पर टैप करें)",
        silence:"कुछ सुनाई नहीं दिया — माइक दबाकर फिर बोलें", net:"आवाज़ पहचान के लिए इंटरनेट चाहिए",
        https:"माइक के लिए सुरक्षित (HTTPS) लिंक चाहिए", nothere:"यह विकल्प इस पैनल में नहीं है",
        done:l=>`ठीक है: ${l}`, price:(n,a)=>`${n} ${a} रुपये प्रति क्विंटल`,
        helpT:"आप ये बोल सकते हैं", speakOn:"आवाज़ में जवाब", on:"चालू", off:"बंद", close:"बंद करें"},
    en:{tap:"Control by voice", no:"Didn't catch that — say “help”", open:l=>`Opening ${l}`,
        nosup:"Voice isn't supported in this browser — open in Chrome", denied:"Please allow the microphone (tap 🔒 in the address bar)",
        silence:"Heard nothing — tap the mic and speak again", net:"Voice recognition needs internet",
        https:"The mic needs a secure (HTTPS) link", nothere:"That isn't available in this panel",
        done:l=>`Done: ${l}`, price:(n,a)=>`${n}: ${a} rupees per quintal`,
        helpT:"You can say", speakOn:"Spoken replies", on:"On", off:"Off", close:"Close"},
    mr:{tap:"बोलून चालवा", no:"समजले नाही — “मदत” म्हणा", open:l=>`${l} उघडत आहे`,
        nosup:"या ब्राउझरमध्ये आवाज चालत नाही — Chrome मध्ये उघडा", denied:"माइकची परवानगी द्या (अ‍ॅड्रेस बारमधील 🔒 वर टॅप करा)",
        silence:"काही ऐकू आले नाही — माइक दाबून पुन्हा बोला", net:"आवाज ओळखण्यासाठी इंटरनेट हवे",
        https:"माइकसाठी सुरक्षित (HTTPS) लिंक हवी", nothere:"हा पर्याय या पॅनलमध्ये नाही",
        done:l=>`ठीक आहे: ${l}`, price:(n,a)=>`${n} ${a} रुपये प्रति क्विंटल`,
        helpT:"तुम्ही हे बोलू शकता", speakOn:"आवाजात उत्तर", on:"चालू", off:"बंद", close:"बंद करा"},
    pa:{tap:"ਬੋਲ ਕੇ ਚਲਾਓ", no:"ਸਮਝ ਨਹੀਂ ਆਇਆ — “ਮਦਦ” ਬੋਲੋ", open:l=>`${l} ਖੋਲ੍ਹ ਰਹੇ ਹਾਂ`,
        nosup:"ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਆਵਾਜ਼ ਨਹੀਂ ਚੱਲਦੀ — Chrome ਵਿੱਚ ਖੋਲ੍ਹੋ", denied:"ਮਾਈਕ ਦੀ ਇਜਾਜ਼ਤ ਦਿਓ (ਐਡਰੈੱਸ ਬਾਰ ਦੇ 🔒 'ਤੇ ਟੈਪ ਕਰੋ)",
        silence:"ਕੁਝ ਸੁਣਾਈ ਨਹੀਂ ਦਿੱਤਾ — ਮਾਈਕ ਦਬਾ ਕੇ ਫਿਰ ਬੋਲੋ", net:"ਆਵਾਜ਼ ਪਛਾਣ ਲਈ ਇੰਟਰਨੈੱਟ ਚਾਹੀਦਾ ਹੈ",
        https:"ਮਾਈਕ ਲਈ ਸੁਰੱਖਿਅਤ (HTTPS) ਲਿੰਕ ਚਾਹੀਦਾ ਹੈ", nothere:"ਇਹ ਵਿਕਲਪ ਇਸ ਪੈਨਲ ਵਿੱਚ ਨਹੀਂ ਹੈ",
        done:l=>`ਠੀਕ ਹੈ: ${l}`, price:(n,a)=>`${n} ${a} ਰੁਪਏ ਪ੍ਰਤੀ ਕੁਇੰਟਲ`,
        helpT:"ਤੁਸੀਂ ਇਹ ਬੋਲ ਸਕਦੇ ਹੋ", speakOn:"ਆਵਾਜ਼ ਵਿੱਚ ਜਵਾਬ", on:"ਚਾਲੂ", off:"ਬੰਦ", close:"ਬੰਦ ਕਰੋ"}
  };
  const m = k => ((MSG[(S&&S.lang)||"hi"]||MSG.hi)[k]) || MSG.hi[k];

  /* ---- text normalising: one spelling for the many ways speech engines write a word ---- */
  const norm = s => (s||"").toLowerCase().normalize("NFD")
      .replace(/[\u093C\u0A3C]/g,"")            /* nukta: ज़→ज, ਸ਼→ਸ */
      .normalize("NFC")
      .replace(/\u0901/g,"\u0902").replace(/\u0A01/g,"\u0A02")   /* chandrabindu → anusvara */
      .replace(/[.,!?;:“”"'‘’()\-–—।|]/g," ").replace(/\s+/g," ").trim();
  /* keyword list → compiled matchers. Latin words match at a word start, Indic words anywhere (inflections) */
  const K = list => list.map(raw=>{
    const n=norm(raw), ascii=/^[\x00-\x7f]+$/.test(n);
    return {n, len:n.length, re: ascii ? new RegExp("(^| )"+n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")) : null};
  });
  const score = (x, kws) => { let b=0; for(const k of kws){ if(k.len<=b) continue; if(k.re ? k.re.test(x) : x.includes(k.n)) b=k.len; } return b; };

  /* ---- vocabulary (Hindi · English · Marathi · Punjabi · Hinglish · Devanagari spellings of English words) ---- */
  const V={
    help:K(["मदद","मदत","ਮਦਦ","help","हेल्प","सहायता","क्या बोल","कमांड","commands","what can i say","madad"]),
    dark:K(["डार्क","dark","अंधेरा","नाइट","night mode","ਡਾਰਕ"]),
    light:K(["लाइट मोड","लाइट","light","उजाला","सफेद","ਲਾਈਟ"]),
    theme:K(["थीम","theme","मोड","mode"]),
    logout:K(["लॉगआउट","लॉग आउट","लोग आउट","लॉगऑफ","logout","log out","sign out","साइन आउट","बाहर निकल","ਲੌਗ ਆਊਟ","ਲਾਗਆਊਟ"]),
    back:K(["बंद","बन्द","क्लोज","close","cancel","कैंसल","रद्द","पीछे","वापस जाओ","वापस जाइए","back","बैक","हटाओ","ਬੰਦ","ਪਿੱਛੇ"]),
    down:K(["नीचे","scroll down","स्क्रॉल डाउन","ਹੇਠਾਂ"]),
    up:K(["ऊपर","scroll up","स्क्रॉल अप","ਉੱਪਰ"]),
    panel:K(["पैनल","पॅनल","पोर्टल","panel","portal","ਪੈਨਲ"]),
    roles:{
      farmer:K(["किसान","शेतकरी","kisan","farmer","ਕਿਸਾਨ"]),
      buyer:K(["खरीदार","खरेदीदार","buyer","बायर","ਖਰੀਦਦਾਰ"]),
      admin:K(["एडमिन","ऐडमिन","admin","ਐਡਮਿਨ"]),
      transport:K(["ट्रांसपोर्ट","ट्रान्सपोर्ट","transport","ਟ੍ਰਾਂਸਪੋਰਟ"])
    },
    lang:{
      hi:K(["हिंदी","हिन्दी","hindi","ਹਿੰਦੀ"]),
      en:K(["अंग्रेजी","अंग्रेज़ी","इंग्लिश","english","ਅੰਗਰੇਜ਼ੀ"]),
      mr:K(["मराठी","marathi","ਮਰਾਠੀ"]),
      pa:K(["पंजाबी","punjabi","ਪੰਜਾਬੀ"])
    }
  };
  /* farmer tool cards (Tools tab) */
  const TOOLS=[
    {act:"opendisease", lab:"tool_disease", kw:K(["रोग","बीमारी","बिमारी","disease","डिजीज","scan","स्कैन","पत्ती","कीड़े","कीट","ਬਿਮਾਰੀ","ਰੋਗ","leaf"])},
    {act:"openequip",   lab:"tool_equip",   kw:K(["किराया","किराये","किराए","भाड़े","भाडे","ट्रैक्टर","ट्रेक्टर","tractor","equipment","इक्विपमेंट","मशीन","यंत्र","machine","rent","harvester","ਕਿਰਾਇਆ","ਟਰੈਕਟਰ"])},
    {act:"openweather", lab:"tool_weather", kw:K(["मौसम","weather","वेदर","बारिश","बरसात","rain","तापमान","हवामान","पाऊस","ਮੌਸਮ","ਮੀਂਹ","forecast","पूर्वानुमान"])},
    {act:"opensoil",    lab:"tool_soil",    kw:K(["मिट्टी","मिटटी","soil","सॉइल","खाद","npk","एनपीके","माती","ਮਿੱਟੀ","उर्वरक","fertilizer"])}
  ];
  /* screens. `to` = which tab to open for each role (a screen not listed for the current role is "not here") */
  const NAV=[
    {id:"sell",     to:{farmer:"sell"}, kw:K(["बेच","सेल","sell","bech","विका","ਵੇਚ","पोस्ट","post crop","नई फसल","फसल डाल","फसल लगा"])},
    {id:"mybids",   to:{buyer:"mybids"}, kw:K(["मेरी बोली","my bid","meri boli","माझ्या बोली","ਮੇਰੀ ਬੋਲੀ"])},
    {id:"bids",     to:{farmer:"bids",buyer:"mybids"}, kw:K(["बोली","बोलिय","बिड","bid","offer","ऑफर","boli","ਬੋਲੀ"])},
    {id:"deals",    to:{buyer:"deals",admin:"ops"}, kw:K(["सौदा","सौदे","सौद","डील","deal","saude","order","ऑर्डर","व्यवहार","ਸੌਦ"])},
    {id:"returns",  to:{farmer:"returns",buyer:"returns",admin:"returns"}, kw:K(["वापसी","वापस","रिफंड","रिटर्न","return","refund","wapsi","परतावा","ਵਾਪਸੀ","ਰਿਫੰਡ"])},
    {id:"wallet",   to:{farmer:"wallet"}, kw:K(["पैसा","पैसे","पैसों","वॉलेट","वालेट","wallet","paisa","paise","balance","बैलेंस","खाता","पासबुक","passbook","ਪੈਸੇ","ਵਾਲਿਟ"])},
    {id:"tools",    to:{farmer:"tools"}, kw:K(["टूल","tool","औजार","उपकरण","साधन","ਟੂਲ"])},
    {id:"transport",to:{buyer:"transport",admin:"logi"}, kw:K(["ट्रांसपोर्ट","ट्रान्सपोर्ट","transport","गाड़ी","गाडी","ट्रक","truck","tracking","ट्रैकिंग","ट्रॅकिंग","fleet","gaadi"])},
    {id:"svc",      to:{buyer:"svc"}, kw:K(["सेवा","सर्विस","service","क्वालिटी","quality","qc","क्यूसी","जांच","jaanch"])},
    {id:"contracts",to:{admin:"contracts"}, kw:K(["अनुबंध","कॉन्ट्रैक्ट","कॉन्ट्रेक्ट","contract","करार","ਇਕਰਾਰ"])},
    {id:"rev",      to:{admin:"rev"}, kw:K(["कमाई","रेवेन्यू","रेवेन्यु","revenue","आमदनी","income"])},
    {id:"ana",      to:{admin:"ana"}, kw:K(["एनालिटिक्स","analytics","विश्लेषण"])},
    {id:"map",      to:{transport:"map"}, kw:K(["नक्शा","नक्शे","नकाशा","map","मैप"])},
    {id:"trips",    to:{transport:"trips"}, kw:K(["trip","ट्रिप","यात्रा","फेरा","फेरे"])},
    {id:"mandi",    to:{farmer:"mandi",buyer:"market"}, kw:K(["मंडी","mandi","भाव","bhav","भाउ","रेट","rate","दाम","कीमत","किंमत","प्राइस","price","बाजारभाव","बाजार भाव","ਮੰਡੀ","ਭਾਅ","ਰੇਟ","ਕੀਮਤ"])},
    {id:"market",   to:{buyer:"market"}, kw:K(["बाजार","मार्केट","market","खरीद","kharid","खरेदी","ਬਾਜ਼ਾਰ"])},
    {id:"home",     to:{farmer:"home",buyer:"market",admin:"ops",transport:"map"}, kw:K(["होम","home","मुख्य","ਹੋਮ"])}
  ];
  /* crops: names in all 4 languages + Hinglish spellings */
  const ALIAS={
    tomato:["tamatar","tamater","टमाटर","टोमॅटो","टोमेटो"], onion:["pyaz","pyaaj","pyaj","kanda","प्याज","प्याज़"],
    potato:["aloo","alu","batata","आलू"], wheat:["gehu","gehun","gahu","गेहूं","गेहूँ","गहू"],
    paddy:["dhan","chawal","basmati","rice","bhat","धान","चावल","बासमती","भात"], soy:["soyabean","soya","सोया","सोयाबीन"],
    gram:["chana","chane","chickpea","harbhara","चना","चने","छोले","हरभरा"], maize:["makka","makkai","makai","corn","मक्का","मकई","मका"]
  };
  const cropMatchers = {};
  const cropKws = c => cropMatchers[c.key] || (cropMatchers[c.key]=K([c.hi,c.en,c.mr,c.pa,c.en.split(" ")[0]].concat(ALIAS[c.key]||[])));

  /* ---- understand a sentence → an action object (no side effects, so it can be tested) ---- */
  function interpret(raw){
    const x=norm(raw); if(!x) return null;
    const role=S.role;
    if(score(x,V.help)) return {kind:"help"};
    for(const code in V.lang) if(score(x,V.lang[code])) return {kind:"lang",code};
    if(score(x,V.dark))  return {kind:"theme",mode:"dark"};
    if(score(x,V.light)) return {kind:"theme",mode:"light"};
    if(score(x,V.theme)) return {kind:"theme",mode:"toggle"};
    if(score(x,V.logout)) return {kind:"logout"};
    if(score(x,V.back))  return {kind:"back"};
    if(score(x,V.down))  return {kind:"scroll",dir:1};
    if(score(x,V.up))    return {kind:"scroll",dir:-1};
    if(score(x,V.panel)){
      for(const r in V.roles) if(score(x,V.roles[r])) return {kind:"role",role:r};
    }
    /* farmer tools (rent / weather / soil / disease) */
    let tool=null;
    for(const tl of TOOLS){ const s=score(x,tl.kw); if(s && (!tool||s>tool.s)) tool={s,tl}; }
    if(tool) return {kind:"tool",act:tool.tl.act,lab:tool.tl.lab};
    /* tabs / screens for the current role */
    let cand=null, anyRole=false;
    for(const n of NAV){
      const s=score(x,n.kw); if(!s) continue; anyRole=true;
      const to=n.to[role]; if(to && (!cand||s>cand.s)) cand={s,tab:to,id:n.id};
    }
    for(const [k] of (TABS[role]||[])){               /* also match the visible tab names in the current language */
      const lab=t("t_"+k); if(lab==="t_"+k) continue;
      const s=score(x,K([lab])); if(s>=3) { anyRole=true; if(!cand||s>cand.s) cand={s,tab:k,id:k}; }
    }
    const crops=CROPS.filter(c=>score(x,cropKws(c))>0);
    if(crops.length && (!cand || cand.id==="mandi")) return {kind:"price",crops};
    if(cand) return {kind:"nav",tab:cand.tab};
    if(anyRole) return {kind:"nothere"};
    return null;
  }

  /* ---- doing it ---- */
  const clickTab = k => { const b=document.querySelector(`#tabbarInner [data-tab="${k}"]`); if(b){ b.click(); return b; } return null; };
  const tabLabel = (b,k) => { const s=b&&b.querySelector("span:last-child"); return (s&&s.textContent)||k; };
  const modalOpen = () => { const s=$("#scrim"); return !!(s && s.classList.contains("on")); };
  function speak(text){
    if(muted || !window.speechSynthesis) return;
    try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang=LANG[S.lang]||"hi-IN"; u.rate=.95; speechSynthesis.speak(u); }catch(e){}
  }
  function say(shown, spoken){ toast(shown); speak(spoken||shown.replace(/^[^\s]+\s/,"")); }

  function run(a, heard){
    const pre = heard ? `🎙️ “${heard}” → ` : "";
    switch(a.kind){
      case "help": showSheet(); return;
      case "nothere": say(pre+m("nothere"), m("nothere")); return;
      case "lang": {
        const sel=$("#langSel"); sel.value=a.code; sel.dispatchEvent(new Event("change",{bubbles:true}));
        const nm={hi:"हिंदी",en:"English",mr:"मराठी",pa:"ਪੰਜਾਬੀ"}[a.code];
        say(pre+"🌐 "+nm, nm); sync(); return;
      }
      case "theme": {
        const btn=$("#themeBtn"), root=document.documentElement;
        if(a.mode==="toggle") btn.click();
        else for(let i=0;i<3 && root.getAttribute("data-theme")!==a.mode;i++) btn.click();
        say(pre+"◐ "+(a.mode==="toggle"?"theme":a.mode), m("done")(a.mode==="toggle"?"theme":a.mode)); return;
      }
      case "logout": if(typeof performLogout==="function"){ speak("OK"); performLogout(); } return;
      case "back": {
        if(sheet){ closeSheet(); return; }
        if(modalOpen()){ closeModal(); say(pre+"✖", m("close")); return; }
        const first=(TABS[S.role]||[])[0]; if(first){ const b=clickTab(first[0]); say(pre+m("open")(tabLabel(b,first[0])), m("open")(tabLabel(b,first[0]))); }
        return;
      }
      case "scroll": window.scrollBy({top:a.dir*Math.round(innerHeight*.75),behavior:"smooth"}); return;
      case "role": {
        const b=document.querySelector(`[data-role="${a.role}"]`);
        if(!b){ say(pre+m("nothere"), m("nothere")); return; }
        if(modalOpen()) closeModal();
        b.click(); const l=t("r_"+a.role); say(pre+m("open")(l), m("open")(l)); return;
      }
      case "tool": {
        if(modalOpen()) closeModal();
        if(S.role!=="farmer"){                                    /* admin can hop into the farmer panel */
          const rb=document.querySelector('[data-role="farmer"]');
          if(!rb){ say(pre+m("nothere"), m("nothere")); return; }
          rb.click();
        }
        if(S.tab.farmer!=="tools") clickTab("tools");
        const btn=document.querySelector(`[data-act="${a.act}"]`);
        if(!btn){ say(pre+m("nothere"), m("nothere")); return; }
        btn.click(); const l=t(a.lab); say(pre+"✅ "+m("open")(l), m("open")(l)); return;
      }
      case "nav": {
        if(modalOpen()) closeModal();
        const b=clickTab(a.tab);
        if(!b){ say(pre+m("nothere"), m("nothere")); return; }
        const l=tabLabel(b,a.tab); say(pre+"✅ "+m("open")(l), m("open")(l)); return;
      }
      case "price": {
        if(S.role==="farmer" && S.tab.farmer!=="mandi") clickTab("mandi");
        const lines=[], spoken=[];
        a.crops.forEach(c=>{
          const p=S.prices[c.key]; if(!p) return;
          const prev=p.hist[p.hist.length-2]||p.now, pct=(p.now-prev)/prev*100;
          lines.push(`${c.em} ${cropName(c.key)}: ${inr(p.now)}${t("per_qtl")} ${pct>=0?"▲":"▼"} ${Math.abs(pct).toFixed(1)}%`);
          spoken.push(m("price")(cropName(c.key), Math.round(p.now)));
        });
        if(lines.length){ toast(lines.join("  ·  ")); speak(spoken.join(". ")); }
        return;
      }
    }
  }

  /* try each alternative the speech engine offered, run the first one we understand */
  function handle(input){
    const list=[].concat(input).filter(Boolean);
    let act=null, used=list[0]||"";
    for(const s of list){ act=interpret(s); if(act){ used=s; break; } }
    if(!act){ toast(`🎙️ “${used}” — ${m("no")}`); return; }
    run(act, used);
  }

  /* ---- microphone ---- */
  function showCap(text){ if(!cap) return; cap.textContent=text||""; cap.classList.toggle("on",!!text); }
  function sync(){
    if(!S) return;                                            /* app state not loaded yet */
    const live=!!rec;
    [fab,$("#micBtn")].forEach(b=>b&&b.classList.toggle("live",live));
    if(fab){ fab.title=m("tap"); fab.setAttribute("aria-label",m("tap")); }
    const mb=$("#micB"); if(mb) mb.textContent = live ? t("mic_live") : t("mic_b");
    if(!live) showCap("");
  }
  function stop(){ try{ rec&&rec.stop(); }catch(e){} }
  function start(){
    if(!SR){ toast(m("nosup")); return; }
    if(!window.isSecureContext){ toast(m("https")); return; }
    if(rec){ stop(); return; }
    try{ window.speechSynthesis && speechSynthesis.cancel(); }catch(e){}
    const r=new SR();
    r.lang=LANG[S.lang]||"hi-IN"; r.interimResults=true; r.maxAlternatives=4; r.continuous=false;
    r.onresult=e=>{
      const res=e.results[e.results.length-1];
      if(!res.isFinal){ showCap(res[0].transcript); return; }
      const alts=[]; for(let i=0;i<res.length;i++) alts.push(res[i].transcript);
      showCap(alts[0]); handle(alts);
    };
    r.onerror=e=>{
      if(e.error==="not-allowed"||e.error==="service-not-allowed") toast(m("denied"));
      else if(e.error==="no-speech") toast(m("silence"));
      else if(e.error==="network") toast(m("net"));
      else if(e.error!=="aborted") toast(m("nosup"));
    };
    r.onend=()=>{ rec=null; sync(); };
    rec=r; sync();
    try{ r.start(); }catch(e){ rec=null; sync(); }
  }

  /* ---- "what can I say" sheet ---- */
  function closeSheet(){ if(sheet){ sheet.remove(); sheet=null; } }
  function showSheet(){
    closeSheet();
    const en=S.lang==="en";
    const tabs=(TABS[S.role]||[]).map(([k,ic])=>{ const l=t("t_"+k); return l==="t_"+k?"":`${ic} ${esc(l)}`; }).filter(Boolean).join(" · ");
    const ex = en
      ? [`“tomato rate”`, S.role==="farmer"?`“weather”, “soil test”, “tractor rent”, “crop disease”`:"", `“Hindi” / “Marathi” / “Punjabi”`, `“dark mode”`, `“close”`, `“scroll down”`, `“logout”`]
      : [`“टमाटर का भाव”`, S.role==="farmer"?`“मौसम”, “मिट्टी जाँच”, “ट्रैक्टर किराया”, “रोग जाँच”`:"", `“अंग्रेज़ी” / “मराठी” / “पंजाबी”`, `“डार्क मोड”`, `“बंद करो”`, `“नीचे”`, `“लॉगआउट”`];
    sheet=document.createElement("div"); sheet.className="kv-sheet";
    sheet.innerHTML=`<div class="kv-card" role="dialog" aria-label="${esc(m("helpT"))}">
      <b>🎙️ ${esc(m("helpT"))}</b>
      <p>${tabs}</p>
      <ul>${ex.filter(Boolean).map(s=>`<li>${s}</li>`).join("")}</ul>
      <label class="kv-row"><span>🔊 ${esc(m("speakOn"))}</span><button type="button" id="kvMute">${esc(muted?m("off"):m("on"))}</button></label>
      <button type="button" class="kv-x" id="kvClose">${esc(m("close"))}</button></div>`;
    sheet.addEventListener("click",e=>{ if(e.target===sheet || e.target.id==="kvClose") closeSheet(); });
    sheet.querySelector("#kvMute").addEventListener("click",e=>{
      muted=!muted; try{ localStorage.setItem("kv_mute",muted?"1":"0"); }catch(_){}
      e.target.textContent=muted?m("off"):m("on"); if(muted) try{ speechSynthesis.cancel(); }catch(_){}
    });
    document.body.appendChild(sheet);
  }

  /* ---- floating mic button (on every screen, every role) ---- */
  function init(){
    if(typeof document==="undefined" || !document.body) return;
    fab=document.createElement("button"); fab.type="button"; fab.className="kv-fab"; fab.id="kvFab"; fab.textContent="🎙️";
    cap=document.createElement("div"); cap.className="kv-cap"; cap.setAttribute("aria-live","polite");
    fab.addEventListener("click",start);
    let pressT=null;                                          /* long-press the mic = open the "what can I say" list */
    fab.addEventListener("contextmenu",e=>{ e.preventDefault(); showSheet(); });
    fab.addEventListener("pointerdown",()=>{ pressT=setTimeout(()=>{ pressT=null; showSheet(); },800); });
    ["pointerup","pointerleave","pointercancel"].forEach(ev=>fab.addEventListener(ev,()=>{ if(pressT){ clearTimeout(pressT); pressT=null; } }));
    document.body.appendChild(cap); document.body.appendChild(fab);
    document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeSheet(); });
    const ls=$("#langSel"); if(ls) ls.addEventListener("change",()=>setTimeout(sync,0));
    sync();
  }
  /* the big mic on the farmer home screen: take it over from the older "price only" code (capture phase = runs first) */
  document.addEventListener("click",e=>{
    const b=e.target.closest && e.target.closest("#micBtn");
    if(b){ e.stopImmediatePropagation(); e.preventDefault(); start(); }
  },true);
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();

  return {toggle:start, handle, sync, help:showSheet, _interpret:interpret};
})();
})();
