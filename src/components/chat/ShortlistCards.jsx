import React from "react";
import { motion } from "framer-motion";
import { formatAmount } from "../../utils/safeFormat";

// The two cards posted when a brand shortlists a creator for a campaign.
//
// Before this, acceptance sent one plain text line — "Congratulations! You've been selected.
// Let's negotiate the terms." — with no renderer for its message_type, so it rendered as an
// ordinary chat bubble carrying no information and no action.
//
// WHY THERE ARE TWO CARDS, AND WHY ONLY ONE HAS BUTTONS
//
// The creator set the price when they applied. Showing the creator an "Accept ₹15,000"
// button on their own offer is meaningless — they will always accept their own number, and
// the brand never gets to negotiate at all. So:
//
//   Card 1  from the BRAND    — the good news. No buttons.
//   Card 2  from the CREATOR  — their application offer. Accept/Negotiate, brand only.
//
// Neither card hardcodes an alignment. MessageBubble decides left/right from `isMine`, so
// the brand sees its own card on the right and the creator's on the left, and the creator
// sees exactly the mirror image. A fixed side would be wrong for one of them.

/**
 * Original handshake illustration.
 *
 * Inline SVG rather than a PNG: no asset to ship, it recolours itself for dark mode through
 * the theme variables, and it stays sharp at any size on any screen.
 */
