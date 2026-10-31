// Real crop-disease check using an AI vision model (Google Gemini API, free tier available).
// Needs ONE environment variable in Render:  GEMINI_API_KEY   (never put the key in code or GitHub)
// Optional: GEMINI_MODEL  (default below; change it in Render if Google renames the model)
//
// Mount in server.js:
//   app.use('/api/disease-ai', requireAuth, require('./routes/diseaseAI'));
const express = require('express');
const router = express.Router();

const DEFAULT_MODEL = 'gemini-3.8-flash';
const MAX_DATAURL_CHARS = 6000000;      // ~4.5 MB image, the browser sends ~150 KB
const TIMEOUT_MS = 40000;

const LANG_NAME = {
  hi: 'Hindi (Devanagari script, simple farmer-friendly words)',
  en: 'simple English',
  mr: 'Marathi (Devanagari script)',
  pa: 'Punjabi (Gurmukhi script)'
};

// small per-IP limit so nobody can burn the free quota: 8 scans per minute
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 8;
}

function buildPrompt(cropKey, lang) {
  return [
    'You are an agriculture extension assistant helping Indian farmers. Look at the photo of a crop plant and judge its health.',
    `The farmer says the crop is: "${cropKey}".`,
    'Rules:',
    '- Judge ONLY from what is visible. If the photo is blurry, too far, not a plant, or you cannot tell, set status to "unclear" and ask for a clearer close-up of the affected leaf in "what_i_see".',
    '- Give your most likely single cause. Be honest about confidence (0-100). Do not pretend to be certain.',
    '- If the plant looks healthy, say so (status "healthy") and give short care tips.',
    '- For treatment, prefer low-risk steps first (remove infected leaves, drainage, spacing, neem-based spray, crop rotation). If a chemical is needed, name only the type or common active ingredient and say "follow the dose printed on the product label". NEVER invent doses, mixing ratios or quantities.',
    '- Set "see_expert" true whenever the problem looks serious, spreading, or you are not confident.',
    `Write every text value in ${LANG_NAME[lang] || LANG_NAME.hi}.`,
    'Return ONLY JSON in exactly this shape:',
    '{"is_plant_photo":boolean,"crop_matches":boolean,"crop_seen":"string","status":"healthy|disease|pest|nutrient|unclear","name":"short name of problem or Healthy","confidence":number,"severity":"low|medium|high|unknown","what_i_see":"1-2 short sentences","treatment":["up to 4 short steps"],"prevention":["up to 3 short tips"],"see_expert":boolean}'
  ].join('\n');
}

function clamp(n, lo, hi) {
  n = Number(n);
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function strList(a, max) {
  return (Array.isArray(a) ? a : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, 300));
}
function normalize(raw) {
  const status = ['healthy', 'disease', 'pest', 'nutrient', 'unclear'].includes(raw.status) ? raw.status : 'unclear';
  const severity = ['low', 'medium', 'high', 'unknown'].includes(raw.severity) ? raw.severity : 'unknown';
  const confidence = clamp(raw.confidence, 0, 100);
  return {
    isPlant: raw.is_plant_photo !== false,
    cropMatches: raw.crop_matches !== false,
    cropSeen: String(raw.crop_seen || '').slice(0, 60),
    status,
    name: String(raw.name || '').slice(0, 120) || (status === 'healthy' ? 'Healthy' : '—'),
    confidence,
    severity,
    whatISee: String(raw.what_i_see || '').slice(0, 400),
    treatment: strList(raw.treatment, 4),
    prevention: strList(raw.prevention, 3),
    // low confidence or serious cases always send the farmer to an expert
    seeExpert: raw.see_expert === true || status === 'unclear' || confidence < 60 || severity === 'high'
  };
}

function extractJson(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('no json');
  return JSON.parse(s.slice(a, b + 1));
}

router.get('/status', (req, res) => {
  res.json({ success: true, ready: !!process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || DEFAULT_MODEL });
});

router.post('/', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(503).json({ success: false, message: 'AI abhi chalu nahi hai (server par GEMINI_API_KEY nahi mili).' });
    }
    if (tooMany(req.ip)) {
      return res.status(429).json({ success: false, message: 'Bahut jaldi-jaldi jaanch ho rahi hai. Ek minute ruk kar dobara try karein.' });
    }

    const { cropKey, image, lang } = req.body || {};
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ''));
    if (!m || String(image).length > MAX_DATAURL_CHARS) {
      return res.status(400).json({ success: false, message: 'Photo sahi nahi hai ya bahut badi hai. Dusri photo lein.' });
    }
    const crop = String(cropKey || 'tomato').replace(/[^a-z_ -]/gi, '').slice(0, 30) || 'tomato';
    const language = LANG_NAME[lang] ? lang : 'hi';
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(crop, language) }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
          generationConfig: { responseMimeType: 'application/json' }
        }),
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).slice(0, 300); } catch (e) {}
      console.error(`[disease-ai] Gemini HTTP ${r.status}: ${detail}`);
      if (r.status === 429) return res.status(503).json({ success: false, message: 'AI ki free limit abhi poori ho gayi hai. Thodi der baad dobara try karein.' });
      if (r.status === 400 || r.status === 403) return res.status(502).json({ success: false, message: 'AI key ya setting me dikkat hai. Admin ko batayein (Render logs dekhein).' });
      if (r.status === 404) return res.status(502).json({ success: false, message: 'AI model ka naam purana ho gaya hai. Render me GEMINI_MODEL badlein.' });
      return res.status(502).json({ success: false, message: 'AI se jawab nahi mila. Thodi der baad try karein.' });
    }

    const data = await r.json();
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map((p) => p.text || '').join('');
    let parsed;
    try {
      parsed = extractJson(text);
    } catch (e) {
      console.error('[disease-ai] could not read AI answer:', String(text).slice(0, 200));
      return res.status(502).json({ success: false, message: 'AI ka jawab samajh nahi aaya. Dobara try karein.' });
    }
    res.json({ success: true, data: normalize(parsed) });
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    console.error('[disease-ai] error:', err && err.message);
    res.status(timedOut ? 504 : 500).json({
      success: false,
      message: timedOut ? 'AI ko bahut der lag gayi. Dobara try karein.' : 'Jaanch nahi ho paayi. Dobara try karein.'
    });
  }
});

module.exports = router;
