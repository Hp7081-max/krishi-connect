// Private chat API.  Mounted in server.js:  app.use('/api/chat', require('./routes/chat'));
// Chat ALWAYS needs a valid login token (even when REQUIRE_AUTH=off), because a private chat
// without knowing who is who would let anyone read or send as someone else.
const express = require('express');
const router = express.Router();
const chat = require('../services/chatService');

async function chatAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ success: false, message: 'Chat ke liye pehle login karein.' });
    req.me = await chat.authenticate(token);
    next();
  } catch (err) {
    res.status(err.status || 401).json({ success: false, message: err.message });
  }
}
router.use(chatAuth);

const wrap = (fn) => async (req, res) => {
  try {
    res.json({ success: true, ...(await fn(req)) });
  } catch (err) {
    if (!err.status) console.error('[chat]', err);
    res.status(err.status || 500).json({ success: false, message: err.status ? err.message : 'Chat me dikkat aayi. Thodi der baad try karein.' });
  }
};

// GET /api/chat/conversations
router.get('/conversations', wrap(async (req) => ({ data: await chat.listConversations(req.me) })));

// GET /api/chat/unread  -> { count }
router.get('/unread', wrap(async (req) => ({ count: await chat.unreadTotal(req.me) })));

// POST /api/chat/start  { listingId }  (buyer -> farmer)   or   { bidId }  (farmer -> bidder)
router.post('/start', wrap(async (req) => ({
  data: await chat.startConversation(req.me, { listingId: req.body.listingId, bidId: req.body.bidId })
})));

// GET /api/chat/:id/messages?before=<timestamp>&limit=50
router.get('/:id/messages', wrap(async (req) => ({
  data: await chat.getThread(req.me, req.params.id, req.query.before, req.query.limit)
})));

// POST /api/chat/:id/messages  { text }
router.post('/:id/messages', wrap(async (req) => ({
  data: await chat.sendMessage(req.me, req.params.id, req.body.text)
})));

// POST /api/chat/:id/block  { block: true|false }
router.post('/:id/block', wrap(async (req) => ({
  data: await chat.setBlock(req.me, req.params.id, req.body.block !== false)
})));

module.exports = router;
