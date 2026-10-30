const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  listingId: { type: String, required: true },
  farmer: { type: String, required: true },
  buyer: { type: String, required: true },
  rate: { type: Number, required: true },
  qty: { type: Number, required: true },
  amount: { type: Number, required: true },
  commission: { type: Number, required: true },
  escrow: { type: String, enum: ['held', 'released'], default: 'held' },
  stage: { type: String, enum: ['confirmed', 'pickup', 'transit', 'delivered'], default: 'confirmed' },
  transporter: { type: Object, default: null },
  quality: { type: String, default: null },
  buyerCity: { type: String, default: 'Delhi NCR' },
  sellerPhone: { type: String },
  buyerPhone: { type: String },
  track: { type: Object, default: { p: 0, km: 0 } },
  created: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Deal', dealSchema);
