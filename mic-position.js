/*! mic-position.js — floating mic ko right-bottom se hatakar upar rakhta hai.
 *  Mic ko ungli se pakad kar kahin bhi khiskaya ja sakta hai; jagah yaad rahti hai.
 *
 *  HTML me (voice.js ke baad):  <script src="mic-position.js" defer></script>
 *
 *  Agar mic nahi hila, to neeche SELECTORS me apne mic button ka id/class jod do.
 *  Dobara default jagah par lana ho to browser console me:  KrishiMic.reset()
 */
(function () {
  'use strict';

  const SELECTORS = [
    '#voice-btn', '#voiceBtn', '#mic-btn', '#micBtn', '#voice-control', '#voiceControl',
    '#voice-button', '#mic', '.voice-btn', '.mic-btn', '.voice-fab', '.mic-fab', '[data-voice-button]',
  ];
  const DEFAULT_TOP = 8;   // px — upar se doori (notch ka hissa apne aap jud jata hai)
  const DEFAULT_LEFT = 8;  // px — left se doori
  const KEY = 'kc_mic_pos_v1';

  const css = `
    .kc-mic-moved{position:fixed!important;right:auto!important;bottom:auto!important;margin:0!important;
      z-index:9990!important;touch-action:none;cursor:grab}
    .kc-mic-moved:active{cursor:grabbing}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } };
  const clear = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

  let el = null;
  let suppressClickUntil = 0;

  function put(x, y, remember) {
    const r = el.getBoundingClientRect();
    const nx = Math.min(Math.max(0, x), Math.max(0, window.innerWidth - r.width));
    const ny = Math.min(Math.max(0, y), Math.max(0, window.innerHeight - r.height));
    el.style.setProperty('left', nx + 'px', 'important');
    el.style.setProperty('top', ny + 'px', 'important');
    if (remember) save({ x: nx, y: ny });
  }

  function placeDefault() {
    el.style.setProperty('left', DEFAULT_LEFT + 'px', 'important');
    el.style.setProperty('top', `calc(env(safe-area-inset-top, 0px) + ${DEFAULT_TOP}px)`, 'important');
  }

  function apply() {
    el.classList.add('kc-mic-moved');
    const saved = load();
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) put(saved.x, saved.y, false);
    else placeDefault();
  }

  function enableDrag() {
    let d = null;
    el.addEventListener('pointerdown', (e) => {
      const r = el.getBoundingClientRect();
      d = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return; // chhota hilna = click
      d.moved = true;
      put(e.clientX - d.dx, e.clientY - d.dy, false);
    });
    const end = () => {
      if (d && d.moved) {
        const r = el.getBoundingClientRect();
        save({ x: r.left, y: r.top });
        suppressClickUntil = Date.now() + 350; // khiskane ke baad galti se click na ho
      }
      d = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => {
      if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  function find() {
    for (const s of SELECTORS) {
      const n = document.querySelector(s);
      if (n) return n;
    }
    return null;
  }

  function init() {
    const found = find();
    if (!found || found === el) return !!found;
    el = found;
    apply();
    enableDrag();
    window.addEventListener('resize', () => {
      const saved = load();
      if (saved) put(saved.x, saved.y, false);
    });
    return true;
  }

  // voice.js mic baad me bana sakta hai — 20 second tak dhoondhte raho
  let tries = 0;
  const poll = setInterval(() => {
    if (init() || ++tries > 40) {
      clearInterval(poll);
      if (!el) console.warn('[mic-position] Mic button nahi mila. SELECTORS me apna id/class daalo.');
    }
  }, 500);

  window.KrishiMic = {
    reset() { clear(); if (el) placeDefault(); },
  };
})();
