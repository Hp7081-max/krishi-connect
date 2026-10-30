const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');
const { getDBStatus } = require('../config/db');

// GET /api/state/sync
router.get('/sync', async (req, res) => {
  try {
    const fullState = await dataService.getFullState();
    res.json({
      success: true,
      timestamp: Date.now(),
      db: getDBStatus(),
      data: fullState
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/health
router.get('/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Krishi Connect (Kisaan Setu)',
    version: '1.0.0',
    db: getDBStatus(),
    uptime: process.uptime()
  });
});

module.exports = router;
