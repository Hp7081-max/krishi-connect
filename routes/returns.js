const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

// GET /api/returns - List return requests
router.get('/', async (req, res) => {
  try {
    const { role, user, dealId, status } = req.query;
    const list = await dataService.getReturns({ role, user, dealId, status });
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/returns/:id - Single return request
router.get('/:id', async (req, res) => {
  try {
    const item = await dataService.getReturnById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Return request not found' });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/returns - Buyer creates a return/complaint request
router.post('/', async (req, res) => {
  try {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin is in Read-Only mode and cannot file return complaints.' });
    }
    const payload = req.body;
    if (!payload.dealId) {
      return res.status(400).json({ success: false, message: 'dealId is required' });
    }
    if (!payload.reason) {
      return res.status(400).json({ success: false, message: 'Complaint reason is required' });
    }
    if (!payload.description || !payload.description.trim()) {
      return res.status(400).json({ success: false, message: 'Detailed description is required' });
    }
    if (!payload.qtyAffected || Number(payload.qtyAffected) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid affected quantity is required' });
    }

    const created = await dataService.createReturnRequest(payload);
    res.status(201).json({
      success: true,
      message: 'Return request submitted successfully',
      data: created
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// POST /api/returns/:id/farmer-response - Farmer accepts or disputes
router.post('/:id/farmer-response', async (req, res) => {
  try {
    const role = (req.headers['x-user-role'] || '').toLowerCase();
    if (role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin is in Read-Only mode and cannot submit farmer dispute responses.' });
    }
    const existing = await dataService.getReturnById(req.params.id);
    const farmerName = req.body.farmerName || req.body.sellerName || (existing ? existing.farmer : '');
    const action = req.body.action || req.body.decision;
    const notes = req.body.notes || req.body.explanation || '';
    const dispatchEvidenceUrls = req.body.dispatchEvidenceUrls || req.body.dispatchProofUrls || [];
    const packagingProof = req.body.packagingProof || '';

    if (!farmerName) {
      return res.status(400).json({ success: false, message: 'Farmer identification is required' });
    }
    if (!action || !['accept', 'dispute'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Valid action (accept or dispute) is required' });
    }

    const updated = await dataService.farmerRespondReturn(req.params.id, farmerName, {
      action,
      notes,
      dispatchEvidenceUrls,
      packagingProof
    });

    res.json({
      success: true,
      message: action === 'accept' ? 'Return request accepted' : 'Dispute registered with dispatch evidence',
      data: updated
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// POST /api/returns/:id/admin-decision - Admin decision & cost allocation
router.post('/:id/admin-decision', async (req, res) => {
  try {
    const adminName = req.body.adminName || req.body.decidedBy || 'Admin';
    let resolutionType = req.body.resolutionType || req.body.resolution || 'full_refund';
    let decision = req.body.decision;
    if (!decision) {
      if (resolutionType === 'reject') decision = 'rejected';
      else if (resolutionType === 'escalate') decision = 'escalated';
      else decision = 'approved';
    }

    const mandatoryReason = req.body.mandatoryReason || req.body.decisionReason || req.body.reason || '';
    const refundAmount = req.body.refundAmount != null ? req.body.refundAmount : req.body.approvedRefund;
    const shippingCost = req.body.shippingCost != null ? req.body.shippingCost : 0;
    const costBearer = req.body.costBearer || 'seller';
    const dispositionAction = req.body.dispositionAction || 'local_disposal';
    const notes = req.body.notes || '';

    if (!decision || !['approved', 'rejected', 'escalated'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Valid decision (approved, rejected, escalated) is required' });
    }
    if (!mandatoryReason || !mandatoryReason.trim()) {
      return res.status(400).json({ success: false, message: 'A mandatory reason is required for administrative resolution' });
    }

    const updated = await dataService.adminResolveReturn(req.params.id, adminName, {
      decision,
      resolutionType,
      refundAmount,
      shippingCost,
      costBearer,
      mandatoryReason,
      dispositionAction,
      notes
    });

    res.json({
      success: true,
      message: `Return request marked as ${decision}`,
      data: updated
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// POST /api/returns/:id/evidence-request - Admin requests additional evidence
router.post('/:id/evidence-request', async (req, res) => {
  try {
    const adminName = req.body.adminName || req.body.decidedBy || 'Admin';
    const targetParty = req.body.targetParty || req.body.targetRole || 'both';
    const message = req.body.message || req.body.note || '';

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Evidence request message is required' });
    }

    const updated = await dataService.requestMoreEvidence(req.params.id, adminName, {
      targetParty,
      message
    });

    res.json({
      success: true,
      message: 'Evidence request sent successfully',
      data: updated
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// POST /api/returns/:id/evidence-submit - Buyer/Farmer submits additional evidence
router.post('/:id/evidence-submit', async (req, res) => {
  try {
    const userName = req.body.userName || req.body.submittedBy || 'User';
    const userRole = req.body.userRole || 'buyer';
    const note = req.body.note || req.body.explanation || '';
    const urls = req.body.urls || (req.body.url ? [req.body.url] : []);

    const updated = await dataService.submitAdditionalEvidence(req.params.id, userName, userRole, {
      note,
      urls
    });

    res.json({
      success: true,
      message: 'Additional evidence submitted successfully',
      data: updated
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// POST /api/returns/:id/shipment - Update return logistics
router.post('/:id/shipment', async (req, res) => {
  try {
    const transporterName = req.body.transporterName || req.body.courierName;
    const trackingRef = req.body.trackingRef || req.body.trackingNumber;
    const { pickupDate, status, actualShippingCost } = req.body;
    const updated = await dataService.updateReturnShipment(req.params.id, {
      transporterName,
      trackingRef,
      pickupDate,
      status,
      actualShippingCost
    });

    res.json({
      success: true,
      message: 'Return shipment logistics updated',
      data: updated
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

module.exports = router;
