import React from "react";
import { Shield, Check, Clock, Loader2 } from "lucide-react";
import MobileSheet, { SheetHeader } from "./MobileSheet";

// Session 23. This sheet used to say "Payment secured · ₹X is held in escrow" and
// a "free" platform fee for EVERY deal — before any payment, with a fee the server does not
// charge. "Make payment" opened it and nothing was paid. Now:
//   - funded      → the real status (held in escrow until approval);
//   - brand, not funded → a real "Pay into escrow" button (same Razorpay flow as desktop);
//     the exact total (fees/GST, if any) is shown by the payment screen itself, not guessed here;
//   - creator, not funded → "waiting for the brand to fund".
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function MobileEscrowSheet({ onClose, amount, isBrand, isFunded, isDealCompleted, onPay, paying }) {
  const Row = ({ label, value }) => (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ font: "400 13px 'DM Sans',sans-serif", color: "#6B7280" }}>{label}</span>
      <span style={{ font: "600 13px 'DM Sans',sans-serif", color: "#0A0A0A" }}>{value}</span>
    </div>
  );

  const state = isDealCompleted ? "released" : isFunded ? "held" : isBrand ? "pay" : "waiting";
  const note = {
    released: { icon: <Check size={17} color="#059669" strokeWidth={2.3} />, bg: "#ECFDF5", title: "Payment released", body: "The deal is complete and escrow has been released.", c1: "#059669", c2: "#047857" },
    held: { icon: <Check size={17} color="#059669" strokeWidth={2.3} />, bg: "#ECFDF5", title: "Payment secured", body: `${inr(amount)} is held in escrow and is released only after the brand approves the delivery.`, c1: "#059669", c2: "#047857" },
    pay: { icon: <Shield size={17} color="#7C3AED" strokeWidth={2.1} />, bg: "#F5F0FF", title: "Not funded yet", body: "Fund the escrow so the creator can start. The money stays with Ybex until you approve the delivery.", c1: "#5B21B6", c2: "#6D28D9" },
    waiting: { icon: <Clock size={17} color="#D97706" strokeWidth={2.1} />, bg: "#FFFBEB", title: "Waiting for the brand", body: "Start work only after the brand funds the escrow — you'll be notified here.", c1: "#92400E", c2: "#B45309" },
  }[state];

  return (
    <MobileSheet onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Shield size={19} color="#059669" strokeWidth={1.9} />
        </div>
        <div style={{ flex: 1 }}>
          <SheetHeader title="Escrow" subtitle="Funds stay protected until delivery is approved." onClose={onClose} />
        </div>
      </div>

      <div style={{ marginTop: 16, borderRadius: 14, background: "#F9F9FB", border: "1px solid #E5E5EA", padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        <Row label="Deal amount" value={inr(amount)} />
        <Row label="Status" value={state === "released" ? "Released" : state === "held" ? "Held in escrow" : "Not funded"} />
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 11, padding: "13px 14px", borderRadius: 14, background: note.bg }}>
        <div style={{ flexShrink: 0, marginTop: 1 }}>{note.icon}</div>
        <div>
          <div style={{ font: "600 13px 'DM Sans',sans-serif", color: note.c1 }}>{note.title}</div>
          <div style={{ marginTop: 4, font: "400 12.5px/1.5 'DM Sans',sans-serif", color: note.c2 }}>{note.body}</div>
        </div>
      </div>

      {state === "pay" ? (
        <>
          <button
            disabled={paying}
            onClick={onPay}
            style={{ marginTop: 16, width: "100%", height: 52, borderRadius: 14, background: "#059669", border: "none", font: "600 15px 'DM Sans',sans-serif", color: "#fff", cursor: paying ? "default" : "pointer", opacity: paying ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {paying ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
            <span>{paying ? "Opening secure payment…" : `Pay ${inr(amount)} into escrow`}</span>
          </button>
          <div style={{ marginTop: 8, textAlign: "center", font: "400 11.5px/1.4 'DM Sans',sans-serif", color: "#8E8E93" }}>
            The payment screen shows the exact total before you confirm.
          </div>
        </>
      ) : (
        <button
          onClick={onClose}
          style={{ marginTop: 16, width: "100%", height: 52, borderRadius: 14, background: "#7C3AED", border: "none", font: "600 15px 'DM Sans',sans-serif", color: "#fff", cursor: "pointer" }}
        >
          Back to chat
        </button>
      )}
    </MobileSheet>
  );
}
