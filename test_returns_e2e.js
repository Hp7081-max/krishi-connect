const http = require('http');

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : '';
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log("=== STARTING RETURN & REFUND END-TO-END WORKFLOW VERIFICATION ===\n");
  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
    }
  }

  try {
    // 1. Check Full State includes returns array
    console.log("1. Testing state initialization...");
    const stateRes = await request('GET', '/api/state/sync');
    assert(stateRes.status === 200, "GET /api/state/sync returns 200 OK");
    assert(Array.isArray(stateRes.data.data.returns), "State contains returns array");

    // Find or create a fresh deal by placing and accepting a bid
    const listings = stateRes.data.data.listings || [];
    let targetDeal = null;
    if (listings.length > 0) {
      const listing = listings[0];
      const bidRes = await request('POST', '/api/bids', {
        listingId: listing.id,
        rate: listing.price,
        qty: 15,
        note: "Fresh deal for return test",
        buyerName: "Agro Fresh Retail Partner"
      });
      if (bidRes.data && bidRes.data.data) {
        const bidId = bidRes.data.data.id || bidRes.data.data._id;
        const acceptRes = await request('POST', `/api/bids/${bidId}/accept`, {});
        if (acceptRes.data && acceptRes.data.deal) {
          targetDeal = acceptRes.data.deal;
        }
      }
    }
    if (!targetDeal) {
      const existingReturnDealIds = new Set((stateRes.data.data.returns || []).filter(r => !['CLOSED','CANCELLED','REJECTED'].includes(r.status)).map(r => r.dealId));
      targetDeal = (stateRes.data.data.deals || []).find(d => !existingReturnDealIds.has(d.id));
    }
    assert(targetDeal && targetDeal.id, `Target deal established: ID=${targetDeal?.id}, Buyer=${targetDeal?.buyer}, Farmer=${targetDeal?.farmer}`);

    // 2. Buyer submits a Return & Refund complaint with evidence
    console.log("\n2. Testing Buyer Return Submission...");
    const returnPayload = {
      dealId: targetDeal.id,
      buyerName: targetDeal.buyer || "Agro Fresh Retailers",
      reason: "damaged_crop",
      description: "Severe rotting and moisture damage observed upon unloading sacks.",
      evidenceUrls: ["data:image/jpeg;base64,/9j/4AAQSkZJRg==", "data:image/jpeg;base64,anotherphoto"],
      qtyReceived: targetDeal.qty,
      qtyAffected: Math.min(targetDeal.qty, 10),
      resolutionRequested: "partial_refund",
      logisticsProtectionOptIn: true
    };

    const createRes = await request('POST', '/api/returns', returnPayload);
    assert(createRes.status === 201, "POST /api/returns returns 201 Created");
    assert(createRes.data.success === true, "Return creation reports success: true");
    const createdReturn = createRes.data.data;
    assert(createdReturn && createdReturn.id, `Created Return ID: ${createdReturn?.id}`);
    assert(createdReturn.status === "REQUESTED", "Initial status is REQUESTED");
    assert(createdReturn.timeline.length >= 1, "Timeline initiated with REQUESTED step");
    assert(createdReturn.logisticsProtection.optedIn === true, "Logistics protection charge recorded");

    // 3. Test Farmer Isolation & Role Filtering
    console.log("\n3. Testing Role-Based Privacy & Farmer Isolation...");
    const farmerAllRes = await request('GET', `/api/returns?role=farmer&user=${encodeURIComponent(targetDeal.farmer)}`);
    assert(farmerAllRes.status === 200, "Farmer can fetch returns");
    const farmerSeesIt = farmerAllRes.data.data.some(r => r.id === createdReturn.id);
    assert(farmerSeesIt, "Target farmer can view the return request filed on their deal");

    const anotherFarmerRes = await request('GET', `/api/returns?role=farmer&user=DifferentFarmer999`);
    const otherFarmerSeesIt = anotherFarmerRes.data.data.some(r => r.id === createdReturn.id);
    assert(!otherFarmerSeesIt, "UNAUTHORIZED farmer CANNOT see returns of another farmer (Strict isolation)");

    // 4. Test Farmer Response & Dispute with Dispatch Proof
    console.log("\n4. Testing Farmer Response / Dispute Submission...");
    const farmerRespPayload = {
      decision: "dispute",
      explanation: "Crop was dispatched in Grade A dry condition; transit delay of 4 days in non-refrigerated truck caused moisture build-up.",
      dispatchProofUrls: ["data:image/jpeg;base64,dispatchWeighmentSlip", "data:image/jpeg;base64,mandiPhoto"]
    };

    const farmerRespRes = await request('POST', `/api/returns/${createdReturn.id}/farmer-response`, farmerRespPayload);
    assert(farmerRespRes.status === 200, "POST farmer-response returns 200 OK");
    assert(farmerRespRes.data.data.farmerResponse.decision === "dispute", "Farmer response recorded as dispute");
    assert(farmerRespRes.data.data.status === "DISPUTE_ESCALATED", "Status escalated to DISPUTE_ESCALATED");

    // 5. Test Admin Request for Additional Evidence
    console.log("\n5. Testing Admin Requesting Additional Evidence...");
    const evidReqPayload = {
      targetRole: "buyer",
      note: "Please provide mandi weighment receipt and timestamped photo of sack seals."
    };
    const evidReqRes = await request('POST', `/api/returns/${createdReturn.id}/evidence-request`, evidReqPayload);
    assert(evidReqRes.status === 200, "POST evidence-request returns 200 OK");
    assert(evidReqRes.data.data.status === "NEEDS_MORE_EVIDENCE", "Status updated to NEEDS_MORE_EVIDENCE");

    // 6. Test Buyer Submitting Additional Evidence
    console.log("\n6. Testing Buyer Submitting Additional Evidence...");
    const evidSubPayload = {
      url: "data:image/jpeg;base64,weighmentSlipTimestamped",
      note: "Uploaded weighment slip showing 10 qtl shortfall / water rot weight.",
      submittedBy: targetDeal.buyer
    };
    const evidSubRes = await request('POST', `/api/returns/${createdReturn.id}/evidence-submit`, evidSubPayload);
    assert(evidSubRes.status === 200, "POST evidence-submit returns 200 OK");
    assert(evidSubRes.data.data.status === "UNDER_REVIEW", "Status transitioned back to UNDER_REVIEW");

    // 7. Test Admin Adjudication, Freight Allocation & Wallet Refund Execution
    console.log("\n7. Testing Admin Adjudication & Financial Refund Execution...");
    const approvedRefundAmt = Math.round(targetDeal.rate * returnPayload.qtyAffected);
    const adminDecisionPayload = {
      resolution: "partial_refund",
      approvedRefund: approvedRefundAmt,
      costBearer: "transit",
      dispositionAction: "local_disposal", // Perishable: approved local disposal without forced reverse shipping
      decisionReason: "Investigation confirms transit heat damage. 10 Qtl spoiled; approved partial refund with local compost disposal.",
      decidedBy: "Admin Adjudicator Sharma"
    };

    const adminDecRes = await request('POST', `/api/returns/${createdReturn.id}/admin-decision`, adminDecisionPayload);
    assert(adminDecRes.status === 200, "POST admin-decision returns 200 OK");
    const resolvedReturn = adminDecRes.data.data;
    assert(resolvedReturn.status === "REFUNDED", "Status transitioned to REFUNDED");
    assert(resolvedReturn.adminDecision.approvedRefund === approvedRefundAmt, "Approved refund amount matched");
    assert(resolvedReturn.adminDecision.costBearer === "transit", "Cost allocated to transit damage");
    assert(resolvedReturn.adminDecision.dispositionAction === "local_disposal", "Perishable local disposal rule applied without reverse shipping");

    // 8. Verify Buyer Wallet Credited and Escrow Adjusted in Full State
    console.log("\n8. Verifying Financial Adjustments in State & Wallet...");
    const updatedStateRes = await request('GET', '/api/state/sync');
    const updatedWallet = updatedStateRes.data.data.wallet;
    const hasRefundTxn = updatedWallet.txns.some(t => t.amt === approvedRefundAmt && t.label.includes(createdReturn.id));
    assert(hasRefundTxn, `Wallet contains credit transaction of ₹${approvedRefundAmt} with Return Claim reference`);

    // 9. Test Reverse Logistics Tracking Endpoint
    console.log("\n9. Testing Reverse Logistics Tracking Update...");
    const shipmentPayload = {
      courierName: "Kisaan Safe Express",
      trackingNumber: "KSE-RET-987654",
      status: "PICKUP_SCHEDULED"
    };
    const shipRes = await request('POST', `/api/returns/${createdReturn.id}/shipment`, shipmentPayload);
    assert(shipRes.status === 200, "POST shipment returns 200 OK");
    assert(shipRes.data.data.logistics.courierName === "Kisaan Safe Express", "Courier logged");
    assert(shipRes.data.data.logistics.trackingNumber === "KSE-RET-987654", "Tracking number logged");

    // 10. Test Input Validation & Prevention of Duplicate Returns
    console.log("\n10. Testing Security & Edge Case Validations...");
    const duplicateRes = await request('POST', '/api/returns', returnPayload);
    assert(duplicateRes.status === 400, "POST duplicate return on same active deal rejected with 400 Bad Request");

    const invalidQtyRes = await request('POST', '/api/returns', { ...returnPayload, dealId: 'DEAL-999999' });
    assert(invalidQtyRes.status === 404, "POST return on non-existent deal rejected with 404 Not Found");

    console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  } catch (err) {
    console.error("Test execution error:", err);
  }
}

runTests();
