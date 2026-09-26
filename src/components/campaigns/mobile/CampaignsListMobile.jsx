import React, { useMemo, useState } from "react";
import { Search, X, CheckCircle2, Megaphone, ChevronRight, MapPin } from "lucide-react";
import { Shimmer } from "../../common/ContentSkeletons";

// Session 23 — design "Creator Complete Mobile UI" C01 (Live campaigns) + C05 (Closed / empty).
// Presentation only. Data, filters and "applied" status come from the desktop Campaigns page
// (same `campaigns` + `campaigns/my-applications` calls); nothing here talks to the API.
//
// Live   = the live campaigns the desktop list shows (UGC briefs have their own Explore UGC tab).
// Closed = campaigns this creator applied to that are no longer live — from my-applications,
//          so it needs no new endpoint.

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const budgetText = (c) => {
  const lo = Number(c.budget_min || 0), hi = Number(c.budget_max || 0);
  if (lo && hi && hi !== lo) return `${inr(lo)}–${inr(hi)}`;
  return lo || hi ? inr(lo || hi) : "Open budget";
};
const deliverableText = (c) => {
  const d = Array.isArray(c.deliverables) ? c.deliverables.filter(Boolean) : [];
  return d.length ? d.slice(0, 2).join(" + ") : "As per brief";
};

function Initial({ name, logo }) {
  if (logo && !String(logo).includes("dicebear")) {
    return <img src={logo} alt="" className="w-10 h-10 rounded-xl object-cover bg-white border border-[#ECECF0]" />;
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center font-bold text-[15px]">
      {String(name || "B").trim().charAt(0).toUpperCase()}
    </div>
  );
}

