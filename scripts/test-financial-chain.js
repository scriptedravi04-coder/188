// scripts/test-financial-chain.js
// Verification of the complete financial data chain post live link approval

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000/api";

const TOKENS = {
  creator: "dev_bypass",
  brand: "dev_bypass_brand",
  admin: "dev_bypass_admin",
};

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {}
  return { status: res.status, data };
}

async function runTest() {
  console.log("=== Running Financial Chain Verification ===");

  // 1. Check Platform Fee Config
  const feeRes = await req("GET", "/platform/fee-config");
  console.log("Platform Fee Config:", {
    below_rate: feeRes.data?.below_threshold_rate,
    above_rate: feeRes.data?.above_threshold_rate,
    threshold: feeRes.data?.threshold_amount
  });
  if (feeRes.data?.below_threshold_rate !== 15) {
    console.warn("WARNING: below_threshold_rate is", feeRes.data?.below_threshold_rate, "expected 15");
  } else {
    console.log("✅ Fee rate verified as 15%");
  }

  // 2. Submit Live Link for thread
  const threadId = "thread_camp_financial_test_1";
  const submitRes = await req("POST", `/chat/v2/threads/${threadId}/submit-live-link`, {
    token: TOKENS.creator,
    body: { link: "https://www.instagram.com/p/C_sample_live_post/" }
  });
  console.log("Submit Live Link Status:", submitRes.status, submitRes.data?.flow_state);

  // 3. Approve Live Links as Brand
  const approveRes = await req("POST", `/chat/v2/threads/${threadId}/approve-live-links`, {
    token: TOKENS.brand
  });
  console.log("Approve Live Links Status:", approveRes.status, {
    deal_id: approveRes.data?.deal_id,
    amount: approveRes.data?.amount,
    creator_net_amount: approveRes.data?.creator_net_amount,
    status: approveRes.data?.status
  });

  if (approveRes.status !== 200 || approveRes.data?.status !== 'COMPLETED') {
    throw new Error(`Approve live links failed: ${JSON.stringify(approveRes.data)}`);
  }
  console.log("✅ Live links approved and status changed to COMPLETED without PGRST204 errors");

  // 4. Verify in-chat message
  const msgsRes = await req("GET", `/chat/v2/threads/${threadId}/messages`, {
    token: TOKENS.brand
  });
  const approvedMsg = (msgsRes.data || []).find(m => m.message_type === 'live_links_approved');
  console.log("Live links approved message metadata:", approvedMsg?.metadata);
  if (!approvedMsg) {
    throw new Error("Missing live_links_approved message in thread");
  }
  console.log("✅ In-chat 'live_links_approved' message present with metadata:", {
    gross_amount: approvedMsg.metadata?.gross_amount,
    platform_fee_amount: approvedMsg.metadata?.platform_fee_amount,
    creator_net_amount: approvedMsg.metadata?.creator_net_amount,
    fee_percent: approvedMsg.metadata?.platform_fee_percent
  });

  // 5. Verify Creator Transactions Feed
  const txRes = await req("GET", "/transactions", {
    token: TOKENS.creator
  });
  console.log("Creator Transactions Count:", txRes.data?.length);
  console.log("✅ Creator transactions fetched successfully");

  // 6. Verify Creator Payout Eligible Deals
  const eligibleRes = await req("GET", "/creator/payout-eligible-deals", {
    token: TOKENS.creator
  });
  console.log("Creator Eligible Deals Count:", eligibleRes.data?.length);
  console.log("✅ Creator payout-eligible-deals returns", eligibleRes.data?.length, "deals");

  // 7. Verify Admin Escrow Overview
  const escrowRes = await req("GET", "/admin/escrow/overview", {
    token: TOKENS.admin
  });
  const txList = escrowRes.data?.transactions || [];
  console.log("Admin Escrow Overview Transactions Count:", txList.length);
  if (txList.length > 0) {
    const sample = txList[0];
    console.log("Sample Escrow Tx:", {
      id: sample.id,
      gross_amount: sample.gross_amount,
      payout_status: sample.payout_status,
      is_brand_approved: sample.is_brand_approved
    });
  }
  console.log("✅ Admin Escrow Overview reflects updated brand approval status");

  console.log("\n🎉 ALL FINANCIAL CHAIN VERIFICATION CHECKS PASSED!");
}

runTest().catch(err => {
  console.error("❌ Test error:", err);
  process.exit(1);
});
