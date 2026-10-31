'use strict';
/**
 * richChatService — offer / counter-offer, listing card, photo, voice, rate card ka logic.
 * Saari validation yahin hoti hai, taaki koi galat ya ganda data DB me na ghuse.
 */
const { isValidObjectId } = require('mongoose');
const RichMessage = require('../models/RichMessage');

const TYPES = ['offer', 'listing', 'photo', 'voice', 'rate'];
const OFFER_TTL_MS = 48 * 60 * 60 * 1000; // 48 ghante baad offer khud expire

class ChatError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------- chhote helpers ---------- */
const text = (v, max = 200) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const id64 = (v) => text(v, 64);

function amount(v, label, { required = true, max = 1e6 } = {}) {
  if (v === '' || v == null) {
    if (required) throw new ChatError(400, `${label} zaroori hai`);
    return undefined;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) {
    throw new ChatError(400, `${label} sahi nahi hai`);
  }
  return Math.round(n * 100) / 100;
}

// Sirf apne /uploads ya https link allow
function safeUrl(u, uploadsOnly = false) {
  const s = String(u || '').trim().slice(0, 500);
  if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(s)) return s;
  if (!uploadsOnly && /^https:\/\/[^\s<>"'\\]+$/i.test(s)) return s;
  return '';
}

/* ---------- har type ka payload saaf karna ---------- */
function buildPayload(type, raw = {}) {
  switch (type) {
    case 'offer': {
      const pricePerQuintal = amount(raw.pricePerQuintal, 'Rate');
      const quantityQuintal = amount(raw.quantityQuintal, 'Matra', { max: 1e5 });
      return {
        crop: text(raw.crop, 60),
        listingId: id64(raw.listingId),
        pricePerQuintal,
        quantityQuintal,
        total: Math.round(pricePerQuintal * quantityQuintal),
        note: text(raw.note, 200),
      };
    }
    case 'listing': {
      const crop = text(raw.crop, 60);
      if (!crop) throw new ChatError(400, 'Fasal ka naam zaroori hai');
      return {
        listingId: id64(raw.listingId),
        crop,
        pricePerQuintal: amount(raw.pricePerQuintal, 'Rate'),
        quantityQuintal: amount(raw.quantityQuintal, 'Matra', { required: false, max: 1e5 }),
        location: text(raw.location, 80),
        image: safeUrl(raw.image),
        sellerName: text(raw.sellerName, 60),
      };
    }
    case 'photo': {
      const url = safeUrl(raw.url, true);
      if (!url) throw new ChatError(400, 'Photo ka link galat hai');
      return { url, caption: text(raw.caption, 200) };
    }
    case 'voice': {
      const url = safeUrl(raw.url, true);
      if (!url) throw new ChatError(400, 'Awaaz ka link galat hai');
      const d = Math.round(Number(raw.durationSec) || 0);
      return { url, durationSec: Math.min(Math.max(d, 0), 120) };
    }
    case 'rate': {
      const crop = text(raw.crop, 60);
      if (!crop) throw new ChatError(400, 'Fasal ka naam zaroori hai');
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ''))
        ? String(raw.date)
        : new Date().toISOString().slice(0, 10);
      return {
        crop,
        market: text(raw.market, 80),
        modalPrice: amount(raw.modalPrice, 'Rate'),
        minPrice: amount(raw.minPrice, 'Minimum rate', { required: false }),
        maxPrice: amount(raw.maxPrice, 'Maximum rate', { required: false }),
        date,
        source: raw.source === 'live' ? 'live' : 'manual',
      };
    }
    default:
      throw new ChatError(400, 'Message type galat hai');
  }
}