function CampaignCard({ c, applied, onOpen }) {
  return (
    <button
      onClick={() => onOpen(c.id)}
      className="w-full text-left bg-white rounded-[20px] border border-[#ECECF0] p-4 active:scale-[.99] transition-transform"
    >
      <div className="flex items-start gap-3">
        <Initial name={c.brand_name} logo={c.brand_logo} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-[#0A0A0A] leading-snug line-clamp-2">{c.title}</div>
          <div className="mt-0.5 text-[12px] text-[#6B7280] truncate">{c.brand_name}</div>
        </div>
        {applied && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#ECFDF5] text-[#059669] text-[11px] font-bold">
            <CheckCircle2 size={12} /> Applied
          </span>
        )}
      </div>
      {c.description && (
        <p className="mt-2.5 text-[12.5px] leading-[1.5] text-[#4B5563] line-clamp-2">{c.description}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#F9F9FB] px-3 py-2">
          <div className="text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase">Per creator</div>
          <div className="text-[14px] font-bold text-[#0A0A0A]">{budgetText(c)}</div>
        </div>
        <div className="rounded-xl bg-[#F9F9FB] px-3 py-2 min-w-0">
          <div className="text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase">Deliverable</div>
          <div className="text-[13px] font-semibold text-[#0A0A0A] truncate">{deliverableText(c)}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11.5px] text-[#6B7280]">
        <span className="inline-flex items-center gap-1 min-w-0 truncate"><MapPin size={12} /> {c.location || "Pan India"}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-[#7C3AED]">
          {applied ? "View application" : "View details"} <ChevronRight size={14} />
        </span>
      </div>
    </button>
  );
}

function EmptyState({ title, body, cta, onCta }) {
  return (
    <div className="mt-10 flex flex-col items-center text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-white border border-[#ECECF0] flex items-center justify-center">
        <Megaphone size={22} className="text-[#7C3AED]" />
      </div>
      <div className="mt-4 text-[16px] font-bold text-[#0A0A0A]">{title}</div>
      <div className="mt-1 text-[13px] leading-[1.5] text-[#6B7280]">{body}</div>
      {cta && (
        <button onClick={onCta} className="mt-4 h-11 px-5 rounded-xl bg-[#7C3AED] text-white text-[13.5px] font-bold">
          {cta}
        </button>
      )}
    </div>
  );
}

export default function CampaignsListMobile({ campaigns = [], myApplications = [], loading = false, categories = [], onOpen }) {
  const [tab, setTab] = useState("live");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  const appliedIds = useMemo(
    () => new Set((myApplications || []).map((a) => String(a.campaign_id || a.id))),
    [myApplications]
  );

  const live = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (campaigns || []).filter((c) => {
      if (cat !== "All" && !(c.categories || []).some((x) => String(x).toLowerCase() === cat.toLowerCase())) return false;
      if (!needle) return true;
      return [c.title, c.brand_name, ...(c.categories || []), String(c.budget_min || ""), String(c.budget_max || "")]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [campaigns, q, cat]);

  const liveIds = useMemo(() => new Set((campaigns || []).map((c) => String(c.id))), [campaigns]);
  const closed = useMemo(
    () => (myApplications || [])
      .filter((a) => a.campaign_id && !liveIds.has(String(a.campaign_id)))
      .map((a) => ({
        id: a.campaign_id,
        title: a.campaign_title || a.title || "Campaign",
        brand_name: a.brand_name || "Brand",
        brand_logo: a.brand_logo,
        budget_min: a.proposed_amount,
        budget_max: a.proposed_amount,
        deliverables: a.deliverables || [],
        location: a.location,
        description: null,
      })),
    [myApplications, liveIds]
  );

  const list = tab === "live" ? live : closed;
  const catChips = ["All", ...categories.filter((x) => x && x !== "All").slice(0, 10)];

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-28" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="bg-white px-4 pt-4 pb-3 border-b border-[#ECECF0]">
        <div className="text-[24px] font-bold tracking-[-.6px] text-[#0A0A0A]">Campaigns</div>
        <div className="text-[12.5px] text-[#6B7280]">Verified brands · transparent rates</div>

        <div className="mt-3 relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E8E93]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search niche, brand or budget"
            className="w-full h-11 rounded-[14px] bg-[#F2F2F7] pl-10 pr-9 text-[14px] outline-none placeholder:text-[#8E8E93]"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1">
              <X size={15} className="text-[#8E8E93]" />
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-1 p-1 rounded-[13px] bg-[#F2F2F7]">
          {[["live", `Live · ${campaigns.length}`], ["closed", "Closed"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 h-9 rounded-[10px] text-[13px] font-bold ${tab === id ? "bg-white text-[#7C3AED] shadow-sm" : "text-[#6B7280]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "live" && catChips.length > 1 && (
          <div className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar">
            {catChips.map((x) => (
              <button
                key={x}
                onClick={() => setCat(x)}
                className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold border ${cat === x ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "bg-white border-[#E5E5EA] text-[#4B5563]"}`}
              >
                {x}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-[20px] border border-[#ECECF0] p-4">
              <div className="flex gap-3"><Shimmer className="w-10 h-10 !rounded-xl" /><div className="flex-1 space-y-2"><Shimmer className="h-4 w-4/5" /><Shimmer className="h-3 w-1/3" /></div></div>
              <Shimmer className="mt-3 h-3 w-full" /><Shimmer className="mt-2 h-3 w-2/3" />
              <div className="mt-3 grid grid-cols-2 gap-2"><Shimmer className="h-12" /><Shimmer className="h-12" /></div>
            </div>
          ))
        ) : list.length === 0 ? (
          tab === "live" ? (
            q || cat !== "All" ? (
              <EmptyState title="No matching campaigns" body="Try another niche, brand or budget." cta="Clear filters" onCta={() => { setQ(""); setCat("All"); }} />
            ) : (
              <EmptyState title="No live campaigns right now" body="New campaigns from verified brands show up here. Meanwhile, try Instant UGC briefs." />
            )
          ) : (
            <EmptyState title="No closed campaigns yet" body="Campaigns you applied to appear here once the brand stops accepting." cta="See live campaigns" onCta={() => setTab("live")} />
          )
        ) : (
          list.map((c) => <CampaignCard key={c.id} c={c} applied={appliedIds.has(String(c.id)) || c.has_applied} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}
