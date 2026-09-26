import React from "react";
import { ChevronLeft, Share2, ShieldCheck, CheckCircle2, MessageCircle, X, Clock } from "lucide-react";
import MobileSheet from "../../chat/mobile/MobileSheet";
import ButtonSpinner from "../../common/ButtonSpinner";

// Session 23 — design C02 (details), C03 (apply sheet), C04 (application sent).
// Presentation only: every check and the POST campaigns/apply live in the desktop
// CampaignDetail page (onApplyClick / handleApply), exactly as on desktop.
//
// CTA state machine (design C02):
//   accepted → "Open deal" (the deal's chat) · applied → "View application" (Deals · Applications)
//   closed   → disabled "Campaign closed"      · otherwise → "Apply now" → sheet

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function Fact({ label, value }) {
  return (
    <div className="rounded-xl bg-[#F9F9FB] px-3 py-2.5 min-w-0">
      <div className="text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase">{label}</div>
      <div className="text-[13px] font-semibold text-[#0A0A0A] truncate">{value}</div>
    </div>
  );
}

export default function CampaignDetailMobile({
  c, isApplied, isAccepted, chatThreadId, myApplication,
  amount, setAmount, pitch, setPitch, applying,
  applyModalOpen, setApplyModalOpen, onApplyClick, handleApply,
  applicationSent, onBack, onOpenChat, onViewApplications, onBrowseMore,
}) {
  const closed = c && c.status && String(c.status).toLowerCase() !== "live" && c.stage !== "Live" && c.stage !== "Under Review";
  const budget = Number(c?.budget_max || c?.budget_min || 0);
  const quote = Number(amount || 0);
  const overBudget = budget > 0 && quote > budget * 1.5;
  const followers = c?.follower_min ? `${c.follower_min >= 1000 ? Math.round(c.follower_min / 1000) + "K" : c.follower_min}+` : "Any";
  const deliverables = (c?.deliverables || []).filter(Boolean);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: c?.title, url });
      else { await navigator.clipboard.writeText(url); }
    } catch { /* user cancelled */ }
  };

  // C04 — after a successful application (the desktop handler flips applicationSent on mobile).
  if (applicationSent) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] px-5 pt-16 pb-28 flex flex-col items-center text-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="w-16 h-16 rounded-2xl bg-[#ECFDF5] flex items-center justify-center"><CheckCircle2 size={30} className="text-[#059669]" /></div>
        <div className="mt-4 text-[22px] font-bold tracking-[-.5px] text-[#0A0A0A]">Application sent</div>
        <div className="mt-1.5 text-[13.5px] leading-[1.55] text-[#6B7280] max-w-[300px]">
          {c?.brand_name || "The brand"} will review your pitch. You'll get a notification when they respond.
        </div>
        <div className="mt-6 w-full bg-white rounded-[18px] border border-[#ECECF0] p-4 space-y-2.5 text-left">
          <div className="flex justify-between text-[13px]"><span className="text-[#6B7280]">Campaign</span><span className="font-semibold text-[#0A0A0A] truncate ml-3">{c?.title}</span></div>
          <div className="flex justify-between text-[13px]"><span className="text-[#6B7280]">Your quote</span><span className="font-semibold text-[#0A0A0A]">{inr(amount)}</span></div>
          <div className="flex justify-between text-[13px]"><span className="text-[#6B7280]">Status</span><span className="font-semibold text-[#D97706]">Under review</span></div>
        </div>
        <button onClick={onViewApplications} className="mt-6 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold">Track application</button>
        <button onClick={onBrowseMore} className="mt-2.5 w-full h-12 rounded-[14px] bg-white border border-[#E5E5EA] text-[#0A0A0A] text-[14.5px] font-bold">Browse more campaigns</button>
      </div>
    );
  }

  let cta;
  if (isAccepted) {
    cta = <button onClick={() => onOpenChat(chatThreadId)} className="flex-1 h-12 rounded-[14px] bg-[#059669] text-white text-[14.5px] font-bold inline-flex items-center justify-center gap-2"><MessageCircle size={16} /> Open deal</button>;
  } else if (isApplied) {
    cta = <button onClick={onViewApplications} className="flex-1 h-12 rounded-[14px] bg-[#F5F0FF] text-[#7C3AED] text-[14.5px] font-bold">View application</button>;
  } else if (closed) {
    cta = <button disabled className="flex-1 h-12 rounded-[14px] bg-[#E5E5EA] text-[#8E8E93] text-[14.5px] font-bold">Campaign closed</button>;
  } else {
    cta = <button onClick={onApplyClick} className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold">Apply now</button>;
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-40" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur px-3 h-14 flex items-center justify-between border-b border-[#ECECF0]" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <button onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-full bg-[#F2F2F7] flex items-center justify-center"><ChevronLeft size={20} /></button>
        <div className="text-[15px] font-bold text-[#0A0A0A]">Campaign details</div>
        <button onClick={share} aria-label="Share" className="w-10 h-10 rounded-full bg-[#F2F2F7] flex items-center justify-center"><Share2 size={17} /></button>
      </div>

      <div className="px-4 pt-4 space-y-3">
        <div className="bg-white rounded-[20px] border border-[#ECECF0] p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center font-bold">{String(c?.brand_name || "B").charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-[#0A0A0A] truncate">{c?.brand_name}</div>
              <div className="text-[12px] text-[#6B7280] truncate">{(c?.categories || []).slice(0, 2).join(" · ")}</div>
            </div>
          </div>
          <div className="mt-3 text-[19px] font-bold leading-snug tracking-[-.3px] text-[#0A0A0A]">{c?.title}</div>
          {c?.deadline && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#D97706]"><Clock size={13} /> Apply by {new Date(c.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
          )}
          <div className="mt-3 rounded-2xl bg-[#ECFDF5] px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[20px] font-bold text-[#047857]">{c?.budget_max && c.budget_max !== c.budget_min ? `${inr(c.budget_min)}–${inr(c.budget_max)}` : inr(c?.budget_min || c?.budget_max)}</div>
              <div className="text-[11.5px] text-[#059669]">per creator · held in escrow</div>
            </div>
            <ShieldCheck size={22} className="text-[#059669]" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Fact label="Deliverables" value={deliverables.join(" + ") || "As per brief"} />
            <Fact label="Platform" value={(c?.platforms || []).join(", ") || "Instagram"} />
            <Fact label="Followers" value={followers} />
            <Fact label="Location" value={c?.location || "Pan India"} />
          </div>
        </div>

        <div className="bg-white rounded-[20px] border border-[#ECECF0] p-4">
          <div className="text-[11px] font-bold tracking-wider text-[#8E8E93] uppercase">Looking for</div>
          <p className="mt-1.5 text-[13.5px] leading-[1.6] text-[#374151] whitespace-pre-line">{c?.description}</p>
        </div>

        <div className="bg-white rounded-[20px] border border-[#ECECF0] p-4">
          <div className="text-[11px] font-bold tracking-wider text-[#8E8E93] uppercase">How it works</div>
          {["Apply with your quote", "Brand accepts → sign the contract with OTP", "Post, submit the link → paid after approval"].map((s, i) => (
            <div key={i} className="mt-2.5 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</div>
              <div className="text-[13px] text-[#374151]">{s}</div>
            </div>
          ))}
        </div>

        {isApplied && myApplication && (
          <div className="bg-white rounded-[20px] border border-[#ECECF0] p-4">
            <div className="text-[11px] font-bold tracking-wider text-[#8E8E93] uppercase">Your application</div>
            <div className="mt-1.5 flex justify-between text-[13px]"><span className="text-[#6B7280]">Quote</span><span className="font-semibold">{inr(myApplication.proposed_amount)}</span></div>
            <div className="mt-1 flex justify-between text-[13px]"><span className="text-[#6B7280]">Status</span><span className="font-semibold">{String(myApplication.status || "Pending").replace(/_/g, " ").toLowerCase().replace(/^./, (m) => m.toUpperCase())}</span></div>
          </div>
        )}
      </div>

      <div className="fixed left-0 right-0 z-30 bg-white border-t border-[#ECECF0] px-4 pt-3 flex gap-2" style={{ bottom: "calc(64px + env(safe-area-inset-bottom, 0px))", paddingBottom: 12 }}>
        {cta}
      </div>

      {applyModalOpen && (
        <MobileSheet onClose={() => setApplyModalOpen(false)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[18px] font-bold text-[#0A0A0A]">Apply to campaign</div>
              <div className="text-[12.5px] text-[#6B7280] truncate">{c?.title} · {c?.brand_name}</div>
            </div>
            <button onClick={() => setApplyModalOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full bg-[#F2F2F7] flex items-center justify-center shrink-0"><X size={16} /></button>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <label className="text-[12.5px] font-bold text-[#0A0A0A]">Your quote</label>
            {budget > 0 && <span className="text-[11.5px] text-[#6B7280]">Brand budget {inr(budget)}</span>}
          </div>
          <div className="mt-1.5 h-12 rounded-[14px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center px-3.5">
            <span className="text-[15px] font-bold text-[#6B7280] mr-1">₹</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="flex-1 bg-transparent outline-none text-[16px] font-bold text-[#0A0A0A]"
              placeholder="0"
            />
          </div>
          {overBudget && <div className="mt-1 text-[11.5px] text-[#D97706]">That's well above the brand's budget — they may not accept it.</div>}

          {deliverables.length > 0 && (
            <>
              <div className="mt-3 text-[12.5px] font-bold text-[#0A0A0A]">Deliverables you'll post</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {deliverables.map((d, i) => <span key={i} className="px-2.5 py-1 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[12px] font-semibold">{d}</span>)}
              </div>
            </>
          )}

          <div className="mt-3 flex items-baseline justify-between">
            <label className="text-[12.5px] font-bold text-[#0A0A0A]">Pitch to brand</label>
            <span className={`text-[11.5px] ${pitch.length < 20 ? "text-[#D97706]" : "text-[#8E8E93]"}`}>{pitch.length}/500 · min 20</span>
          </div>
          <textarea
            value={pitch}
            onChange={(e) => setPitch(e.target.value.slice(0, 500))}
            placeholder="Why you're a great fit — your idea, audience and timeline."
            className="mt-1.5 w-full h-28 rounded-[14px] bg-[#F9F9FB] border border-[#E5E5EA] p-3 text-[14px] leading-[1.5] outline-none resize-none"
          />

          <button
            disabled={applying || !amount || pitch.length < 20}
            onClick={handleApply}
            className="mt-4 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold disabled:opacity-50 inline-flex items-center justify-center"
          >
            {applying ? <ButtonSpinner label="Sending…" /> : "Send application"}
          </button>
        </MobileSheet>
      )}
    </div>
  );
}
