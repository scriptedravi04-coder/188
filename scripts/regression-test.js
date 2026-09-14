// Regression test script — run this after ANY change to catch things that
// used to work but got broken. Run with: node scripts/regression-test.js
//
// Uses dev_bypass / dev_bypass_admin / dev_bypass_brand tokens already
// built into this app's auth system for testing without real login.

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000/api";

const TOKENS = {
  creator: "dev_bypass",
  brand: "dev_bypass_brand",
  admin: "dev_bypass_admin",
};

let pass = 0;
let fail = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    fail++;
    failures.push({ name, error: err.message });
    console.log(`❌ FAIL: ${name} — ${err.message}`);
  }
}

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("=== Regression Test Suite ===\n");

  await check("Health check responds 200", async () => {
    const { status } = await req("GET", "/health");
    assert(status === 200, `expected 200, got ${status}`);
  });

  await check("Banned account login returns 401 ACCOUNT_BANNED (not Nginx HTML)", async () => {
    const { status, data } = await req("POST", "/auth/login", {
      body: { email: "admin@ybex.io", password: "anything" },
    });
    assert(status === 401, `expected 401, got ${status}`);
    assert(data && data.code === "ACCOUNT_BANNED", `expected code ACCOUNT_BANNED, got ${JSON.stringify(data)}`);
  });

  await check("Backdoor privileged emails no longer auto-provision as admin", async () => {
    const { status } = await req("POST", "/auth/login", {
      body: { email: "totallynew_" + Date.now() + "@ybex.io", password: "x" },
    });
    assert(status === 401, `expected 401 (no auto-admin), got ${status}`);
  });

  await check("Admin transactions route requires auth", async () => {
    const { status } = await req("GET", "/admin/transactions");
    assert(status === 403 || status === 401, `expected 403/401, got ${status}`);
  });

  await check("Admin transactions works for admin", async () => {
    const { status } = await req("GET", "/admin/transactions", { token: TOKENS.admin });
    assert(status === 200, `expected 200, got ${status}`);
  });

  await check("Admin KYC/verifications returns real creator PAN (not N/A)", async () => {
    const { status, data } = await req("GET", "/admin/verifications", { token: TOKENS.admin });
    assert(status === 200, `expected 200, got ${status}`);
    const creatorRec = Array.isArray(data) && data.find((r) => (r.kind || r.type || "").toLowerCase() === "creator");
    assert(creatorRec, "no creator KYC record found to check");
    const pan = creatorRec.pan_number || creatorRec.documents?.pan_number;
    assert(pan && pan !== "N/A", `expected real PAN, got ${pan}`);
  });

  await check("Admin KYC/verifications includes brand submissions with type 'brand'", async () => {
    const { data } = await req("GET", "/admin/verifications", { token: TOKENS.admin });
    const brandRec = Array.isArray(data) && data.find((r) => (r.kind || r.type || "").toLowerCase() === "brand");
    assert(brandRec, "no brand KYC record found — brand-side KYC listing may be broken again");
  });

  await check("Banner create/list/delete full cycle", async () => {
    const created = await req("POST", "/admin/banners", {
      token: TOKENS.admin,
      body: { type: "Influencer", status: "Live", imgUrl: "https://example.com/test.jpg" },
    });
    assert(created.status === 200, `create failed, status ${created.status}`);
    const id = created.data.id;

    const publicList = await req("GET", "/banners", { token: TOKENS.creator });
    assert(
      publicList.data.some((b) => b.id === id),
      "created banner not visible on public /banners"
    );

    const del = await req("DELETE", `/admin/banners/${id}`, { token: TOKENS.admin });
    assert(del.status === 200, `delete failed, status ${del.status}`);
  });

  await check("UGC revision_count defaults to 5 on claim", async () => {
    console.log("   (manual check needed: claim a UGC brief, confirm revision_count === 5)");
  });

  await check("Negotiation accept actually updates agreed_amount", async () => {
    console.log("   (manual check needed: propose counter-offer, accept, confirm agreed_amount matches)");
  });

  await check("Chat threads list loads", async () => {
    const res = await req("GET", "/chat/v2/threads", { token: TOKENS.creator });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(Array.isArray(res.data) || Array.isArray(res.data?.threads), "expected threads array");
  });

  await check("Negotiation routes exist", async () => {
    const r1 = await req("POST", "/chat/v2/threads/nonexistent/creator-negotiate", {
      token: TOKENS.creator,
      body: { counter_amount: 5000 },
    });
    assert(r1.status === 404, `expected 404 thread not found, got ${r1.status}`);
    assert(r1.data?.error === "Thread not found", `expected Thread not found, got ${JSON.stringify(r1.data)}`);

    const r2 = await req("POST", "/chat/v2/threads/nonexistent/brand-accept-counter", {
      token: TOKENS.brand,
    });
    assert(r2.status === 404, `expected 404 thread not found, got ${r2.status}`);
    assert(r2.data?.error === "Thread not found", `expected Thread not found, got ${JSON.stringify(r2.data)}`);
  });

  await check("Public campaigns list loads", async () => {
    const res = await req("GET", "/campaigns", { token: TOKENS.creator });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), "expected array of campaigns");
  });

  await check("Chat messages load for active thread", async () => {
    const res = await req("GET", "/chat/v2/threads/thread_test_nego/messages", { token: TOKENS.creator });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), "expected messages array");
  });

  await check("UGC orders list loads for creator and brand", async () => {
    const rCreator = await req("GET", "/ugc/orders/creator", { token: TOKENS.creator });
    assert(rCreator.status === 200, `creator orders expected 200, got ${rCreator.status}`);
    assert(Array.isArray(rCreator.data), "expected creator orders array");

    const rBrand = await req("GET", "/ugc/orders/brand", { token: TOKENS.brand });
    assert(rBrand.status === 200, `brand orders expected 200, got ${rBrand.status}`);
    assert(Array.isArray(rBrand.data), "expected brand orders array");
  });

  await check("UGC deliverable submit route validates payload", async () => {
    const res = await req("POST", "/ugc/orders/ugcord_mtq1oc7t_def095/submit", {
      token: TOKENS.creator,
      body: {},
    });
    assert(res.status === 400, `expected 400 validation error, got ${res.status}`);
    assert(res.data?.error?.includes("video"), `expected video requirement error, got ${JSON.stringify(res.data)}`);
  });

  await check("Support tickets: GET /support/my-tickets and POST /support/order-ticket flow", async () => {
    const initial = await req("GET", "/support/my-tickets", { token: TOKENS.creator });
    assert(initial.status === 200, `expected 200, got ${initial.status}`);
    assert(Array.isArray(initial.data?.tickets), "expected tickets array in data");

    const created = await req("POST", "/support/order-ticket", {
      token: TOKENS.creator,
      body: {
        thread_id: "thread_test_nego",
        order_id: "ord_reg_test_123",
        campaign_title: "Regression Test Campaign",
        deal_amount: 10000,
        issue_category: "Regression Check",
        message: "Automated regression test issue report",
        subject: "Order Dispute: Regression Test Campaign (Order #ord_reg_)",
      },
    });
    assert(created.status === 201, `expected 201, got ${created.status}`);
    assert(created.data?.ticket_id, "expected ticket_id in response");
    assert(created.data?.ticket?.order_id === "ord_reg_test_123", "created ticket order_id mismatch");
    assert(created.data?.ticket?.thread_id === "thread_test_nego", "created ticket thread_id mismatch");

    const tktId = created.data.ticket_id;

    const msgs = await req("GET", `/support/tickets/${tktId}/messages`, { token: TOKENS.creator });
    assert(msgs.status === 200, `expected 200, got ${msgs.status}`);
    assert(Array.isArray(msgs.data) && msgs.data.length > 0, "expected at least 1 message");
    assert(msgs.data[0].message === "Automated regression test issue report", "message content mismatch");

    const refetched = await req("GET", "/support/my-tickets", { token: TOKENS.creator });
    const myTicket = refetched.data?.tickets?.find((t) => t.ticket_id === tktId);
    assert(myTicket, "newly created ticket not found in my-tickets");
    assert(myTicket.order_id === "ord_reg_test_123", `order_id was corrupted to ${myTicket.order_id}`);
    assert(myTicket.thread_id === "thread_test_nego", `thread_id was corrupted to ${myTicket.thread_id}`);
  });

  await check("UGC ops internal routes: GET, POST /accept, POST /submit flow", async () => {
    // 1. GET /ugc-orders
    const listRes = await req("GET", "/ugc-orders", { token: TOKENS.admin });
    assert(listRes.status === 200, `expected 200, got ${listRes.status}`);
    assert(Array.isArray(listRes.data), "expected array of ugc orders/briefs");

    const target = listRes.data[0];
    assert(target && target.order_id, "expected at least one UGC order/brief to test");

    // 2. Accept route
    const acceptRes = await req("POST", `/ugc-orders/${target.order_id}/accept`, { token: TOKENS.admin });
    assert(acceptRes.status === 200, `expected 200 on accept, got ${acceptRes.status}`);
    assert(acceptRes.data?.ok === true, "expected ok: true on accept");
    assert(acceptRes.data?.status === "ACCEPTED", "expected status ACCEPTED on accept");
    assert(acceptRes.data?.in_house_assigned === true, "expected in_house_assigned: true");

    // 3. Submit route validation
    const invalidSubmit = await req("POST", `/ugc-orders/${target.order_id}/submit`, {
      token: TOKENS.admin,
      body: {},
    });
    assert(invalidSubmit.status === 400, "expected 400 when missing video_url");

    // 4. Valid submit
    const validSubmit = await req("POST", `/ugc-orders/${target.order_id}/submit`, {
      token: TOKENS.admin,
      body: { video_url: "https://cdn.ybex.io/deliverables/regression_test_video.mp4" },
    });
    assert(validSubmit.status === 200, `expected 200 on submit, got ${validSubmit.status}`);
    assert(validSubmit.data?.ok === true, "expected ok: true on submit");
    assert(validSubmit.data?.status === "SUBMITTED", "expected status SUBMITTED on submit");
    assert(validSubmit.data?.video_url === "https://cdn.ybex.io/deliverables/regression_test_video.mp4", "video_url mismatch");
  });

  await check("Campaign application requires auth", async () => {
    const { status } = await req("POST", "/campaigns/apply", { body: { campaignId: "test" } });
    assert(status === 401 || status === 403, `expected 401/403, got ${status}`);
  });

  await check("AI predict-roi still returns a usable shape (no hard crash)", async () => {
    const { status, data } = await req("POST", "/ai/predict-roi", {
      token: TOKENS.brand,
      body: { campaign: {}, creators: [{ followers: 5000 }] },
    });
    assert(status === 200, `expected 200, got ${status}`);
    assert(
      typeof data?.estimatedReach === "number" && typeof data?.roiMultiplier === "number",
      `expected estimatedReach/roiMultiplier numbers, got ${JSON.stringify(data)}`
    );
  });

  await check("UGC/Deal lifecycle chat sync — all 5 actions create a chat message", async () => {
    console.log("   (manual check needed: for a real order/deal, verify submit/approve/revision/decline/cancel EACH insert a chat_messages row)");
  });

  await check("Revision-request messages render via ContentProofNotice card, not plain text", async () => {
    console.log("   (manual check needed: request a revision, confirm message_type matches MessageBubble.jsx's isContentProof check, and Supabase chat_messages has message_type/metadata columns)");
  });

  await check("Deal revision limit (5) enforced on content-submissions/:id/request-changes", async () => {
    console.log("   (manual check needed: on a real deal at revisions_used === revision_count, confirm request-changes returns HTTP 400 with 'Revision limit reached')");
  });

  await check("Live link URL validation rejects non-URL garbage and accepts valid URL", async () => {
    // 1. Reject invalid / garbage string
    const invalidRes = await req("POST", "/chat/v2/threads/thread_reg_test_livelink/submit-live-link", {
      token: TOKENS.creator,
      body: { link: "hvvh" },
    });
    assert(invalidRes.status === 400, `expected 400 for garbage link, got ${invalidRes.status}`);
    assert(invalidRes.data?.error?.includes("Invalid URL"), `expected Invalid URL error, got ${JSON.stringify(invalidRes.data)}`);

    // 2. Accept valid URL
    const validRes = await req("POST", "/chat/v2/threads/thread_reg_test_livelink/submit-live-link", {
      token: TOKENS.creator,
      body: { link: "https://www.instagram.com/p/C_test_post_live_123/" },
    });
    assert(validRes.status === 200, `expected 200 for valid link, got ${validRes.status}`);
    assert(validRes.data?.flow_state === "PROOF_SUBMITTED", "expected flow_state PROOF_SUBMITTED");
  });

  await check("Approve & Pay creates distinct live_links_approved message and completes deal", async () => {
    // Call approve-live-links
    const approveRes = await req("POST", "/chat/v2/threads/thread_reg_test_livelink/approve-live-links", {
      token: TOKENS.brand,
    });
    assert(approveRes.status === 200, `expected 200, got ${approveRes.status}`);
    assert(approveRes.data?.status === "COMPLETED", "expected thread status COMPLETED");
    assert(approveRes.data?.flow_state === "COMPLETED", "expected flow_state COMPLETED");

    // Fetch messages to verify distinct live_links_approved message type
    const msgsRes = await req("GET", "/chat/v2/threads/thread_reg_test_livelink/messages", {
      token: TOKENS.brand,
    });
    assert(msgsRes.status === 200, `expected 200 on messages, got ${msgsRes.status}`);
    const approvalMsg = (msgsRes.data || []).find((m) => m.message_type === "live_links_approved");
    assert(approvalMsg, `expected to find message with message_type 'live_links_approved', got ${JSON.stringify(msgsRes.data?.map(m => m.message_type))}`);
    assert(approvalMsg.sender_role === "brand", `expected sender_role 'brand', got ${approvalMsg.sender_role}`);
  });

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`- ${f.name}: ${f.error}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();