function Handshake({ tone = "violet" }) {
  const accent = tone === "green" ? "var(--green, #0f9d58)" : "var(--violet, #6d3aec)";
  const uid = React.useId();
  return (
    <svg
      viewBox="0 0 220 132"
      className="w-[132px] h-[80px] mx-auto block"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Handshake"
    >
      <defs>
        <linearGradient id={`cl-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2f45" />
          <stop offset="1" stopColor="#1d2133" />
        </linearGradient>
        <linearGradient id={`cr-${uid}`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2f45" />
          <stop offset="1" stopColor="#1d2133" />
        </linearGradient>
      </defs>

      <ellipse cx="110" cy="112" rx="72" ry="9" fill={accent} opacity="0.10" />
      <circle cx="110" cy="62" r="46" fill={accent} opacity="0.07" />

      {/* sleeves */}
      <path d="M2 44 L52 34 L66 74 L18 88 Z" fill={`url(#cl-${uid})`} />
      <path d="M50 33 L66 29 L80 70 L64 75 Z" fill="#1d2133" />
      <path d="M218 40 L168 30 L152 70 L200 84 Z" fill={`url(#cr-${uid})`} />
      <path d="M170 29 L154 25 L140 66 L156 71 Z" fill="#1d2133" />

      {/* forearms and clasped hands */}
      <path
        d="M66 40 C88 40 104 50 120 60 C130 66 134 74 128 80 C122 86 110 82 100 76
           C90 70 78 66 68 66 C60 66 58 58 58 52 C58 45 60 40 66 40 Z"
        fill="#e8b48c"
      />
      <path
        d="M154 36 C134 38 118 46 104 54 C95 59 92 67 98 73 C104 79 115 76 124 71
           C133 66 144 62 154 62 C162 62 165 55 165 49 C165 42 161 36 154 36 Z"
        fill="#c98d63"
      />
      <path
        d="M104 56 C112 52 120 50 127 51 C131 51.5 132 55 129 57 C122 58 114 60 108 63 Z"
        fill="#e8b48c"
        opacity="0.85"
      />
      <path
        d="M107 64 C114 61 122 59 129 60 C133 60.5 134 64 131 66 C124 67 116 68 110 71 Z"
        fill="#e8b48c"
        opacity="0.7"
      />
      <path d="M118 48 C124 45 131 45 135 48 C138 50 137 54 133 55 C128 55 123 52 118 52 Z" fill="#c98d63" />

      {/* sparkles */}
      <path
        d="M44 22 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4 Z"
        fill={accent}
        opacity="0.5"
      />
      <path
        d="M180 16 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 Z"
        fill={accent}
        opacity="0.38"
      />
    </svg>
  );
}

const Shell = ({ tone, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 12, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    className="w-full max-w-[340px] rounded-[20px] overflow-hidden border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg"
  >
    <div
      className="h-[5px]"
      style={{
        background:
          tone === "green"
            ? "linear-gradient(90deg,#34d399,#0f9d58)"
            : "linear-gradient(90deg,#8b5cf6,#6d3aec)"
      }}
    />
    {children}
  </motion.div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-2.5 text-[12.5px] py-1 border-t border-[var(--border-subtle)] first:border-t-0">
    <span className="text-[var(--text-secondary)]">{label}</span>
    <span className="font-bold text-right text-[var(--text-primary)]">{value}</span>
  </div>
);

/** Card 1 — from the brand. Information only; the action lives on the creator's card. */
export function ShortlistCongratsCard({ message, campaignTitle }) {
  const m = message?.metadata || {};
  const title = m.campaign_title || campaignTitle || "this campaign";

  return (
    <Shell tone="violet">
      <div className="px-4 pt-4 pb-2.5 text-center">
        <Handshake tone="violet" />
        <span className="inline-block text-[9.5px] font-extrabold tracking-[0.09em] uppercase px-2.5 py-[3.5px] rounded-full mb-2 bg-[var(--violet)]/10 text-[var(--violet)]">
          You're shortlisted
        </span>
        <h3 className="text-[17px] font-extrabold tracking-tight mb-1 text-[var(--text-primary)]">
          Congratulations! 🎉
        </h3>
        <p className="text-[12.5px] text-[var(--text-secondary)] m-0">
          You have been shortlisted for <b className="text-[var(--text-primary)]">{title}</b>.
          <br />
          Let's finalize the terms.
        </p>
      </div>

      <div className="px-4 pb-4">
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[14px] px-3.5 py-3">
          <p className="text-[9.5px] font-extrabold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-1">
            Campaign details
          </p>
          <Row label="Campaign" value={title} />
          {m.budget_label && <Row label="Brand budget" value={m.budget_label} />}
          {m.deliverable && <Row label="Deliverable" value={m.deliverable} />}
          {m.delivery_days && <Row label="Delivery" value={`${m.delivery_days} days`} />}
        </div>
      </div>

      <p className="text-[10.5px] text-[var(--text-tertiary)] text-center px-4 pt-2 pb-3 border-t border-[var(--border-subtle)] m-0">
        No action required — see your offer below
      </p>
    </Shell>
  );
}

/**
 * Card 2 — from the creator. Their application, replayed into the chat so the brand can act
 * on it.
 *
 * The buttons are gated on isUserBrand, not on isMine. A creator must never be able to
 * accept their own price.
 */
export function CreatorApplicationOfferCard({
  message,
  isUserBrand,
  campaignTitle,
  onNegotiate,
  onAccept,
  allMessages,
  thread
}) {
  const m = message?.metadata || {};
  const amount = Number(m.proposed_fee ?? m.amount ?? 0);
  const title = m.campaign_title || campaignTitle || "this campaign";

  const threadFlowUpper = String(thread?.flow_state || '').toUpperCase();
  const threadStatusUpper = String(thread?.status || '').toUpperCase();
  const isAgreementExecuted = Boolean(
    (thread?.agreement_signed_creator && thread?.agreement_signed_brand) ||
    thread?.agreement_signed_at ||
    threadStatusUpper === 'ACTIVE' ||
    ['ESCROW_PAID', 'ESCROW_FUNDED', 'COMPLETED', 'PAID', 'CONTENT_SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CLOSED'].includes(threadStatusUpper) ||
    ['ESCROW_PAID', 'ESCROW_FUNDED', 'COMPLETED', 'CONTENT_SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CLOSED'].includes(threadFlowUpper)
  );
  const isAgreementReady = Boolean(
    threadFlowUpper === 'AI_AGREEMENT_READY' ||
    threadFlowUpper === 'AGREEMENT_SIGNED' ||
    threadStatusUpper === 'AI_AGREEMENT_READY' ||
    threadStatusUpper === 'AGREEMENT_SIGNED'
  );

  const hasSubsequentCounters = (allMessages || []).some(msg => 
    msg && (msg.message_type === 'negotiation_offer' || msg.message_type === 'offer')
  );

  return (
    <Shell tone="green">
      <div className="px-4 pt-4 pb-2.5 text-center">
        <Handshake tone="green" />
        <span className="inline-block text-[9.5px] font-extrabold tracking-[0.09em] uppercase px-2.5 py-[3.5px] rounded-full mb-2 bg-[var(--green)]/10 text-[var(--green)]">
          Offer from creator
        </span>
        <h3 className="text-[17px] font-extrabold tracking-tight mb-1 text-[var(--text-primary)]">
          Thank you for choosing me! 🤝
        </h3>
        <p className="text-[12.5px] text-[var(--text-secondary)] m-0">
          Here is my proposal below — ready to move forward.
        </p>
      </div>

      <div className="px-4 pb-4">
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[14px] px-3.5 py-3 mb-2.5">
          <p className="text-[9.5px] font-extrabold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-1">
            Proposed fee
          </p>
          <p className="text-[29px] font-black tracking-tighter font-mono leading-none mb-2 text-[var(--text-primary)]">
            ₹{formatAmount(amount)}
          </p>
          <Row label="Campaign" value={title} />
          {m.delivery_days && <Row label="Delivery" value={`${m.delivery_days} days`} />}
          {m.revisions != null && <Row label="Revisions" value={`${m.revisions} included`} />}
        </div>

        {m.pitch && (
          <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--violet)] rounded-[10px] px-3.5 py-2.5 mb-2.5">
            <p className="text-[9.5px] font-extrabold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-0.5">
              Creator's note
            </p>
            <p className="m-0 text-[13px] italic text-[var(--text-primary)]">"{m.pitch}"</p>
          </div>
        )}

        {hasSubsequentCounters ? (
          <div className="py-2.5 w-full text-center text-xs font-bold rounded-xl border bg-[var(--violet-soft)] border-[var(--violet-border)] text-[var(--violet)] select-none">
            Countered
          </div>
        ) : isAgreementExecuted || isAgreementReady ? (
          <div className="py-2.5 w-full text-center text-xs font-bold rounded-xl border bg-[#F0FDF4] border-[#A7F3D0] text-[var(--green)] flex items-center justify-center gap-1.5 select-none">
            {isAgreementExecuted ? "Signed ✓" : "Accepted ✓"}
          </div>
        ) : isUserBrand ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onNegotiate}
              className="flex-1 text-[12.5px] font-extrabold py-2.5 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              Negotiate
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="flex-1 text-[12.5px] font-extrabold py-2.5 rounded-xl bg-[var(--violet)] text-white hover:opacity-90 transition-opacity cursor-pointer"
            >
              Accept ₹{formatAmount(amount)}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 bg-[var(--bg-base)] border border-dashed border-[var(--border-default)] rounded-xl py-2.5 text-[12px] font-bold text-[var(--text-tertiary)]">
            Awaiting brand response
            <span className="flex gap-1">
              <span className="w-[5px] h-[5px] rounded-full bg-current animate-pulse" />
              <span className="w-[5px] h-[5px] rounded-full bg-current animate-pulse [animation-delay:200ms]" />
              <span className="w-[5px] h-[5px] rounded-full bg-current animate-pulse [animation-delay:400ms]" />
            </span>
          </div>
        )}
      </div>

      {/* The creator did not type this just now — it was their application. Saying so keeps
          it honest; without it the creator sees a message they never wrote. */}
      <p className="text-[10.5px] text-[var(--text-tertiary)] text-center px-4 pt-2 pb-3 border-t border-[var(--border-subtle)] m-0">
        Submitted with application
        {m.applied_at ? ` · ${new Date(m.applied_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
      </p>
    </Shell>
  );
}

export default ShortlistCongratsCard;
