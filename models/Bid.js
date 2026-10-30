const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  listingId: { type: String, required: true },
  buyer: { type: String, required: true },
  rate: { type: Number, required: true },
  qty: { type: Number, required: true },
  note: { type: String, default: '' },
  counterRate: { type: Number },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'countered'], default: 'pending' },
  mine: { type: Boolean, default: false },
  created: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Bid', bidSchema);
