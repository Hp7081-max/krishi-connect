const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  em: { type: String, default: '🚜' },
  owner: { type: String, required: true },
  location: { type: String, required: true },
  rate: { type: Number, required: true },
  unit: { type: String, enum: ['hr', 'acre', 'day'], default: 'hr' },
  mine: { type: Boolean, default: false },
  available: { type: Boolean, default: true },
  created: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Equipment', equipmentSchema);
