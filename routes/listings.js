const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

// GET /api/listings
router.get('/', async (req, res) => {
  try {
    const { state, grade, cropKey } = req.query;
    const listings = await dataService.getListings({ state, grade, cropKey });
    res.json({ success: true, count: listings.length, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/listings
router.post('/', async (req, res) => {
  try {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    const { cropKey, qty, price, grade, state, district, photo, farmerName } = req.body;
    if (role === 'admin' || (farmerName && farmerName.toLowerCase().includes('admin'))) {
      return res.status(403).json({ success: false, message: 'Admin is in Read-Only mode and cannot post crop listings.' });
    }
    if (!cropKey || !qty || !price) {
      return res.status(400).json({ success: false, message: 'Crop, quantity and price are required' });
    }

    const listing = await dataService.createListing({
      cropKey,
      qty,
      price,
      grade,
      state,
      district,
      photo,
      farmerName
    });

    res.status(201).json({
      success: true,
      message: 'Listing posted successfully to Mandi',
      data: listing,
      listingId: listing.id
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
