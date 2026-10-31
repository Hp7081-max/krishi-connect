// Private chat between a farmer and a buyer.
// Works in both storage modes: MongoDB (Conversation + Message models) or a local file (data/chat.json).
// Live delivery uses a separate Socket.IO namespace (/chat); every socket must present a valid login token.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { getDBStatus } = require('../config/db');
const dataService = require('./dataService');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const JWT_SECRET = process.env.JWT_SECRET || 'krishi_connect_super_secret_jwt_key_2026_agro_market';
const MAX_LEN = 1000;            // characters per message
const RATE_MAX = 20;             // messages ...
const RATE_WINDOW_MS = 60 * 1000; // ... per minute, per user
const RETENTION_DAYS = 90;

const useMongo = () => getDBStatus().isConnected;
function fail(status, message) { const e = new Error(message); e.status = status; return e; }

/* ---------------- file storage (only used when MongoDB is not connected) ---------------- */
const CHAT_FILE = path.join(__dirname, '..', 'data', 'chat.json');
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
let store = null;
let saveTimer = null;

function loadStore() {
  if (store) return store;
  try { store = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); } catch (e) { store = { conversations: [], messages: [] }; }
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  store.messages = (store.messages || []).filter((m) => m.at >= cutoff);
  store.conversations = store.conversations || [];
  return store;
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(CHAT_FILE), { recursive: true });
      fs.writeFileSync(CHAT_FILE, JSON.stringify(store), 'utf8');
    } catch (e) { console.error('[chat] could not save chat.json:', e.message); }
  }, 300);
}

/* ---------------- users ---------------- */
function readFileUsers() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).users || []; } catch (e) { return []; }
}
async function findUserByContact(contact) {
  if (useMongo()) return User.findOne({ contact }).select('contact name role').lean();
  return readFileUsers().find((u) => u.contact === contact) || null;
}
async function findUsersByName(name, role) {
  const n = String(name || '').trim();
  if (!n) return [];
  if (useMongo()) return User.find({ name: n, role }).select('contact name role').limit(3).lean();
  return readFileUsers().filter((u) => String(u.name || '').trim() === n && u.role === role).slice(0, 3);
}
function pickOne(found, label) {
  if (found.length === 0) throw fail(404, `Is ${label} ka app account nahi mila (ye demo listing ho sakti hai), isliye chat nahi ho sakti.`);
  if (found.length > 1) throw fail(409, `Is naam ke kai ${label} hain, isliye chat abhi shuru nahi ho sakti.`);
  return found[0];
}

/* ---------------- phone number / email hiding ---------------- */
const DEVANAGARI = '०१२३४५६७८९';
const PHONE_RE = /(?:\+?\s*91[\s-]*)?[6-9](?:[\s.-]*\d){9}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
function maskContacts(text) {
  const norm = text.replace(/[०-९]/g, (d) => String(DEVANAGARI.indexOf(d)));
  const out = norm.replace(EMAIL_RE, '[hidden]').replace(PHONE_RE, '[hidden]');
  return out !== norm ? { text: out, masked: true } : { text, masked: false };
}

