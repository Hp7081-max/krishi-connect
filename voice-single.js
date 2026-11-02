/**
 * Krishi Connect - ONE microphone (voice listing). Replaces voice.js + mic-position.js UI.
 * Include ONE line before </body>:   <script src="voice-single.js" defer></script>
 *
 * Hook for your listing form:
 *   window.addEventListener('krishi:voice-listing', e => console.log(e.detail)); // {text, crop, qty, unit, price}
 * It also tries to auto-fill inputs whose id/name/placeholder contains qty/quantity/price/rate/crop.
 */
(function () {
  if (window.KrishiVoice) return;

  var LANGS = [['hi-IN', 'हिंदी / Hinglish'], ['en-IN', 'English'], ['mr-IN', 'मराठी'], ['pa-IN', 'ਪੰਜਾਬੀ'], ['gu-IN', 'ગુજરાતી'], ['bn-IN', 'বাংলা'], ['ta-IN', 'தமிழ்'], ['te-IN', 'తెలుగు']];
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, listening = false, fab, panel, sel, txt, status;

  var css = '\
#kv-fab{position:fixed;left:16px;bottom:calc(88px + env(safe-area-inset-bottom,0px));width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;z-index:2147482990;background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;font-size:26px;box-shadow:0 6px 20px rgba(0,0,0,.45)}\
#kv-fab.on{background:#ef4444;animation:kvp 1.1s infinite}\
@keyframes kvp{0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}100%{box-shadow:0 0 0 18px rgba(239,68,68,0)}}\
#kv-panel{position:fixed;left:16px;bottom:calc(158px + env(safe-area-inset-bottom,0px));width:320px;max-width:calc(100vw - 32px);background:#fdf3e1;color:#3a2a14;border-radius:14px;padding:12px;z-index:2147482990;display:none;box-shadow:0 10px 30px rgba(0,0,0,.5);font:14px system-ui,sans-serif}\
#kv-panel.open{display:block}\
#kv-panel h4{margin:0 0 8px;font-size:15px}\
#kv-panel select,#kv-panel input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #d6c3a0;border-radius:8px;background:#fff;color:#3a2a14;font-size:14px;margin-bottom:6px}\
#kv-panel .ex{font-size:12px;opacity:.7;margin-bottom:6px}\
#kv-panel .r{display:flex;gap:6px}\
#kv-panel .r input{margin:0;flex:1}\
#kv-panel button.go{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:0 14px;font-weight:700;cursor:pointer}\
#kv-status{font-size:12px;margin-top:6px;min-height:16px;color:#b45309}\
@media(max-width:520px){#kv-fab{bottom:calc(84px + env(safe-area-inset-bottom,0px))}}';

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function say(m) { status.textContent = m || ''; }

  /* ---------- parse: "20 क्विंटल गेहूं 2400 रुपये क्विंटल" ---------- */
  var CROPS = { 'गेहूं': 'wheat', 'गेहूँ': 'wheat', 'wheat': 'wheat', 'चावल': 'rice', 'धान': 'rice', 'rice': 'rice', 'टमाटर': 'tomato', 'tomato': 'tomato', 'प्याज': 'onion', 'onion': 'onion', 'आलू': 'potato', 'potato': 'potato', 'मक्का': 'maize', 'maize': 'maize', 'सोयाबीन': 'soybean', 'soybean': 'soybean', 'कपास': 'cotton', 'cotton': 'cotton', 'सरसों': 'mustard', 'mustard': 'mustard', 'चना': 'chana', 'chana': 'chana' };
  function parse(text) {
    var out = { text: text, crop: null, cropWord: null, qty: null, unit: null, price: null };
    var t = text.replace(/[,]/g, '');
    var q = t.match(/(\d+(?:\.\d+)?)\s*(क्विंटल|क्विण्टल|quintal|qtl|किलो|kg|टन|ton)/i);
    if (q) { out.qty = Number(q[1]); out.unit = q[2]; }
    var p = t.match(/(\d+(?:\.\d+)?)\s*(?:रुपये|रुपए|रुपया|rs\.?|₹|rupees?)/i) || t.match(/(?:₹|rs\.?)\s*(\d+(?:\.\d+)?)/i);
    if (p) out.price = Number(p[1]);
    else {
      var nums = t.match(/\d+(?:\.\d+)?/g) || [];
      if (nums.length >= 2) out.price = Number(nums[nums.length - 1]);
    }
    var low = t.toLowerCase();
    Object.keys(CROPS).some(function (w) { if (low.indexOf(w.toLowerCase()) > -1) { out.crop = CROPS[w]; out.cropWord = w; return true; } });
    return out;
  }
  function setVal(el, v) {
    var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    d && d.set ? d.set.call(el, v) : (el.value = v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function autofill(d) {
    var done = 0;
    document.querySelectorAll('input,select').forEach(function (el) {
      if (el.closest('#kv-panel') || el.closest('#kc-panel')) return;
      var key = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.placeholder || '')).toLowerCase();
      if (d.qty != null && /qty|quantity|मात्रा/.test(key)) { setVal(el, d.qty); done++; }
      else if (d.price != null && /price|rate|भाव|रेट|दाम/.test(key)) { setVal(el, d.price); done++; }
      else if (el.tagName === 'SELECT' && d.crop && /crop|फसल/.test(key)) {
        for (var i = 0; i < el.options.length; i++) {
          var o = el.options[i], s = (o.value + ' ' + o.text).toLowerCase();
          if (s.indexOf(d.crop) > -1 || (d.cropWord && s.indexOf(d.cropWord.toLowerCase()) > -1)) { setVal(el, o.value); done++; break; }
        }
      }
    });
    return done;
  }
  function fill() {
    var text = txt.value.trim();
    if (!text) return say('Pehle bolein ya type karein.');
    var d = parse(text);
    window.dispatchEvent(new CustomEvent('krishi:voice-listing', { detail: d }));
    var n = autofill(d);
    say(n ? '✅ ' + n + ' field bhar diye gaye.' : '✅ Samajh liya: ' + (d.qty || '?') + ' ' + (d.unit || '') + ' ' + (d.cropWord || '') + ' @ ₹' + (d.price || '?'));
  }

  /* ---------- speech ---------- */
  function errMsg(e) {
    if (e === 'network') return 'Voice service connect nahi ho rahi. Chrome ya Edge use karein (Brave me speech recognition band hota hai) — ya neeche type karein.';
    if (e === 'not-allowed' || e === 'service-not-allowed') return 'Mic permission band hai. Address bar ke lock icon se Microphone Allow karein.';
    if (e === 'no-speech') return 'Awaaz nahi suni, dobara bolein.';
    if (e === 'audio-capture') return 'Mic nahi mila. Mic connect/enable karein.';
    return 'Voice error: ' + e;
  }
  function start() {
    if (!SR) { say('Is browser me voice support nahi hai — Chrome/Edge use karein ya type karein.'); return; }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') { say('Voice ke liye HTTPS zaroori hai.'); return; }
    rec = new SR();
    rec.lang = sel.value; rec.interimResults = true; rec.continuous = false;
    rec.onstart = function () { listening = true; fab.classList.add('on'); say('🎙️ Sun raha hoon… boliye'); };
    rec.onresult = function (ev) {
      var s = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) s += ev.results[i][0].transcript;
      txt.value = s;
    };
    rec.onerror = function (ev) { say(errMsg(ev.error)); };
    rec.onend = function () { listening = false; fab.classList.remove('on'); if (txt.value.trim() && /Sun raha/.test(status.textContent)) say('Check karke "भरो" dabayein.'); };
    try { rec.start(); } catch (e) { say('Mic start nahi hua, dobara try karein.'); }
  }
  function stop() { try { rec && rec.stop(); } catch (e) {} }

  function onFab() {
    if (!panel.classList.contains('open')) { panel.classList.add('open'); start(); return; }
    if (listening) stop(); else start();
  }

  /* ---------- remove duplicate mic UIs created by old scripts ---------- */
  function killDuplicates() {
    var MIC = /🎤|🎙|माइक|बोलकर लिस्टिंग/;
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el.id === 'kv-fab' || el.id === 'kv-panel' || el.id === 'kc-panel' || el.id === 'kc-bubble') return;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      var pos = getComputedStyle(el).position;
      if (pos !== 'fixed') return;
      var label = (el.getAttribute('aria-label') || '') + (el.title || '') + (el.id || '') + (el.className && el.className.baseVal === undefined ? el.className : '');
      if (MIC.test(el.textContent || '') || /mic|voice|speech/i.test(label)) el.style.setProperty('display', 'none', 'important');
    });
  }

  function init() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    sel = h('select', {}, LANGS.map(function (l) { return h('option', { value: l[0] }, [l[1]]); }));
    txt = h('input', { type: 'text', placeholder: 'या यहाँ लिखें / टाइप करें', onkeydown: function (e) { if (e.key === 'Enter') fill(); } });
    status = h('div', { id: 'kv-status' });
    panel = h('div', { id: 'kv-panel' }, [
      h('h4', {}, ['बोलकर लिस्टिंग']),
      sel,
      h('div', { class: 'ex' }, ['जैसे: "20 क्विंटल गेहूं 2400 रुपये क्विंटल"']),
      h('div', { class: 'r' }, [txt, h('button', { class: 'go', onclick: fill }, ['भरो'])]),
      status
    ]);
    fab = h('button', { id: 'kv-fab', title: 'बोलकर लिस्टिंग (Mic)', 'aria-label': 'Mic', onclick: onFab }, ['🎤']);
    document.body.appendChild(panel);
    document.body.appendChild(fab);
    killDuplicates();
    setInterval(killDuplicates, 1500);
  }

  window.KrishiVoice = { open: function () { panel.classList.add('open'); }, parse: parse };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
