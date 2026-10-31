'use strict';
/**
 * RichMessage — chat ke "khaas" message: offer, listing card, photo, voice note, mandi rate.
 * (Normal text message aapke purane Message model me hi rahenge.)
 */
const mongoose = require('mongoose');

const TYPES = ['offer', 'listing', 'photo', 'voice', 'rate'];
const OFFER_STATUS = ['pending', 'accepted', 'rejected', 'countered', 'expired'];

const richMessageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true },
    senderId: { type: String, required: true },
    receiverId: { type: String, required: true },
    type: { type: String, enum: TYPES, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Sirf offer ke liye
    status: { type: String, enum: OFFER_STATUS },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RichMessage' }, // counter-offer kis offer ka jawab hai
    expiresAt: { type: Date },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

richMessageSchema.index({ conversationId: 1, updatedAt: 1 });
richMessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports =
  mongoose.models.RichMessage || mongoose.model('RichMessage', richMessageSchema);
module.exports.TYPES = TYPES;
