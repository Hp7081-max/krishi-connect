'use strict';
/**
 * chatExtras routes — offer, listing card, photo, voice, mandi rate.
 *
 * server.js me bas ye 2 line (express.json() ke baad):
 *   const { mountChatExtras } = require('./routes/chatExtras');
 *   mountChatExtras(app);
 *
 * Endpoints (sab /api/chat-extras ke andar):
 *   GET  /messages?conversationId=..&after=..
 *   POST /messages                 { conversationId, receiverId, type, payload }
 *   POST /offers/:id/respond       { action: 'accept'|'reject'|'counter', counter? }
 *   POST /upload                   multipart, field "file" (photo ya awaaz)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const svc = require('../services/richChatService');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- login wala user ---------- */
function getUserId(req) {
  const fromAuth = req.user && (req.user._id || req.user.id);
  if (fromAuth) return String(fromAuth).slice(0, 64);
  // Jab tak auth guard OFF hai: .env me CHAT_EXTRAS_TRUST_HEADER=true rakho.
  // Auth guard ON hote hi ye line hata do / flag false kar do — warna koi bhi kisi ka naam laga sakta hai.
  if (process.env.CHAT_EXTRAS_TRUST_HEADER === 'true') {
    const h = req.get('x-user-id');
    if (h) return String(h).slice(0, 64);
  }
  return null;
}

function requireUser(req, res, next) {
  const uid = getUserId(req);
  if (!uid) return res.status(401).json({ error: 'Pehle login karo' });
  req.uid = uid;
  next();
}

/* ---------- chhota rate limiter (per user, memory me) ---------- */
const hits = new Map();
setInterval(() => {
  const cut = Date.now() - 60000;
  for (const [k, arr] of hits) {
    const keep = arr.filter((t) => t > cut);
    if (keep.length) hits.set(k, keep);
    else hits.delete(k);
  }
}, 60000).unref();

function limiter(max = 60, windowMs = 60000) {
  return (req, res, next) => {
    const now = Date.now();
    const arr = (hits.get(req.uid) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: 'Bahut tez ho raha hai, thoda ruk kar try karo' });
    }
    arr.push(now);
    hits.set(req.uid, arr);
    next();
  };
}

/* ---------- upload (photo + awaaz) ---------- */
const EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
};
const baseMime = (m) => String(m || '').split(';')[0].trim().toLowerCase();

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, crypto.randomBytes(12).toString('hex') + EXT[baseMime(file.mimetype)]),
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (EXT[baseMime(file.mimetype)]) return cb(null, true);
    cb(Object.assign(new Error('Sirf photo ya awaaz ki file chalegi'), { status: 400 }));
  },
});

/* ---------- routes ---------- */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(express.json({ limit: '20kb' }));
router.use(requireUser);
router.use(limiter());

router.get(
  '/messages',
  wrap(async (req, res) => {
    const messages = await svc.listMessages({
      conversationId: req.query.conversationId,
      userId: req.uid,
      after: req.query.after,
    });
    res.json({ messages });
  })
);

router.post(
  '/messages',
  wrap(async (req, res) => {
    const { conversationId, receiverId, type, payload } = req.body || {};
    const message = await svc.createMessage({
      conversationId,
      receiverId,
      type,
      payload,
      senderId: req.uid,
    });
    res.status(201).json({ message });
  })
);

router.post(
  '/offers/:id/respond',
  wrap(async (req, res) => {
    const { action, counter } = req.body || {};
    const result = await svc.respondToOffer({
      id: req.params.id,
      userId: req.uid,
      action,
      counter,
    });
    res.json(result);
  })
);

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'File bahut badi hai (max 6 MB)' : 'Upload nahi hua',
    });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('[chat-extras]', err);
  res.status(500).json({ error: 'Server me gadbad, thodi der baad try karo' });
});

/* ---------- server.js ke liye ek line ---------- */
function mountChatExtras(app) {
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      maxAge: '7d',
      setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
    })
  );
  app.use('/api/chat-extras', router);
}

module.exports = router;
module.exports.mountChatExtras = mountChatExtras;