/* ---------------- rate limit ---------------- */
const hits = new Map();
function rateOk(contact) {
  const now = Date.now();
  const arr = (hits.get(contact) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { hits.set(contact, arr); return false; }
  arr.push(now); hits.set(contact, arr);
  return true;
}

/* ---------------- conversation storage helpers ---------------- */
function makeConvId(listingId, c1, c2) {
  const key = [listingId, ...[c1, c2].sort()].join('|');
  return 'c_' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}
function sideOf(conv, contact) {
  if (conv.a.contact === contact) return 'a';
  if (conv.b.contact === contact) return 'b';
  return null;
}
async function getConv(id) {
  if (useMongo()) return Conversation.findOne({ id }).lean();
  return loadStore().conversations.find((c) => c.id === id) || null;
}
async function createConv(conv) {
  if (useMongo()) {
    try { await Conversation.create(conv); } catch (e) { if (e.code !== 11000) throw e; }
  } else {
    const s = loadStore();
    if (!s.conversations.some((c) => c.id === conv.id)) { s.conversations.push(conv); persist(); }
  }
  return getConv(conv.id);
}
async function setField(id, side, field, value) {
  if (useMongo()) { await Conversation.updateOne({ id }, { $set: { [`${side}.${field}`]: value } }); return; }
  const c = loadStore().conversations.find((x) => x.id === id);
  if (c) { c[side][field] = value; persist(); }
}
async function addMessage(conv, side, text, masked) {
  const msg = { id: 'm_' + crypto.randomBytes(8).toString('hex'), convId: conv.id, from: side, text, masked: !!masked, at: Date.now() };
  const other = side === 'a' ? 'b' : 'a';
  const preview = text.slice(0, 80);
  if (useMongo()) {
    await Message.create(msg);
    await Conversation.updateOne({ id: conv.id }, {
      $set: { lastText: preview, lastAt: msg.at, lastFrom: side },
      $inc: { [`${other}.unread`]: 1 }
    });
  } else {
    const s = loadStore();
    s.messages.push(msg);
    const c = s.conversations.find((x) => x.id === conv.id);
    c.lastText = preview; c.lastAt = msg.at; c.lastFrom = side;
    c[other].unread = (c[other].unread || 0) + 1;
    persist();
  }
  return msg;
}
async function getMessages(convId, before, limit) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const b = Number(before) || 0;
  let rows;
  if (useMongo()) {
    rows = await Message.find(b ? { convId, at: { $lt: b } } : { convId }).sort({ at: -1 }).limit(lim).lean();
  } else {
    rows = loadStore().messages.filter((m) => m.convId === convId && (!b || m.at < b)).sort((x, y) => y.at - x.at).slice(0, lim);
  }
  return rows.reverse();
}
async function convsFor(contact) {
  if (useMongo()) return Conversation.find({ $or: [{ 'a.contact': contact }, { 'b.contact': contact }] }).sort({ lastAt: -1 }).limit(100).lean();
  return loadStore().conversations.filter((c) => c.a.contact === contact || c.b.contact === contact).sort((x, y) => (y.lastAt || 0) - (x.lastAt || 0));
}

/* ---------------- what the browser is allowed to see (never the other person's contact) ---------------- */
function publicMsg(m, side) { return { id: m.id, convId: m.convId, text: m.text, mine: m.from === side, at: m.at, masked: !!m.masked }; }
function publicConv(c, side) {
  const me = c[side]; const o = side === 'a' ? c.b : c.a;
  return {
    id: c.id, listingId: c.listingId, cropKey: c.cropKey,
    other: { name: o.name, role: o.role },
    lastText: c.lastText || '', lastAt: c.lastAt || c.createdAt || 0, lastMine: c.lastFrom === side,
    unread: me.unread || 0, blockedByMe: !!me.blocked, blockedByOther: !!o.blocked
  };
}

/* ---------------- public API used by routes/chat.js ---------------- */
async function authenticate(token) {
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch (e) { throw fail(401, 'Chat ke liye dobara login karein.'); }
  const u = await findUserByContact(payload.contact);
  if (!u) throw fail(401, 'Account nahi mila. Dobara login karein.');
  return { contact: u.contact, name: u.name, role: u.role };
}

async function listConversations(me) {
  const rows = await convsFor(me.contact);
  return rows.map((c) => publicConv(c, sideOf(c, me.contact)));
}

async function unreadTotal(me) {
  const rows = await convsFor(me.contact);
  return rows.reduce((n, c) => n + (c[sideOf(c, me.contact)].unread || 0), 0);
}

