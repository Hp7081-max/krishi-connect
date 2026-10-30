const crypto = require('crypto');
const { getDBStatus } = require('../config/db');
const Otp = require('../models/Otp');
const { sendOtpEmail } = require('./mailer');

const OTP_TTL_MS = 5 * 60 * 1000;      // OTP valid for 5 minutes
const RESEND_COOLDOWN_MS = 30 * 1000;  // 30 seconds between sends
const MAX_ATTEMPTS = 5;

// Used when MongoDB is not connected (file/memory mode). OTPs are short-lived so memory is enough.
const memoryStore = new Map();

function secret() {
  return process.env.JWT_SECRET || 'krishi_connect_super_secret_jwt_key_2026_agro_market';
}
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function hashCode(key, code) {
  return crypto.createHmac('sha256', secret()).update(`${key}:${code}`).digest('hex');
}
function makeKey(purpose, email) {
  return `${purpose}:${email}`;
}

async function getRecord(key) {
  if (getDBStatus().isConnected) return Otp.findOne({ key });
  const r = memoryStore.get(key);
  if (r && r.expiresAt.getTime() < Date.now()) { memoryStore.delete(key); return null; }
  return r || null;
}
async function saveRecord(key, data) {
  if (getDBStatus().isConnected) {
    await Otp.findOneAndUpdate({ key }, { key, ...data }, { upsert: true, new: true });
  } else {
    memoryStore.set(key, { key, ...data });
  }
}
async function deleteRecord(key) {
  if (getDBStatus().isConnected) await Otp.deleteOne({ key });
  else memoryStore.delete(key);
}

async function sendOtp(purpose, rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) throw new Error('Sahi email address daalein.');
  const key = makeKey(purpose, email);

  const existing = await getRecord(key);
  if (existing && Date.now() - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - new Date(existing.lastSentAt).getTime())) / 1000);
    throw new Error(`Thoda ruko, ${wait} second baad dobara OTP mangein.`);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  // Send first; only store the OTP if the email was actually handed over
  await sendOtpEmail(email, code, purpose);
  await saveRecord(key, {
    codeHash: hashCode(key, code),
    attempts: 0,
    lastSentAt: new Date(),
    expiresAt: new Date(Date.now() + OTP_TTL_MS)
  });
  return { email };
}

// Throws if the OTP is wrong/expired. On success the OTP is consumed (one-time use).
async function verifyOtp(purpose, rawEmail, rawCode) {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || '').trim();
  const key = makeKey(purpose, email);

  const rec = await getRecord(key);
  if (!rec || new Date(rec.expiresAt).getTime() < Date.now()) {
    throw new Error('OTP expire ho gaya ya mila nahi. Naya OTP mangein.');
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await deleteRecord(key);
    throw new Error('Bahut zyada galat try. Naya OTP mangein.');
  }

  const ok = /^\d{6}$/.test(code) &&
    crypto.timingSafeEqual(Buffer.from(hashCode(key, code)), Buffer.from(rec.codeHash));

  if (!ok) {
    await saveRecord(key, {
      codeHash: rec.codeHash,
      attempts: rec.attempts + 1,
      lastSentAt: rec.lastSentAt,
      expiresAt: rec.expiresAt
    });
    const left = MAX_ATTEMPTS - (rec.attempts + 1);
    throw new Error(left > 0 ? `OTP galat hai. ${left} try bache hain.` : 'Bahut zyada galat try. Naya OTP mangein.');
  }
  await deleteRecord(key);
  return email;
}

module.exports = { sendOtp, verifyOtp, normalizeEmail, isValidEmail };
