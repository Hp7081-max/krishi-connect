// AI crop grading from a photo (Google Gemini). Uses the same GEMINI_API_KEY as disease-ai.
// Mounted in server.js:  app.use('/api/grade-ai', requireAuth, require('./routes/gradeAI'));
// The answer is an ESTIMATE from one photo, not a lab test. The browser falls back to its own
// pixel-based grader if this route fails.
const express = require('express');
const router = express.Router();

const DEFAULT_MODEL = 'gemini-3.8-flash';
const MAX_DATAURL_CHARS = 6000000;
const TIMEOUT_MS = 40000;

const LANG_NAME = {
  hi: 'Hindi (Devanagari script, simple farmer-friendly words)',
  en: 'simple English',
  mr: 'Marathi (Devanagari script)',
  pa: 'Punjabi (Gurmukhi script)'
};

// What a mandi buyer looks at, per crop. Edit these lines to match your local mandi practice.
const CROP_RULES = {
  tomato: 'Tomato: uniform deep red (or the same ripeness stage), firm and smooth skin, no cracks, no soft or rotten spots, no black marks, no green shoulders, similar size. Burst/cracked, soft or blemished fruit lowers the grade.',
  onion: 'Onion: dry papery skin, uniform colour, firm bulbs, no sprouting, no black mould, no soft/rotten neck, no cuts, similar size. Sprouting, mould or doubles/splits lower the grade.',
  potato: 'Potato: clean firm tubers, smooth skin, no green patches, no cuts, no scab or black spots, no rot, no sprouting, similar size. Green skin, rot or deep damage lowers the grade.',
  wheat: 'Wheat: plump grains of uniform golden colour, few broken or shrivelled grains, no visible stones, dust, chaff or other seeds, no mould, no insect holes. More foreign matter or broken grains lowers the grade.',
  paddy: 'Basmati paddy: long slender uniform grains, clean golden-straw colour, few broken/chalky/discoloured grains, no husk dust or foreign matter, no mould. Many discoloured or broken grains lowers the grade.',
  soy: 'Soybean: clean uniform round yellow beans, few split/wrinkled/green/damaged beans, no mould, no stones or pods, no insect holes. Many damaged or discoloured beans lowers the grade.',
  gram: 'Gram (chana): uniform size and colour, plump seeds, few broken or shrivelled seeds, no insect holes, no stones or dust, no mould. Insect-damaged or broken seeds lower the grade.',
  maize: 'Maize: full yellow kernels of uniform colour, few broken or shrivelled kernels, no mould or black tips, no insect damage, no cob/foreign matter. Mouldy or damaged kernels lower the grade.'
};

// per-IP limit: 10 grade checks per minute
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 10;
}

function buildPrompt(cropKey, lang) {
  return [
    'You are a mandi quality-grading assistant for Indian farmers. Look at the photo of harvested produce and estimate its grade the way a buyer would, from what is VISIBLE only.',
    `The farmer says the crop is: "${cropKey}".`,
    `What to check: ${CROP_RULES[cropKey] || 'Colour, size uniformity, damage, rot, foreign matter.'}`,
    'Grades: "A" = premium (clean, uniform, almost no defects). "B" = standard (some defects or uneven). "C" = fair (many defects, damage or mixed quality).',
    'Rules:',
    '- Judge ONLY what you can see. You cannot measure moisture, weight or lab quality from a photo, so never claim to.',
    '- If the photo is not the stated crop, is blurry, too dark or too far to judge, set "gradable" to false.',
    '- Score 0-100 (A is roughly 70+, B 48-69, C below 48). Be honest; do not inflate the grade.',
    '- "reasons": 2 to 4 short points, each naming something you actually saw. If the photo quality limits accuracy, add one point saying so.',
    `Write every text value in ${LANG_NAME[lang] || LANG_NAME.hi}.`,
    'Return ONLY JSON in exactly this shape:',
    '{"gradable":boolean,"crop_matches":boolean,"grade":"A|B|C","score":number,"reasons":["short points"],"photo_issue":"empty string, or one short sentence if the photo is too poor"}'
  ].join('\n');
}

function extractJson(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('no json');
  return JSON.parse(s.slice(a, b + 1));
}

function normalize(raw) {
  let score = Number(raw.score);
  score = isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  const grade = ['A', 'B', 'C'].includes(raw.grade) ? raw.grade : (score >= 70 ? 'A' : score >= 48 ? 'B' : 'C');
  const reasons = (Array.isArray(raw.reasons) ? raw.reasons : [])
    .map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4).map((s) => s.slice(0, 200));
  return {
    gradable: raw.gradable !== false && raw.crop_matches !== false,
    cropMatches: raw.crop_matches !== false,
    grade,
    score,
    reasons,
    photoIssue: String(raw.photo_issue || '').slice(0, 200)
  };
}

router.get('/status', (req, res) => {
  res.json({ success: true, ready: !!process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || DEFAULT_MODEL });
});

router.post('/', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(503).json({ success: false, message: 'AI abhi chalu nahi hai (GEMINI_API_KEY nahi mili).' });
    if (tooMany(req.ip)) return res.status(429).json({ success: false, message: 'Bahut jaldi-jaldi jaanch ho rahi hai. Ek minute ruk kar dobara try karein.' });

    const { crop, image, lang } = req.body || {};
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ''));
    if (!m || String(image).length > MAX_DATAURL_CHARS) {
      return res.status(400).json({ success: false, message: 'Photo sahi nahi hai ya bahut badi hai.' });
    }
    const cropKey = Object.prototype.hasOwnProperty.call(CROP_RULES, crop) ? crop : 'tomato';
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
          contents: [{ parts: [{ text: buildPrompt(cropKey, language) }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
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
      console.error(`[grade-ai] Gemini HTTP ${r.status}: ${detail}`);
      return res.status(r.status === 429 ? 503 : 502).json({ success: false, message: 'AI se jawab nahi mila.' });
    }

    const data = await r.json();
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map((p) => p.text || '').join('');
    let parsed;
    try {
      parsed = extractJson(text);
    } catch (e) {
      console.error('[grade-ai] could not read AI answer:', String(text).slice(0, 200));
      return res.status(502).json({ success: false, message: 'AI ka jawab samajh nahi aaya.' });
    }
    const out = normalize(parsed);
    res.json({ success: true, data: out });
  } catch (err) {
    console.error('[grade-ai] error:', err && err.message);
    res.status(err && err.name === 'AbortError' ? 504 : 500).json({ success: false, message: 'Jaanch nahi ho paayi.' });
  }
});

module.exports = router;
