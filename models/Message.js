const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  convId: { type: String, required: true, index: true },
  from: { type: String, enum: ['a', 'b'], required: true },
  text: { type: String, required: true },
  masked: { type: Boolean, default: false }, // true = a phone number / email was hidden
  at: { type: Number, default: Date.now },
  // MongoDB deletes messages automatically after 90 days
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }
});

messageSchema.index({ convId: 1, at: -1 });

module.exports = mongoose.model('Message', messageSchema);
