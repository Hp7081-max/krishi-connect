const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

// GET /api/equipment
router.get('/', async (req, res) => {
  try {
    const equipment = await dataService.getEquipment();
    res.json({ success: true, count: equipment.length, data: equipment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/equipment
router.post('/', async (req, res) => {
  try {
    const { name, rate, unit, owner, location, em } = req.body;
    if (!name || !rate) {
      return res.status(400).json({ success: false, message: 'Name and rate are required' });
    }

    const eq = await dataService.addEquipment({ name, rate, unit, owner, location, em });
    res.status(201).json({ success: true, message: 'Equipment listed for rent', data: eq });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/equipment/:id/book
router.post('/:id/book', async (req, res) => {
  try {
    const result = await dataService.bookEquipment(req.params.id);
    res.json({ success: true, message: 'Equipment booking confirmed', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
