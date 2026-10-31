const mongoose = require('mongoose');

// One side of a chat (a = the person who started it, b = the other person).
// "contact" stays on the server only; it is never sent to the other user.
const sideSchema = new mongoose.Schema({
  contact: { type: String, required: true },
  name: { type: String, default: '' },
  role: { type: String, default: '' },
  unread: { type: Number, default: 0 },
  blocked: { type: Boolean, default: false } // true = this side has blocked the other side
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  listingId: { type: String, default: '' },
  cropKey: { type: String, default: '' },
  a: { type: sideSchema, required: true },
  b: { type: sideSchema, required: true },
  lastText: { type: String, default: '' },
  lastAt: { type: Number, default: 0 },
  lastFrom: { type: String, default: '' },
  createdAt: { type: Number, default: Date.now }
});

conversationSchema.index({ 'a.contact': 1 });
conversationSchema.index({ 'b.contact': 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
