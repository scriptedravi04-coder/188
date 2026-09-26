import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Lock, Mail, ArrowLeft, ShieldCheck, CheckCircle2, Clock } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";

export default function UGCContractModal({ brief, orderId, threadId, onClose, onSigned, onStartChat }) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  
  const getRegisteredUserEmail = (u) => { return u?.email || ""; };
  const [otpEmail, setOtpEmail] = useState(() => getRegisteredUserEmail(user));

  useEffect(() => {
    const e = getRegisteredUserEmail(user);
    if (e) setOtpEmail(e);
  }, [user]);

  // 6 separate digits for OTP
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);
  
  // Agreement checkboxes
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [agreedDeadline, setAgreedDeadline] = useState(true);

  // OTP cooldown timer
  const [resendCooldown, setResendCooldown] = useState(60);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Masked email for display (e.g. ad***@gmail.com)
  const maskedEmail = React.useMemo(() => {
    if (!otpEmail) return "your registered email";
    const parts = otpEmail.split("@");
    if (parts.length < 2) return otpEmail;
    const name = parts[0];
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}***@${parts[1]}`;
  }, [otpEmail]);

  // Auto-send OTP on mount
  useEffect(() => {
    let timer;
    if (otpEmail && !otpSent && !sendingOtp) {
      handleSendOTP(true);
    }
    return () => clearInterval(timer);
  }, [otpEmail]);

  // Cooldown timer interval
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  const handleSendOTP = async (isAuto = false) => {
    if (!otpEmail || !otpEmail.includes("@")) {
      if (!isAuto) toast.error("Registered email address not found.");
      return;
    }
    setSendingOtp(true);
    try {
      const otpRes = await api.post("/otp/send", { 
        value: otpEmail, 
        target: "email", 
        purpose: "contract_sign",
        recipientName: user?.name || user?.full_name || "Creator Partner",
        brandName: brief?.brand_name || "Brand Partner",
        creatorName: user?.name || "Creator Partner",
        campaignTitle: brief?.title || brief?.campaign_title || "UGC Video Deliverable Agreement",
        dealAmount: brief?.budget || brief?.payout || ""
      });
      setOtpSent(true);
      setResendCooldown(60);
      if (otpRes?.data?.code && String(otpRes?.data?.message || "").startsWith("Test mode")) {
        toast.warning(`${otpRes.data.message} Test code: ${otpRes.data.code}`, { duration: 15000 });
      } else if (!isAuto) {
        toast.success(`Verification code dispatched to ${maskedEmail}`);
      }
    } catch (e) {
      if (!isAuto) {
        toast.error(e?.response?.data?.detail || e?.response?.data?.error || "Failed to send OTP.");
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleDigitChange = (index, value) => {
    // If pasted multiple digits
    if (value.length > 1) {
      const clean = value.replace(/\D/g, "").slice(0, 6);
      if (clean) {
        const newDigits = [...otpDigits];
        clean.split("").forEach((char, i) => {
          if (index + i < 6) newDigits[index + i] = char;
        });
        setOtpDigits(newDigits);
        const nextFocus = Math.min(5, index + clean.length);
        inputRefs.current[nextFocus]?.focus();
      }
      return;
    }

    const cleanChar = value.replace(/\D/g, "");
    const newDigits = [...otpDigits];
    newDigits[index] = cleanChar;
    setOtpDigits(newDigits);

    if (cleanChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const fullOtpCode = otpDigits.join("");
  const isFormValid = agreedTerms && agreedDeadline && fullOtpCode.length === 6;

  const handleSign = async () => {
    if (!isFormValid) {
      toast.error("Please agree to all terms and enter the 6-digit verification code.");
      return;
    }
    
    setLoading(true);
    try {
      // 1. Verify OTP code
      const verified = await api.post("/otp/verify", { value: otpEmail, code: fullOtpCode });
      const signToken = verified?.data?.sign_token; // required by claim and /sign

      let targetOrderId = orderId;

      if (!targetOrderId) {
        // Fresh claim from Explore UGC: atomically claim & sign with OTP signature
        const briefId = brief?.id || brief?.brief_id;
        if (!briefId) {
          throw new Error("Invalid brief identifier.");
        }
        const { data } = await api.post("ugc/orders/claim", {
          brief_id: briefId,
          signature: `OTP Verified: ${otpEmail}`,
          sign_token: signToken
        });
        targetOrderId = data?.order_id || data?.order?.id;
      } else {
        // Resigning an existing pending order in Manage Orders
        await api.post(`/ugc/orders/${targetOrderId}/sign`, { 
          signature: `OTP Verified: ${otpEmail}`,
          thread_id: threadId,
          sign_token: signToken
        });
      }

      toast.success("✓ Agreement signed · brief claimed — Your 24h timer has started", {
        duration: 4000
      });

      if (onSigned) {
        onSigned(targetOrderId);
      } else {
        onClose();
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.error || e?.message || "Invalid OTP code. Please check and try again.");
    } finally {
      setLoading(false);
    }
  };

  const brandName = brief?.brand_name || brief?.brand?.name || "Verified Brand";
  const briefTitle = brief?.title || "Collaboration video deliverable";
  const payout = Number(brief?.budget || brief?.payout || 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
          onClick={onClose} 
        />

        {/* Modal Window */}
        <motion.div 
          initial={{ scale: 0.96, opacity: 0, y: 16 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          exit={{ scale: 0.96, opacity: 0, y: 16 }}
          className="bg-white border border-[#E0E0E6] rounded-3xl w-full max-w-[760px] max-h-[92vh] flex flex-col relative z-10 shadow-2xl overflow-hidden font-['DM_Sans',sans-serif]"
        >
          {/* Top Bar */}
          <div className="shrink-0 px-6 py-4.5 border-b border-[#ECECF0] flex items-center justify-between bg-white">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-[#F4F4F7] hover:bg-gray-200 text-[#374151] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Back to brief details"
              >
                <ArrowLeft size={16} strokeWidth={2.4} />
              </button>
              <div className="min-w-0">
                <h2 className="font-bold text-[17px] text-[#0A0A0A] leading-tight">Creator agreement</h2>
                <div className="text-xs text-[#6B7280] truncate mt-0.5">
                  {briefTitle} · {brandName}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Step Indicator */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#6B7280] font-medium mr-1">
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check size={13} className="stroke-[3]" /> 1 Brief
                </span>
                <span className="w-4 h-px bg-gray-300"></span>
                <span className="text-[#7C3AED] font-bold">● 2 Agreement</span>
              </div>

              {/* Close Button */}
              <button 
                onClick={onClose} 
                className="w-8 h-8 rounded-lg bg-[#F4F4F7] hover:bg-gray-200 text-[#374151] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Close"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* Modal Scrollable Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
            {/* 4 Key Terms Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3.5 rounded-2xl bg-[#EDFAF1] border border-[#C6F0D3]">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#047857]">Payout</div>
                <div className="mt-1 font-bold text-lg text-[#059669]">₹{payout.toLocaleString()}</div>
                <div className="text-[11px] text-[#047857] mt-0.5 font-medium">In escrow</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F8F8FA] border border-[#ECECF0]">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">Deadline</div>
                <div className="mt-1 font-bold text-lg text-[#0A0A0A]">24 hours</div>
                <div className="text-[11px] text-[#6B7280] mt-0.5">From signing</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F8F8FA] border border-[#ECECF0]">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">Revisions</div>
                <div className="mt-1 font-bold text-lg text-[#0A0A0A]">Up to 2</div>
                <div className="text-[11px] text-[#6B7280] mt-0.5">12h each</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F8F8FA] border border-[#ECECF0]">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#6B7280]">Usage rights</div>
                <div className="mt-1 font-bold text-lg text-[#0A0A0A]">6 months</div>
                <div className="text-[11px] text-[#6B7280] mt-0.5">Organic + ads</div>
              </div>
            </div>

            {/* Full Terms Card */}
            <div className="rounded-2xl border border-[#E6E8EE] bg-[#FAFAFC] p-4.5 space-y-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">Terms of agreement</span>
              </div>

              <div className="max-h-44 overflow-y-auto pr-2 space-y-2.5 text-xs text-[#374151] leading-relaxed border-t border-gray-200/70 pt-3">
                <p>
                  <strong>1. Deliverable.</strong> One 30–60s, 9:16 edited video with natural lighting, audio, and subtitles, delivered according to brand specifications.
                </p>
                <p>
                  <strong>2. Timeline.</strong> First draft is due within 24 hours of signing. If the draft isn't submitted in time, the order is cancelled and the escrow returns to the brand.
                </p>
                <p>
                  <strong>3. Revisions.</strong> The brand may request up to 2 revisions. Each revision must be re-submitted within 12 hours.
                </p>
                <p>
                  <strong>4. Payment.</strong> ₹{payout.toLocaleString()} is held in escrow and released to your wallet within 48 hours of final approval.
                </p>
                <p>
                  <strong>5. Content rights.</strong> The brand may use the video on its own channels and paid ads for 6 months from approval.
                </p>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer"
                />
                <span className="text-xs text-[#374151] leading-tight font-medium">
                  I've read and agree to the creator agreement and brief requirements.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedDeadline}
                  onChange={(e) => setAgreedDeadline(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer"
                />
                <span className="text-xs text-[#374151] leading-tight font-medium">
                  I understand missing the 24h deadline cancels this order.
                </span>
              </label>
            </div>

            {/* Sign with OTP Box */}
            <div className="rounded-2xl border border-[#D8B4FE]/60 bg-[#FAF7FF] p-4.5 space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-bold text-sm text-[#0A0A0A]">
                  <Lock size={15} className="text-[#7C3AED]" />
                  <span>Sign with OTP</span>
                </div>
                <div className="text-xs text-[#6B7280] flex items-center gap-1">
                  <Mail size={12} />
                  <span>Sent to <strong>{maskedEmail}</strong></span>
                </div>
              </div>

              {/* 6 Digit Inputs */}
              <div>
                <div className="flex justify-center sm:justify-start gap-2 sm:gap-3">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-11 h-13 text-center text-xl font-bold font-mono bg-white border border-[#DDD0FF] rounded-xl text-[#0A0A0A] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 outline-none transition-all shadow-2xs"
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between mt-3 text-xs text-[#6B7280]">
                  <span>Registered email · can’t be changed here</span>
                  {resendCooldown > 0 ? (
                    <span className="font-medium text-[#7C3AED]">
                      Resend in 0:{resendCooldown < 10 ? `0${resendCooldown}` : resendCooldown}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendOTP(false)}
                      disabled={sendingOtp}
                      className="font-bold text-[#7C3AED] hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {sendingOtp ? "Sending..." : "Resend OTP"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Footer (Rule AGENTS_md: Cancel on left, Verify on right) */}
          <div className="shrink-0 px-6 py-4 border-t border-[#ECECF0] bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11.5px] text-[#6B7280] leading-tight">
              OTP verify hote hi agreement sign hoga, 24h timer start hoga aur aap Manage orders pe jaoge.
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
              {/* Secondary button on Left per AGENTS_md */}
              <button
                type="button"
                onClick={onClose}
                className="px-4.5 h-11 rounded-xl text-xs font-bold text-[#4B5563] bg-[#F2F2F7] hover:bg-[#E5E5EA] transition-colors cursor-pointer"
              >
                Back
              </button>

              {/* Primary button on Right per AGENTS_md */}
              <button
                type="button"
                onClick={handleSign}
                disabled={loading || !isFormValid}
                className="px-6 h-11 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)] cursor-pointer"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Verify OTP & sign</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
