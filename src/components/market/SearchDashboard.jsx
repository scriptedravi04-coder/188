import React, { useState } from "react";
import { 
  Search, ShieldCheck, TrendingUp, Sparkles, ExternalLink, 
  RefreshCw, CheckCircle2, AlertTriangle, Filter, Database,
  ArrowRight, X, ChevronDown, Award, Globe
} from "lucide-react";
import { useInfluencerSearch } from "../../hooks/useInfluencerSearch";
import InfluencerMetricsChart from "../analytics/InfluencerMetricsChart";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function SearchDashboard() {
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    platform,
    setPlatform,
    category,
    setCategory,
    loading,
    results,
    sources,
    error,
    isCached,
    search,
    pipeToSupabase,
  } = useInfluencerSearch();

  const [selectedCreatorForChart, setSelectedCreatorForChart] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'verified'

  const PRESET_QUERIES = [
    { label: "Tech YouTubers India", q: "Tech YouTubers India", platform: "YouTube", cat: "Tech" },
    { label: "Mumbai Fashion Creators", q: "Fashion influencers Mumbai", platform: "Instagram", cat: "Fashion" },
    { label: "Fitness & Nutrition Delhi", q: "Fitness creators Delhi NCR", platform: "Instagram", cat: "Fitness" },
    { label: "Finance & Fintech Creators", q: "Personal finance influencers India", platform: "YouTube", cat: "Finance" },
  ];

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    search(query);
  };

  const handlePresetClick = (preset) => {
    setQuery(preset.q);
    setPlatform(preset.platform);
    setCategory(preset.cat);
    search(preset.q, { platform: preset.platform, category: preset.cat });
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4 sm:p-6 text-left">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-indigo-900/40 via-[var(--bg-card)] to-[var(--bg-elevated)] border border-indigo-500/20 rounded-3xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-[#7C5CFF]/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
              <Sparkles size={13} className="text-indigo-400" />
              <span>Real-Time Google Search Grounding Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-[var(--text-primary)] tracking-tight">
              Influencer Intelligence & Search Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1.5 max-w-2xl leading-relaxed">
              Scan live web signals, verify real followers, inspect brand sponsorships, and track D3.js growth curves synchronized with Supabase.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-medium font-mono">
              <Database size={13} />
              <span>Auto-Piping to Supabase</span>
            </span>
          </div>
        </div>

        {/* Live Search Bar */}
        <form onSubmit={handleSearchSubmit} className="mt-6 relative z-10">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-[var(--bg-card)] border border-[var(--border-default)] p-2 rounded-2xl shadow-lg focus-within:border-indigo-500 transition-all">
            <div className="flex items-center gap-2.5 flex-1 px-3">
              <Search size={18} className="text-[var(--text-tertiary)] shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search creator name, @handle, niche, or city (e.g. 'Tech Burner', 'Ranveer Allahbadia')..."
                className="w-full bg-transparent border-none text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 rounded-full"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Platform Selector */}
            <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-[var(--border-default)] pt-2 sm:pt-0 sm:pl-3">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] rounded-xl px-3 py-2 focus:outline-hidden font-medium cursor-pointer"
              >
                <option value="Instagram">Instagram</option>
                <option value="YouTube">YouTube</option>
                <option value="Snapchat">Snapchat</option>
                <option value="X">X (Twitter)</option>
                <option value="LinkedIn">LinkedIn</option>
              </select>

              {/* Action Button on the RIGHT (Rule standard) */}
              <button
                type="submit"
                disabled={loading}
                className="bg-[#7C5CFF] hover:bg-[#6A4BE8] text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md flex items-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer ml-auto"
              >
                {loading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Searching Web...</span>
                  </>
                ) : (
                  <>
                    <Search size={15} />
                    <span>Search Live</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Quick Discovery Presets */}
        <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
          <span className="text-[var(--text-tertiary)] font-medium">Trending Searches:</span>
          {PRESET_QUERIES.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handlePresetClick(p)}
              className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:border-indigo-500/40 transition-all font-medium cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Inspect Modal/Drawer if a creator's chart is opened */}
      {selectedCreatorForChart && (
        <div className="bg-[var(--bg-card)] border border-[#7C5CFF]/30 rounded-2xl p-5 shadow-2xl relative animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default)] mb-4">
            <div>
              <span className="text-xs uppercase font-mono text-indigo-400 font-bold tracking-wider">
                Telemetry & Growth Trajectory
              </span>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {selectedCreatorForChart.name} ({selectedCreatorForChart.handle})
              </h3>
            </div>
            {/* Close button on LEFT or right dismissive */}
            <button
              type="button"
              onClick={() => setSelectedCreatorForChart(null)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              Close Telemetry
            </button>
          </div>

          <InfluencerMetricsChart
            entityId={selectedCreatorForChart.id}
            title={`${selectedCreatorForChart.name} — Verified D3.js Metrics Curve`}
          />
        </div>
      )}

      {/* Results Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>Verified Influencer Results</span>
            {results.length > 0 && (
              <span className="text-xs font-mono bg-[var(--bg-elevated)] text-[var(--text-secondary)] px-2.5 py-0.5 rounded-full border border-[var(--border-default)]">
                {results.length} Profiles
              </span>
            )}
          </h2>

          {isCached && (
            <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
              <RefreshCw size={12} />
              Cached view — Click "Search Live" to re-scan
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center bg-[var(--bg-card)]/50 rounded-2xl border border-[var(--border-default)] space-y-3">
            <div className="w-9 h-9 border-2 border-[#7C5CFF] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Executing Google Search Grounding & Fraud Scan...
            </p>
            <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
              Analyzing live social footprints, engagement velocity, and recent brand mentions across the web.
            </p>
          </div>
        ) : error ? (
          <div className="p-6 text-center bg-red-500/10 rounded-2xl border border-red-500/20 text-red-400 text-xs">
            <AlertTriangle size={20} className="mx-auto mb-2 text-red-400" />
            {error}
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center bg-[var(--bg-elevated)] rounded-2xl border border-[var(--border-default)] space-y-3">
            <Search size={32} className="mx-auto text-[var(--text-tertiary)] opacity-60" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Search Any Creator to Generate Live Grounded Intelligence
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] max-w-md mx-auto">
              Try searching by name, YouTube channel, Instagram handle, or niche keywords above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((c, idx) => {
              const score = c.verification_score || 85;
              const isHighTrust = score >= 80;

              return (
                <div
                  key={c.id || idx}
                  className="bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-indigo-500/30 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  {/* Top Creator Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                          {c.name}
                        </h3>
                        <span className="text-xs text-indigo-400 font-mono">
                          {c.handle}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                          {c.platform || "Instagram"}
                        </span>
                        <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
                          {c.category}
                        </span>
                      </div>
                    </div>

                    {/* Authenticity Gauge */}
                    <div
                      className={`flex flex-col items-center px-3 py-1.5 rounded-xl border font-mono ${
                        isHighTrust
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                          : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                      }`}
                    >
                      <span className="text-xs font-black">{score}/100</span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold">
                        {isHighTrust ? "Verified" : "Moderate"}
                      </span>
                    </div>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {c.summary}
                  </p>

                  {/* Key Stats Row */}
                  <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-[var(--bg-elevated)]/60 border border-[var(--border-default)]/60 text-xs">
                    <div>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase block">
                        Estimated Audience
                      </span>
                      <span className="text-sm font-bold text-[var(--text-primary)] font-mono">
                        {c.followers || "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase block">
                        Eng. Benchmark
                      </span>
                      <span className="text-sm font-bold text-emerald-500 font-mono">
                        {c.engagement_rate || "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Brand Collaborations */}
                  {c.recent_collaborations?.length > 0 && (
                    <div>
                      <span className="text-[11px] text-[var(--text-tertiary)] font-medium block mb-1.5">
                        Recent Public Endorsements:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {c.recent_collaborations.map((brand, bIdx) => (
                          <span
                            key={bIdx}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium"
                          >
                            {brand}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risk Signals */}
                  {c.risk_signals?.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                      <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
                      <span>{c.risk_signals.join(" • ")}</span>
                    </div>
                  )}

                  {/* Card Actions (RULE standard: Secondary on LEFT, Primary on RIGHT) */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={() => setSelectedCreatorForChart(c)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border border-[var(--border-default)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <TrendingUp size={13} className="text-[#7C5CFF]" />
                      <span>D3 Performance</span>
                    </button>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => pipeToSupabase(c)}
                        title="Re-save to Supabase influencer_data"
                        className="p-1.5 rounded-xl border border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-emerald-500 hover:border-emerald-500/30 transition-colors"
                      >
                        <Database size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate(`/explore?q=${encodeURIComponent(c.name)}`)}
                        className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-[#7C5CFF] hover:bg-[#6A4BE8] text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Collaborate</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Web Grounding References */}
        {sources && sources.length > 0 && (
          <div className="bg-[var(--bg-elevated)]/40 border border-[var(--border-default)] rounded-2xl p-4 mt-6">
            <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 mb-2">
              <Globe size={13} className="text-indigo-400" />
              Live Google Search Grounding Citations:
            </span>
            <div className="flex flex-wrap gap-2">
              {sources.map((src, sIdx) => (
                <a
                  key={sIdx}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-indigo-400 hover:underline inline-flex items-center gap-1 bg-[var(--bg-card)] px-2.5 py-1 rounded-lg border border-[var(--border-default)]"
                >
                  <span className="truncate max-w-[200px]">{src.title || "Web Citation"}</span>
                  <ExternalLink size={10} />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
