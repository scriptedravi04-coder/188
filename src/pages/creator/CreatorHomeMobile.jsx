import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import PullToRefresh from "../../components/common/PullToRefresh";
import {
  Bell,
  MessageCircle,
  CheckCircle,
  Clock,
  Upload,
  Zap,
  Send,
  Package,
  CreditCard,
  Briefcase,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { CreatorHomeSkeleton } from "../../components/common/MobileSkeletons";

// Curated Fallback Banners with 2.2:1 aspect ratio matching design specs
const DEFAULT_HERO_BANNERS = [
  {
    id: "b1",
    title: "boAt Rockerz ANC Series",
    description: "Produce premium UGC for the new active noise cancelling series. Earn up to ₹25,000.",
    tag: "HIGH BUDGET",
    brand: "boAt Lifestyle",
    link: "/creator/ugc?tab=explore",
    image: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?q=80&w=800&auto=format&fit=crop",
    color: "#7C3AED",
  },
  {
    id: "b2",
    title: "Nike Pegasus 40 Launch",
    description: "Review & style the ultimate running shoes in your aesthetic. Receive free footwear + payout.",
    tag: "TRENDING",
    brand: "Nike India",
    link: "/campaigns",
    image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=800&auto=format&fit=crop",
    color: "#059669",
  },
  {
    id: "b3",
    title: "Mamaearth Pure Tea Tree",
    description: "Clean skincare campaign. Promote daily routines with real testimonials. Escrow pre-funded.",
    tag: "SAFE ESCROW",
    brand: "Mamaearth",
    link: "/creator/ugc?tab=explore",
    image: "https://images.unsplash.com/photo-1612817288484-6f916006741a?q=80&w=800&auto=format&fit=crop",
    color: "#D97706",
  },
];

// Rotating Trust & Value propositions (Zero Commission Line Rotation - Short, Cute, Perfectly Centered)
const TRUST_ITEMS = [
  { title: "Zero commission", text: "keep 100% of payout" },
  { title: "Guaranteed Escrow", text: "100% safe & secured" },
  { title: "Fast Milestone Approval", text: "direct bank payouts" },
  { title: "Direct Legal Contracts", text: "verified brands" },
  { title: "Instant UGC Payouts", text: "deliver & earn fast" },
];

// Fallback Featured Winning Creators matching design specs & Explore Creators aesthetics
const FEATURED_CREATORS = [
  {
    id: "c-bb",
    name: "Babu bhaiya",
    initials: "BB",
    photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #22C55E, #0EA5E9)",
    followers: "890K",
    niche: "Beauty",
    avgReach: "2.3M",
    verified: true,
  },
  {
    id: "c-db",
    name: "Devika Sharma",
    initials: "DS",
    photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=300&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #6366F1, #A78BFA)",
    followers: "195K",
    niche: "Health",
    avgReach: "412K",
    verified: true,
  },
  {
    id: "c-rv",
    name: "Rishi & Vini",
    initials: "RV",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=300&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #F59E0B, #F43F5E)",
    followers: "7.7M",
    niche: "Fashion",
    avgReach: "389K",
    verified: true,
  },
  {
    id: "c-ankit",
    name: "Ankit Roy",
    initials: "AR",
    photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=300&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #7C3AED, #C084FC)",
    followers: "250K",
    niche: "Travel",
    avgReach: "5.6M",
    verified: true,
  },
];

// Fallback Recommended Campaigns for New Creator (Screen B)
const FALLBACK_MATCHES = [
  {
    id: "m1",
    title: "Street-style apparel reel",
    brand: "cosmic eye",
    initials: "CE",
    payout: 10000,
    matchScore: 80,
  },
  {
    id: "m2",
    title: "WFH desk snack routine",
    brand: "Respiro",
    initials: "R",
    payout: 5500,
    matchScore: 74,
  },
  {
    id: "m3",
    title: "Morning hydration ritual",
    brand: "AquaVibe",
    initials: "AV",
    payout: 4200,
    matchScore: 68,
  },
];

export default function CreatorHomeMobile({ user: propUser }) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const user = propUser || authUser;

  // Real backend states
  const [banners, setBanners] = useState([]);
  const [currentBannerIdx, setCurrentBannerIdx] = useState(0);
  const [trustIdx, setTrustIdx] = useState(0);
  const [ugcOrders, setUgcOrders] = useState([]);
  const [realDeals, setRealDeals] = useState([]);
  const [recommendedCampaigns, setRecommendedCampaigns] = useState([]);
  const [campaignsMatchNiche, setCampaignsMatchNiche] = useState(null);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [kycStatus, setKycStatus] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const isMountedRef = useRef(true);

  // Carousel touch handlers
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Marquee pause on touch
  const [marqueePaused, setMarqueePaused] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Rotate Zero Commission / Trust lines periodically (like desktop mode TrustBadgeRotator)
  useEffect(() => {
    const timer = setInterval(() => {
      setTrustIdx((prev) => (prev + 1) % TRUST_ITEMS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  // Keep live time ticking every 15s for countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all operational collaboration updates
  const fetchHomeFeedData = useCallback(async (isSilent = false) => {
    if (!user) return;
    if (!isSilent) {
      setLoading(true);
    } else {
      setIsRefreshingFeed(true);
    }

    try {
      // Parallel fetch for ultra-fast response
      const [
        bannersRes,
        ordersRes,
        collabsRes,
        campsRes,
        kycRes,
        notifsRes,
        chatRes,
      ] = await Promise.all([
        api.get("banners?audience=creator").catch(() => ({ data: [] })),
        api.get("ugc/orders/creator").catch(() => ({ data: [] })),
        api.get("collabs").catch(() => ({ data: { sent: [], received: [], campaign_applications: [] } })),
        api.get("campaigns").catch(() => ({ data: [] })),
        api.get("verifications/me").catch(() => ({ data: null })),
        api.get("notifications").catch(() => ({ data: [] })),
        api.get("chat/v2/threads").catch(() => ({ data: [] })),
      ]);

      if (!isMountedRef.current) return;

      // 1. Live banners
      const bannersData = bannersRes?.data;
      if (Array.isArray(bannersData) && bannersData.length > 0) {
        const liveBanners = bannersData.filter(
          (b) =>
            (b.status === "Live" || b.active === true || !b.status) &&
            (b.type === "Common" || b.type === "Influencer" || b.type === "both" || b.type === "all" || !b.type)
        );
        setBanners(liveBanners.length > 0 ? liveBanners : []);
      } else {
        setBanners([]);
      }

      // 2. Creator UGC Orders (in-progress, deliverables, deadlines)
      const ordersData = ordersRes?.data;
      if (Array.isArray(ordersData)) {
        setUgcOrders(ordersData);
      }

      // 3. Deals / Collabs (sent, received, brand collaborations)
      const collabsData = collabsRes?.data;
      if (collabsData) {
        const sent = collabsData.sent || [];
        const received = collabsData.received || [];
        const allDeals = [...sent, ...received];
        setRealDeals(allDeals);
      }

      // 4. Campaigns for "Best matches" (Category based matching + Fallback to recent)
      const campsData = campsRes?.data;
      if (Array.isArray(campsData) && campsData.length > 0) {
        const activeCamps = campsData.filter(
          (c) => c.status === "live" || c.stage === "Live" || c.stage === "Under Review" || c.status === "published"
        );

        const userCat = (
          user?.category ||
          user?.primary_niche ||
          user?.niche ||
          (Array.isArray(user?.categories) ? user.categories[0] : user?.categories) ||
          ""
        ).trim().toLowerCase();

        let matched = [];
        if (userCat) {
          matched = activeCamps.filter((c) => {
            const cCat = (c.category || c.target_niche || c.niche || "").toLowerCase();
            const cTags = (Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || "")).toLowerCase();
            const cTitle = (c.title || c.campaign_name || "").toLowerCase();
            return cCat.includes(userCat) || userCat.includes(cCat) || cTags.includes(userCat) || cTitle.includes(userCat);
          });
        }

        if (matched.length > 0) {
          setCampaignsMatchNiche(userCat.charAt(0).toUpperCase() + userCat.slice(1));
          setRecommendedCampaigns(matched.slice(0, 4));
        } else {
          setCampaignsMatchNiche(null);
          setRecommendedCampaigns(activeCamps.slice(0, 4));
        }
      }

      // 5. KYC Status
      if (kycRes?.data) {
        setKycStatus(kycRes.data.status);
      }

      // 6. Notifications unread count
      const notifs = notifsRes?.data;
      if (Array.isArray(notifs)) {
        const unread = notifs.filter((n) => !n.read).length;
        setUnreadNotifications(unread);
      }

      // 7. Chat unread count
      const threads = chatRes?.data;
      if (Array.isArray(threads)) {
        const unread = threads.filter(
          (t) =>
            t.unread_creator ||
            t.unread === true ||
            (t.last_message_sender && t.last_message_sender !== user?.user_id && !t.read)
        ).length;
        setUnreadChatCount(unread);
      }

      // 8. Fetch Real Top Creators (Explore Page logic)
      let rawCreators = [];
      try {
        if (supabase) {
          const { data: sbCreators, error: sbErr } = await supabase
            .from("creator_profiles")
            .select("*");
          if (!sbErr && Array.isArray(sbCreators) && sbCreators.length > 0) {
            rawCreators = sbCreators;
          }
        }
      } catch (errSb) {
        console.warn("Supabase creator fetch notice:", errSb);
      }

      if (rawCreators.length === 0) {
        try {
          if (supabase) {
            const { data: appData, error: appErr } = await supabase
              .from("applications")
              .select("*");
            if (!appErr && Array.isArray(appData) && appData.length > 0) {
              rawCreators = appData;
            }
          }
        } catch (e) {
          console.warn("applications fallback notice:", e);
        }
      }

      if (rawCreators.length === 0) {
        const { data: apiCreators } = await api.get("creators").catch(() => ({ data: [] }));
        if (Array.isArray(apiCreators) && apiCreators.length > 0) {
          rawCreators = apiCreators;
        }
      }

      const approvedExploreCreators = (rawCreators || []).filter((c) => {
        if (c.is_deleted) return false;
        if ((c.user_id || c.id) === user?.user_id) return false;

        const pStatus = (c.profile_status || c.status || "").toLowerCase();
        const wStatus = (c.waitlist_status || "").toLowerCase();
        if (wStatus && wStatus !== "approved") return false;

        const isApproved = pStatus === "approved" || Boolean(c.verified || c.is_verified);
        if (!isApproved) return false;

        const name = (c.full_name || c.name || "").trim();
        return name.length > 1 && name.toLowerCase() !== "c" && !name.toLowerCase().startsWith("test");
      });

      if (isMountedRef.current && approvedExploreCreators.length > 0) {
        const filtered = approvedExploreCreators
          .sort((a, b) => {
            const reachA = Number(a.avg_reach_per_reel || a.avg_views_30d || a.avg_reach || a.reach || a.followers_count || a.performance_score || 0);
            const reachB = Number(b.avg_reach_per_reel || b.avg_views_30d || b.avg_reach || b.reach || b.followers_count || b.performance_score || 0);
            return reachB - reachA;
          })
          .slice(0, 10);

        const gradients = [
          "linear-gradient(135deg, #22C55E, #0EA5E9)",
          "linear-gradient(135deg, #6366F1, #A78BFA)",
          "linear-gradient(135deg, #F59E0B, #F43F5E)",
          "linear-gradient(135deg, #7C3AED, #C084FC)",
        ];

        const formatted = filtered.map((c, i) => {
          const followersNum = Number(c.followers_count || (c.followers_instagram || 0) + (c.followers_youtube || 0) || 25000);
          const followersStr =
            followersNum >= 1000000
              ? `${(followersNum / 1000000).toFixed(1)}M`
              : followersNum >= 1000
              ? `${Math.round(followersNum / 1000)}K`
              : `${followersNum}`;

          const reachNum = Number(c.avg_reach_per_reel || c.avg_views_30d || c.avg_reach || c.reach || c.profile_reach || followersNum * 2.2);
          const reachStr =
            reachNum >= 1000000
              ? `${(reachNum / 1000000).toFixed(1)}M`
              : reachNum >= 1000
              ? `${Math.round(reachNum / 1000)}K`
              : `${reachNum}`;

          const name = c.name || c.full_name || c.display_name || "Top Creator";
          const initials = name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const photo = c.photo || c.profile_photo_url || c.picture || c.avatar || c.profile_pic || null;

          return {
            id: c.user_id || c.id,
            name,
            initials: initials || "CR",
            photo,
            gradient: gradients[i % gradients.length],
            followers: followersStr,
            niche: c.category || c.primary_niche || c.niche || "Creator",
            avgReach: reachStr,
            verified: Boolean(c.verified || c.is_verified || followersNum > 50000),
          };
        });

        setFeaturedCreators(formatted);
      } else if (isMountedRef.current) {
        setFeaturedCreators([]);
      }

      setNow(Date.now());
      setLastRefreshedAt(new Date());

      if (isSilent) {
        const totalCollabs = (collabsRes?.data?.sent?.length || 0) + (collabsRes?.data?.received?.length || 0);
        const totalOrders = ordersRes?.data?.length || 0;
        console.log(`[PullToRefresh] Home feed refreshed: ${totalCollabs} deals, ${totalOrders} UGC orders active.`);
      }
    } catch (err) {
      console.warn("Silent failure loading mobile home data", err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setIsRefreshingFeed(false);
      }
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    fetchHomeFeedData(false);
  }, [fetchHomeFeedData]);

  // Explicit pull to refresh trigger handler
  const handlePullRefresh = useCallback(async () => {
    await fetchHomeFeedData(true);
  }, [fetchHomeFeedData]);

  // Banner Auto-slider (every 4 seconds)
  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Handle banner swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 50) {
      // swipe left -> next
      setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
    } else if (diff < -50) {
      // swipe right -> prev
      setCurrentBannerIdx((prev) => (prev - 1 + banners.length) % banners.length);
    }
  };

  // Profile completion status
  const isKycApproved = user?.kyc_verified || kycStatus === "approved" || kycStatus === "APPROVED";
  const isKycPending = kycStatus === "pending" || kycStatus === "PENDING" || kycStatus === "UNDER_REVIEW";
  const isProfileComplete = Boolean(user?.profile_completed);
  const showCompleteProfile = !isKycApproved || !isProfileComplete;

  // Calculate profile completion percentage
  const profileCompletionPercentage = useMemo(() => {
    let score = 20; // Base signup
    if (user?.bio || user?.description) score += 20;
    if (user?.category || (user?.categories && user.categories.length > 0)) score += 20;
    if (user?.instagram || user?.youtube || user?.social_accounts) score += 20;
    if (isKycApproved) score += 20;
    else if (isKycPending) score += 10;
    return Math.min(score, 90);
  }, [user, isKycApproved, isKycPending]);

  // Active UGC Orders: filter orders that are claimed and actively in progress / revision requested
  const activeUgcOrders = useMemo(() => {
    return ugcOrders.filter((order) => {
      const stage = (order.stage || order.status || "").toUpperCase();
      const creatorStatus = (order.creator_status || "").toUpperCase();
      // Only show if claimed / in progress / revision requested
      const isClaimedOrInProgress =
        stage === "IN_PROGRESS" ||
        stage === "CLAIMED" ||
        stage === "REVISION_REQUESTED" ||
        creatorStatus === "IN_PROGRESS" ||
        creatorStatus === "CLAIMED" ||
        creatorStatus === "REVISION_REQUESTED";

      const isFinished =
        stage === "COMPLETED" ||
        stage === "DELIVERED" ||
        stage === "IN_REVIEW" ||
        stage === "SUBMITTED" ||
        creatorStatus === "SUBMITTED" ||
        creatorStatus === "COMPLETED";

      return isClaimedOrInProgress && !isFinished;
    });
  }, [ugcOrders]);

  // Earliest deadline UGC order for the Live Timer
  const nearestUgcOrder = useMemo(() => {
    if (activeUgcOrders.length === 0) return null;
    return [...activeUgcOrders].sort((a, b) => {
      const timeA = new Date(a.sla_expires_at || a.deadline || a.internal_deadline || Date.now() + 86400000).getTime();
      const timeB = new Date(b.sla_expires_at || b.deadline || b.internal_deadline || Date.now() + 86400000).getTime();
      return timeA - timeB;
    })[0];
  }, [activeUgcOrders]);

  // Calculate UGC Countdown and Urgency Styling
  const ugcCountdown = useMemo(() => {
    if (!nearestUgcOrder) return null;
    const deadlineMs = new Date(
      nearestUgcOrder.sla_expires_at ||
        nearestUgcOrder.deadline ||
        nearestUgcOrder.internal_deadline ||
        nearestUgcOrder.created_at
        ? new Date(nearestUgcOrder.created_at).getTime() + 86400000
        : Date.now() + 14 * 3600000 + 22 * 60000
    ).getTime();

    const diff = deadlineMs - now;
    if (diff <= 0) {
      return {
        formatted: "0h 00m",
        formattedDeadline: "Overdue",
        color: "#DC2626", // Red
        fillPercent: 100,
        hoursLeft: 0,
      };
    }

    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const totalHours = diff / 3600000;

    // Color: >6h green (#16A34A), 2–6h amber (#D97706), <2h red (#DC2626)
    let color = "#16A34A";
    if (totalHours < 2) color = "#DC2626";
    else if (totalHours < 6) color = "#D97706";

    // Format deadline date / time e.g. "4:00 PM tomorrow"
    const d = new Date(deadlineMs);
    const hoursStr = d.getHours() % 12 || 12;
    const minutesStr = d.getMinutes().toString().padStart(2, "0");
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    const isTomorrow = d.getDate() !== new Date().getDate();
    const formattedDeadline = `${hoursStr}:${minutesStr} ${ampm} ${isTomorrow ? "tomorrow" : "today"}`;

    // Fill percent for the ring (out of 24h)
    const fillPercent = Math.min(100, Math.max(10, Math.round((diff / (24 * 3600000)) * 100)));

    return {
      formatted: `${hours}h ${mins}m`,
      formattedDeadline,
      color,
      fillPercent,
      hoursLeft: totalHours,
    };
  }, [nearestUgcOrder, now]);

  // Active Deals
  const hasAnyDeals = realDeals.length > 0;
  const activeDealsList = useMemo(() => {
    if (!hasAnyDeals) return [];
    return realDeals.slice(0, 3).map((d) => {
      let friendlyStatus = "IN PROGRESS";
      let statusColor = "bg-[#FEF3C7] text-[#B45309]"; // amber
      const s = (d.status || d.stage || "").toLowerCase();

      if (s.includes("review") || s.includes("pending")) {
        friendlyStatus = "PENDING REVIEW";
        statusColor = "bg-[#E9F7F0] text-[#047857]"; // emerald
      } else if (s.includes("complete") || s.includes("paid") || s.includes("delivered")) {
        friendlyStatus = "COMPLETED";
        statusColor = "bg-[#ECFDF5] text-[#065F46]"; // green
      }

      const brandName = d.brand_name || d.company || "Brand Partner";
      const initials = brandName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const amount = d.agreed_rate || d.budget || d.amount || 10000;

      return {
        id: d.id,
        brand: brandName,
        initials: initials || "BP",
        deliverable: d.deliverables || d.campaign_name || d.title || "Campaign Sponsorship",
        amount: `₹${Number(amount).toLocaleString("en-IN")}`,
        status: friendlyStatus,
        statusColor,
      };
    });
  }, [realDeals, hasAnyDeals]);

  // Greeting based on time of day or welcome for new creator
  const greeting = useMemo(() => {
    if (!hasAnyDeals && activeUgcOrders.length === 0) {
      return "Welcome to YBEX";
    }
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  }, [hasAnyDeals, activeUgcOrders.length]);

  const userName = user?.name || user?.full_name || user?.username || "Creator";
  const userInitial = (userName[0] || "C").toUpperCase();

  const lastUpdatedText = useMemo(() => {
    if (!lastRefreshedAt) return "Live";
    const diffSec = Math.floor((now - lastRefreshedAt.getTime()) / 1000);
    if (diffSec < 45) return "Just updated";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    return "Synced";
  }, [lastRefreshedAt, now]);

  // Active banner
  const activeBanner = banners[currentBannerIdx] || banners[0] || DEFAULT_HERO_BANNERS[0];

  if (loading) {
    return <CreatorHomeSkeleton />;
  }

  return (
    <PullToRefresh
      onRefresh={handlePullRefresh}
      isRefreshing={isRefreshingFeed}
      pullingText="Pull down to refresh"
      releaseText="Release to sync collaborations"
      refreshingText="Fetching latest collaboration updates..."
      successText="Collaboration updates synced"
      lastUpdatedText={lastUpdatedText}
      className="w-full min-h-screen bg-[#EFE6FF]"
    >
      <div className="w-full min-h-screen bg-[#F4F4F8] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-28 select-none">
        {/* 1 · Header U-Box with Banner */}
        <div
          style={{
            position: "relative",
            flexShrink: 0,
            background:
              "radial-gradient(120% 70% at 85% 0%, #DCCBFF 0%, rgba(220,203,255,0) 60%), radial-gradient(90% 60% at 0% 30%, #F1E8FF 0%, rgba(241,232,255,0) 70%), linear-gradient(180deg, #EFE6FF 0%, #F6F1FF 100%)",
            borderRadius: "0 0 32px 32px",
            borderBottom: "1px solid #E7DCFF",
            paddingBottom: "32px",
            paddingTop: "14px",
          }}
        >
          {/* Elastic overscroll background extension so pulling down never reveals any cut or blank gap */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "-500px",
              height: "500px",
              background: "#EFE6FF",
              backgroundImage:
                "radial-gradient(120% 70% at 85% 100%, #DCCBFF 0%, rgba(220,203,255,0) 60%), radial-gradient(90% 60% at 0% 100%, #F1E8FF 0%, rgba(241,232,255,0) 70%), linear-gradient(180deg, #EFE6FF 0%, #EFE6FF 100%)",
              pointerEvents: "none",
            }}
          />
          {/* User Greeting & Header Actions Row */}
          <div
            style={{
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              gap: "11px",
            }}
          >
            {/* Creator Avatar -> opens profile */}
            <button
              type="button"
              onClick={() => navigate("/creator/profile")}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "20px",
                background: "linear-gradient(135deg, #7C3AED, #C084FC)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "700 14px 'DM Sans', sans-serif",
                color: "#fff",
                overflow: "hidden",
                border: "none",
                cursor: "pointer",
              }}
              aria-label="View Profile"
            >
              {user?.profile_image || user?.avatar ? (
                <img
                  src={user.profile_image || user.avatar}
                  alt={userName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{userInitial}</span>
              )}
            </button>

            {/* Greeting text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "500 11.5px 'DM Sans', sans-serif", color: "#6B7280", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>{greeting}</span>
                <span style={{ fontSize: "9px", color: "#9CA3AF" }}>•</span>
                <span style={{ fontSize: "10.5px", color: "#7C3AED", fontWeight: 600 }}>
                  {lastUpdatedText}
                </span>
              </div>
              <div
                style={{
                  font: "700 17px 'DM Sans', sans-serif",
                  letterSpacing: "-0.4px",
                  color: "#0A0A0A",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {userName}
              </div>
            </div>

            {/* Refresh / Sync Manual Button */}
            <button
              type="button"
              onClick={handlePullRefresh}
              disabled={isRefreshingFeed}
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "13px",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: "none",
                cursor: "pointer",
              }}
              aria-label="Refresh Collaboration Updates"
              title="Fetch Latest Collaboration Updates"
            >
              <RefreshCw
                size={16}
                strokeWidth={2}
                color={isRefreshingFeed ? "#7C3AED" : "#1F2937"}
                className={isRefreshingFeed ? "animate-spin" : ""}
              />
            </button>

            {/* Notification Bell -> opens notifications */}
          <button
            type="button"
            onClick={() => navigate("/creator/notifications")}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "13px",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              flexShrink: 0,
              border: "none",
              cursor: "pointer",
            }}
            aria-label="Notifications"
          >
            <Bell size={17} strokeWidth={1.9} color="#1F2937" />
            {unreadNotifications > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  height: "17px",
                  padding: "0 5px",
                  borderRadius: "9px",
                  background: "#7C3AED",
                  display: "flex",
                  alignItems: "center",
                  font: "700 9.5px 'DM Sans', sans-serif",
                  color: "#fff",
                  border: "1.5px solid #fff",
                }}
              >
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </div>
            )}
          </button>
        </div>

        {/* 7 · Banner Carousel Inside U-Box (Clean Graphic Banner with Automatic Rotation & Zero-Cutoff Jugaad) */}
        {banners.length > 0 && activeBanner && (
          <div
            style={{
              margin: "12px 14px 0",
              borderRadius: "20px",
              overflow: "hidden",
              background: "#09090B",
              border: "1px solid #E7DCFF",
              boxShadow: "0 14px 28px -20px rgba(76,29,149,0.45)",
              position: "relative",
              cursor: "pointer",
            }}
            className="aspect-[2.9/1] min-h-[112px] flex items-center justify-center"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={() => navigate(activeBanner.link || "/creator/ugc?tab=explore")}
          >
            {/* Ambient blurred backdrop so any aspect ratio blends seamlessly without letterbox bars */}
            <img
              src={activeBanner.image || activeBanner.banner_image || activeBanner.cover_image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-75"
            />
            {/* Foreground Banner - object-contain ensures 100% of text and graphics remain intact */}
            <img
              src={activeBanner.image || activeBanner.banner_image || activeBanner.cover_image}
              alt={activeBanner.title || "Banner"}
              className="relative z-10 w-full h-full object-contain"
            />
          </div>
        )}

        {/* Cute, Compact, Centered Rotating Trust Line */}
        <div
          style={{
            margin: "9px 14px 0",
            height: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={trustIdx}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#16A34A" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M10.6 16.4l-3.8-3.8 1.3-1.3 2.5 2.5 5.3-5.3 1.3 1.3z" fill="#fff" />
              </svg>
              <span style={{ font: "700 11px 'DM Sans', sans-serif", color: "#15803D" }}>
                {TRUST_ITEMS[trustIdx]?.title || "Zero commission"}
              </span>
              <span style={{ font: "500 11px 'DM Sans', sans-serif", color: "#6B7280" }}>
                · {TRUST_ITEMS[trustIdx]?.text || "keep 100% of payout"}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* 2 · Quick Bar (Compact margin, balanced spacing) */}
      <div
        style={{
          flexShrink: 0,
          margin: "-22px 14px 0",
          background: "#fff",
          borderRadius: "22px",
          border: "1px solid #ECE7F7",
          boxShadow: "0 18px 34px -26px rgba(76,29,149,0.55)",
          padding: "13px 4px 12px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Shortcut 1: Campaigns */}
        <button
          type="button"
          onClick={() => navigate("/campaigns")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "16px",
              background: "#F3EDFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#7C3AED"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 11l16-7-3 16-4.5-5z" />
              <path d="M11.5 15L8 19v-5" />
            </svg>
          </div>
          <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#1F2937" }}>
            Campaigns
          </span>
        </button>

        {/* Shortcut 2: Insta UGC (with NEW badge) */}
        <button
          type="button"
          onClick={() => navigate("/creator/ugc?tab=manage")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "16px",
              background: "#FFF1E6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EA580C"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
            </svg>
            <div
              style={{
                position: "absolute",
                top: "-6px",
                left: "50%",
                transform: "translateX(-50%)",
                height: "16px",
                padding: "0 6px",
                borderRadius: "8px",
                background: "#0A0A0A",
                display: "flex",
                alignItems: "center",
                font: "800 8.5px 'DM Sans', sans-serif",
                letterSpacing: "0.5px",
                color: "#fff",
              }}
            >
              NEW
            </div>
          </div>
          <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#1F2937" }}>
            Insta UGC
          </span>
        </button>

        {/* Shortcut 3: My orders (with active orders count badge) */}
        <button
          type="button"
          onClick={() => navigate("/creator/ugc?tab=orders")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "16px",
              background: "#E9F7F0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="7" width="18" height="13" rx="2.5" />
              <path d="M8 7V5.5A2.5 2.5 0 0110.5 3h3A2.5 2.5 0 0116 5.5V7" />
            </svg>
            {activeUgcOrders.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "-5px",
                  right: "-5px",
                  minWidth: "18px",
                  height: "18px",
                  padding: "0 4px",
                  boxSizing: "border-box",
                  borderRadius: "9px",
                  background: "#F43F5E",
                  border: "2px solid #fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "700 9.5px 'DM Sans', sans-serif",
                  color: "#fff",
                }}
              >
                {activeUgcOrders.length}
              </div>
            )}
          </div>
          <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#1F2937" }}>
            My orders
          </span>
        </button>

        {/* Shortcut 4: Earnings */}
        <button
          type="button"
          onClick={() => navigate("/earnings")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "16px",
              background: "#EEF2FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4F46E5"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="6" width="19" height="13" rx="3" />
              <path d="M2.5 10h19" />
              <path d="M16 14.5h2.5" />
            </svg>
          </div>
          <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#1F2937" }}>
            Earnings
          </span>
        </button>
      </div>

      {/* 3 · UGC Live Timer (Spec 3: padding: 14px 14px 0, ONLY FOR UGC IN PROGRESS) */}
      {nearestUgcOrder && ugcCountdown && (
        <div style={{ flexShrink: 0, padding: "14px 14px 0" }}>
          <div
            style={{
              background: "#fff",
              border: "1.5px solid #BBF7D0",
              borderRadius: "20px",
              padding: "12px",
              boxShadow: "0 14px 28px -24px rgba(5,150,105,0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Conic Timer Ring */}
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "26px",
                  background: `conic-gradient(${ugcCountdown.color} 0% ${ugcCountdown.fillPercent}%, #E7F5EC ${ugcCountdown.fillPercent}% 100%)`,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "21px",
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={ugcCountdown.color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2.5 1.5" />
                    <path d="M9.5 2.5h5" />
                  </svg>
                </div>
              </div>

              {/* Countdown & Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "3px",
                      background: "#16A34A",
                      animation: "pulse 1.4s infinite",
                    }}
                  />
                  <span
                    style={{
                      font: "800 9.5px 'DM Sans', sans-serif",
                      letterSpacing: "0.9px",
                      color: "#15803D",
                    }}
                  >
                    UGC LIVE · UPLOAD IN
                  </span>
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    font: "800 22px/1.1 'DM Sans', sans-serif",
                    letterSpacing: "-0.8px",
                    color: "#0A0A0A",
                  }}
                >
                  {ugcCountdown.formatted}
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    font: "500 11px 'DM Sans', sans-serif",
                    color: "#6B7280",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {nearestUgcOrder.brief?.title || "Quick unboxing"} ·{" "}
                  {nearestUgcOrder.brief?.brand_name || "Brand Partner"} · ₹
                  {Number(nearestUgcOrder.creator_payout || nearestUgcOrder.brief?.budget || 3300).toLocaleString("en-IN")}
                </div>
              </div>

              {/* Primary Action Button (Right Aligned per Architecture Rule) */}
              <button
                type="button"
                onClick={() =>
                  navigate(`/creator/ugc?tab=manage&orderId=${nearestUgcOrder.id}`)
                }
                style={{
                  height: "40px",
                  padding: "0 14px",
                  borderRadius: "13px",
                  background: "#7C3AED",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexShrink: 0,
                  boxShadow: "0 10px 20px -12px rgba(124,58,237,1)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 16V4" />
                  <path d="M7.5 8.5L12 4l4.5 4.5" />
                  <path d="M4 17v2.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V17" />
                </svg>
                <span style={{ font: "700 12.5px 'DM Sans', sans-serif", color: "#fff" }}>
                  Upload
                </span>
              </button>
            </div>

            {/* Bottom Dashed Row */}
            <div
              style={{
                marginTop: "11px",
                paddingTop: "10px",
                borderTop: "1px dashed #E5E7EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ font: "500 11px 'DM Sans', sans-serif", color: "#6B7280" }}>
                Submit before{" "}
                <b style={{ color: "#0A0A0A", fontWeight: 700 }}>
                  {ugcCountdown.formattedDeadline}
                </b>
              </span>
              {activeUgcOrders.length > 1 && (
                <button
                  type="button"
                  onClick={() => navigate("/creator/ugc?tab=manage")}
                  style={{
                    font: "600 11px 'DM Sans', sans-serif",
                    color: "#7C3AED",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  +{activeUgcOrders.length - 1} more UGC
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4 · Complete Your Profile (Spec 4: padding: 14px 14px 0, CONDITIONAL) */}
      {showCompleteProfile && (
        <div style={{ flexShrink: 0, padding: "14px 14px 0" }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #E6E6EE",
              borderRadius: "18px",
              padding: "11px 12px",
              display: "flex",
              alignItems: "center",
              gap: "11px",
            }}
          >
            {/* Completion Percentage Ring */}
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "20px",
                background: `conic-gradient(#7C3AED 0% ${profileCompletionPercentage}%, #EDE4FF ${profileCompletionPercentage}% 100%)`,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "16px",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "700 10px 'DM Sans', sans-serif",
                  color: "#7C3AED",
                }}
              >
                {profileCompletionPercentage}%
              </div>
            </div>

            {/* Description */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 13.5px 'DM Sans', sans-serif", color: "#0A0A0A" }}>
                Complete your profile
              </div>
              <div
                style={{
                  marginTop: "2px",
                  font: "400 11px 'DM Sans', sans-serif",
                  color: "#6B7280",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {isKycPending
                  ? "KYC under review · verification in progress"
                  : !isKycApproved
                  ? "KYC pending · brands can't pay you yet"
                  : "Finish profile details to attract top brand deals"}
              </div>
            </div>

            {/* Finish CTA Button (Right Aligned per Architecture Rule) */}
            <button
              type="button"
              onClick={() => {
                if (isKycPending) {
                  navigate("/kyc/status");
                } else if (!isKycApproved) {
                  navigate("/creator/kyc");
                } else {
                  navigate("/creator/profile");
                }
              }}
              style={{
                height: "32px",
                padding: "0 13px",
                borderRadius: "11px",
                background: "#7C3AED",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                font: "600 11.5px 'DM Sans', sans-serif",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Finish
            </button>
          </div>
        </div>
      )}

      {/* 5 · Active Deals vs Best Matches (Spec 5: Existing creator vs New creator) */}
      {hasAnyDeals ? (
        /* Scenario A: Existing creator — Your Active Deals */
        <div style={{ flexShrink: 0, paddingTop: "16px" }}>
          <div
            style={{
              padding: "0 14px",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                font: "700 16px 'DM Sans', sans-serif",
                letterSpacing: "-0.4px",
                color: "#0A0A0A",
              }}
            >
              Your Active Deals
            </span>
            <button
              type="button"
              onClick={() => navigate("/creator/deals")}
              style={{
                font: "600 12px 'DM Sans', sans-serif",
                color: "#7C3AED",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              View All
            </button>
          </div>

          <div
            style={{
              padding: "9px 14px 0",
              display: "flex",
              flexDirection: "column",
              gap: "7px",
            }}
          >
            {activeDealsList.map((deal) => (
              <div
                key={deal.id}
                onClick={() => navigate(`/creator/deals`)}
                style={{
                  background: "#fff",
                  border: "1px solid #E6E6EE",
                  borderRadius: "18px",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  cursor: "pointer",
                }}
              >
                {/* Brand Monogram */}
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "18px",
                    background: "#F2F2F7",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    font: "700 11px 'DM Sans', sans-serif",
                    color: "#4B5563",
                  }}
                >
                  {deal.initials}
                </div>

                {/* Brand name + Deliverable */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 13.5px 'DM Sans', sans-serif", color: "#0A0A0A" }}>
                    {deal.brand}
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      font: "400 11.5px 'DM Sans', sans-serif",
                      color: "#6B7280",
                    }}
                  >
                    {deal.deliverable}
                  </div>
                </div>

                {/* Payout & Status Badge */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ font: "700 14px 'DM Sans', sans-serif", color: "#0A0A0A" }}>
                    {deal.amount}
                  </div>
                  <div
                    className={`mt-1 h-5 px-2 rounded-[6px] flex items-center font-bold text-[9.5px] tracking-[0.4px] uppercase ${deal.statusColor}`}
                  >
                    {deal.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Scenario B: New creator — Best matches for your profile */
        <div style={{ flexShrink: 0, paddingTop: "16px" }}>
          <div
            style={{
              padding: "0 14px",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                font: "700 16px 'DM Sans', sans-serif",
                letterSpacing: "-0.4px",
                color: "#0A0A0A",
              }}
            >
              {campaignsMatchNiche
                ? `Best matches for ${campaignsMatchNiche}`
                : "Best matches for your profile"}
            </span>
            <button
              type="button"
              onClick={() => navigate("/campaigns")}
              style={{
                font: "600 12px 'DM Sans', sans-serif",
                color: "#7C3AED",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              View all
            </button>
          </div>

          <div
            style={{
              padding: "9px 14px 0",
              display: "flex",
              flexDirection: "column",
              gap: "7px",
            }}
          >
            {(recommendedCampaigns.length > 0
              ? recommendedCampaigns
              : FALLBACK_MATCHES
            ).map((camp, idx) => {
              const brandName = camp.brand_name || camp.company || camp.brand || "Brand";
              const title = camp.title || camp.campaign_name || "Social Media Campaign";
              const initials = brandName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const payout = camp.budget || camp.budget_per_creator || camp.price_range || camp.payout || 10000;
              const matchScore = camp.matchScore || (campaignsMatchNiche ? 95 - idx * 4 : 80 - idx * 6);

              return (
                <div
                  key={camp.id || camp.campaign_id || idx}
                  onClick={() =>
                    navigate(camp.id || camp.campaign_id ? `/campaigns/${camp.id || camp.campaign_id}` : "/campaigns")
                  }
                  style={{
                    background: "#fff",
                    border: "1px solid #E6E6EE",
                    borderRadius: "18px",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "11px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "18px",
                      background: "#F2F2F7",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "700 11px 'DM Sans', sans-serif",
                      color: "#4B5563",
                    }}
                  >
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        font: "600 13.5px 'DM Sans', sans-serif",
                        color: "#0A0A0A",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {title}
                    </div>
                    <div
                      style={{
                        marginTop: "2px",
                        font: "400 11.5px 'DM Sans', sans-serif",
                        color: "#6B7280",
                      }}
                    >
                      {brandName} · ₹{Number(payout).toLocaleString("en-IN")}
                    </div>
                  </div>

                  {/* Match Score Pill */}
                  <div
                    style={{
                      height: "22px",
                      padding: "0 8px",
                      borderRadius: "7px",
                      background: "#F3EDFF",
                      display: "flex",
                      alignItems: "center",
                      font: "700 10px 'DM Sans', sans-serif",
                      color: "#7C3AED",
                      flexShrink: 0,
                    }}
                  >
                    {matchScore}% MATCH
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6 · Creators Like You, Winning on YBEX (Strictly ONLY approved creators visible on Explore page) */}
      {featuredCreators.length > 0 && (
        <div style={{ flexShrink: 0, paddingTop: "18px" }}>
          <div
            style={{
              padding: "0 14px",
              font: "700 16px 'DM Sans', sans-serif",
              letterSpacing: "-0.4px",
              color: "#0A0A0A",
            }}
          >
            Creators like you, winning on YBEX
          </div>

          {/* Horizontal Marquee / Scroll Container */}
          <div
            style={{
              padding: "9px 0 18px 14px",
              display: "flex",
              gap: "8px",
              overflowX: "auto",
            }}
            className="no-scrollbar scroll-smooth"
            onTouchStart={() => setMarqueePaused(true)}
            onTouchEnd={() => setMarqueePaused(false)}
            onMouseEnter={() => setMarqueePaused(true)}
            onMouseLeave={() => setMarqueePaused(false)}
          >
            {featuredCreators.map((creator) => (
              <div
                key={creator.id}
                onClick={() => navigate(`/creator/${creator.id}`)}
                style={{
                  width: "214px",
                  flexShrink: 0,
                  background: "#fff",
                  border: "1px solid #E6E6EE",
                  borderRadius: "18px",
                  padding: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  cursor: "pointer",
                }}
              >
                {/* Creator Avatar with Photo or Vibrant Gradient */}
                <div
                  style={{
                    width: "54px",
                    height: "54px",
                    borderRadius: "16px",
                    flexShrink: 0,
                    overflow: "hidden",
                    background: creator.gradient || "linear-gradient(135deg, #7C3AED, #C084FC)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    font: "700 16px 'DM Sans', sans-serif",
                    color: "#fff",
                  }}
                >
                  {creator.photo ? (
                    <img
                      src={creator.photo}
                      alt={creator.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    creator.initials
                  )}
                </div>

                {/* Creator Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span
                      style={{
                        font: "600 13px 'DM Sans', sans-serif",
                        color: "#0A0A0A",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {creator.name}
                    </span>
                    {creator.verified && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#7C3AED" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M10.6 16.4l-3.8-3.8 1.3-1.3 2.5 2.5 5.3-5.3 1.3 1.3z" fill="#fff" />
                      </svg>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: "2px",
                      font: "400 11px 'DM Sans', sans-serif",
                      color: "#6B7280",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {creator.followers} followers · {creator.niche}
                  </div>

                  <div
                    style={{
                      marginTop: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <span style={{ font: "700 11.5px 'DM Sans', sans-serif", color: "#047857" }}>
                      {creator.avgReach}
                    </span>
                    <span style={{ font: "500 10.5px 'DM Sans', sans-serif", color: "#9CA3AF" }}>
                      avg reach
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </PullToRefresh>
  );
}
