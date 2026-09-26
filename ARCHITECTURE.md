# ⚠️ PROTECTED CHANGES — READ BEFORE EDITING (for developers and AI tools)

**To any AI assistant (Google AI Studio / Gemini, Copilot, Cursor, Claude, …) and any developer:**
the items below are security, money and data-privacy fixes. Each one closed a real hole.
**Do not remove, weaken, "simplify" or work around them — even if a feature seems easier without
them, even if the user asks for a small UI change nearby.** If a change you are asked to make
seems to require touching one of them, STOP and tell the user instead of changing it.

**Before finishing ANY change, run `npm run verify`** (typecheck + crash guard + all tests).
The tests named below fail when a protection is undone. Never edit or delete a test to make it
pass — a failing test here means the change is wrong, not the test.

| # | Protected rule | Why (what went wrong before) | Where | Guard test |
|---|---|---|---|---|
| 1 | `npm start` = `NODE_ENV=production node dist/server.cjs` | `node server.ts` crashed on Cloud Run → "failed to listen on PORT" | `package.json` | `deployStart.test.ts` |
| 2 | Demo admin login only with `DEMO_LOGIN=true` | It followed payment test mode (ON on run.app) → anyone could GET `/api/admin/bypass` and get an **admin** token | `admin_system_maintenance_routes.ts`, `server.ts` | `session22Audit.test.ts` |
| 3 | No demo data for real users unless `DEMO_SEED=true` | Every new user got fake collabs, invoices, earnings, orders; a real creator was added as applicant to real campaigns | `auth_routes.ts` (`/auth/me`) | `session22Audit.test.ts` |
| 4 | `/auth/sync` stays removed (410) | No login check; anyone could set any account's role (incl. admin) and read its row | `auth_routes.ts` | `session22Audit.test.ts` |
| 5 | No login auto-provision; no bare `user_id` as token; `/auth/session` only for a real session | Any email + any password created a verified account; "admin" in email → admin | `auth_routes.ts`, `server.ts parseAuthUser` | `session20Fixes`, `session21Review` |
| 6 | Onboarding saves `users.role`; creator↔brand switch blocked after onboarding | Brands saw "Only brands can post campaigns"; role could be changed by API | `roleGuards.ts` | `onboardingRole.test.ts` |
| 7 | Contract signing needs a verified email OTP → one-time `sign_token` (server) | Signing screens showed the OTP in a toast / accepted a typed name | `signTokens.ts`, `session_routes.ts`, all `/sign` routes | `phase2`, `session22` |
| 8 | OTP codes, sign tokens, OTP send limit in shared store `ybex_ephemeral` (hashed) | With 2+ Cloud Run instances, verify/sign failed randomly | `ephemeralStore.ts`, `scripts/sql/ybex_ephemeral.sql` | `session22.test.ts` |
| 9 | OTP code is returned to the browser **only in test mode** | Code visible to whoever asked = no verification | `session_routes.ts` | `campaignRoutesAndOtp` |
| 10 | Only the deal's two parties sign / accept / counter; compare by **side**, not user id | A stranger could accept someone's counter-offer | `campaignGuards.ts`, deal routes | `campaignIntegrity`, `session21Review` |
| 11 | Escrow cannot be funded before both sides signed (`CONTRACT_NOT_SIGNED`) | Money taken for unsigned deals | `payment_routes.ts`, `escrowService.ts` | `moneyWiring`, `escrowService` |
| 12 | A money claim in the UI must match the server (gross vs net, RELEASED ≠ PAID, no fake %) | Earnings page showed gross as net and a fake "+100%" | earnings pages | `moneyWiring` |
| 13 | UGC cancel = real Razorpay refund, else `PENDING` + `refund_due` admin alert | It said "refunded" with no money moving | `refunds.ts`, `ugcLifecycleService.ts` | `phase2` |
| 14 | UGC slot claim is compare-and-set | Two creators got the same slot → two payouts | `ugcSlots.ts` | `ugcIntegrity` |
| 15 | Sockets: tied to the logged-in user; rooms only for the deal's parties; deal events never `io.emit` to everyone; online status only to contacts | Anyone could read any deal chat live and everyone's notifications | `socketAccess.ts`, `socketServer.ts` | `phase1and3`, `session22` |
| 16 | Admin alerts (new sign-ups' name/email) to admins only | Leaked to every user | `sendNotification`, `emitAdminEvent` | `phase1and3` |
| 17 | Private buckets (`content-submissions`, `live-proofs`, `ugc-assets`, `kyc-documents`) are **never** made public by code; files open only via `/api/media` (15-min signed link, party check) | Clean videos downloadable before approval; server re-publicised the bucket on every start | `mediaAccess.ts`, `media_routes.ts`, `storageHelpers.ts`, `src/lib/mediaUrl.js` | `mediaAccess.test.ts` |
| 18 | Do **not** build `/object/public/content-submissions/...` URLs in the frontend; use `resolveMediaUrl` / `mediaHref` | Bypasses the access check | `VideoEmbedPreview.jsx`, `mediaUrl.js` | `mediaAccess.test.ts` |
| 19 | `/api/admin/run-sql` stays removed | It returned the whole `process.env` (all secret keys) to anyone | `server.ts` | `session20Fixes` |
| 20 | Signed upload URLs only for the deliverable folders | Could upload into any bucket (KYC too) | `misc_routes.ts checkSignedUploadTarget` | `phase1and3` |
| 21 | Every `/admin/*` route checks admin; formerly open routes (landing brands/reviews, bulk-import, collab deliverable, performance record, `/files/:id` for private files) check the caller | Anyone could deface the landing page, insert leads, overwrite deliverables, download KYC files | the route files | `session22Audit.test.ts` |
| 22 | Public creator profile hides email/phone/bank/UPI/PAN/Aadhaar/GST/address | The whole row was public | `profilePrivacy.ts`, `creators_routes.ts` | `session22Audit.test.ts` |
| 23 | No empty `catch {}` — backend uses `logIgnored`, frontend `ignored` | Failures (OTP not sent, lost sessions) vanished without trace | everywhere | `session22.test.ts` |
| 24 | Every `flow_state` token is listed in `statusTokens.ts` (the DB contract) | Unknown states broke cards and payouts | `statusTokens.ts` | `statusTokens.test.ts` |
| 25 | No hard-coded fake orders / fake brands / ₹50,000 placeholders; no competitor names | Fake money records | — | `moneyWiring` |
| 26 | The server always uses the service-role client (`supabase = privilegedSupabase` when the key is set). The browser never reads/writes `users`, `user_sessions`, `transactions`, `files`, `deals`, `*_kyc` directly — it calls the API (`browserDbRoutes.ts`) | Those tables had "anyone may do anything" RLS policies so anon-key calls worked; any browser could read session tokens, KYC, payments, or set its own role to admin | `server.ts`, `browserDbRoutes.ts` | `session22Audit.test.ts` |
| 27 | Profile-table writes from the browser (`brand_profiles`, `creator_profiles`, `creator_portfolio_items`, `creator_social_channels`, notifications "mark read") go through `ownDb` → `POST /api/db/own`; the server forces the caller's own row and drops staff-only columns (verified, kyc_*, rating, featured, role, suspension; `profile_status` only draft/under_review/pending) | RLS on these tables is SELECT-only for the browser; direct upserts failed silently. A direct-write policy would let anyone edit anyone's profile or mark themselves verified | `src/lib/ownDb.js`, `browserDbRoutes.ts` | `ownDb.test.ts`, `session22Audit.test.ts` |
| 28 | Notifications: the browser reads them only via `GET /api/notifications` and gets live ones over our socket (`new_notification` to room `user_<id>`); never `supabase.from('notifications')` or Supabase realtime | The table had to be readable by anyone for the old direct reads/realtime — everyone's notifications were public. Also the server emitted to room `<id>` while sockets join `user_<id>`, so live notifications never arrived | `BrandDashboard.jsx`, `BrandHomeMobile.jsx`, `server.ts` | `session22Audit.test.ts` |
| 29 | Helpdesk: the browser uses only the API for `support_tickets` / `ticket_messages` (`/support/my-tickets`, `/support/tickets/:id/messages` — owner or staff, `/admin/support/tickets`, `PATCH /admin/support/tickets/:id/status` — staff); live refresh by polling, not Supabase realtime | Both tables were open to anyone (read + write); any logged-in user could read any ticket's messages | `support_routes.ts`, `AdminHelpdesk.jsx`, `HelpTickets.jsx`, `AdminAnalytics.jsx` | `session22Audit.test.ts` |
| 30 | Every successful POST/PUT/PATCH on a thread/order action route sends one `thread_updated` to both parties (`threadSync.ts`, mounted with `router.use`). Only state fields travel (`SYNC_FIELDS`), never the enriched record. Clients merge it without touching their own thread `id`, then do one coalesced refresh (`createCoalescedRunner`) | Negotiate / accept-counter and others sent nothing, so the other screen showed old buttons until its 15 s poll; bursts of events caused flicker | `threadSync.ts`, `ChatBox.jsx`, `useChatThreadMobile.js`, `src/lib/chatSync.js` | `session23.test.ts` |
| 31 | Chat messages are shown in time order: the messages endpoint sorts after merging local rows, and both clients sort. Every `chat_messages.message_id` written to Supabase is a UUID | A non-UUID id made the campaign revision insert fail; the card lived only locally and was appended after everything, so it stuck to the bottom of the chat | `chat_routes.ts`, `campaign_lifecycle.ts`, `chatSync.js` | `session23.test.ts` |
| 32 | Login check: parallel requests with one token share one lookup; token → user_id is cached ≤ 5 s; the user row is never cached. Logout deletes the Supabase session row and clears the cache | Each request ran 2 sequential Supabase lookups (×10 per page load). Logout removed the session only locally, so the token kept working | `authLookupCache.ts`, `server.ts`, `auth_routes.ts`, `session_routes.ts` | `session23.test.ts`, `session20Fixes.test.ts` |
| 33 | Mobile chat reads deal state only from `src/components/chat/dealState.js` (a copy of desktop ChatBox's flags) — never its own copy. Escrow payment on mobile uses `processRazorpayPayment` with the same arguments as desktop; the escrow sheet never says "secured" unless funded and never states a fee. A UGC approval (releases payout) asks for confirmation. Negotiation opens the desktop `NegotiationTable` | Mobile's own flags ignored `payment_funded`, kept any old revision open and showed "Sign" during negotiation; "Make payment" opened a sheet that said "Payment secured · fee Free" and paid nothing | `dealState.js`, `ChatBoxMobile.jsx`, `useChatThreadMobile.js`, `MobileEscrowSheet.jsx`, `MobilePayoutCard.jsx` | `mobileChatActions.test.js` |
| 34 | Mobile money screens show only the server's numbers (`gross_amount`, `platform_fee_amount`, `gst_amount`, `creator_net_amount`, real UTR) — no assumed fee %, no sample UTR/ids. Mobile admin payout sends the desktop payload with FULL ids (display ids are truncated) and uses the desktop readiness rules. Mobile UGC: live link sent as `link`/`links`; brand payout release asks first; live-link correction sends `action: reject_live_links` | Mobile invented a 12.5%/5% fee and a sample UTR, sent a 7-char deal id to release-payout, used `liveLink` (server ignores it) and turned link corrections into draft revisions | `AdminPayoutMobile.jsx`, `BrandPaymentsMobile.jsx`, `CreatorEarningsMobile.jsx`, `CreatorUGCMobile.jsx`, `BrandUGCMobile.jsx` | `mobileAudit.test.js` |
| 35 | **Loading states** (section below). Button actions (save, OTP, logout, approve, submit, pay) never call `startLoading()` — they use `useBusy` + `<ButtonSpinner />` in the tapped button. Page data shows `ContentSkeletons` in the content's shape. `GlobalLoader` stays a 2px top bar, non-blocking. The big-wordmark splash is only `ColdStartSplash` (auth loading) | The old full-screen blurred loader blocked the whole app for any fetch or button tap | `useBusy.js`, `ButtonSpinner.jsx`, `ContentSkeletons.jsx`, `GlobalLoader.jsx`, `ColdStartSplash.jsx` | `loadingStates.test.js` |

**Env switches that must stay OFF in production:** `DEMO_LOGIN`, `DEMO_SEED`. `PAYMENTS_TEST_MODE`
must be `false` for real use (while test mode is on, fake `pay_test_` payments are accepted and
OTP codes are shown on screen).

**Safe to change freely:** texts, colours, layout, spacing, icons, new pages that call existing
APIs, button placement (see AGENTS.md). When in doubt: ask, and run `npm run verify`.

---

# Ybex — Campaign vs UGC

Read this before touching anything in chat, escrow or the deal lifecycle.

## The one thing that causes bugs here

Ybex runs two products through a lot of the same code:

| | Campaign | Instant UGC |
|---|---|---|
| What it is | A brand runs a campaign; creators apply; a deal is signed | A brand orders a video directly from a creator |
| Record | `deals` row | `ugc_orders` row |
| Identifier | UUID, e.g. `3f2b…-…` | prefixed string, e.g. `ugcord_1773…` |
| Has a signature stage | yes | no |
| Chat thread id | `thread_camp_…` or a UUID | `thread_ugc_…` |

Both of these were historically stored in the **same column**: `chat_threads.deal_id`. So a
`deal_id` may hold a campaign UUID or a UGC order string, and code that assumed one got the
other. That single ambiguity is behind a long run of bugs — Supabase `22P02` errors from
passing `ugcord_…` where a UUID was expected, UGC orders silently updating the `deals`
table, revision state landing on the wrong record.

## The identifiers to use

- **`campaign_deal_id`** — set only on campaign threads. Always a UUID or `null`.
- **`ugc_order_id`** — set only on UGC threads.
- **`deal_id`** — legacy, still populated for both. Hundreds of call sites read it, so it
  has not been removed. **Do not use it in new code to decide which flow you are in.**

`populateThreadData` in `backend/server.ts` sets `campaign_deal_id` and `ugc_order_id`, plus
`is_ugc`, `type` and `deal_type`.

## How to tell which flow you are in

Do not pattern-match on the string. Use the flags the serializer already gives you:

```ts
const isUgc = Boolean(
  thread.is_ugc || thread.ugc_order_id ||
  String(thread.deal_type || '').toUpperCase() === 'UGC'
);
```

When you only have a raw id, check for the `ugcord_` / `thread_ugc_` prefix, and validate
the UUID shape before sending anything to a Supabase UUID column:

```ts
const isUuid = (v: any) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
```

## Rules

1. **Never write a UGC id into a UUID column.** Guard with `isUuid` first. An unguarded
   write fails the whole statement, not just that row.
2. **Decide by what the thread IS, not by what you could prove.** Gating a UGC write on
   "did the order row resolve" means the write is skipped exactly when resolution failed —
   which is when it mattered. Gate on `isCampaignThread` instead, and let UGC be the
   default. See `syncUgcLifecycleEvent`.
3. **Campaign code is under a freeze.** Do not modify `backend/campaigns_routes.ts`,
   `backend/admin_campaigns_settings_routes.ts`, `src/pages/brand/BrandCampaign*.jsx`,
   `src/pages/creator/CreatorCampaignFlow.jsx` or `src/components/campaigns/` without
   explicit sign-off.
4. **Shared files must branch, not switch.** `server.ts`, `ChatBox.jsx`, `SystemMessage.jsx`,
   `MessageBubble.jsx`, `ContentProofNotice.jsx` and `deals_chat_routes.ts` serve both
   flows. Changes go inside a UGC-only or campaign-only branch, leaving the other path
   byte-identical.
5. **Order your state checks carefully.** A revision request updates the thread immediately
   but the order row can lag. If "content submitted" is allowed to win that tie, the UI
   sticks on the old state. See `src/components/chat/chatFlowState.js`.

## Database

`campaign_deals` is a view over `deals`, added so the campaign table can be referred to by
a name that says what it is. The underlying table is unchanged and both names work.

`chat_threads.campaign_deal_id` and `transactions.campaign_deal_id` are nullable UUID
columns. Backfilled only where the existing `deal_id` is a valid UUID; UGC rows are left
`NULL` deliberately. Readers fall back to `deal_id` when it is `NULL`.

Migration to run if these are not yet present:

```sql
ALTER TABLE IF EXISTS chat_threads ADD COLUMN IF NOT EXISTS campaign_deal_id UUID;
ALTER TABLE IF EXISTS transactions  ADD COLUMN IF NOT EXISTS campaign_deal_id UUID;

UPDATE chat_threads SET campaign_deal_id = deal_id::UUID
 WHERE campaign_deal_id IS NULL AND deal_id IS NOT NULL
   AND deal_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- The UUID guard matters here too. transactions.deal_id can hold a ugcord_ string, and
-- without the filter the whole statement fails on the first one.
UPDATE transactions SET campaign_deal_id = deal_id::UUID
 WHERE campaign_deal_id IS NULL AND deal_id IS NOT NULL
   AND deal_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE INDEX IF NOT EXISTS idx_chat_threads_campaign_deal_id ON chat_threads(campaign_deal_id);
CREATE INDEX IF NOT EXISTS idx_transactions_campaign_deal_id ON transactions(campaign_deal_id);

CREATE OR REPLACE VIEW campaign_deals AS SELECT * FROM deals;
```

## Fees

The brand is charged **no platform fee**. Escrow holds the full agreed amount and the
commission is taken from the creator's side at payout. Brand-facing screens therefore show
`Brand Fee: ₹0` — this is a display change only; `calculatePlatformFee` and the amounts
written to `transactions` are untouched.

## Chat contact filter

`backend/contactSecurityFilter.ts` blocks attempts to move a deal off-platform. It is
enforced on the server; `src/utils/contactSecurityFilter.js` re-exports the same module so
the UI can warn instantly, but the client is never the barrier.

Contact keywords do **not** block on their own — only when they appear near something
contact-shaped. "Is this for iPhone or Android?" must keep working. Revision notes and
briefs are exempt entirely, so a brand can ask a creator to keep a phone out of frame.

## Route Separation & Lifecycle Handlers (Phases A–D)

Campaign and UGC lifecycle execution are split into dedicated modules with discrete namespaces:

1. **Campaign Namespace (`/campaign/threads/*`)**:
   - Handled by `createCampaignLifecycleHandlers` in `backend/campaigns_routes.ts`.
   - Manages campaign content approvals (`approve-content`), draft submission (`submit-content`), live link submissions (`submit-live-link`), live links approval (`approve-live-links` / `mark-complete`), revisions (`request-revision` / `reject-content`), and cancellations (`cancel-order`).
   - Wired via `setupCampaignThreadRoutes`.

2. **UGC Namespace (`/ugc/threads/*` & `/ugc/orders/*`)**:
   - Handled by `createUgcLifecycleHandlers` and `setupUgcOrderRoutes` in `backend/ugc_routes.ts`.
   - Manages raw deliverable submissions (`submit` / `submit-content`), instant order approval & payout release (`approve` / `mark-complete`), revisions, decline revisions, and order claims cancellation.

3. **Thin Forwarders & Legacy Compatibility**:
   - Legacy `/chat/v2/threads/*` endpoints in `backend/server.ts` are thin forwarders that resolve the thread and dispatch to either the UGC or Campaign lifecycle handler using `isUgcThread(thread)`.


---

## Security model (sessions 19–21) — read before touching auth, money or chat

Every lifecycle action checks **WHO** (the caller is a party on *this* deal: `partyRole()` in
`backend/campaignGuards.ts`, `ugcGuards.ts` for UGC) and **WHEN** (the deal is at the right
step). A new route that moves money or changes a deal's stage must do both.

| Area | Where | Rule |
|---|---|---|
| Login | `backend/server.ts` `parseAuthUser` | Only real session tokens (`user_sessions`, read with the privileged client). A bare `user_id` is never a token. Login never creates accounts — sign-up + email verification only. |
| Roles | `backend/roleGuards.ts` | Set at sign-up / onboarding. An onboarded creator cannot become a brand (or back) through an API call. |
| Signing | `backend/signTokens.ts` | `/otp/verify` of a `contract_sign` code returns a one-time `sign_token` (10 min, that user only). Every `/sign` route and the UGC claim require it. |
| Escrow | `payment_routes.ts` create-order | Amount comes from the deal, never the browser; refused until both sides signed (`CONTRACT_NOT_SIGNED`). |
| Payout | `campaigns_routes.ts` approve-live-links, `ugcLifecycleService` APPROVE | Brand/admin only, needs a live link (campaign + UGC collab) or an approved deliverable (raw/edited UGC). Status `RELEASED` = platform released it; an admin makes the bank transfer and marks it `PAID`. Admins get a `payout_due` alert. |
| Refund | `backend/refunds.ts` | UGC cancel refunds the order's share through Razorpay. `refund_status` is `PROCESSED` only when Razorpay accepted it, otherwise `PENDING` + a `refund_due` admin alert. |
| UGC slots | `backend/ugcSlots.ts` | Compare-and-set on `claimed_count`; never read-then-write. |
| Sockets | `backend/socketAccess.ts` | A socket belongs to the logged-in user. `join_room` only for a party of the thread. Deal events go to the thread room + both parties + `admins` — never `io.emit` to everyone. |
| Uploads | `misc_routes.ts` `checkSignedUploadTarget` | Signed upload URLs only for `content-submissions` / `ugc-videos/`, `campaign-deliverables/`, `chat-attachments/`. |
| Notifications | `broadcastAdminNotification` | Admin alerts go to `user_id: 'admin'` and the `admins` socket room only. `'all'` is for real platform announcements. |

## Where the data lives

- **Supabase is the source of truth.** The server uses `privilegedSupabase` (service-role key)
  for anything it must be able to read regardless of RLS — sessions, users, threads, orders.
  Without `SUPABASE_SERVICE_ROLE_KEY` the server falls back to the anon key and RLS silently
  hides rows (that is what made a brand look like "not a brand").
- **`getDb()` / `saveDb()` is a local in-memory store** flushed to `db_mock.json` (and a cloud
  backup). It is a cache/fallback, not a second database: it only knows what this server
  instance saw. Do not add features that depend on it being complete — read Supabase.
  An empty `db_mock.json` is a fresh store (v171c ships it empty).
- The browser writes to Supabase directly in ~19 places (anon key + RLS). Anything involving
  money, roles or another user's data must go through the server instead.

## Deal flow (campaign)

`BRIEF_SENT → NEGOTIATING ⇄ NEGOTIATING_COUNTER → AI_AGREEMENT_READY → (both sign, OTP) →
escrow paid → ACTIVE → SUBMITTED (draft) ⇄ CHANGES_REQUESTED / REVISION_DECLINED →
CONTENT_APPROVED → PROOF_SUBMITTED (live link) ⇄ REVISION_REQUESTED_LINKS / REVISION_DECLINED_LINKS →
COMPLETED (payout RELEASED)`

UGC: claim (= creator signs, OTP) → deliverable → approve (raw/edited: payout) or, for a
collaboration, draft approve → live link → payout. `CANCELLED` refunds.

All `flow_state` values are listed in `backend/statusTokens.ts`; a test fails on an unlisted
one. A new value needs the DB constraint updated first.

## Environment variables

| Variable | Needed for |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` (`VITE_…` for the browser) | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required in production** — sessions, roles, admin writes |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Escrow payments, UGC deposits, refunds |
| `PAYMENTS_TEST_MODE` | `true` = no real payments; OTP codes are returned to the screen. Unset + `APP_URL` on `run.app` also means test mode — set `false` for real use |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | All emails incl. OTP. The sender domain must be verified in Resend |
| `RESEND_ALLOW_FALLBACK` | Only for local dev: pretend an email was sent when Resend fails |
| `APP_URL` | Links in emails; test-mode detection |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `GEMINI_API_KEY` | AI features (market intelligence, suggestions) |
| `ADMIN_EMAIL` | Admin notifications by email |
| `DEMO_LOGIN` | Demo/bypass logins — keep off in production |

## Known structural debt (not fixed yet)

- Very large files: `backend/server.ts` (~3.8k lines), `campaigns_routes.ts` (~3.3k),
  `src/components/chat/ChatBox.jsx` (~3k). Split them route-group by route-group, with the
  tests green after each step — not in one go.
- Empty `catch {}` blocks outside the money/auth files still swallow errors silently; the
  money/auth ones report through `backend/logIgnored.ts`.
- `strict: false` in `tsconfig.json`; the frontend is mostly JSX.

## Private media (session 22)
- `content-submissions`, `live-proofs`, `ugc-assets`, `kyc-documents` are private buckets. The server never makes them public (`isPrivateBucket` in `backend/mediaAccess.ts`).
- The browser opens those files only through `GET /api/media?src=<bucket/path>` (`backend/media_routes.ts`): viewer = session cookie, Bearer, or the `k` media key from `/auth/me` (12 h, cannot log in). Allowed: staff, the uploader, a party of the file's thread/order, or (for `/upload` files) someone with a deal with the uploader. KYC: owner + staff only. Answer: 302 to a signed URL valid `MEDIA_URL_TTL_SECONDS` (15 min).
- Frontend: `resolveMediaUrl` → `mediaProxyUrl` (`src/lib/mediaUrl.js`); plain links use `mediaHref`.
- Optional env: `MEDIA_KEY_SECRET` (else derived from the service-role key; with neither, keys work only on the instance that issued them — cookie still works).
- Limit: the watermark is still an overlay. A burned-in watermark needs an ffmpeg preview copy (not built).

## Shared short-lived state (session 22)
- OTP codes (hashed) and contract sign tokens live in `public.ybex_ephemeral` (`backend/ephemeralStore.ts`, SQL: `scripts/sql/ybex_ephemeral.sql`), service-role only. Consuming a sign token is one `DELETE … RETURNING`, so it works once across all instances. Without the table it falls back to instance memory and logs a warning once.
- The OTP send rate limit is still per instance.

## Online status (session 22)
- `user_status_change` goes to the user's contacts (other side of any thread/order/deal) and admins; `get_online_users` returns only contacts (staff: everyone). Before, both went to every connected user.
- Socket wiring lives in `backend/socketServer.ts`; rules in `backend/socketAccess.ts`.

## File map additions (session 22)
- `backend/socketServer.ts` socket wiring · `backend/notificationService.ts` notifications + admin broadcasts + emails · `backend/storageHelpers.ts` buckets/signed URLs/base64 upload · `backend/campaign_lifecycle.ts` campaign deal lifecycle handlers · `backend/ephemeralStore.ts` shared short-lived state · `backend/mediaAccess.ts` + `media_routes.ts` private media · `src/utils/ignored.js` frontend swallowed-error reporting (dev only).


## Loading states (rule 35 — every new feature follows this)

One pattern per job. Pick by **what the user is waiting for**:

| Waiting for | Use | Never |
|---|---|---|
| App cold start (session unknown) | `ColdStartSplash` — already mounted in `App.jsx`, driven by `AuthContext.loading`. Nothing to add. | A second splash / full-screen loader anywhere else |
| Moving to another page, or a page whose content is a form (settings) | `startLoading()` / `stopLoading()` → the 2px top bar (`GlobalLoader`). Always call `stopLoading()` in `finally`. | Blocking overlays, `backdrop-blur`, big logos |
| A page's DATA (lists, cards, detail pages, profiles) | Render header/nav/tabs immediately; where the data goes, render a skeleton from `src/components/common/ContentSkeletons.jsx` (`CardGridSkeleton`, `DetailSkeleton`, `ProfileSkeleton`, or `Shimmer` for a custom shape) in the **final shape**. Mobile lists: `MobileSkeletons.jsx`. | Centered spinners with "Loading…" text, empty `min-h-screen` divs, `startLoading()` on top of a skeleton |
| A BUTTON action (save, send OTP, verify, logout, approve, reject, submit, upload, pay) | `const { isBusy, anyBusy, run } = useBusy()` (`src/lib/useBusy.js`); wrap the handler in `run("key", …)` (or `begin/end` in an existing try/finally); the button gets `disabled={anyBusy}` and shows `<ButtonSpinner />` while `isBusy("key")`. `run` also blocks double taps. | `startLoading()` for a button — it signals a page load and gives no feedback on the button itself |

Details: skeleton shimmer is `#EFEFF4 → #F7F7FA`, 1.6 s linear; bar is `#7C3AED`, 2 px, 250 ms show delay, finishes at 100 % then fades; everything is static under `prefers-reduced-motion`. A money-moving button (approve & release, pay) also asks for confirmation first (rules 33–34).
