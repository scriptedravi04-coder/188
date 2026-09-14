# Protected Flows — DO NOT BREAK

This document lists behaviors that have already been verified working through 
careful testing. Before making ANY change, especially to shared files like 
backend/server.ts, ChatBox.jsx, MessageBubble.jsx, or ContentProofNotice.jsx, 
check whether your change could affect any of these. After making a change, 
run `node scripts/regression-test.js` and re-verify anything related below.

## Security
- Login for banned/deleted/suspended accounts returns HTTP 401 (not 403 — 
  403 gets swallowed by the platform's Nginx and replaced with an HTML page) 
  with the correct `code` field (ACCOUNT_BANNED / ACCOUNT_DELETED / 
  ACCOUNT_SUSPENDED).
- No hardcoded Supabase service_role key anywhere in the codebase — always 
  read from process.env.SUPABASE_SERVICE_ROLE_KEY.
- No privileged-email auto-admin backdoor in /auth/login.
- env.json, db_mock.json, keys.txt must stay in .gitignore.

## KYC
- GET /admin/verifications must return BOTH creator and brand submissions, 
  each with kind/type correctly set to "creator" or "brand" (lowercase).
- Real submitted PAN, UPI, GSTIN, bank details must appear — never "N/A" 
  or placeholder values, when real data was submitted.
- content_submissions / creator_kyc / brand_kyc do NOT have a real foreign 
  key relationship allowing an embedded Supabase .select() join — always 
  query separately and merge in memory.
- "Update Details" button must be visible on approved/pending KYC status 
  pages, resetting status to pending on resubmission.

## Admin Panel
- /admin/transactions and /transactions return real data (not hardcoded []).
- /admin/banners full CRUD works; public /banners filters by audience type 
  + Live status + date window.
- /ai/predict-roi and /escrow-transactions return real/reasonable data, 
  never hard-fail.
- /admin/fee-config, /admin/templates, /admin/enforcement/warning, 
  /admin/versions, /admin/system-collabs (7 sub-routes), 
  /support/tickets/:id/reply all exist and work as built.
- PORT respects process.env.PORT (via Number(process.env.PORT) || 3000), 
  and env.json loader must NOT overwrite already-set real env vars.

## Instant UGC Orders
- revision_count defaults to 5 (not 2) on order claim.
- Requesting more than revision_count revisions returns HTTP 400 with a 
  clear "Revision limit reached (N/N)" message, and revisions_used does 
  NOT increment further.
- Cancelling an order refunds escrow (payment_status → REFUNDED, 
  escrow_hold → false) and logs a refund transaction; cancelling an 
  already-COMPLETED order is blocked with an error.
- Every lifecycle action (submit, approve, request-revision, decline-
  revision, cancel) creates a chat message AND a notification — this must 
  stay true for all five actions, not just some.
- Chat messages of type revision_requested / content_proof_submitted must 
  render as the rich ContentProofNotice card (video preview + action 
  buttons), never fall back to a plain text bubble — check the message 
  bubble's rendering rule AND that Supabase's chat_messages table actually 
  has message_type and metadata columns (they're required for this to work 
  after a page reload / Supabase reload, not just optimistically in-memory).
- Video/deliverable URLs in chat message metadata must always be written under 
  BOTH video_url and content_url keys — ContentProofNotice.jsx and other 
  consumers may read either name; don't narrow to just one when touching this 
  code again.

## Campaign Collaboration (Deals)
- Deal signing requires BOTH parties to actually sign (dual-signature check) 
  — do not accidentally make this auto-sign like UGC orders.
- revision_count for Deals also defaults to 5 and is enforced the same way 
  as UGC (this was fixed alongside the UGC fix — don't let them drift 
  apart again).
- NegotiationTable.jsx and OfferCard.jsx must call the REAL backend routes 
  creator-negotiate and brand-accept-counter (not /offer or 
  /offer/:id/accept, which don't exist).
- brand-accept-counter must actually update agreed_amount on the deal/
  thread to match the negotiated counter_amount (previously silently 
  didn't; the FIX changed thread.agreed_amount when accepted — note: a 
  proposed-but-not-yet-accepted counter should ideally NOT already change 
  agreed_amount, only counter_amount — double check this distinction 
  stays correct if this code is touched again).
- Deal cancellation stays ADMIN-ONLY (via /admin/system-collabs/:id/resolve) 
  — do not add a self-service cancel button/route for Deals, this is 
  intentional.
- After CONTENT_APPROVED, a live post link submission (PROOF_SUBMITTED) is 
  still required before COMPLETED — this differs from UGC, which completes 
  immediately on approval. Do not merge these two behaviors.

## Testing Safety & Isolation
- NEVER reuse real user-facing threads, deals, or campaigns for manual or automated API testing.
- Always create dedicated, clearly-named test entities (e.g. threads prefixed with `thread_test_...`, `thread_demo_...`, or test users like `dev-user-id-12345` on isolated test deals/campaigns).
- Never emit test deliverables, test revision requests, fake video URLs, or test messages into production deals/threads between real users.

## Infrastructure
- Any lazy-loaded route/chunk import failure ("Failed to fetch dynamically 
  imported module") must trigger an automatic reload via the 
  lazyWithRetry + vite:preloadError handlers in src/App.jsx / 
  src/index.jsx — never show a raw stack trace to the user.
- Mobile view of the Public Creator Application form (PublicCreatorApply.jsx) 
  must show the dedicated "Entry" screen before Step 1, and back-navigation 
  must go Step 1 → Entry → landing page (/) — never to /creators or any 
  broken intermediate screen.
