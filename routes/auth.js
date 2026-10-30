const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const dataService = require('../services/dataService');

const JWT_SECRET = process.env.JWT_SECRET || 'krishi_connect_super_secret_jwt_key_2026_agro_market';

const otpService = require('../services/otpService');

// Set OTP_LOGIN=off in Render environment to skip OTP at login (register & reset still use OTP)
const LOGIN_OTP_ENABLED = () => String(process.env.OTP_LOGIN || 'on').toLowerCase() !== 'off';

// Emails are case-insensitive: find the account whether it was stored as typed or in lowercase
async function resolveContact(raw) {
  const c = String(raw || '').trim();
  if (!c.includes('@')) return c;
  if (await dataService.userExists(c)) return c;
  return c.toLowerCase();
}

function issueToken(user) {
  return jwt.sign({ id: user.id, contact: user.contact, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/otp/send  { email, purpose: 'register' | 'reset' }
// (login OTP is sent automatically by /login after the password is correct)
router.post('/otp/send', async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!['register', 'reset'].includes(purpose)) {
      return res.status(400).json({ success: false, message: 'Invalid purpose' });
    }
    const clean = otpService.normalizeEmail(email);
    if (!otpService.isValidEmail(clean)) {
      return res.status(400).json({ success: false, message: 'Sahi email address daalein.' });
    }
    const exists = await dataService.userExists(await resolveContact(clean));
    if (purpose === 'register' && exists) {
      return res.status(400).json({ success: false, message: 'Is email se account pehle se bana hua hai. Login karein.' });
    }
    if (purpose === 'reset' && !exists) {
      return res.status(404).json({ success: false, message: 'Is email se koi account nahi mila.' });
    }
    await otpService.sendOtp(purpose, clean);
    res.json({ success: true, message: 'OTP aapke email par bhej diya gaya hai.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/auth/register  { contact(email), password, role, name, village, phone?, otp }
router.post('/register', async (req, res) => {
  try {
    const { contact, password, role, name, village, phone, otp } = req.body;
    if (!contact || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const email = otpService.normalizeEmail(contact);
    if (!otpService.isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Sahi email address daalein.' });
    }
    if (!otp) {
      return res.status(400).json({ success: false, message: 'Email OTP daalna zaroori hai.' });
    }
    await otpService.verifyOtp('register', email, otp);

    const user = await dataService.registerUser({ contact: email, password, role, name, village, phone });
    const token = issueToken(user);

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

// POST /api/auth/login  { contact, password, otp? }
// Step 1: contact + password -> if the account has an email, OTP is emailed and { otpRequired: true } returned
// Step 2: same call again with otp -> token
router.post('/login', async (req, res) => {
  try {
    const { contact, password, otp } = req.body;
    if (!contact || !password) {
      return res.status(400).json({ success: false, message: 'Contact and password are required' });
    }

    const user = await dataService.loginUser(await resolveContact(contact), password);

    // Old demo accounts (mobile/admin ID, no email) cannot receive email OTP, so they log in directly
    const needsOtp = LOGIN_OTP_ENABLED() && String(user.contact).includes('@');
    if (needsOtp) {
      const email = otpService.normalizeEmail(user.contact);
      if (!otp) {
        await otpService.sendOtp('login', email);
        return res.json({ success: true, otpRequired: true, message: 'OTP aapke email par bhej diya gaya hai.' });
      }
      await otpService.verifyOtp('login', email, otp);
    }

    const token = issueToken(user);
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

// POST /api/auth/reset-password  { email, otp, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP aur naya password zaroori hai.' });
    }
    if (String(newPassword).length < 4) {
      return res.status(400).json({ success: false, message: 'Password kam se kam 4 akshar ka hona chahiye.' });
    }
    const clean = await otpService.verifyOtp('reset', email, otp);
    await dataService.resetPassword(await resolveContact(email), newPassword);
    res.json({ success: true, message: 'Password badal gaya. Ab naye password se login karein.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
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
