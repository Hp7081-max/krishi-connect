const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  contact: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['farmer', 'buyer', 'admin', 'transport'], default: 'farmer' },
  name: { type: String, required: true },
  village: { type: String, default: 'Barabanki, Uttar Pradesh' },
  phone: { type: String },
  bank: { type: String, default: 'PNB ••••4471' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
