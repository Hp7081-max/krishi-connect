/*! chat-extras.js — Krishi Connect chat: offer/counter-offer, listing card, mandi rate,
 *  photo (+AI check), voice note, bolkar likhna.
 *
 *  HTML me bas ye 3 line (index.html / fully final.html ke <head> ya </body> se pehle):
 *    <link rel="stylesheet" href="chat-extras.css">
 *    <script src="chat-extras.js" defer></script>
 *
 *  Agar chat ke element alag naam ke hain to neeche CONFIG ke selectors badlo,
 *  ya baad me:  KrishiChatExtras.init({ getMessagesBox: () => document.querySelector('#meri-chat') })
 */
(function () {
  'use strict';

  /* ======================= CONFIG — apne app ke hisaab se badlo ======================= */
  const safeJSON = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const pick = (pairs) => pairs.find(([o, n]) => o && typeof o[n] === 'function');

  // Login token (JWT) browser storage me kisi bhi naam se ho, yahan dhoondh liya jata hai
  function findToken() {
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        for (let i = 0; i < store.length; i++) {
          const m = String(store.getItem(store.key(i)) || '').match(/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/);
          if (m) return m[0];
        }
      } catch (e) { /* storage band hai */ }
    }
    return null;
  }
  function tokenUser(t) {
    try {
      const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const id = p.id || p._id || p.userId || p.uid || p.sub;
      return id ? { id: String(id) } : null;
    } catch (e) { return null; }
  }

  const CONFIG = {
    apiBase: '/api/chat-extras',

    // Login wala user: { id }
    getUser: () => (findToken() && tokenUser(findToken())) || window.currentUser || safeJSON(lsGet('user')) || {},
    getAuthHeaders: () => { const t = findToken(); return t ? { Authorization: 'Bearer ' + t } : {}; },

    // Abhi kaun si chat khuli hai, aur samne wala kaun hai
    getConversationId: () =>
      window.currentConversationId || window.currentChatId ||
      (document.querySelector('[data-conversation-id]') || {}).dataset?.conversationId || null,
    getReceiverId: () =>
      window.currentChatPartnerId ||
      (document.querySelector('[data-partner-id]') || {}).dataset?.partnerId || null,

    // Chat ke elements
    getMessagesBox: () => document.querySelector('#chat-messages, .chat-messages, #messages'),
    getInputBar: () => document.querySelector('#chat-input-bar, .chat-input-bar, #chat-form, .chat-input'),
    getTextInput: () =>
      document.querySelector('#chat-input, .chat-input input, #chat-input-bar input[type="text"], #chat-input-bar textarea'),

    // Seller ki apni listings (picker ke liye). Khali ho to manual form khulega.
    // Har item: { id, crop, quantityQuintal, pricePerQuintal, location, image }
    getListings: async () => window.myListings || [],

    // mandi-live.js se live bhav. Return: { crop, market, minPrice, modalPrice, maxPrice } ya null
    getMandiRate: async (crop) => {
      const hit = pick([[window.MandiLive, 'getRate'], [window.mandiLive, 'getRate'], [window, 'getMandiRate']]);
      return hit ? hit[0][hit[1]](crop) : null;
    },

    // disease-ai.js se photo check. File leta hai; text ya { disease, confidence, advice } return kare
    analyzePhoto: async (url) => {
      const hit = pick([[window.DiseaseAI, 'analyze'], [window.diseaseAI, 'analyze'], [window, 'analyzeDisease']]);
      if (!hit) throw new Error(T.aiNotConnected);
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'crop.jpg', { type: blob.type || 'image/jpeg' });
      return hit[0][hit[1]](file);
    },

    // Listing page se "chat karo" dabane par chat kholna (apne chat-client ke hisaab se badlo)
    openConversation: (receiverId, listing) => {
      if (receiverId) window.currentChatPartnerId = String(receiverId);
      document.dispatchEvent(new CustomEvent('krishi:open-chat', { detail: { receiverId, listing } }));
      if (typeof window.openChat === 'function') window.openChat(receiverId, listing);
    },
  };

  /* ======================= Hindi text (yahin se bhasha badal sakte ho) ======================= */
  const T = {
    offer: 'ऑफर', listing: 'लिस्टिंग', rate: 'मंडी भाव', photo: 'फोटो', voice: 'आवाज़', dictate: 'बोलकर लिखें',
    offerTitle: 'ऑफर', listingTitle: 'फसल की लिस्टिंग', rateTitle: 'मंडी भाव', voiceMsg: 'आवाज़ संदेश',
    perQ: 'क्विंटल', quintal: 'क्विंटल', total: 'कुल',
    pending: 'जवाब बाकी', accepted: 'सौदा पक्का', rejected: 'मना किया', countered: 'नया भाव आया', expired: 'समय खत्म',
    accept: 'स्वीकार', reject: 'मना करें', counter: 'नया भाव दें',
    waiting: 'सामने वाले के जवाब का इंतज़ार…',
    offerOnThis: 'इस पर ऑफर दें', offerOnRate: 'इस भाव पर ऑफर दें',
    fCrop: 'फसल', fPrice: 'भाव (₹ प्रति क्विंटल)', fQty: 'मात्रा (क्विंटल)', fNote: 'संदेश (ज़रूरी नहीं)',
    fLocation: 'जगह', fMarket: 'मंडी', fModal: 'आम भाव (₹)', fMin: 'न्यूनतम (₹)', fMax: 'अधिकतम (₹)', fCaption: 'फोटो के बारे में लिखें (ज़रूरी नहीं)',
    send: 'भेजें', cancel: 'रद्द करें', close: 'बंद करें',
    getLive: 'लाइव मंडी भाव लाएँ', noLive: 'लाइव भाव नहीं मिला, खुद भरें',
    pickListing: 'कौन सी फसल भेजनी है?', manualListing: 'दूसरी फसल लिखें',
    needPriceQty: 'भाव और मात्रा भरें', needCrop: 'पहले फसल का नाम लिखें', needRate: 'आम भाव भरें',
    noConv: 'पहले कोई चैट खोलें', noReceiver: 'सामने वाले की जानकारी नहीं मिली',
    confirmAccept: (p, q, t) => `₹${p} प्रति क्विंटल पर ${q} क्विंटल, कुल ₹${t}.\nसौदा पक्का करें?`,
    aiCheck: 'AI से जाँच करें', checking: 'जाँच हो रही है…', aiFail: 'जाँच नहीं हो पाई', photoAlt: 'फसल की फोटो',
    aiNotConnected: 'disease-ai.js अभी चैट से जुड़ा नहीं है',
    recording: 'रिकॉर्ड हो रहा है', recHint: 'ज़्यादा से ज़्यादा 60 सेकंड', tooShort: 'बहुत छोटी आवाज़, फिर बोलें',
    noMic: 'इस फोन में आवाज़ रिकॉर्ड नहीं हो सकती', micDenied: 'माइक की अनुमति दें',
    noSTT: 'इस ब्राउज़र में बोलकर लिखना नहीं चलता (Chrome में चलाएँ)', noInput: 'लिखने की जगह नहीं मिली', sttErr: 'सुनाई नहीं दिया, फिर बोलें',
    sending: 'भेज रहे हैं…',
  };

  /* ======================= chhote helpers ======================= */
  const S = {
    convId: null, receiverId: null, items: new Map(), after: null,
    timer: null, busy: false, list: null, bar: null, pendingListing: null, stt: null,
  };

  // XSS se bachne ke liye: user ka text hamesha textContent se, kabhi innerHTML se nahi
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const num = (n) => Number(n).toLocaleString('en-IN');
  const inr = (n) => (Number.isFinite(Number(n)) ? '₹' + num(n) : '');
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const timeStr = (iso) => new Date(iso).toLocaleTimeString('hi-IN', { hour: 'numeric', minute: '2-digit' });
  const myId = () => { const u = CONFIG.getUser() || {}; return String(u.id || u._id || ''); };
  const safeSrc = (u) => (/^\/uploads\/[\w.-]+$/.test(u || '') || /^https:\/\//i.test(u || '') ? u : '');

  function toast(msg) {
    document.querySelectorAll('.kc-toast').forEach((n) => n.remove());
    const t = h('div', { class: 'kc-toast', role: 'status' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 2800);
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ 'x-user-id': myId() }, CONFIG.getAuthHeaders(), opts.headers || {});
    let body = opts.body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const res = await fetch(CONFIG.apiBase + path, { method: opts.method || 'GET', headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'कुछ गड़बड़ हुई, फिर कोशिश करें');
    return data;
  }

  /* ======================= bottom sheet + form ======================= */
  function openSheet({ title, body, actions = [], onClose }) {
    const ov = h('div', { class: 'kc-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    let closed = false;
    const onKey = (e) => { if (e.key === 'Escape') ctl.close(); };
    const ctl = {
      el: ov,
      close() {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        ov.remove();
        if (onClose) onClose();
      },
    };
    const btns = actions.map((a) =>
      h('button', {
        type: 'button', class: 'kc-btn ' + (a.cls || 'kc-ok'),
        onclick: async (e) => {
          const b = e.currentTarget;
          if (b.disabled) return;
          b.disabled = true;
          try { await a.onClick(ctl, b); } finally { b.disabled = false; }
        },
      }, a.label)
    );
    const sheet = h('div', { class: 'kc-sheet' },
      h('div', { class: 'kc-sheet-h' }, h('strong', null, title),
        h('button', { type: 'button', class: 'kc-x', 'aria-label': T.close, onclick: () => ctl.close() }, '✕')),
      body,
      btns.length ? h('div', { class: 'kc-actions kc-actions-end' }, btns) : null);
    ov.addEventListener('click', (e) => { if (e.target === ov) ctl.close(); });
    ov.append(sheet);
    document.body.append(ov);
    document.addEventListener('keydown', onKey);
    setTimeout(() => { const f = sheet.querySelector('input'); if (f) f.focus(); }, 60);
    return ctl;
  }

  function buildForm(fields, onInput) {
    const inputs = {};
    const values = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
    const isNum = (f) => f.type === 'number';
    const node = h('div', { class: 'kc-form' }, fields.map((f) => {
      const input = h('input', {
        type: f.type || 'text', inputmode: isNum(f) ? 'decimal' : null, step: isNum(f) ? 'any' : null,
        min: isNum(f) ? '0' : null, maxlength: f.max || null, autocomplete: 'off',
      });
      input.value = f.value == null ? '' : f.value;
      input.addEventListener('input', () => onInput && onInput(values()));
      inputs[f.name] = input;
      return h('label', { class: 'kc-field' }, h('span', null, f.label), input);
    }));
    return { node, inputs, values };
  }

  /* ======================= bhejna / sync ======================= */
  async function send(type, payload) {
    if (!S.convId) { toast(T.noConv); return false; }
    if (!S.receiverId) { toast(T.noReceiver); return false; }
    try {
      const { message } = await api('/messages', {
        method: 'POST', body: { conversationId: S.convId, receiverId: S.receiverId, type, payload },
      });
      upsert(message, true);
      return true;
    } catch (e) { toast(e.message); return false; }
  }

  async function upload(blob, name) {
    const fd = new FormData();
    fd.append('file', blob, name);
    return api('/upload', { method: 'POST', body: fd });
  }

  function upsert(m, scroll) {
    if (!m) return;
    S.items.set(m._id, m);
    if (!S.after || m.updatedAt > S.after) S.after = m.updatedAt;
    if (!S.list) return;
    const node = renderMsg(m);
    const old = S.list.querySelector(`[data-id="${m._id}"]`);
    if (old) {
      old.replaceWith(node);
    } else {
      let ref = null;
      for (const c of S.list.children) { if (c.dataset.t > m.createdAt) { ref = c; break; } }
      S.list.insertBefore(node, ref);
    }
    if (scroll || m.senderId === myId()) scrollDown();
  }

  function scrollDown() {
    const box = S.list && S.list.parentNode;
    if (box) box.scrollTop = box.scrollHeight;
  }

  async function sync() {
    if (!S.convId) return;
    const q = new URLSearchParams({ conversationId: S.convId });
    if (S.after) q.set('after', S.after);
    const { messages } = await api('/messages?' + q);
    const box = S.list && S.list.parentNode;
    const stick = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    messages.forEach((m) => upsert(m, false));
    if (messages.length && stick) scrollDown();
  }

  /* ======================= UI lagana (toolbar + list) ======================= */
  function ensureUI() {
    const box = CONFIG.getMessagesBox();
    if (!box) return false;
    if (!S.list || !box.contains(S.list)) {
      S.list = h('div', { class: 'kc-list', id: 'kc-rich-list' });
      box.append(S.list);
      S.items.forEach((m) => upsert(m, false)); // chat dubara draw hui ho to wapas laga do
    }
    if (!S.bar || !document.body.contains(S.bar)) {
      const bar = h('div', { class: 'kc-bar', role: 'toolbar', 'aria-label': 'Chat ke khaas options' });
      const chip = (icon, label, fn) =>
        h('button', { type: 'button', class: 'kc-chip', onclick: (e) => fn(e.currentTarget) }, h('span', { 'aria-hidden': 'true' }, icon), label);
      bar.append(
        chip('💰', T.offer, () => openOfferSheet()),
        chip('📋', T.listing, openListingPicker),
        chip('📈', T.rate, openRateSheet),
        chip('📷', T.photo, pickPhoto),
        chip('🎙️', T.voice, openRecorder),
        chip('🗣️', T.dictate, dictate)
      );
      const inputBar = CONFIG.getInputBar();
      if (inputBar && inputBar.parentNode) inputBar.parentNode.insertBefore(bar, inputBar);
      else box.after(bar);
      S.bar = bar;
    }
    return true;
  }

  /* ======================= cards ======================= */
  function renderMsg(m) {
    const mine = m.senderId === myId();
    const make = { offer: offerCard, listing: listingCard, photo: photoCard, voice: voiceCard, rate: rateCard }[m.type];
    return h('div', { class: 'kc-row ' + (mine ? 'kc-me' : 'kc-them'), 'data-id': m._id, 'data-t': m.createdAt },
      make ? make(m, mine) : null,
      h('div', { class: 'kc-time' }, timeStr(m.createdAt)));
  }

  function offerCard(m, mine) {
    const p = m.payload || {};
    const st = m.status || 'pending';
    const canAnswer = st === 'pending' && !mine;
    return h('div', { class: 'kc-card kc-s-' + st },
      h('div', { class: 'kc-card-h' }, h('span', null, '💰 ' + T.offerTitle), h('span', { class: 'kc-badge' }, T[st] || st)),
      p.crop ? h('div', { class: 'kc-crop' }, p.crop) : null,
      h('div', { class: 'kc-big' }, inr(p.pricePerQuintal), h('small', null, ' / ' + T.perQ)),
      h('div', { class: 'kc-sub' }, `${num(p.quantityQuintal)} ${T.quintal} · ${T.total} ${inr(p.total)}`),
      p.note ? h('div', { class: 'kc-note' }, p.note) : null,
      st === 'pending' && mine ? h('div', { class: 'kc-hint' }, T.waiting) : null,
      canAnswer ? h('div', { class: 'kc-actions' },
        h('button', { type: 'button', class: 'kc-btn kc-ok', onclick: (e) => respond(m, 'accept', e.currentTarget) }, '✅ ' + T.accept),
        h('button', { type: 'button', class: 'kc-btn kc-no', onclick: (e) => respond(m, 'reject', e.currentTarget) }, '❌ ' + T.reject),
        h('button', { type: 'button', class: 'kc-btn kc-alt kc-wide', onclick: () => openOfferSheet({ counterOf: m }) }, '↔ ' + T.counter)
      ) : null);
  }

  function listingCard(m, mine) {
    const p = m.payload || {};
    const src = safeSrc(p.image);
    const meta = [p.quantityQuintal ? `${num(p.quantityQuintal)} ${T.quintal}` : '', p.location, p.sellerName].filter(Boolean).join(' · ');
    return h('div', { class: 'kc-card' },
      src ? h('img', { src, alt: p.crop || '', loading: 'lazy' }) : null,
      h('div', { class: 'kc-card-h' }, h('span', null, '📋 ' + T.listingTitle)),
      h('div', { class: 'kc-crop' }, p.crop),
      h('div', { class: 'kc-big' }, inr(p.pricePerQuintal), h('small', null, ' / ' + T.perQ)),
      meta ? h('div', { class: 'kc-sub' }, meta) : null,
      !mine ? h('div', { class: 'kc-actions' },
        h('button', {
          type: 'button', class: 'kc-btn kc-ok',
          onclick: () => openOfferSheet({ prefill: { crop: p.crop, price: p.pricePerQuintal, qty: p.quantityQuintal, listingId: p.listingId } }),
        }, '💰 ' + T.offerOnThis)) : null);
  }

  function rateCard(m) {
    const p = m.payload || {};
    const range = p.minPrice && p.maxPrice ? `${inr(p.minPrice)} – ${inr(p.maxPrice)}` : '';
    const meta = [p.market, p.date, p.source === 'live' ? 'लाइव' : ''].filter(Boolean).join(' · ');
    return h('div', { class: 'kc-card' },
      h('div', { class: 'kc-card-h' }, h('span', null, '📈 ' + T.rateTitle)),
      h('div', { class: 'kc-crop' }, p.crop),
      h('div', { class: 'kc-big' }, inr(p.modalPrice), h('small', null, ' / ' + T.perQ)),
      range || meta ? h('div', { class: 'kc-sub' }, [range, meta].filter(Boolean).join(' · ')) : null,
      h('div', { class: 'kc-actions' },
        h('button', {
          type: 'button', class: 'kc-btn kc-alt',
          onclick: () => openOfferSheet({ prefill: { crop: p.crop, price: p.modalPrice } }),
        }, '💰 ' + T.offerOnRate)));
  }

  function photoCard(m) {
    const p = m.payload || {};
    const src = safeSrc(p.url);
    const out = h('div', { class: 'kc-ai', hidden: 'hidden' });
    const label = '🔍 ' + T.aiCheck;
    const btn = h('button', {
      type: 'button', class: 'kc-btn kc-alt',
      onclick: async () => {
        btn.disabled = true; btn.textContent = T.checking;
        try { out.textContent = formatAI(await CONFIG.analyzePhoto(src)); out.hidden = false; }
        catch (e) { toast(e.message || T.aiFail); }
        btn.disabled = false; btn.textContent = label;
      },
    }, label);
    return h('div', { class: 'kc-card' },
      src ? h('img', { src, alt: T.photoAlt, loading: 'lazy', onclick: () => window.open(src, '_blank', 'noopener') }) : null,
      p.caption ? h('div', { class: 'kc-note' }, p.caption) : null,
      src ? h('div', { class: 'kc-actions' }, btn) : null,
      out);
  }

  function voiceCard(m) {
    const p = m.payload || {};
    const src = safeSrc(p.url);
    return h('div', { class: 'kc-card' },
      h('div', { class: 'kc-card-h' }, h('span', null, '🎙️ ' + T.voiceMsg), h('span', { class: 'kc-badge' }, mmss(p.durationSec || 0))),
      src ? h('audio', { controls: 'controls', preload: 'none', src }) : null);
  }

  function formatAI(r) {
    if (r == null) return T.aiFail;
    if (typeof r === 'string') return r;
    const keys = ['disease', 'name', 'label', 'result', 'confidence', 'advice', 'treatment', 'remedy'];
    const v = keys.map((k) => r[k]).filter((x) => x != null && x !== '')
      .map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x)));
    return v.length ? v.join('\n') : JSON.stringify(r).slice(0, 400);
  }

  /* ======================= offer ======================= */
  async function respond(m, action, btn) {
    const p = m.payload || {};
    if (action === 'accept' && !window.confirm(T.confirmAccept(num(p.pricePerQuintal), num(p.quantityQuintal), num(p.total)))) return;
    const btns = btn.closest('.kc-actions').querySelectorAll('button');
    btns.forEach((b) => { b.disabled = true; });
    try {
      const r = await api(`/offers/${m._id}/respond`, { method: 'POST', body: { action } });
      upsert(r.offer, false);
    } catch (e) {
      toast(e.message);
      btns.forEach((b) => { b.disabled = false; });
      sync().catch(() => {});
    }
  }

  function lastListingPrefill() {
    let found = null;
    for (const m of S.items.values()) {
      if (m.type === 'listing' && (!found || m.createdAt > found.createdAt)) found = m;
    }
    const p = found && found.payload;
    return p ? { crop: p.crop, price: p.pricePerQuintal, qty: p.quantityQuintal, listingId: p.listingId } : null;
  }

  function openOfferSheet(opts = {}) {
    const isCounter = !!opts.counterOf;
    const base = isCounter
      ? { crop: opts.counterOf.payload.crop, price: opts.counterOf.payload.pricePerQuintal, qty: opts.counterOf.payload.quantityQuintal }
      : opts.prefill || lastListingPrefill() || {};
    const summary = h('div', { class: 'kc-total' });
    const update = (v) => {
      const t = Math.round(Number(v.price) * Number(v.qty));
      summary.textContent = t > 0 ? `${T.total}: ${inr(t)}` : '';
    };
    const form = buildForm([
      { name: 'crop', label: T.fCrop, value: base.crop, max: 60 },
      { name: 'price', label: T.fPrice, type: 'number', value: base.price },
      { name: 'qty', label: T.fQty, type: 'number', value: base.qty },
      { name: 'note', label: T.fNote, max: 200 },
    ], update);
    if (isCounter) form.inputs.crop.disabled = true;
    update(form.values());

    openSheet({
      title: isCounter ? T.counter : T.offerTitle,
      body: h('div', null, form.node, summary),
      actions: [
        { label: T.cancel, cls: 'kc-alt', onClick: (ctl) => ctl.close() },
        {
          label: T.send,
          onClick: async (ctl) => {
            const v = form.values();
            if (!(Number(v.price) > 0 && Number(v.qty) > 0)) return toast(T.needPriceQty);
            const body = { pricePerQuintal: v.price, quantityQuintal: v.qty, note: v.note };
            if (isCounter) {
              try {
                const r = await api(`/offers/${opts.counterOf._id}/respond`, { method: 'POST', body: { action: 'counter', counter: body } });
                upsert(r.offer, false);
                upsert(r.counter, true);
              } catch (e) { return toast(e.message); }
            } else if (!(await send('offer', Object.assign({ crop: v.crop, listingId: base.listingId }, body)))) {
              return undefined;
            }
            ctl.close();
            return undefined;
          },
        },
      ],
    });
  }

  /* ======================= listing card ======================= */
  function toListingPayload(l) {
    l = l || {};
    return {
      listingId: l.id || l._id || '',
      crop: l.crop || l.cropName || l.name || '',
      pricePerQuintal: l.pricePerQuintal || l.price,
      quantityQuintal: l.quantityQuintal || l.quantity || l.qty,
      location: l.location || l.village || l.district || '',
      image: l.image || l.photo || (l.images && l.images[0]) || '',
      sellerName: l.sellerName || l.farmerName || '',
    };
  }

  async function openListingPicker() {
    let items = [];
    try { items = (await CONFIG.getListings()) || []; } catch (e) { items = []; }
    if (!items.length) return openManualListing();
    const ctl = openSheet({
      title: T.pickListing,
      body: h('div', { class: 'kc-pick' },
        items.slice(0, 20).map((l) => {
          const p = toListingPayload(l);
          return h('button', {
            type: 'button', class: 'kc-btn',
            onclick: async () => { if (await send('listing', p)) ctl.close(); },
          }, `${p.crop} · ${inr(p.pricePerQuintal)}/${T.perQ}`);
        }),
        h('button', { type: 'button', class: 'kc-btn kc-alt', onclick: () => { ctl.close(); openManualListing(); } }, T.manualListing)),
    });
  }

  function openManualListing() {
    const form = buildForm([
      { name: 'crop', label: T.fCrop, max: 60 },
      { name: 'price', label: T.fPrice, type: 'number' },
      { name: 'qty', label: T.fQty, type: 'number' },
      { name: 'location', label: T.fLocation, max: 80 },
    ]);
    openSheet({
      title: T.listingTitle, body: form.node,
      actions: [
        { label: T.cancel, cls: 'kc-alt', onClick: (ctl) => ctl.close() },
        {
          label: T.send,
          onClick: async (ctl) => {
            const v = form.values();
            if (!v.crop) return toast(T.needCrop);
            if (!(Number(v.price) > 0)) return toast(T.needPriceQty);
            if (await send('listing', { crop: v.crop, pricePerQuintal: v.price, quantityQuintal: v.qty, location: v.location })) ctl.close();
            return undefined;
          },
        },
      ],
    });
  }

  // Listing page ke "chat karo" button se: KrishiChatExtras.openWithListing(listing, sellerId)
  function openWithListing(listing, receiverId) {
    S.pendingListing = toListingPayload(listing);
    if (receiverId) S.receiverId = String(receiverId);
    CONFIG.openConversation(receiverId, listing);
    setTimeout(tick, 400);
  }

  async function flushPendingListing() {
    const p = S.pendingListing;
    if (!p || !S.convId || !S.receiverId) return;
    S.pendingListing = null;
    const already = [...S.items.values()].some((m) => m.type === 'listing' && m.senderId === myId() && p.listingId && m.payload.listingId === p.listingId);
    if (!already) await send('listing', p);
  }

  /* ======================= mandi rate ======================= */
  function openRateSheet() {
    const lp = lastListingPrefill() || {};
    const form = buildForm([
      { name: 'crop', label: T.fCrop, value: lp.crop, max: 60 },
      { name: 'market', label: T.fMarket, max: 80 },
      { name: 'modal', label: T.fModal, type: 'number' },
      { name: 'min', label: T.fMin, type: 'number' },
      { name: 'max', label: T.fMax, type: 'number' },
    ]);
    let live = false;
    form.inputs.modal.addEventListener('input', () => { live = false; });
    const liveBtn = h('button', {
      type: 'button', class: 'kc-btn kc-alt kc-wide',
      onclick: async () => {
        const v = form.values();
        if (!v.crop) return toast(T.needCrop);
        liveBtn.disabled = true;
        try {
          const r = await CONFIG.getMandiRate(v.crop);
          if (!r) { toast(T.noLive); } else {
            if (r.market) form.inputs.market.value = r.market;
            form.inputs.modal.value = r.modalPrice == null ? '' : r.modalPrice;
            form.inputs.min.value = r.minPrice == null ? '' : r.minPrice;
            form.inputs.max.value = r.maxPrice == null ? '' : r.maxPrice;
            live = true;
          }
        } catch (e) { toast(T.noLive); }
        liveBtn.disabled = false;
        return undefined;
      },
    }, '📡 ' + T.getLive);

    openSheet({
      title: T.rateTitle,
      body: h('div', { class: 'kc-form' }, liveBtn, form.node),
      actions: [
        { label: T.cancel, cls: 'kc-alt', onClick: (ctl) => ctl.close() },
        {
          label: T.send,
          onClick: async (ctl) => {
            const v = form.values();
            if (!v.crop) return toast(T.needCrop);
            if (!(Number(v.modal) > 0)) return toast(T.needRate);
            const ok = await send('rate', {
              crop: v.crop, market: v.market, modalPrice: v.modal, minPrice: v.min, maxPrice: v.max,
              source: live ? 'live' : 'manual', date: new Date().toISOString().slice(0, 10),
            });
            if (ok) ctl.close();
            return undefined;
          },
        },
      ],
    });
  }

  /* ======================= photo ======================= */
  async function compressImage(file, max = 1280, quality = 0.8) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(T.aiFail))), 'image/jpeg', quality));
  }

  function pickPhoto() {
    const input = h('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      let blob;
      try { blob = await compressImage(f); } catch (e) { return toast(e.message); }
      const url = URL.createObjectURL(blob);
      const caption = buildForm([{ name: 'caption', label: T.fCaption, max: 200 }]);
      openSheet({
        title: T.photo,
        body: h('div', null, h('img', { class: 'kc-preview', src: url, alt: T.photoAlt }), caption.node),
        onClose: () => URL.revokeObjectURL(url),
        actions: [
          { label: T.cancel, cls: 'kc-alt', onClick: (ctl) => ctl.close() },
          {
            label: T.send,
            onClick: async (ctl, b) => {
              b.textContent = T.sending;
              try {
                const up = await upload(blob, 'photo.jpg');
                if (await send('photo', { url: up.url, caption: caption.values().caption })) ctl.close();
              } catch (e) { toast(e.message); }
              b.textContent = T.send;
              return undefined;
            },
          },
        ],
      });
      return undefined;
    });
    input.click();
  }

  /* ======================= awaaz (voice note) ======================= */
  async function openRecorder() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return toast(T.noMic);
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return toast(T.micDenied); }

    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    const t0 = Date.now();
    let sec = 0;
    let cancelled = false;
    let ctl;
    const timeEl = h('div', { class: 'kc-rec-time' }, '0:00');
    const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
    const finish = () => { if (rec.state !== 'inactive') rec.stop(); };
    const ticker = setInterval(() => {
      sec = Math.round((Date.now() - t0) / 1000);
      timeEl.textContent = mmss(sec);
      if (sec >= 60) finish();
    }, 250);

    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      clearInterval(ticker);
      stopTracks();
      if (cancelled || !chunks.length) return;
      if (sec < 1) { toast(T.tooShort); ctl.close(); return; }
      try {
        const blob = new Blob(chunks, { type: (rec.mimeType || mime || 'audio/webm') });
        const up = await upload(blob, 'voice');
        await send('voice', { url: up.url, durationSec: sec });
      } catch (e) { toast(e.message); }
      ctl.close();
    };

    ctl = openSheet({
      title: '🎙️ ' + T.voice,
      body: h('div', { class: 'kc-rec' }, h('div', { class: 'kc-rec-dot' }), h('div', null, T.recording), timeEl, h('div', { class: 'kc-rec-hint' }, T.recHint)),
      onClose: () => { cancelled = cancelled || rec.state !== 'inactive'; finish(); clearInterval(ticker); stopTracks(); },
      actions: [
        { label: T.cancel, cls: 'kc-no', onClick: (c) => { cancelled = true; c.close(); } },
        { label: T.send, onClick: (c, b) => { b.textContent = T.sending; finish(); } },
      ],
    });
    rec.start();
    return undefined;
  }

  /* ======================= bolkar likhna (Hindi speech-to-text) ======================= */
  function dictate(btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const input = CONFIG.getTextInput();
    if (!SR) return toast(T.noSTT);
    if (!input) return toast(T.noInput);
    if (S.stt) { S.stt.stop(); return undefined; }
    const r = new SR();
    r.lang = 'hi-IN';
    r.interimResults = true;
    r.continuous = false;
    const base = input.value ? input.value.trim() + ' ' : '';
    btn.classList.add('kc-on');
    r.onresult = (e) => {
      input.value = base + Array.from(e.results).map((x) => x[0].transcript).join('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    r.onerror = (ev) => toast(ev.error === 'not-allowed' ? T.micDenied : T.sttErr);
    r.onend = () => { S.stt = null; btn.classList.remove('kc-on'); };
    S.stt = r;
    r.start();
    return undefined;
  }

  /* ======================= chalana ======================= */
  function resetConversation(id) {
    S.convId = id ? String(id) : null;
    S.receiverId = null;
    S.after = null;
    S.items.clear();
    if (S.list) S.list.replaceChildren();
  }

  function inferReceiver() {
    if (S.receiverId) return;
    const me = myId();
    for (const m of S.items.values()) {
      S.receiverId = m.senderId === me ? m.receiverId : m.senderId;
      return;
    }
  }

  async function tick() {
    if (document.hidden || S.busy) return;
    S.busy = true;
    try {
      if (!ensureUI()) return;
      const id = CONFIG.getConversationId();
      if ((id ? String(id) : null) !== S.convId) resetConversation(id);
      const rid = CONFIG.getReceiverId();
      if (rid) S.receiverId = String(rid);
      if (!S.convId) return;
      try { await sync(); } catch (e) { /* network gaya — agli baar phir koshish */ }
      inferReceiver();
      await flushPendingListing();
    } finally { S.busy = false; }
  }

  function start() {
    if (S.timer) return;
    setTimeout(tick, 300);
    S.timer = setInterval(tick, 3500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }

  window.KrishiChatExtras = {
    init(opts) {
      opts = opts || {};
      Object.assign(CONFIG, opts);
      if (opts.t) Object.assign(T, opts.t);
      start();
    },
    openWithListing,
    send,
    refresh: tick,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
