const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // "<purpose>:<email>"
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

// MongoDB deletes the document automatically after expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
