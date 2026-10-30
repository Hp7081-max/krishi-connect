const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

// GET /api/bids
router.get('/', async (req, res) => {
  try {
    const { listingId } = req.query;
    const bids = await dataService.getBids(listingId);
    res.json({ success: true, count: bids.length, data: bids });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/bids
router.post('/', async (req, res) => {
  try {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    const { id, listingId, rate, qty, note, buyerName } = req.body;
    if (role === 'admin' || (buyerName && buyerName.toLowerCase().includes('admin'))) {
      return res.status(403).json({ success: false, message: 'Admin is in Read-Only mode and cannot place bids.' });
    }
    if (!listingId || !rate || !qty) {
      return res.status(400).json({ success: false, message: 'listingId, rate and qty are required' });
    }

    const bid = await dataService.createBid({ id, listingId, rate, qty, note, buyerName });
    res.status(201).json({ success: true, message: 'Bid sent to farmer', data: bid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/bids/:id/accept
router.post('/:id/accept', async (req, res) => {
  try {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin is in Read-Only mode and cannot accept bids.' });
    }
    const result = await dataService.acceptBid(req.params.id);
    res.json({ success: true, message: 'Bid accepted and deal created', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/bids/:id/reject
router.post('/:id/reject', async (req, res) => {
  try {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin is in Read-Only mode and cannot reject bids.' });
    }
    const result = await dataService.rejectBid(req.params.id);
    res.json({ success: true, message: 'Bid rejected', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/bids/:id/counter
router.post('/:id/counter', async (req, res) => {
  try {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin is in Read-Only mode and cannot send counter bids.' });
    }
    const { counterRate } = req.body;
    if (!counterRate) {
      return res.status(400).json({ success: false, message: 'counterRate is required' });
    }
    const result = await dataService.counterBid(req.params.id, counterRate);
    res.json({ success: true, message: 'Counter-offer sent to buyer', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/bids/:id/accept-counter
router.post('/:id/accept-counter', async (req, res) => {
  try {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin is in Read-Only mode and cannot accept counter bids.' });
    }
    const result = await dataService.acceptCounter(req.params.id);
    res.json({ success: true, message: 'Counter offer accepted', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
