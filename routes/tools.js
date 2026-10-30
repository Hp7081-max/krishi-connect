const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

// POST /api/tools/scan-disease
router.post('/scan-disease', async (req, res) => {
  try {
    const { cropKey, photoUrl, lang } = req.body;
    const scan = await dataService.scanDisease(cropKey, photoUrl, lang);
    res.json({ success: true, message: 'Crop disease scan completed', data: scan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tools/soil-advisory
router.post('/soil-advisory', async (req, res) => {
  try {
    const { n, p, k, lang } = req.body;
    const advice = await dataService.getSoilAdvisory(n, p, k, lang);
    res.json({ success: true, message: 'Soil NPK advisory calculated', data: advice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tools/weather
router.get('/weather', (req, res) => {
  const { state = 'Uttar Pradesh', lang = 'hi' } = req.query;
  const seed = state.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const daysHi = ['आज', 'कल', 'परसों', 'गुरुवार', 'शुक्रवार'];
  const daysEn = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5'];
  const icons = ['☀️', '⛅', '🌧️', '⛈️', '🌤️'];

  const rows = [0, 1, 2, 3, 4].map(i => {
    const r = Math.abs(Math.sin(seed + i * 1.7));
    const rain = Math.round(r * 100) % 100;
    const icon = icons[Math.floor(r * 5) % 5];
    const tmax = 28 + Math.round(Math.cos(seed + i) * 6);
    const tmin = tmax - 8;
    return {
      label: lang === 'en' ? daysEn[i] : daysHi[i],
      icon,
      rain,
      tmax,
      tmin
    };
  });

  const willRain = rows[0].rain > 50 || rows[1].rain > 60;
  const advice = willRain
    ? (lang === 'en' ? 'Hold irrigation today — rain expected' : 'आज सिंचाई रोकें — बारिश आने वाली है')
    : (rows[0].rain < 20
      ? (lang === 'en' ? 'Soil is dry — irrigate soon' : 'मिट्टी सूखी है — जल्दी सिंचाई करें')
      : (lang === 'en' ? 'Give light watering today' : 'आज हल्की सिंचाई करें'));

  res.json({
    success: true,
    location: state,
    forecast: rows,
    willRain,
    advice
  });
});

module.exports = router;
