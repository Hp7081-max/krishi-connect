/**
 * Krishi Connect - Chat API
 * Mount in server.js:
 *    const chat = require('./routes/chat');
 *    app.use('/api/chat', chat);
 *    chat.attachSocket(io);          // optional, for real-time (REST polling works without it)
 *
 * Storage: data/chat.json (auto-created). Works with or without MongoDB.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
let jwt = null;
try { jwt = require('jsonwebtoken'); } catch (e) { /* optional */ }

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

const FILE = path.join(__dirname, '..', 'data', 'chat.json');
let db = { users: {}, rooms: {}, messages: [] };

function seed() {
  if (!db.rooms.community) db.rooms.community = { id: 'community', type: 'public', title: '🌾 Mandi Community (Sabhi)', members: [], reads: {}, created: Date.now() };
  if (!db.rooms.support) db.rooms.support = { id: 'support', type: 'public', title: '🛟 Krishi Support / Admin', members: [], reads: {}, created: Date.now() };
}
function load() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    if (fs.existsSync(FILE)) db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (e) { console.error('[chat] load error', e.message); }
  seed();
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(FILE, JSON.stringify(db), (err) => err && console.error('[chat] save error', err.message));
  }, 300);
}
load();

/* ---------- identity ---------- */
function identify(req) {
  let id = null, name = null, role = null;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token && jwt) {
    try {
      const p = jwt.verify(token, process.env.JWT_SECRET || 'krishi_connect_super_secret_jwt_key_2026_agro_market');
      id = p.id || p._id || p.userId || p.sub || null;
      name = p.name || null;
      role = p.role || null;
    } catch (e) { /* fall through to headers */ }
  }
  const dec = (v) => { try { return v ? decodeURIComponent(v) : null; } catch (e) { return v; } };
  id = id || dec(req.headers['x-user-id']);
  name = name || dec(req.headers['x-user-name']);
  role = role || dec(req.headers['x-user-role']) || 'user';
  if (!id) return null;
  id = String(id);
  const u = db.users[id] || { id };
  u.name = name || u.name || 'User';
  u.role = role || u.role || 'user';
  u.seen = Date.now();
  db.users[id] = u;
  return u;
}
function need(req, res, next) {
  const me = identify(req);
  if (!me) return res.status(401).json({ ok: false, error: 'login required' });
  req.me = me;
  next();
}

/* ---------- helpers ---------- */
function canSee(room, uid) { return room.type === 'public' || (room.members || []).includes(uid); }
function roomMsgs(roomId) { return db.messages.filter((m) => m.roomId === roomId); }
function describe(room, me) {
  const msgs = roomMsgs(room.id);
  const last = msgs[msgs.length - 1] || null;
  const readAt = (room.reads || {})[me.id] || 0;
  const unread = msgs.filter((m) => m.ts > readAt && m.from !== me.id).length;
  let title = room.title;
  if (room.type === 'dm') {
    const otherId = room.members.find((m) => m !== me.id);
    const o = db.users[otherId];
    title = (o ? o.name + (o.role ? ' (' + o.role + ')' : '') : 'User') + (room.context ? ' · ' + room.context : '');
  }
  return { id: room.id, type: room.type, title, unread, last: last && { text: last.text, ts: last.ts, fromName: last.fromName } };
}
function emitTo(room, event, payload) {
  const io = router.io;
  if (!io) return;
  if (room.type === 'public') io.emit(event, payload);
  else room.members.forEach((id) => io.to('user:' + id).emit(event, payload));
}

/* ---------- routes ---------- */
router.post('/hello', need, (req, res) => {
  save();
  res.json({ ok: true, me: req.me });
});

router.get('/rooms', need, (req, res) => {
  const rooms = Object.values(db.rooms).filter((r) => canSee(r, req.me.id)).map((r) => describe(r, req.me));
  rooms.sort((a, b) => ((b.last && b.last.ts) || 0) - ((a.last && a.last.ts) || 0));
  const unread = rooms.reduce((s, r) => s + r.unread, 0);
  res.json({ ok: true, rooms, unread });
});

router.get('/contacts', need, (req, res) => {
  const list = Object.values(db.users).filter((u) => u.id !== req.me.id).map((u) => ({ id: u.id, name: u.name, role: u.role }));
  res.json({ ok: true, contacts: list });
});

router.post('/dm', need, (req, res) => {
  const withId = String(req.body.withId || '');
  if (!withId || withId === req.me.id) return res.status(400).json({ ok: false, error: 'invalid user' });
  if (!db.users[withId]) db.users[withId] = { id: withId, name: req.body.withName || 'User', role: req.body.withRole || 'user', seen: 0 };
  const ids = [req.me.id, withId].sort();
  const roomId = 'dm:' + ids.join(':');
  if (!db.rooms[roomId]) {
    db.rooms[roomId] = { id: roomId, type: 'dm', members: ids, context: req.body.context || '', reads: {}, created: Date.now() };
    save();
  }
  res.json({ ok: true, room: describe(db.rooms[roomId], req.me) });
});

router.get('/rooms/:id/messages', need, (req, res) => {
  const room = db.rooms[req.params.id];
  if (!room || !canSee(room, req.me.id)) return res.status(404).json({ ok: false, error: 'room not found' });
  const after = Number(req.query.after || 0);
  const msgs = roomMsgs(room.id).filter((m) => m.ts > after).slice(-200);
  res.json({ ok: true, messages: msgs });
});

router.post('/rooms/:id/messages', need, (req, res) => {
  const room = db.rooms[req.params.id];
  if (!room || !canSee(room, req.me.id)) return res.status(404).json({ ok: false, error: 'room not found' });
  const text = String(req.body.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ ok: false, error: 'empty message' });
  const last = db.messages[db.messages.length - 1];
  const ts = Math.max(Date.now(), last ? last.ts + 1 : 0);
  const msg = { id: ts + '-' + Math.random().toString(36).slice(2, 7), roomId: room.id, from: req.me.id, fromName: req.me.name, fromRole: req.me.role, text, ts };
  db.messages.push(msg);
  if (db.messages.length > 5000) db.messages = db.messages.slice(-4000);
  room.reads[req.me.id] = ts;
  save();
  emitTo(room, 'chat:message', msg);
  res.json({ ok: true, message: msg });
});

router.post('/rooms/:id/read', need, (req, res) => {
  const room = db.rooms[req.params.id];
  if (!room || !canSee(room, req.me.id)) return res.status(404).json({ ok: false });
  room.reads[req.me.id] = Date.now();
  save();
  res.json({ ok: true });
});

/* ---------- socket.io (optional) ---------- */
router.attachSocket = function (io) {
  router.io = io;
  io.on('connection', (socket) => {
    socket.on('chat:join', (p) => { if (p && p.userId) socket.join('user:' + String(p.userId)); });
  });
};

module.exports = router;