/* ---------- message banana ---------- */
async function createMessage({ conversationId, senderId, receiverId, type, payload }) {
  const convId = id64(conversationId);
  const to = id64(receiverId);
  if (!convId) throw new ChatError(400, 'conversationId chahiye');
  if (!to) throw new ChatError(400, 'Samne wale ki pehchaan (receiverId) chahiye');
  if (to === senderId) throw new ChatError(400, 'Apne aap ko message nahi bhej sakte');
  if (!TYPES.includes(type)) throw new ChatError(400, 'Message type galat hai');

  // TODO (auth guard ON karne ke baad): yahan check karo ki senderId is conversation ka hissa hai.
  const doc = {
    conversationId: convId,
    senderId,
    receiverId: to,
    type,
    payload: buildPayload(type, payload),
  };
  if (type === 'offer') {
    doc.status = 'pending';
    doc.expiresAt = new Date(Date.now() + OFFER_TTL_MS);
  }
  return RichMessage.create(doc);
}

/* ---------- offer par jawab: accept / reject / counter ---------- */
async function respondToOffer({ id, userId, action, counter }) {
  if (!isValidObjectId(id)) throw new ChatError(404, 'Offer nahi mila');
  if (!['accept', 'reject', 'counter'].includes(action)) {
    throw new ChatError(400, 'Action galat hai');
  }

  // Counter ka data pehle hi check kar lo, taaki beech me kuch atak na jaye
  let counterPayload;
  if (action === 'counter') {
    const old = await RichMessage.findById(id).lean();
    if (!old || old.type !== 'offer') throw new ChatError(404, 'Offer nahi mila');
    counterPayload = buildPayload('offer', {
      crop: old.payload.crop,
      listingId: old.payload.listingId,
      pricePerQuintal: counter && counter.pricePerQuintal,
      quantityQuintal: counter && counter.quantityQuintal,
      note: counter && counter.note,
    });
  }

  const next = { accept: 'accepted', reject: 'rejected', counter: 'countered' }[action];
  const now = new Date();

  // Ek hi baar jawab ho sakta hai (double-tap / race se bachne ke liye atomic update)
  const offer = await RichMessage.findOneAndUpdate(
    { _id: id, type: 'offer', receiverId: userId, status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: next, respondedAt: now } },
    { new: true }
  );

  if (!offer) {
    const cur = await RichMessage.findById(id).lean();
    if (!cur || cur.type !== 'offer') throw new ChatError(404, 'Offer nahi mila');
    if (cur.receiverId !== userId) {
      throw new ChatError(403, 'Is offer par jawab dene ka haq aapka nahi hai');
    }
    if (cur.status === 'pending') {
      await RichMessage.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'expired' } });
      throw new ChatError(409, 'Is offer ki samay-seema khatam ho gayi');
    }
    throw new ChatError(409, 'Is offer par pehle hi jawab ho chuka hai');
  }

  let newOffer;
  if (action === 'counter') {
    newOffer = await RichMessage.create({
      conversationId: offer.conversationId,
      senderId: userId,
      receiverId: offer.senderId,
      type: 'offer',
      payload: counterPayload,
      status: 'pending',
      parentId: offer._id,
      expiresAt: new Date(now.getTime() + OFFER_TTL_MS),
    });
  }
  return { offer, counter: newOffer };
}

/* ---------- messages padhna (polling: `after` ke baad jo badla woh) ---------- */
async function listMessages({ conversationId, userId, after, limit = 100 }) {
  const convId = id64(conversationId);
  if (!convId) throw new ChatError(400, 'conversationId chahiye');

  await RichMessage.updateMany(
    { conversationId: convId, type: 'offer', status: 'pending', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired' } }
  );

  const query = {
    conversationId: convId,
    $or: [{ senderId: userId }, { receiverId: userId }],
  };
  const afterDate = after ? new Date(after) : null;
  if (afterDate && !Number.isNaN(afterDate.getTime())) query.updatedAt = { $gt: afterDate };

  const rows = await RichMessage.find(query)
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 100, 200))
    .lean();
  return rows.reverse();
}

module.exports = { createMessage, respondToOffer, listMessages, ChatError };
