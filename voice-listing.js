/* Krishi Connect — voice-listing.js
   Mic button + form filler. Needs voice-parser.js loaded BEFORE this file.

   Add to your listing page (before </body>):
     <script src="/voice-parser.js"></script>
     <script src="/voice-listing.js"></script>

   Optional config (put BEFORE the two scripts) if auto-detect picks the wrong field:
     <script>
       window.KRISHI_VOICE_CONFIG = {
         crop:  "#cropName",     // input or select
         qty:   "#quantity",
         price: "#price",
         grade: "#grade",        // optional
         qtyUnit:   "quintal",   // unit your form uses for quantity: "quintal" or "kg"
         priceUnit: "quintal"    // unit your form uses for price:    "quintal" or "kg"
       };
     </script>
*/
(function () {
  "use strict";
  var P = window.KrishiVoiceParser;
  if (!P) { console.error("voice-parser.js must load before voice-listing.js"); return; }
  var CFG = window.KRISHI_VOICE_CONFIG || {};

  /* ---------- find form fields ---------- */
  function attrText(el) {
    var lab = "";
    if (el.id) { var l = document.querySelector('label[for="' + el.id + '"]'); if (l) lab = l.textContent; }
    if (!lab && el.closest) { var pl = el.closest("label"); if (pl) lab = pl.textContent; }
    if (!lab && el.closest) { var fw = el.closest(".field"); if (fw) { var fl = fw.querySelector("label"); if (fl) lab = fl.textContent; } }
    return (el.name + " " + el.id + " " + (el.placeholder || "") + " " + (el.getAttribute("aria-label") || "") + " " + lab).toLowerCase();
  }
  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
  function findField(sel, re, types) {
    if (sel) { var d = document.querySelector(sel); if (d) return d; }
    var all = Array.prototype.slice.call(document.querySelectorAll("input,select,textarea"));
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!visible(el) || el.type === "hidden" || el.type === "password") continue;
      if (el.closest && el.closest("#kvl-panel")) continue;
      if (types && types.indexOf(el.tagName === "SELECT" ? "select" : (el.type || "text")) < 0) continue;
      if (re.test(attrText(el))) return el;
    }
    return null;
  }
  function fields() {
    return {
      crop:  findField(CFG.crop,  /crop|fasal|फसल|फ़सल|पीक|ਫ਼ਸਲ|commodity/, ["select", "text", "search"]),
      qty:   findField(CFG.qty,   /quant|qty|matra|मात्रा|कितना माल|कितना चाहिए|कितना|weight|stock/, ["number", "text", "tel"]),
      price: findField(CFG.price, /price|rate|रेट|bhav|भाव|दाम|₹/, ["number", "text", "tel"]),
      grade: findField(CFG.grade, /grade|quality|ग्रेड|क्वालिटी/, ["select", "text"])
    };
  }

  /* ---------- set value so React/Vue/etc. notice it ---------- */
  function setValue(el, val) {
    var proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype :
                el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, val); else el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* pick the <option> that matches the detected crop (English key or any Hindi/Hinglish synonym) */
  /* parser key -> key used by Krishi Connect (fully final.html CROPS list) */
  var APP_KEY = { rice: "paddy", soybean: "soy", chickpea: "gram" };
  function fillCrop(el, crop) {
    if (!el || !crop) return false;
    var appKey = APP_KEY[crop.key] || crop.key;
    if (el.tagName === "SELECT") {
      var opts = Array.prototype.slice.call(el.options);
      for (var k = 0; k < opts.length; k++) {          /* 1st choice: option value equals the app's crop key */
        if (String(opts[k].value).toLowerCase() === appKey) { setValue(el, opts[k].value); return true; }
      }
      for (var i = 0; i < opts.length; i++) {
        var o = opts[i], txt = P.norm(o.text + " " + o.value);
        var hit = P.detectCrop(txt);
        if (hit && hit.key === crop.key) { setValue(el, o.value); return true; }
      }
      return false;
    }
    var nice = appKey.charAt(0).toUpperCase() + appKey.slice(1);
    setValue(el, nice);
    return true;
  }

  function fillNumber(el, value) { if (el && value != null) { setValue(el, String(value)); return true; } return false; }

  function fillGrade(el, grade) {
    if (!el || !grade) return false;
    if (el.tagName === "SELECT") {
      for (var i = 0; i < el.options.length; i++) {
        var t = (el.options[i].text + " " + el.options[i].value).toLowerCase();
        if (new RegExp("(^|[^a-z])" + grade.toLowerCase() + "([^a-z]|$)").test(t)) { setValue(el, el.options[i].value); return true; }
      }
      return false;
    }
    setValue(el, grade); return true;
  }

  /* convert parsed numbers to the unit your form uses */
  function qtyForForm(q) {
    if (!q) return null;
    var u = (CFG.qtyUnit || "quintal");
    return u === "kg" ? round(q.qtl * 100) : q.qtl;
  }
  function priceForForm(p) {
    if (!p) return null;
    var u = (CFG.priceUnit || "quintal");
    return u === "kg" ? round(p.perQtl / 100) : p.perQtl;
  }
  function round(x) { return Math.round(x * 100) / 100; }

  function applyResult(r) {
    var f = fields(), done = [], missed = [];
    (r.crop && fillCrop(f.crop, r.crop) ? done : missed).push("फसल / Crop");
    (r.qty && fillNumber(f.qty, qtyForForm(r.qty)) ? done : missed).push("मात्रा / Quantity");
    (r.price && fillNumber(f.price, priceForForm(r.price)) ? done : missed).push("भाव / Price");
    if (r.grade) (fillGrade(f.grade, r.grade) ? done : missed).push("Grade");
    return { done: done, missed: missed, fields: f };
  }

  /* ---------- UI ---------- */
  var css = "\
#kvl-btn{position:fixed;left:14px;bottom:90px;z-index:99999;width:58px;height:58px;border-radius:50%;border:0;background:#2e7d32;color:#fff;font-size:26px;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer}\
#kvl-btn.rec{background:#c62828;animation:kvlp 1s infinite}@keyframes kvlp{50%{transform:scale(1.1)}}\
#kvl-panel{position:fixed;left:14px;bottom:160px;z-index:99999;width:min(340px,calc(100vw - 36px));background:#fff;color:#222;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.3);padding:12px;font:14px/1.4 system-ui,sans-serif;display:none}\
#kvl-panel select,#kvl-panel input,#kvl-panel button.kvl-s{font:inherit;padding:6px 8px;border:1px solid #bbb;border-radius:6px}\
#kvl-panel .kvl-row{display:flex;gap:6px;margin:6px 0}#kvl-panel .kvl-row input{flex:1;min-width:0}\
#kvl-panel button.kvl-s{background:#2e7d32;color:#fff;border-color:#2e7d32;cursor:pointer}\
#kvl-out{margin-top:6px;font-size:13px}#kvl-out b{color:#2e7d32}#kvl-out .kvl-w{color:#c62828}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement("button");
  btn.id = "kvl-btn"; btn.type = "button"; btn.title = "बोलकर लिस्टिंग भरें"; btn.textContent = "🎤";
  var panel = document.createElement("div"); panel.id = "kvl-panel";
  panel.innerHTML =
    '<div><b>🎤 बोलकर लिस्टिंग</b></div>' +
    '<div class="kvl-row"><select id="kvl-lang"><option value="hi-IN">हिंदी / Hinglish</option><option value="en-IN">English (India)</option></select></div>' +
    '<div style="font-size:12px;color:#555">जैसे: "20 क्विंटल गेहूं 2400 रुपये क्विंटल"</div>' +
    '<div class="kvl-row"><input id="kvl-text" placeholder="या यहाँ लिखें / टाइप करें"><button type="button" class="kvl-s" id="kvl-go">भरो</button></div>' +
    '<div id="kvl-out"></div>';
  document.body.appendChild(panel); document.body.appendChild(btn);

  var out = panel.querySelector("#kvl-out"), txt = panel.querySelector("#kvl-text");
  function say(h) { out.innerHTML = h; }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function handle(sentence) {
    var r = P.parse(sentence);
    txt.value = sentence;
    if (!r.found) { say('<span class="kvl-w">कुछ समझ नहीं आया। फिर से बोलें: फसल, मात्रा और भाव।</span>'); return; }
    var a = applyResult(r), h = "सुना: <i>" + esc(sentence) + "</i><br>";
    if (r.crop) h += "फसल: <b>" + esc(r.crop.key) + "</b><br>";
    if (r.qty) h += "मात्रा: <b>" + r.qty.value + " " + r.qty.unit + "</b>" + (r.qty.guess ? " (अंदाज़ा)" : "") + "<br>";
    if (r.price) h += "भाव: <b>₹" + r.price.value + "/" + r.price.unit + "</b>" + (r.price.guess ? " (अंदाज़ा)" : "") + "<br>";
    if (r.grade) h += "Grade: <b>" + r.grade + "</b><br>";
    if (a.missed.length) h += '<span class="kvl-w">भरा नहीं गया (खुद भरें): ' + a.missed.join(", ") + "</span><br>";
    h += "कृपया सबमिट करने से पहले एक बार जाँच लें।";
    say(h);
  }

  /* ---------- speech recognition ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, listening = false;
  btn.addEventListener("click", function () {
    if (panel.style.display !== "block") panel.style.display = "block";
    if (!SR) { say('<span class="kvl-w">इस ब्राउज़र में आवाज़ नहीं चलती (Chrome इस्तेमाल करें)। ऊपर टाइप करके भी भर सकते हैं।</span>'); return; }
    if (listening) { rec.stop(); return; }
    rec = new SR();
    rec.lang = panel.querySelector("#kvl-lang").value;
    rec.interimResults = false; rec.maxAlternatives = 3;
    rec.onstart = function () { listening = true; btn.classList.add("rec"); say("सुन रहा हूँ… बोलिए 🎙️"); };
    rec.onend = function () { listening = false; btn.classList.remove("rec"); };
    rec.onerror = function (e) {
      say('<span class="kvl-w">' + (e.error === "not-allowed" ? "माइक की अनुमति दें (ब्राउज़र सेटिंग)।" : "आवाज़ नहीं पकड़ी: " + esc(e.error)) + "</span>");
    };
    rec.onresult = function (e) {
      /* try every alternative, keep the one where the parser finds the most */
      var best = null, bestN = -1, res = e.results[0];
      for (var i = 0; i < res.length; i++) {
        var r = P.parse(res[i].transcript);
        if (r.found > bestN) { bestN = r.found; best = res[i].transcript; }
      }
      handle(best || "");
    };
    try { rec.start(); } catch (err) { /* already started */ }
  });
  panel.querySelector("#kvl-go").addEventListener("click", function () { handle(txt.value); });
  txt.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); handle(txt.value); } });
})();
