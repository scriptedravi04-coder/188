import React, { useState, useMemo } from "react";
import { 
  Check, 
  Copy, 
  ExternalLink, 
  Clock, 
  ShieldCheck, 
  Building2, 
  X, 
  ChevronRight, 
  Download, 
  MessageSquare,
  Lock,
  ArrowUpRight,
  Send,
  FileText,
  Eye,
  HelpCircle,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import InvoiceModal from "./InvoiceModal";
import { CreatorEarningsSkeleton } from "../common/MobileSkeletons";

export default function CreatorEarningsMobile({
  totalEarned = 0,
  inEscrow = 0,
  transactions = [],
  eligibleDeals = [],
  paymentMethods = [],
  kycObj = null,
  growthPercent = null,
  past28DaysEarned = 0,
  onNudgeAdmin = null,
  onOpenPayoutSettings = null,
  loading = false,
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'escrow' | 'queue' | 'disbursed'
  const [selectedActiveDeal, setSelectedActiveDeal] = useState(null);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(null);
  const [showProofModal, setShowProofModal] = useState(null);

  if (loading) {
    return <CreatorEarningsSkeleton />;
  }

  // Derive default payment destination
  const primaryMethod = paymentMethods && paymentMethods.length > 0 ? paymentMethods[0] : null;
  const disbursingText = primaryMethod
    ? primaryMethod.upi_id
      ? `UPI · ${primaryMethod.upi_id}`
      : `${primaryMethod.bank_name || "Bank"} ••${(primaryMethod.account_number || "").slice(-4)}`
    : "No payout account added";

  // Normalize transactions into unified feed
  const feedItems = useMemo(() => {
    const list = [];

    // Eligible deals in payout queue
    (eligibleDeals || []).forEach((deal) => {
      list.push({
        id: deal.id || deal.deal_id,
        type: "queue",
        title: deal.campaign_title || deal.deliverable_type || "Brand Collaboration",
        brandName: deal.brand_name || "Brand Partner",
        amount: Number(deal.creator_net_amount || deal.amount || 0),
        grossAmount: Number(deal.gross_amount || deal.amount || 0),
        status: "queue",
        statusLabel: "Approved · in payout queue",
        timeAgo: "Approved recently",
        dealObj: deal,
        date: deal.approved_at || deal.updated_at || deal.created_at || new Date().toISOString(),
        monthLabel: "SEPTEMBER 2026"
      });
    });

    // Transactions (in escrow or disbursed)
    (transactions || []).forEach((tx) => {
      const isPaid = tx.payout_status === "PAID" || tx.payout_status === "RELEASED" || Boolean(tx.utr_number || tx.payout_reference);
      const amount = Number(tx.creator_net_amount || tx.net_amount || tx.amount || tx.gross_amount || 0);
      const txDate = new Date(tx.created_at || tx.payout_completed_at || Date.now());
      const monthStr = txDate.toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();

      list.push({
        id: tx.id || tx.transaction_id,
        type: isPaid ? "disbursed" : "escrow",
        title: tx.campaign_title || tx.deliverable_type || tx.deal_title || "UGC Deliverable",
        brandName: tx.brand_name || (tx.users && tx.users.name) || "Brand Partner",
        amount: amount,
        grossAmount: Number(tx.gross_amount || tx.amount || amount),
        feeAmount: Number(tx.platform_fee_amount || tx.fee_amount || 0) + Number(tx.gst_amount || 0), // fee + GST, both deducted from gross
        status: isPaid ? "disbursed" : "escrow",
        statusLabel: isPaid ? "Disbursed to bank" : "Brand reviewing escrow",
        utr: tx.utr_number || tx.payout_reference || null,
        disbursedAt: tx.payout_completed_at || tx.payout_released_at || tx.updated_at,
        txObj: tx,
        date: tx.created_at || tx.updated_at || new Date().toISOString(),
        monthLabel: monthStr || "SEPTEMBER 2026"
      });
    });

    return list;
  }, [transactions, eligibleDeals]);

  // Counts
  const countEscrow = feedItems.filter((i) => i.type === "escrow").length;
  const countQueue = feedItems.filter((i) => i.type === "queue").length;
  const countDisbursed = feedItems.filter((i) => i.type === "disbursed").length;

  // Filtered Items
  const filteredFeed = useMemo(() => {
    if (activeTab === "escrow") return feedItems.filter((i) => i.type === "escrow");
    if (activeTab === "queue") return feedItems.filter((i) => i.type === "queue");
    if (activeTab === "disbursed") return feedItems.filter((i) => i.type === "disbursed");
    return feedItems;
  }, [feedItems, activeTab]);

  // Group by Month
  const groupedFeed = useMemo(() => {
    const groups = {};
    filteredFeed.forEach((item) => {
      const groupKey = item.monthLabel || "SEPTEMBER 2026";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });
    return groups;
  }, [filteredFeed]);

  const copyToClipboard = (text, label = "UTR") => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const kycStatus = String(kycObj?.status || "").toUpperCase();
  const isKycVerified = kycStatus === "VERIFIED" || kycStatus === "APPROVED";
  const isKycPending = kycStatus === "PENDING" || kycStatus === "IN_REVIEW" || kycStatus === "SUBMITTED";

  return (
    <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-sans pb-16">
      {/* 01 TOP HEADER */}
      <header className="bg-white border-b border-[#E5E7EB] px-4 pt-3 pb-3.5 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-[#0A0A0A] leading-tight">
              Earnings &amp; escrow
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              {isKycVerified ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#059669" className="shrink-0">
                    <path d="M12 2l2.4 1.6 2.9-.2 1 2.7 2.3 1.8-.9 2.8.9 2.8-2.3 1.8-1 2.7-2.9-.2L12 22l-2.4-1.6-2.9.2-1-2.7L3.4 15l.9-2.8-.9-2.8 2.3-1.8 1-2.7 2.9.2z" />
                    <path d="M10.6 15.4l-2.8-2.8 1.2-1.2 1.6 1.6 4-4 1.2 1.2z" fill="#fff" />
                  </svg>
                  <span className="text-[11.5px] font-semibold text-[#059669]">
                    KYC verified
                  </span>
                </>
              ) : isKycPending ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="text-[11.5px] font-semibold text-amber-600">
                    KYC in review
                  </span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                  <span className="text-[11.5px] font-semibold text-slate-500">
                    KYC not submitted
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => onOpenPayoutSettings ? onOpenPayoutSettings() : navigate("/settings")}
            className="h-8 px-3 rounded-[10px] bg-[#F2F2F7] hover:bg-[#E5E7EB] active:scale-95 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-[#4B5563]" />
            <span className="text-[12px] font-semibold text-[#4B5563]">Payout settings</span>
          </button>
        </div>
      </header>

      {/* 01 HERO METRICS CARD WITH 28-DAY GROWTH CURVE */}
      <div className="p-4">
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#9061F9] via-[#7C3AED] to-[#4C1D95] p-[18px] text-white shadow-xl shadow-purple-900/30">
          {/* Ambient blur lighting */}
          <div className="absolute -top-[70px] -right-[50px] w-[190px] h-[190px] rounded-full bg-white/20 blur-xl pointer-events-none" />
          <div className="absolute -bottom-[60px] -left-[40px] w-[170px] h-[170px] rounded-full bg-sky-400/20 blur-xl pointer-events-none" />

          {/* BACKGROUND 28-DAY GROWTH CURVE (LOW OPACITY BLEND) */}
          <div className="absolute left-0 right-0 bottom-0 h-[105px] pointer-events-none overflow-hidden select-none">
            <svg
              viewBox="0 0 360 100"
              preserveAspectRatio="none"
              className="w-full h-full"
            >
              <defs>
                <linearGradient id="creatorCurveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
                  <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
                </linearGradient>
                <filter id="creatorGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Grid guide line */}
              <line x1="0" y1="85" x2="360" y2="85" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" strokeWidth="1" />
              <line x1="0" y1="52" x2="360" y2="52" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" strokeWidth="1" />

              {past28DaysEarned > 0 || totalEarned > 0 ? (
                <>
                  {/* Shaded Area Fill */}
                  <path
                    d="M0,82 C25,78 45,84 70,68 C95,54 115,70 140,56 C165,42 185,52 210,38 C235,24 255,34 280,20 C305,11 325,18 355,8 L360,8 L360,100 L0,100 Z"
                    fill="url(#creatorCurveGrad)"
                  />

                  {/* Glowing Stroke Curve */}
                  <path
                    d="M0,82 C25,78 45,84 70,68 C95,54 115,70 140,56 C165,42 185,52 210,38 C235,24 255,34 280,20 C305,11 325,18 355,8"
                    fill="none"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    filter="url(#creatorGlow)"
                  />

                  {/* Peak 28-day indicator point */}
                  <circle cx="355" cy="8" r="7" fill="#FFFFFF" opacity="0.25" />
                  <circle cx="355" cy="8" r="3.5" fill="#FFFFFF" />
                </>
              ) : null}
            </svg>
          </div>

          {/* HERO CONTENT */}
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10.5px] font-medium tracking-wider uppercase text-white/75">
                  Total earned · paid to bank
                </div>
                <div className="text-[32px] font-bold tracking-tight text-white mt-1 leading-none">
                  ₹{Number(totalEarned || 0).toLocaleString("en-IN")}
                </div>
              </div>

              {growthPercent ? (
                <div className="h-[26px] px-2.5 rounded-[9px] bg-white/20 backdrop-blur-md flex items-center gap-1 shrink-0">
                  <ArrowUpRight className="w-3 h-3 text-[#D9FBE9] stroke-[2.8]" />
                  <span className="text-[11px] font-bold text-[#EAFBF2]">{growthPercent}</span>
                </div>
              ) : null}
            </div>

            <div className="text-[10.5px] text-white/70 mt-1 font-normal">
              ₹{Number(past28DaysEarned || 0).toLocaleString("en-IN")} earned in the past 28 days
            </div>

            {/* In Active Escrow Pill */}
            <div className="mt-3.5 flex items-center gap-2 px-3 py-2 rounded-[14px] bg-white/15 border border-white/20 backdrop-blur-sm">
              <Lock className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0 stroke-[2]" />
              <div className="flex-1 min-w-0 text-[11.5px] text-white/90">
                In active escrow · guaranteed
              </div>
              <div className="text-[13.5px] font-bold text-white shrink-0">
                ₹{Number(inEscrow || 0).toLocaleString("en-IN")}
              </div>
            </div>

            {/* Disbursing Destination Pill */}
            <div className="mt-2 flex items-center gap-2 p-2.5 rounded-[14px] bg-slate-950/25">
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-medium tracking-wider uppercase text-white/60">
                  Disbursing to
                </div>
                <div className="text-[11.5px] font-semibold text-white truncate mt-0.5">
                  {disbursingText}
                </div>
              </div>
              <button
                onClick={() => onOpenPayoutSettings ? onOpenPayoutSettings() : navigate("/settings")}
                className="h-6 px-2.5 rounded-[7px] bg-white text-[#4C1D95] text-[11px] font-bold shrink-0 active:scale-95 transition-transform cursor-pointer"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER SEGMENTS */}
      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("all")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "all" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab("escrow")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "escrow" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          In escrow · {countEscrow}
        </button>
        <button
          onClick={() => setActiveTab("queue")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "queue" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          Ready for disbursal · {countQueue}
        </button>
        <button
          onClick={() => setActiveTab("disbursed")}
          className={`h-8 px-3 rounded-[10px] text-[12px] font-semibold shrink-0 transition-all cursor-pointer ${
            activeTab === "disbursed" ? "bg-[#0A0A0A] text-white" : "bg-white border border-[#E2E8F0] text-[#4B5563]"
          }`}
        >
          Disbursed · {countDisbursed}
        </button>
      </div>

      {/* FEED ITEMS GROUPED BY MONTH */}
      <div className="px-4 pt-2 flex-1 flex flex-col gap-4">
        {Object.keys(groupedFeed).length === 0 ? (
          <div className="bg-white rounded-[16px] border border-[#E2E8F0] p-8 text-center text-[#6B7280]">
            <p className="text-sm font-medium">No deals in this category yet</p>
          </div>
        ) : (
          Object.entries(groupedFeed).map(([month, items]) => (
            <div key={month} className="flex flex-col gap-2.5">
              <div className="text-[10.5px] font-bold tracking-wider uppercase text-[#6B7280] px-0.5">
                {month}
              </div>

              {items.map((item) => {
                // CARD TYPE A: IN ESCROW / REVIEWING
                if (item.type === "escrow") {
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedActiveDeal(item)}
                      className="bg-white border border-[#E2E8F0] rounded-[16px] p-3 flex items-center gap-3 cursor-pointer hover:border-purple-300 transition-all active:scale-[0.99] shadow-xs"
                    >
                      <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#FDE68A] to-[#B45309] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#0A0A0A] truncate">
                          {item.title}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="h-5 px-1.5 rounded-[5px] bg-[#FFFBEB] flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-[#B45309]" />
                            <span className="text-[10px] font-semibold text-[#B45309]">
                              {item.statusLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-[14px] font-bold text-[#0A0A0A]">
                          ₹{item.amount.toLocaleString("en-IN")}
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#C4C4CC]" />
                      </div>
                    </div>
                  );
                }

                // CARD TYPE B: IN PAYOUT QUEUE / APPROVED
                if (item.type === "queue") {
                  return (
                    <div
                      key={item.id}
                      className="bg-white border-[1.5px] border-[#DDD0FF] rounded-[16px] p-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#C9DFD2] to-[#2C4438] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold text-[#0A0A0A] truncate">
                            {item.title}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <div className="h-5 px-1.5 rounded-[5px] bg-[#F5F0FF] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]" />
                              <span className="text-[10px] font-semibold text-[#7C3AED]">
                                Approved · in payout queue
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-[14px] font-bold text-[#0A0A0A] shrink-0">
                          ₹{item.amount.toLocaleString("en-IN")}
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2.5 border-t border-purple-50 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] text-[#6B7280]">
                          Finance usually disburses within 24h of approval.
                        </span>
                        <button
                          onClick={() => onNudgeAdmin ? onNudgeAdmin(item.id) : toast.error("Couldn't reach the admin desk from here. Please use Help → Tickets.")}
                          className="h-7 px-3 rounded-[8px] bg-[#F5F0FF] hover:bg-[#EDE5FF] text-[#7C3AED] text-[11px] font-bold shrink-0 active:scale-95 transition-all cursor-pointer"
                        >
                          Nudge admin
                        </button>
                      </div>
                    </div>
                  );
                }

                // CARD TYPE C: COMPLETED & DISBURSED TO BANK (WITH UTR)
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedReceiptTx(item)}
                    className="bg-white border border-[#E2E8F0] rounded-[16px] p-3 cursor-pointer hover:border-emerald-300 transition-all active:scale-[0.99] shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#CBD3E8] to-[#2B3348] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#0A0A0A] truncate">
                          {item.title}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="h-5 px-1.5 rounded-[5px] bg-[#ECFDF5] flex items-center gap-1">
                            <Check className="w-2.5 h-2.5 text-[#059669] stroke-[3]" />
                            <span className="text-[10px] font-semibold text-[#059669]">
                              Disbursed to bank
                            </span>
                          </div>
                          {item.date && (
                            <span className="text-[10.5px] text-[#9CA3AF]">
                              {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-[14px] font-bold text-[#059669]">
                          +₹{item.amount.toLocaleString("en-IN")}
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#C4C4CC]" />
                      </div>
                    </div>

                    {item.utr && (
                      <div className="mt-2.5 flex items-center gap-1.5 px-2 py-1 rounded-[6px] bg-[#F8F8FB] border border-[#EEF1F5] w-fit">
                        <span className="text-[9.5px] font-medium tracking-wider text-[#9CA3AF]">UTR</span>
                        <span className="text-[10px] font-semibold text-[#4B5563]">{item.utr}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* SCREEN 02: ACTIVE DEAL · ESCROW MILESTONES BOTTOM SHEET */}
      {selectedActiveDeal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-[24px] p-5 max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Grab Handle */}
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

            {/* Deal Header */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-[13px] bg-gradient-to-br from-[#FDE68A] to-[#B45309] shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold text-[#0A0A0A] leading-tight truncate">
                  {selectedActiveDeal.title}
                </h3>
                <p className="text-[11.5px] text-[#6B7280] mt-0.5">
                  Deal #{selectedActiveDeal.id.slice(0, 8)} · {selectedActiveDeal.brandName}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[18px] font-bold text-[#0A0A0A]">
                  ₹{selectedActiveDeal.amount.toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-[#9CA3AF]">deal value</div>
              </div>
            </div>

            {/* Stepper Milestones */}
            <div className="mt-5 flex flex-col">
              {/* Step 1: Funded */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div className="flex-1 w-[2px] bg-[#A7F3D0] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">Escrow funded by brand</div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                    Sep 18 · Razorpay verified · ₹{selectedActiveDeal.amount.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              {/* Step 2: Content Submitted */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div className="flex-1 w-[2px] bg-[#E5E7EB] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">UGC video submitted by you</div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">Sep 19 · 1080p · 0:42 high bitrate</div>
                </div>
              </div>

              {/* Step 3: Brand Review */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#FFFBEB] border-2 border-[#F59E0B]" />
                  <div className="flex-1 w-[2px] bg-[#E5E7EB] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">Brand QC &amp; approval</span>
                    <span className="h-4 px-1.5 rounded-[4px] bg-[#FFFBEB] text-[#B45309] text-[9px] font-bold flex items-center">
                      NOW
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[#B45309] mt-0.5">
                    Auto-approves in 18h 32m if no revision is requested
                  </div>
                </div>
              </div>

              {/* Step 4: Disbursal */}
              <div className="flex gap-3">
                <div className="w-5 shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#9CA3AF]">
                    <Lock className="w-2.5 h-2.5" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-[#9CA3AF]">Direct disbursal to bank / UPI</div>
                  <div className="text-[11.5px] text-[#9CA3AF] mt-0.5">
                    Ybex finance sends IMPS to {disbursingText} and posts the UTR here
                  </div>
                </div>
              </div>
            </div>

            {/* Escrow Guarantee Banner */}
            <div className="mt-3 p-3 rounded-[14px] bg-[#ECFDF5] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-[#047857] leading-relaxed">
                <strong className="font-semibold">100% escrow protected.</strong> The brand cannot cancel this brief without admin mediation.
              </p>
            </div>

            {/* Actions: View Proof & Chat With Brand */}
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => {
                  setShowProofModal(selectedActiveDeal);
                }}
                className="flex-1 h-12 rounded-[14px] border border-[#E2E8F0] bg-[#F8F8FB] text-[#0A0A0A] font-semibold text-[13px] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#4B5563]" />
                View proof
              </button>
              <button
                onClick={() => {
                  setSelectedActiveDeal(null);
                  navigate("/chat");
                }}
                className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 active:scale-95 transition-all cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                Chat with brand
              </button>
            </div>

            <button
              onClick={() => setSelectedActiveDeal(null)}
              className="mt-2.5 w-full h-10 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 03: DISBURSAL RECEIPT & UTR PROOF BOTTOM SHEET */}
      {selectedReceiptTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-[24px] p-5 max-h-[90vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Grab handle */}
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />

            {/* Success Icon & Big Amount */}
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center text-[#059669]">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <div className="text-[13px] font-semibold text-[#047857] mt-2">
                Disbursed to bank account
              </div>
              <div className="text-[34px] font-bold tracking-tight text-[#0A0A0A] mt-1 leading-none">
                ₹{selectedReceiptTx.amount.toLocaleString("en-IN")}
              </div>
              <div className="text-[11.5px] text-[#6B7280] mt-1">
                {selectedReceiptTx.title} · {selectedReceiptTx.brandName}
              </div>
            </div>

            {/* Financial Breakdown Card */}
            <div className="mt-4 rounded-[16px] bg-[#F8F8FB] p-3.5 flex flex-col gap-2">
              <div className="flex justify-between text-[12px]">
                <span className="text-[#6B7280]">Gross deal value</span>
                <span className="font-semibold text-[#0A0A0A]">
                  ₹{(selectedReceiptTx.grossAmount || selectedReceiptTx.amount).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-[#6B7280]">Platform fee &amp; TDS</span>
                <span className="font-semibold text-[#0A0A0A]">
                  −₹{(selectedReceiptTx.feeAmount || 0).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="h-[1px] bg-[#EAEAF0]" />
              <div className="flex justify-between text-[13px]">
                <span className="font-semibold text-[#0A0A0A]">Final amount disbursed</span>
                <span className="font-bold text-[#059669]">
                  ₹{selectedReceiptTx.amount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Banking Proof Box */}
            <div className="mt-3 rounded-[16px] border border-[#E2E8F0] overflow-hidden">
              <div className="p-3 bg-[#FBFBFD] border-b border-[#EEF1F5] flex items-center justify-between">
                <div>
                  <div className="text-[9.5px] font-medium tracking-wider uppercase text-[#9CA3AF]">
                    UTR / REFERENCE NO.
                  </div>
                  <div className="text-[14px] font-bold text-[#0A0A0A] mt-0.5">
                    {selectedReceiptTx.utr || "Pending"}
                  </div>
                </div>
                <button
                  onClick={() => selectedReceiptTx.utr && copyToClipboard(selectedReceiptTx.utr)}
                  className="h-8 px-3 rounded-[8px] bg-[#7C3AED] text-white text-[11.5px] font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
              </div>

              <div className="p-3 flex flex-col gap-2 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Destination</span>
                  <span className="font-semibold text-[#0A0A0A]">
                    {disbursingText}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">IFSC</span>
                  <span className="font-semibold text-[#0A0A0A]">HDFC0001234</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Channel</span>
                  <span className="font-semibold text-[#0A0A0A]">IMPS · direct bank transfer</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Disbursed at</span>
                  <span className="font-semibold text-[#0A0A0A]">
                    {selectedReceiptTx.disbursedAt
                      ? new Date(selectedReceiptTx.disbursedAt).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "Sep 20, 2026 · 11:42 AM"}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions: Download GST invoice & Discrepancy Support */}
            <button
              onClick={() => {
                setShowInvoiceModal(selectedReceiptTx.txObj || selectedReceiptTx);
              }}
              className="mt-4 w-full h-12 rounded-[14px] border-[1.5px] border-[#DDD0FF] bg-white text-[#7C3AED] font-semibold text-[13.5px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              Download GST invoice / voucher
            </button>

            <button
              onClick={() => {
                navigate("/help/tickets");
              }}
              className="mt-2.5 w-full h-10 rounded-[12px] bg-[#F2F2F7] text-[#4B5563] text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Discrepancy? Contact finance support
            </button>

            <button
              onClick={() => setSelectedReceiptTx(null)}
              className="mt-2 w-full h-9 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close receipt
            </button>
          </div>
        </div>
      )}

      {/* Deliverable Proof Preview Modal */}
      {showProofModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] p-5 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#7C3AED]" />
                <h4 className="text-[14px] font-bold text-[#0A0A0A]">Deliverable Proof</h4>
              </div>
              <button
                onClick={() => setShowProofModal(null)}
                className="w-7 h-7 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6B7280]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center">
              <div className="w-full h-44 rounded-[14px] bg-slate-950 flex flex-col items-center justify-center text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10" />
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white z-20">
                  <Eye className="w-6 h-6" />
                </div>
                <div className="absolute bottom-3 left-3 z-20 text-[11px] font-medium text-white/90">
                  {showProofModal.title} · 1080p high bitrate
                </div>
              </div>

              <div className="mt-3 w-full p-3 rounded-[12px] bg-[#F8F8FB] text-[12px] text-[#4B5563] flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>Uploaded:</span>
                  <span className="font-semibold text-[#0A0A0A]">Sep 19, 2026 · 14:30</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-[#059669]">Brand in Review</span>
                </div>
              </div>

              <button
                onClick={() => {
                  toast.success("Deliverable link opened in preview");
                  setShowProofModal(null);
                }}
                className="mt-4 w-full h-11 rounded-[12px] bg-[#7C3AED] text-white font-semibold text-[13px] active:scale-95 transition-all cursor-pointer"
              >
                Open Full Asset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tax Invoice Modal */}
      {showInvoiceModal && (
        <InvoiceModal
          transaction={showInvoiceModal}
          isBrand={false}
          creatorName="You"
          brandName={showInvoiceModal.brandName || "Brand Partner"}
          onClose={() => setShowInvoiceModal(null)}
        />
      )}
    </div>
  );
}
