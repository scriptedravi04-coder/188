// Session 21. Every flow_state the backend writes, in one list.
//
// Status tokens are a contract with the database (rule 7: update the DB constraint first). They
// were scattered as string literals over a dozen files, with near-duplicates in circulation
// (LIVE_LINK_SUBMITTED vs LIVE_LINKS_SUBMITTED, REVISION_REQ vs REVISION_REQUESTED). New code
// should import from here; backend/statusTokens.test.ts fails if a file writes a flow_state that
// is not listed, so a new token cannot slip in without being added (and the constraint checked).

export const FLOW_STATES = {
  // Negotiation
  BRIEF_SENT: "BRIEF_SENT",
  NEGOTIATING: "NEGOTIATING",
  NEGOTIATING_COUNTER: "NEGOTIATING_COUNTER",
  AI_AGREEMENT_READY: "AI_AGREEMENT_READY",
  // Contract signed / escrow funded, work in progress
  ACTIVE: "ACTIVE",
  // Draft
  SUBMITTED: "SUBMITTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  REVISION_REQ: "REVISION_REQ", // UGC's name for CHANGES_REQUESTED
  REVISION_DECLINED: "REVISION_DECLINED",
  CONTENT_APPROVED: "CONTENT_APPROVED",
  // Live link
  PROOF_SUBMITTED: "PROOF_SUBMITTED",
  REVISION_REQUESTED_LINKS: "REVISION_REQUESTED_LINKS",
  REVISION_DECLINED_LINKS: "REVISION_DECLINED_LINKS",
  // End
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type FlowState = (typeof FLOW_STATES)[keyof typeof FLOW_STATES];
export const ALL_FLOW_STATES: string[] = Object.values(FLOW_STATES);
