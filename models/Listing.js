const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  cropKey: { type: String, required: true },
  qty: { type: Number, required: true },
  price: { type: Number, required: true },
  grade: { type: String, default: 'A' },
  state: { type: String, default: 'Uttar Pradesh' },
  district: { type: String, default: 'Barabanki' },
  farmer: { type: String, required: true },
  photo: { type: String, default: null },
  status: { type: String, enum: ['active', 'sold', 'withdrawn'], default: 'active' },
  mine: { type: Boolean, default: false },
  created: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Listing', listingSchema);
