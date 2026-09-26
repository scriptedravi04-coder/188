import React, { useState } from "react";

export default function MobileChangesCard({
  message,
  isBrand,
  onOpenReupload,
  onDeclineChanges,
}) {
  const meta = message?.metadata || {};
  const feedback =
    meta.feedback ||
    meta.reason ||
    meta.notes ||
    message.content ||
    "Please ensure product label is clearly visible in the first 3 seconds.";
  const timeText = message?.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "12:10";

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineText, setDeclineText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleDecline = async () => {
    if (!declineText.trim()) return;
    setBusy(true);
    await onDeclineChanges?.(declineText);
    setBusy(false);
    setDeclineOpen(false);
  };

  const cardRadius = isBrand ? "20px 20px 8px 20px" : "20px 20px 20px 8px";
  const alignSide = isBrand ? "flex-end" : "flex-start";

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: alignSide,
        width: 302,
        maxWidth: "93%",
        boxSizing: "border-box",
        borderRadius: cardRadius,
        background: "#fff",
        border: "1px solid #F3E2BE",
        padding: 14,
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          height: 3,
          margin: "-14px -14px 12px",
          borderRadius: "20px 20px 0 0",
          background: "linear-gradient(90deg,#F59E0B,#EA580C)",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 11,
            flexShrink: 0,
            background: "#FFF6E6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 14px/30px 'DM Sans',sans-serif",
            color: "#B45309",
          }}
        >
          !
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 13px 'DM Sans',sans-serif", color: "#101014" }}>
            Brand needs some changes
          </div>
          <div
            style={{
              marginTop: 3,
              font: "600 9.5px 'DM Sans',sans-serif",
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "#B45309",
            }}
          >
            CHANGES REQUESTED
          </div>
        </div>
        <span style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6E6E7C", flexShrink: 0 }}>
          {timeText}
        </span>
      </div>

      <div
        style={{
          marginTop: 11,
          padding: "11px 12px",
          border: "1px solid #F3E2BE",
          borderRadius: 12,
          background: "#FFFCF5",
        }}
      >
        <div
          style={{
            font: "600 9.5px 'DM Sans',sans-serif",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "#B45309",
          }}
        >
          Requested changes
        </div>
        <div style={{ marginTop: 6, font: "500 12.5px/1.5 'DM Sans',sans-serif", color: "#101014" }}>
          {feedback}
        </div>
      </div>

      {!isBrand ? (
        declineOpen ? (
          <div style={{ marginTop: 12, padding: 13, borderRadius: 13, background: "#F7F7FA" }}>
            <div
              style={{
                font: "600 9.5px 'DM Sans',sans-serif",
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "#5C5C6B",
              }}
            >
              Reason for declining
            </div>
            <textarea
              value={declineText}
              onChange={(e) => setDeclineText(e.target.value)}
              placeholder="This revision is outside the agreed scope."
              style={{
                marginTop: 9,
                width: "100%",
                height: 64,
                border: "1px solid #E4E4EC",
                borderRadius: 12,
                background: "#fff",
                padding: "10px 12px",
                font: "400 12.5px/1.5 'DM Sans',sans-serif",
                color: "#101014",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: 9, display: "flex", gap: 8 }}>
              <button
                onClick={() => setDeclineOpen(false)}
                style={{
                  height: 40,
                  padding: "0 15px",
                  border: "1px solid #E4E4EC",
                  borderRadius: 12,
                  background: "#fff",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#5C5C6B",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                disabled={busy || !declineText.trim()}
                onClick={handleDecline}
                style={{
                  flex: 1,
                  height: 40,
                  border: "none",
                  borderRadius: 12,
                  background: "#E11D48",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Propose decline
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              onClick={() => setDeclineOpen(true)}
              style={{
                flex: 1,
                height: 42,
                border: "1px solid #E4E4EC",
                borderRadius: 13,
                background: "#fff",
                font: "600 12.5px 'DM Sans',sans-serif",
                color: "#E11D48",
                cursor: "pointer",
              }}
            >
              Decline changes
            </button>
            <button
              onClick={onOpenReupload}
              style={{
                flex: 1,
                height: 42,
                border: "none",
                borderRadius: 13,
                background: "#7C3AED",
                font: "600 12.5px 'DM Sans',sans-serif",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Upload revised
            </button>
          </div>
        )
      ) : (
        <div
          style={{
            marginTop: 12,
            height: 40,
            borderRadius: 12,
            background: "#FFF8EB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 12px 'DM Sans',sans-serif",
            color: "#92400E",
          }}
        >
          ↻ Waiting for creator to upload revised content…
        </div>
      )}
    </div>
  );
}
