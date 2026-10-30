const mongoose = require('mongoose');

const returnRequestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  dealId: { type: String, required: true },
  listingId: { type: String },
  cropKey: { type: String, required: true },
  cropName: { type: String },
  buyer: { type: String, required: true },
  buyerPhone: { type: String },
  farmer: { type: String, required: true },
  farmerPhone: { type: String },
  
  // Complaint Details
  reason: { 
    type: String, 
    required: true,
    enum: [
      'damaged_crop',
      'rotten_spoiled',
      'poor_quality',
      'incorrect_grade',
      'incorrect_product',
      'quantity_mismatch',
      'description_mismatch',
      'other'
    ]
  },
  description: { type: String, required: true },
  evidenceUrls: [{ type: String }],
  
  // Quantities & Financials
  qtyOrdered: { type: Number, required: true },
  qtyReceived: { type: Number, required: true },
  qtyAffected: { type: Number, required: true },
  ratePerQtl: { type: Number, required: true },
  dealAmount: { type: Number, required: true },
  estimatedRefund: { type: Number, required: true },
  estimatedReturnShipping: { type: Number, default: 0 },
  
  // Resolution requested by buyer
  resolutionRequested: {
    type: String,
    enum: ['full_refund', 'partial_refund', 'replacement', 'return_and_refund'],
    default: 'full_refund'
  },
  
  // Status Workflow
  status: {
    type: String,
    enum: [
      'REQUESTED',
      'UNDER_REVIEW',
      'NEEDS_MORE_EVIDENCE',
      'AWAITING_SELLER_RESPONSE',
      'APPROVED',
      'REJECTED',
      'PICKUP_SCHEDULED',
      'RETURN_IN_TRANSIT',
      'RETURN_RECEIVED',
      'REPLACEMENT_APPROVED',
      'PARTIAL_REFUND_APPROVED',
      'REFUND_PROCESSING',
      'REFUNDED',
      'REFUND_FAILED',
      'DISPUTE_ESCALATED',
      'CANCELLED',
      'CLOSED'
    ],
    default: 'REQUESTED'
  },

  // Perishable handling
  isPerishable: { type: Boolean, default: true },
  dispositionAction: {
    type: String,
    enum: ['physical_return', 'local_disposal', 'retained_by_buyer'],
    default: 'physical_return'
  },

  // Farmer Response
  farmerResponse: {
    respondedAt: { type: Number },
    action: { type: String, enum: ['accept', 'dispute', 'pending'], default: 'pending' },
    notes: { type: String, default: '' },
    dispatchEvidenceUrls: [{ type: String }],
    packagingProof: { type: String, default: '' }
  },

  // Admin Decision & Cost Allocation
  adminDecision: {
    decidedAt: { type: Number },
    adminName: { type: String },
    decision: { type: String, enum: ['approved', 'rejected', 'escalated', 'more_evidence', 'pending'], default: 'pending' },
    resolutionType: { type: String, enum: ['full_refund', 'partial_refund', 'replacement', 'no_refund', 'none'], default: 'none' },
    refundAmount: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    costBearer: {
      type: String,
      enum: ['seller', 'buyer', 'transporter', 'platform', 'uncertain'],
      default: 'uncertain'
    },
    mandatoryReason: { type: String, default: '' },
    notes: { type: String, default: '' }
  },

  // Return Logistics & Tracking
  logistics: {
    shipmentId: { type: String },
    transporterName: { type: String },
    trackingRef: { type: String },
    pickupAddress: { type: String },
    destinationAddress: { type: String },
    pickupDate: { type: String },
    status: {
      type: String,
      enum: ['not_required', 'pending_pickup', 'in_transit', 'delivered_to_farmer', 'cancelled'],
      default: 'not_required'
    }
  },

  // Optional Logistics-Protection Charge
  logisticsProtection: {
    optedIn: { type: Boolean, default: false },
    feeCharged: { type: Number, default: 0 },
    coverageAmount: { type: Number, default: 0 }
  },

  // Full Timestamped Timeline & Audit Trail
  timeline: [{
    status: { type: String, required: true },
    by: { type: String, required: true }, // 'Buyer', 'Farmer', 'Admin', 'System'
    actorName: { type: String },
    note: { type: String },
    at: { type: Number, default: Date.now }
  }],

  // Additional Evidence Requests & Submissions
  evidenceRequests: [{
    requestedBy: { type: String, default: 'Admin' },
    targetParty: { type: String, enum: ['buyer', 'farmer', 'both'] },
    message: { type: String, required: true },
    requestedAt: { type: Number, default: Date.now },
    resolved: { type: Boolean, default: false }
  }],

  evidenceSubmissions: [{
    submittedBy: { type: String, required: true },
    role: { type: String, required: true },
    note: { type: String },
    urls: [{ type: String }],
    submittedAt: { type: Number, default: Date.now }
  }],

  created: { type: Number, default: Date.now },
  updated: { type: Number, default: Date.now }
});

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
