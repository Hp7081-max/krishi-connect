// Live mandi prices (Agmarknet via data.gov.in).
// Frontend (mandi-live.js) calls:  GET /api/mandi/prices?state=Uttar%20Pradesh
// and expects:  { success, data: { tomato: { modal, min, max, date, mandis, scope }, ... }, source }
//
// Needs DATA_GOV_API_KEY in Render -> Environment. Without it (or if data.gov.in is down) this route
// answers { success:false } and the app keeps showing its demo prices. It never crashes the server.
const express = require('express');
const router = express.Router();

const RESOURCE_ID = process.env.MANDI_RESOURCE_ID || '9ef84268-d588-465a-a308-a864a43d0070';
const API_URL = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const CACHE_MS = 30 * 60 * 1000;            // fresh for 30 minutes
const STALE_OK_MS = 24 * 60 * 60 * 1000;    // if data.gov.in fails, serve cache up to 24h old
const FETCH_TIMEOUT_MS = 12000;
const RECORD_LIMIT = 300;

// app crop key -> Agmarknet commodity names (first name that returns data wins)
const COMMODITIES = {
  tomato: ['Tomato'],
  onion: ['Onion'],
  potato: ['Potato'],
  wheat: ['Wheat'],
  paddy: ['Paddy(Dhan)(Basmati)', 'Paddy(Dhan)(Common)'],
  soy: ['Soyabean'],
  gram: ['Bengal Gram(Gram)(Whole)'],
  maize: ['Maize']
};

const cache = new Map();     // stateKey -> { at, data }
const inflight = new Map();  // stateKey -> Promise

function cleanState(raw) {
  const s = String(raw || 'Uttar Pradesh').replace(/\s+/g, ' ').trim().slice(0, 50);
  if (!s) return 'Uttar Pradesh';
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// data.gov.in field names change between datasets (modal_price / Modal_Price / Modal_x0020_Price)
function pick(rec, names) {
  for (const n of names) {
    if (rec[n] !== undefined && rec[n] !== null && rec[n] !== '') return rec[n];
  }
  return undefined;
}
function num(v) {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
// "31/10/2026" -> "2026-10-31" (ISO so the frontend can compare dates as plain strings)
function isoDate(v) {
  const m = String(v || '').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : '';
}
function median(arr) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return Math.round(a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2);
}

async function fetchRecords(apiKey, commodity, state) {
  const params = new URLSearchParams({
    'api-key': apiKey,
    format: 'json',
    limit: String(RECORD_LIMIT),
    'filters[commodity]': commodity
  });
  if (state) params.set('filters[state]', state);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_URL}?${params.toString()}`, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`data.gov.in HTTP ${resp.status}`);
    const json = await resp.json();
    return Array.isArray(json.records) ? json.records : [];
  } finally {
    clearTimeout(timer);
  }
}

// Reduce raw records to one price row: only the newest date, median across reporting mandis
function summarise(records, scope) {
  const rows = records
    .map((r) => ({
      date: isoDate(pick(r, ['arrival_date', 'Arrival_Date'])),
      modal: num(pick(r, ['modal_price', 'Modal_Price', 'Modal_x0020_Price'])),
      min: num(pick(r, ['min_price', 'Min_Price', 'Min_x0020_Price'])),
      max: num(pick(r, ['max_price', 'Max_Price', 'Max_x0020_Price']))
    }))
    .filter((r) => r.date && r.modal);
  if (!rows.length) return null;

  const latest = rows.reduce((d, r) => (r.date > d ? r.date : d), '');
  const today = rows.filter((r) => r.date === latest);
  return {
    modal: median(today.map((r) => r.modal)),
    min: median(today.map((r) => r.min).filter(Boolean)),
    max: median(today.map((r) => r.max).filter(Boolean)),
    date: latest,
    mandis: today.length,
    scope, // 'state' = your state's mandis, 'india' = fallback because the state had no data
    unit: 'Rs/quintal'
  };
}

async function loadCrop(apiKey, names, state) {
  for (const name of names) {
    const s = summarise(await fetchRecords(apiKey, name, state), 'state');
    if (s) return s;
  }
  for (const name of names) {
    const s = summarise(await fetchRecords(apiKey, name, null), 'india');
    if (s) return s;
  }
  return null;
}

async function loadAll(apiKey, state) {
  const keys = Object.keys(COMMODITIES);
  const results = await Promise.all(
    keys.map((k) => loadCrop(apiKey, COMMODITIES[k], state).catch((e) => {
      console.warn(`[mandi] ${k} failed:`, e.message);
      return null;
    }))
  );
  const data = {};
  keys.forEach((k, i) => { if (results[i]) data[k] = results[i]; });
  return data;
}

// GET /api/mandi/prices?state=Uttar Pradesh
router.get('/prices', async (req, res) => {
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ success: false, message: 'DATA_GOV_API_KEY set nahi hai (Render -> Environment).' });
  }

  const state = cleanState(req.query.state);
  const hit = cache.get(state);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return res.json({ success: true, source: 'Agmarknet / data.gov.in', state, cached: true, data: hit.data });
  }

  try {
    if (!inflight.has(state)) {
      inflight.set(state, loadAll(apiKey, state).finally(() => inflight.delete(state)));
    }
    const data = await inflight.get(state);
    if (!Object.keys(data).length) throw new Error('koi bhav nahi mila');
    cache.set(state, { at: Date.now(), data });
    return res.json({ success: true, source: 'Agmarknet / data.gov.in', state, cached: false, data });
  } catch (err) {
    console.warn('[mandi] live fetch failed:', err.message);
    if (hit && Date.now() - hit.at < STALE_OK_MS) {
      return res.json({ success: true, source: 'Agmarknet / data.gov.in (purana cache)', state, cached: true, stale: true, data: hit.data });
    }
    return res.status(502).json({ success: false, message: 'Live mandi bhav abhi nahi mil paye.' });
  }
});

module.exports = router;
