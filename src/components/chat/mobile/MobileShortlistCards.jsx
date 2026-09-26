import React, { useState } from "react";
import { formatAmount } from "../../../utils/safeFormat";
import { ignored } from "../../../utils/ignored";

function Handshake({ tone = "violet" }) {
  const accent = tone === "green" ? "#0f9d58" : "#6d3aec";
  const uid = React.useId();
  return (
    <svg
      viewBox="0 0 220 132"
      className="w-[110px] h-[66px] mx-auto block"
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

const Row = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 0", borderTop: "1px solid #EFEFF3", fontSize: "11.5px" }}>
    <span style={{ color: "#6E6E7C" }}>{label}</span>
    <span style={{ fontWeight: 700, textAlign: "right", color: "#101014" }}>{value}</span>
  </div>
);

/**
 * MobileShortlistCongratsCard (Message 1)
 * Sent automatically from the Brand to Creator when shortlisted.
 */
export function MobileShortlistCongratsCard({
  message,
  campaignTitle,
  isMine,
  amount,
  thread,
}) {
  let m = message?.metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch (e) { ignored("MobileShortlistCards:95", e); }
  }
  m = m || {};

  const title =
    m.campaign_title ||
    campaignTitle ||
    thread?.campaign_title ||
    thread?.campaigns?.title ||
    "this campaign";

  const budgetLabel =
    m.budget_label ||
    (thread?.budget_min && thread?.budget_max
      ? `₹${Number(thread.budget_min).toLocaleString("en-IN")} – ₹${Number(thread.budget_max).toLocaleString("en-IN")}`
      : amount
      ? `₹${formatAmount(amount)}`
      : "₹10,000 – ₹22,000");

  const deliverable =
    m.deliverable ||
    thread?.deliverable_type ||
    thread?.deliverables ||
    thread?.ugc_brief?.deliverables ||
    "1 Instagram Reel1 Photo Review Post";

  const deliveryDays = m.delivery_days || thread?.delivery_days || "7";

  const cardRadius = isMine ? "20px 20px 8px 20px" : "20px 20px 20px 8px";
  const alignSide = isMine ? "flex-end" : "flex-start";
  const timeText = message?.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: alignSide,
        width: 302,
        maxWidth: "93%",
        borderRadius: cardRadius,
        background: "#fff",
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        overflow: "hidden",
        border: "1px solid #EAEAF2",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          height: 4,
          background: "linear-gradient(90deg, #8b5cf6, #6d3aec)",
        }}
      />

      <div style={{ padding: "14px 14px 10px", textAlign: "center" }}>
        <Handshake tone="violet" />

        <div style={{ marginTop: 6, marginBottom: 8 }}>
          <span
            style={{
              display: "inline-block",
              font: "800 9.5px 'DM Sans', sans-serif",
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              padding: "3px 10px",
              borderRadius: 20,
              background: "rgba(109, 58, 236, 0.1)",
              color: "#6d3aec",
            }}
          >
            You're Shortlisted
          </span>
        </div>

        <div
          style={{
            font: "800 16px/1.2 'DM Sans', sans-serif",
            letterSpacing: "-0.4px",
            color: "#101014",
            marginBottom: 5,
          }}
        >
          Congratulations! 🎉
        </div>

        <p
          style={{
            margin: 0,
            font: "400 12px/1.45 'DM Sans', sans-serif",
            color: "#5C5C6B",
          }}
        >
          You have been shortlisted for <b style={{ color: "#101014", fontWeight: 700 }}>{title}</b>.
          <br />
          Let's finalize the terms.
        </p>
      </div>

      <div style={{ padding: "0 14px 12px" }}>
        <div
          style={{
            background: "#F8F8FC",
            border: "1px solid #EAEAF2",
            borderRadius: 13,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              font: "800 9px 'DM Sans', sans-serif",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#8E8EA0",
              marginBottom: 4,
            }}
          >
            Campaign details
          </div>
          <Row label="Campaign" value={title} />
          {budgetLabel && <Row label="Brand budget" value={budgetLabel} />}
          {deliverable && <Row label="Deliverable" value={deliverable} />}
          {deliveryDays && <Row label="Delivery" value={`${deliveryDays} days`} />}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid #F0F0F5",
          padding: "8px 14px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span
          style={{
            font: "400 10.5px 'DM Sans', sans-serif",
            color: "#8E8EA0",
          }}
        >
          No action required — see your offer below
        </span>
        {timeText && (
          <span style={{ font: "400 10px 'DM Sans', sans-serif", color: "#8E8EA0", flexShrink: 0 }}>
            {timeText}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * MobileCreatorApplicationOfferCard (Message 2)
 * The creator's application proposal replayed into chat with fee, note, and Accept/Negotiate buttons.
 */
export function MobileCreatorApplicationOfferCard({
  message,
  campaignTitle,
  isMine,
  isBrand,
  thread,
  amount,
  onAcceptOffer,
  onCounterOffer,
}) {
  let m = message?.metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch (e) { ignored("MobileShortlistCards:269", e); }
  }
  m = m || {};

  const rawProposed =
    m.proposed_fee ??
    m.amount ??
    m.proposed_amount ??
    message?.content?.match(/₹\s*([\d,]+)/)?.[1]?.replace(/,/g, "") ??
    message?.text?.match(/₹\s*([\d,]+)/)?.[1]?.replace(/,/g, "") ??
    amount ??
    thread?.agreed_amount ??
    thread?.amount_fixed ??
    10000;
  const offerAmount = Number(rawProposed) || 10000;

  const title =
    m.campaign_title ||
    campaignTitle ||
    thread?.campaign_title ||
    thread?.campaigns?.title ||
    "this campaign";

  const pitch =
    m.pitch ||
    m.note ||
    m.cover_letter ||
    thread?.pitch ||
    thread?.cover_letter ||
    thread?.application?.pitch ||
    thread?.ugc_order?.pitch ||
    "";

  const deliveryDays = m.delivery_days || thread?.delivery_days || 7;
  const revisions = m.revisions ?? thread?.revisions ?? 1;
  const appliedAt = m.applied_at || message?.created_at;

  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterVal, setCounterVal] = useState("");
  const [busy, setBusy] = useState(false);

  const cardRadius = isMine ? "20px 20px 8px 20px" : "20px 20px 20px 8px";
  const alignSide = isMine ? "flex-end" : "flex-start";
  const timeText = message?.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const handleAccept = async () => {
    if (!onAcceptOffer || busy) return;
    setBusy(true);
    try {
      await onAcceptOffer();
    } finally {
      setBusy(false);
    }
  };

  const handleSendCounter = async () => {
    if (!counterVal || !onCounterOffer || busy) return;
    setBusy(true);
    try {
      await onCounterOffer(counterVal);
      setShowCounterInput(false);
      setCounterVal("");
    } finally {
      setBusy(false);
    }
  };

  let appliedText = "Submitted with application";
  if (appliedAt) {
    try {
      appliedText += ` · ${new Date(appliedAt).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch (e) { ignored("MobileShortlistCards:347", e); }
  }

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: alignSide,
        width: 302,
        maxWidth: "93%",
        borderRadius: cardRadius,
        background: "#fff",
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        overflow: "hidden",
        border: "1px solid #EAEAF2",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Top green accent line */}
      <div
        style={{
          height: 4,
          background: "linear-gradient(90deg, #34d399, #0f9d58)",
        }}
      />

      <div style={{ padding: "14px 14px 10px", textAlign: "center" }}>
        <Handshake tone="green" />

        <div style={{ marginTop: 6, marginBottom: 8 }}>
          <span
            style={{
              display: "inline-block",
              font: "800 9.5px 'DM Sans', sans-serif",
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              padding: "3px 10px",
              borderRadius: 20,
              background: "rgba(15, 157, 88, 0.1)",
              color: "#0f9d58",
            }}
          >
            Offer from creator
          </span>
        </div>

        <div
          style={{
            font: "800 16px/1.2 'DM Sans', sans-serif",
            letterSpacing: "-0.4px",
            color: "#101014",
            marginBottom: 5,
          }}
        >
          Thank you for choosing me! 🤝
        </div>

        <p
          style={{
            margin: 0,
            font: "400 12px/1.45 'DM Sans', sans-serif",
            color: "#5C5C6B",
          }}
        >
          Here is my proposal below — ready to move forward.
        </p>
      </div>

      <div style={{ padding: "0 14px 12px" }}>
        {/* Fee & Specs box */}
        <div
          style={{
            background: "#F8F8FC",
            border: "1px solid #EAEAF2",
            borderRadius: 13,
            padding: "10px 12px",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              font: "800 9px 'DM Sans', sans-serif",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#8E8EA0",
              marginBottom: 3,
            }}
          >
            Proposed fee
          </div>
          <div
            style={{
              font: "900 24px/1 'DM Mono', monospace, sans-serif",
              letterSpacing: "-0.5px",
              color: "#101014",
              marginBottom: 8,
            }}
          >
            ₹{formatAmount(offerAmount)}
          </div>
          <Row label="Campaign" value={title} />
          {deliveryDays && <Row label="Delivery" value={`${deliveryDays} days`} />}
          {revisions != null && <Row label="Revisions" value={`${revisions} included`} />}
        </div>

        {/* Creator Note */}
        {pitch ? (
          <div
            style={{
              background: "#FBFBFE",
              border: "1px solid #EAEAF2",
              borderLeft: "3px solid #7C3AED",
              borderRadius: 10,
              padding: "8px 10px",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                font: "800 9px 'DM Sans', sans-serif",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#7C3AED",
                marginBottom: 2,
              }}
            >
              Creator's note
            </div>
            <p
              style={{
                margin: 0,
                font: "italic 400 12.5px/1.4 'DM Sans', sans-serif",
                color: "#101014",
              }}
            >
              "{pitch}"
            </p>
          </div>
        ) : null}

        {/* Actions: Brand sees Accept & Negotiate buttons. Creator sees waiting state. */}
        {isBrand ? (
          showCounterInput ? (
            <div
              style={{
                background: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: 12,
                padding: "10px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ font: "600 11px 'DM Sans',sans-serif", color: "#374151" }}>
                Your counter offer (min ₹3,000):
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    background: "#fff",
                    border: "1.5px solid #7C3AED",
                    borderRadius: 9,
                    padding: "0 8px",
                    height: 36,
                  }}
                >
                  <span style={{ font: "700 13px 'DM Sans',sans-serif", color: "#6B7280", marginRight: 4 }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    value={counterVal}
                    onChange={(e) => setCounterVal(e.target.value)}
                    placeholder="e.g. 8000"
                    autoFocus
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      font: "700 13px 'DM Sans',sans-serif",
                      color: "#101014",
                      background: "transparent",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCounterInput(false)}
                  style={{
                    height: 36,
                    width: 32,
                    borderRadius: 9,
                    background: "#F3F4F6",
                    border: "none",
                    color: "#6B7280",
                    font: "700 12px 'DM Sans',sans-serif",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={handleSendCounter}
                  disabled={busy || !counterVal}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 9,
                    background: "#7C3AED",
                    border: "none",
                    color: "#fff",
                    font: "700 11.5px 'DM Sans',sans-serif",
                    cursor: busy || !counterVal ? "not-allowed" : "pointer",
                    opacity: busy || !counterVal ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {busy ? "Sending..." : "Send 🚀"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowCounterInput(true)}
                disabled={busy}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 11,
                  background: "#fff",
                  border: "1px solid #D1D5DB",
                  color: "#374151",
                  font: "800 12px 'DM Sans', sans-serif",
                  cursor: busy ? "not-allowed" : "pointer",
                  transition: "background-color 0.15s",
                }}
              >
                Negotiate
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={busy}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 11,
                  background: "#7C3AED",
                  border: "none",
                  color: "#fff",
                  font: "800 12px 'DM Sans', sans-serif",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.7 : 1,
                  boxShadow: "0 4px 12px -2px rgba(124,58,237,0.35)",
                  transition: "opacity 0.15s",
                }}
              >
                {busy ? "Accepting..." : `Accept ₹${formatAmount(offerAmount)}`}
              </button>
            </div>
          )
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "#F8F8FC",
              border: "1px dashed #D1D5DB",
              borderRadius: 11,
              height: 38,
              font: "700 11.5px 'DM Sans', sans-serif",
              color: "#6B7280",
            }}
          >
            <span>Awaiting brand response</span>
            <span style={{ display: "inline-flex", gap: 3 }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:200ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:400ms]" />
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid #F0F0F5",
          padding: "8px 14px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span
          style={{
            font: "400 10px 'DM Sans', sans-serif",
            color: "#8E8EA0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {appliedText}
        </span>
        {timeText && (
          <span style={{ font: "400 10px 'DM Sans', sans-serif", color: "#8E8EA0", flexShrink: 0 }}>
            {timeText}
          </span>
        )}
      </div>
    </div>
  );
}
