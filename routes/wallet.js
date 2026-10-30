const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

// GET /api/wallet
router.get('/', async (req, res) => {
  try {
    const wallet = await dataService.getWallet();
    res.json({ success: true, data: wallet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/wallet/withdraw
router.post('/withdraw', async (req, res) => {
  try {
    const result = await dataService.withdrawFunds();
    res.json({ success: true, message: 'Withdrawal payout processed to bank', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
