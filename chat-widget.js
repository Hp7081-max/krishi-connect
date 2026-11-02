/**
 * Krishi Connect - Chat Widget (bubble + panel). Include ONE line before </body>:
 *    <script src="chat-widget.js" defer></script>
 * Optional manual hooks:
 *    KrishiChat.setUser({ id, name, role, token })   // if auto-detect fails
 *    KrishiChat.openWith({ id, name, role }, 'Deal #123')  // e.g. from a "Chat" button on a bid/deal
 */
(function () {
  if (window.KrishiChat) return;

  var BASE = (window.KRISHI_API_BASE || '') + '/api/chat';
  var JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
  var S = { user: null, open: false, view: 'list', rooms: [], contacts: [], room: null, msgs: [], last: 0, unread: 0, timer: null, socketOn: false };

  /* ---------------- identity ---------------- */
  function b64json(s) {
    try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; }
  }
  function scanStore(store, out) {
    try {
      for (var i = 0; i < store.length; i++) {
        var v = store.getItem(store.key(i));
        if (!v) continue;
        if (JWT_RE.test(v)) { out.token = out.token || v; continue; }
        var o = null;
        try { o = JSON.parse(v); } catch (e) { continue; }
        if (!o || typeof o !== 'object') continue;
        var cand = o.user && typeof o.user === 'object' ? o.user : o;
        if (o.token && JWT_RE.test(o.token)) out.token = out.token || o.token;
        if (cand.name && (cand.role || cand.contact || cand._id || cand.id)) out.obj = out.obj || cand;
      }
    } catch (e) {}
  }
  function detectUser() {
    if (S.manual) return S.manual;
    var f = {};
    scanStore(window.localStorage, f);
    scanStore(window.sessionStorage, f);
    var p = f.token ? b64json(f.token.split('.')[1]) : null;
    var o = f.obj || {};
    var id = (p && (p.id || p._id || p.userId || p.sub)) || o._id || o.id || o.contact || null;
    var name = (p && p.name) || o.name || null;
    var role = (p && p.role) || o.role || 'user';
    if (!id && name) id = (name + '-' + role).toLowerCase().replace(/\s+/g, '_');
    if (!id) return null;
    return { id: String(id), name: name || 'User', role: role, token: f.token || null };
  }
  function headers() {
    var h = { 'Content-Type': 'application/json' };
    if (S.user) {
      if (S.user.token) h.Authorization = 'Bearer ' + S.user.token;
      h['x-user-id'] = encodeURIComponent(S.user.id);
      h['x-user-name'] = encodeURIComponent(S.user.name);
      h['x-user-role'] = encodeURIComponent(S.user.role);
    }
    return h;
  }
  function api(path, opt) {
    opt = opt || {};
    opt.headers = headers();
    return fetch(BASE + path, opt).then(function (r) { return r.json(); });
  }

  /* ---------------- tiny DOM helper ---------------- */
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
  function fmt(ts) {
    var d = new Date(ts), n = new Date();
    var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === n.toDateString() ? t : d.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' + t;
  }

  /* ---------------- CSS ---------------- */
  var css = '\
#kc-bubble{position:fixed;right:16px;bottom:calc(88px + env(safe-area-inset-bottom,0px));width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;z-index:2147483000;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:26px;box-shadow:0 6px 20px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}\
#kc-bubble:hover{transform:scale(1.06)}\
#kc-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;color:#fff;font:700 12px/20px system-ui,sans-serif;text-align:center;padding:0 5px;display:none}\
#kc-panel{position:fixed;right:16px;bottom:calc(158px + env(safe-area-inset-bottom,0px));width:360px;max-width:calc(100vw - 24px);height:min(520px,calc(100vh - 190px));background:#0f1a14;color:#e8f5e9;border:1px solid #1f3a2a;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.6);z-index:2147483000;display:none;flex-direction:column;overflow:hidden;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}\
#kc-panel.open{display:flex}\
.kc-head{display:flex;align-items:center;gap:8px;padding:12px 14px;background:#10281a;border-bottom:1px solid #1f3a2a;font-weight:700}\
.kc-head .t{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.kc-ib{background:transparent;border:0;color:#bbf7d0;font-size:18px;cursor:pointer;padding:2px 6px}\
.kc-body{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px}\
.kc-row{display:flex;gap:10px;align-items:center;padding:10px;border-radius:10px;background:#13241a;cursor:pointer}\
.kc-row:hover{background:#18301f}\
.kc-row .m{flex:1;min-width:0}\
.kc-row .n{font-weight:600}\
.kc-row .s{font-size:12px;color:#86efac;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.kc-un{background:#22c55e;color:#04210f;border-radius:10px;font-size:11px;font-weight:700;padding:1px 7px}\
.kc-sec{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6ee7b7;opacity:.7;margin:8px 2px 2px}\
.kc-msg{max-width:80%;padding:8px 11px;border-radius:14px;line-height:1.35;word-wrap:break-word;white-space:pre-wrap}\
.kc-msg.me{align-self:flex-end;background:#16a34a;color:#fff;border-bottom-right-radius:4px}\
.kc-msg.th{align-self:flex-start;background:#1c2e23;border-bottom-left-radius:4px}\
.kc-msg .who{font-size:11px;font-weight:700;color:#86efac;margin-bottom:2px}\
.kc-msg .ts{font-size:10px;opacity:.65;margin-top:3px;text-align:right}\
.kc-foot{display:flex;gap:8px;padding:10px;border-top:1px solid #1f3a2a;background:#10281a}\
.kc-foot input{flex:1;background:#0b140f;border:1px solid #1f3a2a;color:#e8f5e9;border-radius:20px;padding:9px 14px;outline:0;font-size:14px}\
.kc-foot button{background:#22c55e;border:0;color:#04210f;font-weight:700;border-radius:20px;padding:0 16px;cursor:pointer}\
.kc-empty{margin:auto;text-align:center;opacity:.7;padding:20px}\
@media(max-width:520px){#kc-panel{right:0;left:0;bottom:0;width:100vw;max-width:100vw;height:100vh;border-radius:0}#kc-bubble{bottom:calc(84px + env(safe-area-inset-bottom,0px))}}';

  /* ---------------- build UI ---------------- */
  var bubble, badge, panel, head, body, foot, input;
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    badge = h('span', { id: 'kc-badge' });
    bubble = h('button', { id: 'kc-bubble', title: 'Chat', 'aria-label': 'Chat', onclick: toggle }, ['💬', badge]);
    head = h('div', { class: 'kc-head' });
    body = h('div', { class: 'kc-body' });
    input = h('input', { type: 'text', placeholder: 'Message likhein…', maxlength: '2000', onkeydown: function (e) { if (e.key === 'Enter') send(); } });
    foot = h('div', { class: 'kc-foot' }, [input, h('button', { onclick: send }, ['Bhejein'])]);
    panel = h('div', { id: 'kc-panel' }, [head, body, foot]);
    document.body.appendChild(panel);
    document.body.appendChild(bubble);
  }

  function setBadge(n) {
    S.unread = n;
    badge.style.display = n > 0 ? 'block' : 'none';
    badge.textContent = n > 99 ? '99+' : String(n);
  }

  function renderHead(title, back) {
    head.innerHTML = '';
    if (back) head.appendChild(h('button', { class: 'kc-ib', onclick: showList, title: 'Back' }, ['←']));
    head.appendChild(h('div', { class: 't' }, [title]));
    head.appendChild(h('button', { class: 'kc-ib', onclick: toggle, title: 'Close' }, ['✕']));
  }

  /* ---------------- views ---------------- */
  function needLogin() {
    renderHead('💬 Krishi Chat', false);
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'kc-empty' }, ['Chat ke liye pehle login karein, phir yahan wapas aayein.']));
    foot.style.display = 'none';
  }

  function showList() {
    S.view = 'list'; S.room = null;
    foot.style.display = 'none';
    renderHead('💬 Krishi Chat', false);
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'kc-empty' }, ['Loading…']));
    Promise.all([api('/rooms'), api('/contacts')]).then(function (r) {
      S.rooms = r[0].rooms || []; S.contacts = r[1].contacts || [];
      setBadge(r[0].unread || 0);
      if (S.view !== 'list') return;
      body.innerHTML = '';
      body.appendChild(h('div', { class: 'kc-sec' }, ['Chats']));
      S.rooms.forEach(function (rm) {
        var kids = [h('div', { class: 'm' }, [h('div', { class: 'n' }, [rm.title]), h('div', { class: 's' }, [rm.last ? (rm.last.fromName + ': ' + rm.last.text) : 'Abhi koi message nahi'])])];
        if (rm.unread) kids.push(h('span', { class: 'kc-un' }, [String(rm.unread)]));
        body.appendChild(h('div', { class: 'kc-row', onclick: function () { openRoom(rm.id, rm.title); } }, kids));
      });
      body.appendChild(h('div', { class: 'kc-sec' }, ['Naya chat shuru karein']));
      if (!S.contacts.length) body.appendChild(h('div', { class: 'kc-empty' }, ['Abhi aur koi user online nahi aaya. Jaise hi farmer/buyer chat kholenge, yahan dikhenge.']));
      S.contacts.forEach(function (c) {
        body.appendChild(h('div', { class: 'kc-row', onclick: function () { startDm(c); } }, [h('div', { class: 'm' }, [h('div', { class: 'n' }, [c.name]), h('div', { class: 's' }, [c.role || 'user'])])]));
      });
    }).catch(function () {
      body.innerHTML = '';
      body.appendChild(h('div', { class: 'kc-empty' }, ['Chat server se connect nahi ho paaya. Thodi der baad try karein.']));
    });
  }

  function startDm(c, context) {
    return api('/dm', { method: 'POST', body: JSON.stringify({ withId: c.id, withName: c.name, withRole: c.role, context: context || '' }) })
      .then(function (r) { if (r.ok) openRoom(r.room.id, r.room.title); });
  }

  function openRoom(id, title) {
    S.view = 'room'; S.room = id; S.msgs = []; S.last = 0;
    foot.style.display = 'flex';
    renderHead(title, true);
    body.innerHTML = '';
    pull(true);
    setTimeout(function () { input.focus(); }, 50);
  }

  function drawMsgs() {
    body.innerHTML = '';
    if (!S.msgs.length) { body.appendChild(h('div', { class: 'kc-empty' }, ['Pehla message bhejein 👋'])); return; }
    S.msgs.forEach(function (m) {
      var mine = S.user && m.from === S.user.id;
      var kids = [];
      if (!mine) kids.push(h('div', { class: 'who' }, [m.fromName + (m.fromRole ? ' · ' + m.fromRole : '')]));
      kids.push(document.createTextNode(m.text));
      kids.push(h('div', { class: 'ts' }, [fmt(m.ts)]));
      body.appendChild(h('div', { class: 'kc-msg ' + (mine ? 'me' : 'th') }, kids));
    });
    body.scrollTop = body.scrollHeight;
  }

  function pull(initial) {
    if (!S.room) return;
    var rid = S.room;
    api('/rooms/' + encodeURIComponent(rid) + '/messages?after=' + (initial ? 0 : S.last)).then(function (r) {
      if (rid !== S.room || !r.ok) return;
      var fresh = r.messages || [];
      if (fresh.length) {
        var seen = {}; S.msgs.forEach(function (m) { seen[m.id] = 1; });
        fresh.forEach(function (m) { if (!seen[m.id]) S.msgs.push(m); });
        S.last = S.msgs[S.msgs.length - 1].ts;
        drawMsgs();
        api('/rooms/' + encodeURIComponent(rid) + '/read', { method: 'POST', body: '{}' });
      } else if (initial) drawMsgs();
    });
  }

  function send() {
    var text = input.value.trim();
    if (!text || !S.room) return;
    input.value = '';
    api('/rooms/' + encodeURIComponent(S.room) + '/messages', { method: 'POST', body: JSON.stringify({ text: text }) }).then(function (r) {
      if (r.ok) { S.msgs.push(r.message); S.last = r.message.ts; drawMsgs(); }
    });
  }

  /* ---------------- open/close + polling ---------------- */
  function ensureUser() {
    var u = detectUser();
    var changed = (u && (!S.user || S.user.id !== u.id || S.user.token !== u.token));
    if (!u) { S.user = null; return Promise.resolve(false); }
    S.user = u;
    if (!changed && S.hello) return Promise.resolve(true);
    return api('/hello', { method: 'POST', body: '{}' }).then(function () { S.hello = true; joinSocket(); return true; }).catch(function () { return false; });
  }

  function toggle() {
    S.open = !S.open;
    panel.classList.toggle('open', S.open);
    if (!S.open) return;
    ensureUser().then(function (ok) { if (!ok) needLogin(); else showList(); });
  }

  function tick() {
    ensureUser().then(function (ok) {
      if (!ok) return;
      if (S.open && S.view === 'room') pull(false);
      else if (!S.open || S.view === 'list') {
        api('/rooms').then(function (r) { if (r.ok) setBadge(r.unread || 0); if (S.open && S.view === 'list' && !S.socketOn) { /* keep list static to avoid flicker */ } }).catch(function () {});
      }
    });
  }

  /* ---------------- socket.io (optional realtime) ---------------- */
  function joinSocket() {
    if (S.socket) { if (S.user) S.socket.emit('chat:join', { userId: S.user.id }); return; }
    function connect() {
      try {
        S.socket = window.io(window.KRISHI_API_BASE || undefined);
        S.socketOn = true;
        S.socket.on('connect', function () { if (S.user) S.socket.emit('chat:join', { userId: S.user.id }); });
        S.socket.on('chat:message', function (m) {
          if (S.user && m.from === S.user.id) return;
          if (S.open && S.view === 'room' && S.room === m.roomId) pull(false);
          else tick();
        });
      } catch (e) { S.socketOn = false; }
    }
    if (window.io) return connect();
    var sc = document.createElement('script');
    sc.src = (window.KRISHI_API_BASE || '') + '/socket.io/socket.io.js';
    sc.onload = connect;
    sc.onerror = function () { S.socketOn = false; };
    document.head.appendChild(sc);
  }

  /* ---------------- public API ---------------- */
  window.KrishiChat = {
    setUser: function (u) { S.manual = u && u.id ? { id: String(u.id), name: u.name || 'User', role: u.role || 'user', token: u.token || null } : null; S.hello = false; ensureUser(); },
    open: function () { if (!S.open) toggle(); },
    openWith: function (c, context) {
      if (!S.open) { S.open = true; panel.classList.add('open'); }
      ensureUser().then(function (ok) { if (!ok) return needLogin(); startDm(c, context); });
    }
  };

  function init() {
    build();
    ensureUser().then(function (ok) { if (ok) tick(); });
    setInterval(tick, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
