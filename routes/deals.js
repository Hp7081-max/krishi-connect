const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

// GET /api/deals
router.get('/', async (req, res) => {
  try {
    const deals = await dataService.getDeals();
    res.json({ success: true, count: deals.length, data: deals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/deals/:id/advance
router.post('/:id/advance', async (req, res) => {
  try {
    const deal = await dataService.advanceDeal(req.params.id);
    res.json({ success: true, message: `Deal stage advanced to ${deal.stage}`, data: deal });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/deals/:id/assign-driver
router.post('/:id/assign-driver', async (req, res) => {
  try {
    const { transporter } = req.body;
    if (!transporter) {
      return res.status(400).json({ success: false, message: 'transporter details are required' });
    }
    const deal = await dataService.assignDriver(req.params.id, transporter);
    res.json({ success: true, message: 'Driver assigned to deal', data: deal });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/deals/:id/release-escrow
router.post('/:id/release-escrow', async (req, res) => {
  try {
    const result = await dataService.releaseEscrow(req.params.id);
    res.json({ success: true, message: 'Escrow payment released to farmer', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/deals/:id/book-qc
router.post('/:id/book-qc', async (req, res) => {
  try {
    const { quality } = req.body;
    const result = await dataService.bookQC(req.params.id, quality);
    res.json({ success: true, message: 'Quality check inspection booked', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
