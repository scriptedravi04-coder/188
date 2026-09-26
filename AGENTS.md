# 🛑 FIRST: read `ARCHITECTURE.md` → "PROTECTED CHANGES"

Security, money and privacy fixes in this app must not be undone. Before finishing any change run
`npm run verify`; never edit or delete a test to make it pass. If a requested change needs one of
the protected rules changed, stop and ask the user.

# Project Architecture & UI Guidelines

## Button Alignment Architecture Standard

### Mandatory Rule:
All action buttons across the application (desktop and mobile chat cards, modals, negotiations, deal lifecycle, and sheets) must adhere strictly to the following positioning convention:

1. **Right-Side Alignment (Primary / Affirmative / Action Buttons):**
   - **Approve** (e.g. Approve Draft, Approve Deliverable, Approve & Pay)
   - **Accept** (e.g. Accept Proposal, Accept Offer, Accept Terms, Accept via OTP)
   - **Upload / Submit / Send** (e.g. Upload Content, Submit Links again, Send Propose, Send Changes Request, Upload Revised)
   - **Sign / Authorize** (e.g. Authorize Deed, Sign Agreement)
   - In any horizontal flex row or button pair, these primary action buttons must **ALWAYS be placed on the right side** (last child or `justify-end` / `ml-auto`).

2. **Left-Side Alignment (Secondary / Neutral / Dismissive Buttons):**
   - **Cancel / Close / Dismiss** (e.g. Cancel, Close, X)
   - **Decline / Reject** (e.g. Decline, Propose Decline, Decline the changes)
   - **Negotiate / Counter** (e.g. Negotiate, Counter)
   - **Request Changes / Ask to Resubmit**
   - In any horizontal flex row or button pair, these secondary/dismissive buttons must **ALWAYS be placed on the left side** (first child).


## Loading states
Follow ARCHITECTURE.md "Loading states" (rule 35) in every new screen: button actions use `useBusy` + `<ButtonSpinner />` (never `startLoading()`), page data uses `ContentSkeletons`, the global loader stays a 2px top bar. Do not bring back the full-screen blurred loader or a big wordmark.