async function startConversation(me, { listingId, bidId }) {
  const listings = await dataService.getListings();
  let listing; let other;
  if (bidId) {
    const bid = (await dataService.getBids()).find((b) => b.id === bidId);
    if (!bid) throw fail(404, 'Ye bid nahi mili.');
    listing = listings.find((l) => l.id === bid.listingId);
    if (!listing) throw fail(404, 'Is bid ki listing nahi mili.');
    if (me.role !== 'farmer' || String(listing.farmer).trim() !== String(me.name).trim()) {
      throw fail(403, 'Sirf listing ka kisan hi bid wale buyer se chat shuru kar sakta hai.');
    }
    other = pickOne(await findUsersByName(bid.buyer, 'buyer'), 'buyer');
  } else if (listingId) {
    listing = listings.find((l) => l.id === listingId);
    if (!listing) throw fail(404, 'Ye listing nahi mili.');
    if (me.role !== 'buyer') throw fail(403, 'Listing se chat buyer shuru karta hai. Kisan, bid wale buyer se chat kar sakta hai.');
    other = pickOne(await findUsersByName(listing.farmer, 'farmer'), 'kisan');
  } else {
    throw fail(400, 'listingId ya bidId chahiye.');
  }
  if (other.contact === me.contact) throw fail(400, 'Apne aap se chat nahi ho sakti.');

  const id = makeConvId(listing.id, me.contact, other.contact);
  let conv = await getConv(id);
  if (!conv) {
    conv = await createConv({
      id, listingId: listing.id, cropKey: listing.cropKey,
      a: { contact: me.contact, name: me.name, role: me.role, unread: 0, blocked: false },
      b: { contact: other.contact, name: other.name, role: other.role, unread: 0, blocked: false },
      lastText: '', lastAt: 0, lastFrom: '', createdAt: Date.now()
    });
  }
  return publicConv(conv, sideOf(conv, me.contact));
}

async function getThread(me, id, before, limit) {
  const conv = await getConv(id);
  const side = conv && sideOf(conv, me.contact);
  if (!side) throw fail(404, 'Chat nahi mili.'); // same answer for "doesn't exist" and "not yours"
  const rows = await getMessages(id, before, limit);
  if ((conv[side].unread || 0) > 0) await setField(id, side, 'unread', 0);
  return { conversation: { ...publicConv(conv, side), unread: 0 }, messages: rows.map((m) => publicMsg(m, side)) };
}

async function sendMessage(me, id, rawText) {
  const conv = await getConv(id);
  const side = conv && sideOf(conv, me.contact);
  if (!side) throw fail(404, 'Chat nahi mili.');
  const text0 = String(rawText || '').replace(/\s+\n/g, '\n').trim();
  if (!text0) throw fail(400, 'Khali message nahi bhej sakte.');
  if (text0.length > MAX_LEN) throw fail(400, `Message ${MAX_LEN} akshar se chhota rakhein.`);
  if (conv.a.blocked || conv.b.blocked) throw fail(403, 'Ye chat band hai (block hai).');
  if (!rateOk(me.contact)) throw fail(429, 'Bahut tezi se message ho rahe hain. Thodi der ruk kar bhejein.');

  const { text, masked } = maskContacts(text0);
  const msg = await addMessage(conv, side, text, masked);

  // push to both people instantly
  const fresh = await getConv(id);
  if (ns) {
    for (const s of ['a', 'b']) {
      ns.to('user:' + fresh[s].contact).emit('chat:message', { message: publicMsg(msg, s), conversation: publicConv(fresh, s) });
    }
  }
  return { message: publicMsg(msg, side), masked };
}

async function setBlock(me, id, flag) {
  const conv = await getConv(id);
  const side = conv && sideOf(conv, me.contact);
  if (!side) throw fail(404, 'Chat nahi mili.');
  await setField(id, side, 'blocked', !!flag);
  return { blocked: !!flag };
}

/* ---------------- live delivery ---------------- */
let ns = null;
function setSocketIO(io) {
  ns = io.of('/chat');
  ns.use(async (socket, next) => {
    try {
      const me = await authenticate(socket.handshake.auth && socket.handshake.auth.token);
      socket.data.contact = me.contact;
      next();
    } catch (e) { next(new Error('unauthorized')); }
  });
  ns.on('connection', (socket) => { socket.join('user:' + socket.data.contact); });
}

module.exports = {
  setSocketIO, authenticate, listConversations, unreadTotal,
  startConversation, getThread, sendMessage, setBlock, maskContacts
};
