const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const dataService = require('../services/dataService');

const JWT_SECRET = process.env.JWT_SECRET || 'krishi_connect_super_secret_jwt_key_2026_agro_market';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { contact, password, role, name, village } = req.body;
    if (!contact || !password) {
      return res.status(400).json({ success: false, message: 'Contact and password are required' });
    }

    const user = await dataService.registerUser({ contact, password, role, name, village });
    const token = jwt.sign({ id: user.id, contact: user.contact, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'User registered successfully in Krishi Connect',
      token,
      user
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { contact, password } = req.body;
    if (!contact || !password) {
      return res.status(400).json({ success: false, message: 'Contact and password are required' });
    }

    const user = await dataService.loginUser(contact, password);
    const token = jwt.sign({ id: user.id, contact: user.contact, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Logged in successfully',
      token,
      user
    });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/profile
router.put('/profile', async (req, res) => {
  try {
    const { contact, name, village, bank, phone } = req.body;
    if (!contact) {
      return res.status(400).json({ success: false, message: 'Contact is required' });
    }

    const user = await dataService.updateUserProfile(contact, { name, village, bank, phone });
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
