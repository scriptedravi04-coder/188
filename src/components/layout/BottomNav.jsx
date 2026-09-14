import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Briefcase,
  Search,
  MessageCircle,
  User,
  LayoutGrid,
  Megaphone,
  ShoppingBag,
  Users,
  ShieldAlert,
  Wallet,
  HelpCircle,
} from "lucide-react";

/**
 * BottomNav Component — Mobile Only
 * Spec:
 * - Fixed bottom, full width, 84px height (including safe-area inset)
 * - rgba(255, 255, 255, 0.94) + 16px backdrop blur, 1px top border #E5E5E2
 * - Equal flex tabs, icon 22px above a 10px label, 5px gap, min 44px hit target
 * - Role-based tabs: "creator" | "brand" | "admin"
 * - Active state dynamic from router
 * - Raised center for Creator Explore tab (46px, -18px offset)
 * - Re-tap on active tab scrolls page to top
 */
export default function BottomNav({
  role = "creator",
  hasPendingWork = false,
  activeThreadsCount = 0,
  className = "",
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  // Define tab sets for each role according to the design specification
  const getTabsForRole = () => {
    if (role === "brand") {
      return [
        {
          id: "dashboard",
          label: "Dashboard",
          icon: LayoutGrid,
          path: "/brand",
          matches: (path) =>
            path === "/brand" ||
            path === "/brand/dashboard" ||
            (path === "/dashboard" && role === "brand"),
        },
        {
          id: "campaigns",
          label: "Campaigns",
          icon: Megaphone,
          path: "/brand/campaigns",
          matches: (path) =>
            path === "/brand/campaigns" ||
            path.startsWith("/brand/campaigns/") ||
            path.startsWith("/brand/ugc"),
        },
        {
          id: "discover",
          label: "Discover",
          icon: Search,
          path: "/brand/discover",
          matches: (path) =>
            path === "/brand/discover" ||
            path === "/creators" ||
            path.startsWith("/creator/"),
          isRaised: false, // Flat tab for brand as per spec
        },
        {
          id: "inbox",
          label: "Inbox",
          icon: MessageCircle,
          path: "/brand/inbox",
          matches: (path) =>
            path === "/brand/inbox" ||
            path.startsWith("/brand/inbox/") ||
            path.startsWith("/chat"),
          badgeCount: activeThreadsCount,
        },
        {
          id: "brand",
          label: "Brand",
          icon: ShoppingBag,
          path: "/brand/account",
          matches: (path) =>
            path === "/brand/account" ||
            path === "/brand/settings" ||
            path === "/brand/profile" ||
            path === "/brand/payments" ||
            path === "/brand/kyc" ||
            (path === "/settings" && role === "brand"),
        },
      ];
    }

    if (role === "admin" || role === "sub_admin") {
      return [
        {
          id: "overview",
          label: "Overview",
          icon: LayoutGrid,
          path: "/admin?tab=dashboard",
          matches: (path) => path.startsWith("/admin") && (!location.search || location.search.includes("tab=dashboard")),
        },
        {
          id: "users",
          label: "Users",
          icon: Users,
          path: "/admin?tab=users",
          matches: (path) => path.includes("tab=users"),
        },
        {
          id: "kyc",
          label: "KYC",
          icon: ShieldAlert,
          path: "/admin?tab=verifications",
          matches: (path) => path.includes("tab=verifications"),
        },
        {
          id: "escrow",
          label: "Escrow",
          icon: Wallet,
          path: "/admin?tab=escrow",
          matches: (path) => path.includes("tab=escrow"),
        },
        {
          id: "helpdesk",
          label: "Helpdesk",
          icon: HelpCircle,
          path: "/admin?tab=helpdesk",
          matches: (path) => path.includes("tab=helpdesk"),
        },
      ];
    }

    // Default: Creator (5 Tabs)
    return [
      {
        id: "home",
        label: "Home",
        icon: Home,
        path: "/dashboard",
        matches: (path) => path === "/dashboard" || path === "/",
      },
      {
        id: "deals",
        label: "My Work",
        icon: Briefcase,
        path: "/deals",
        matches: (path) =>
          path === "/deals" ||
          path === "/collabs" ||
          path.startsWith("/deals/") ||
          path.startsWith("/creator/deals") ||
          path === "/creator/ugc/orders",
        badge: hasPendingWork,
      },
      {
        id: "explore",
        label: "Explore",
        icon: Search,
        path: "/explore",
        matches: (path) =>
          path === "/explore" ||
          path === "/creators" ||
          path === "/campaigns" ||
          path.startsWith("/campaigns/") ||
          path === "/creator/ugc" ||
          path === "/creator/ugc/browse" ||
          path === "/ugc" ||
          path === "/ugc-orders" ||
          path === "/creator-campaign-flow",
        isRaised: true, // Raised centre for Creator only (46px, -18px offset)
      },
      {
        id: "chat",
        label: "Chat",
        icon: MessageCircle,
        path: "/inbox",
        matches: (path) =>
          path === "/inbox" ||
          path === "/chat" ||
          path.startsWith("/chat/"),
        badgeCount: activeThreadsCount,
      },
      {
        id: "profile",
        label: "Profile",
        icon: User,
        path: "/profile",
        matches: (path) =>
          path === "/profile" ||
          path === "/creator/settings" ||
          path === "/creator/profile" ||
          path === "/profile/overview" ||
          path === "/settings" ||
          path === "/earnings" ||
          path === "/refer" ||
          path === "/creator/kyc" ||
          path === "/kyc" ||
          path === "/kyc/status" ||
          path.startsWith("/help"),
      },
    ];
  };

  const tabs = getTabsForRole();

  // Scroll to top helper on re-tap
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Also scroll any active container
    const scrollContainers = document.querySelectorAll(
      ".overflow-y-auto, main, #root"
    );
    scrollContainers.forEach((el) => {
      try {
        el.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {}
    });
  };

  const handleTabClick = (tab, isActive) => {
    if (tab.id === "profile") {
      window.dispatchEvent(new CustomEvent("reset-mobile-profile-hub"));
      if (isActive) {
        if (location.search || (location.pathname !== "/profile" && location.pathname !== "/creator/settings")) {
          navigate("/profile");
        }
        scrollToTop();
      } else {
        navigate(tab.path);
      }
      return;
    }

    if (isActive) {
      scrollToTop();
    } else {
      navigate(tab.path);
    }
  };

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="Mobile Bottom Navigation"
      className={`md:hidden fixed bottom-0 left-0 right-0 z-50 w-full bg-white/94 dark:bg-[#0f172a]/94 backdrop-blur-[16px] border-t border-[#E5E5E2] dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] transition-all duration-150 select-none ${className}`}
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)",
        height: "calc(84px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="flex items-center justify-around h-[84px] px-2 w-full max-w-lg mx-auto relative">
        {tabs.map((tab) => {
          const isActive = tab.matches(currentPath);
          const Icon = tab.icon;

          if (tab.isRaised) {
            // Raised Centre Tab (Explore - Creator Only: 46px, -18px offset)
            return (
              <button
                key={tab.id}
                id={`bottom-nav-tab-${tab.id}`}
                type="button"
                onClick={() => handleTabClick(tab, isActive)}
                className="flex-1 min-w-0 flex flex-col items-center justify-center relative touch-manipulation cursor-pointer group py-1"
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
              >
                {/* Raised Floating Circle */}
                <div
                  className={`w-[46px] h-[46px] rounded-full flex items-center justify-center -translate-y-[18px] transition-transform duration-200 active:scale-95 shadow-[0_8px_20px_rgba(124,58,237,0.38)] ring-4 ring-white dark:ring-[#0f172a] ${
                    isActive
                      ? "bg-[#7C3AED] text-white"
                      : "bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
                  }`}
                >
                  <Icon size={22} strokeWidth={2.2} />
                </div>

                {/* Label aligned directly underneath */}
                <span
                  className={`text-[10px] leading-tight tracking-tight -translate-y-[12px] truncate max-w-[64px] transition-colors ${
                    isActive
                      ? "font-bold text-[#7C3AED] dark:text-[#A78BFA]"
                      : "font-semibold text-[#71717A] dark:text-slate-400"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          }

          // Standard Flat Tab
          return (
            <button
              key={tab.id}
              id={`bottom-nav-tab-${tab.id}`}
              type="button"
              onClick={() => handleTabClick(tab, isActive)}
              className="flex-1 min-w-0 min-h-[48px] flex flex-col items-center justify-center relative touch-manipulation cursor-pointer group py-1.5 transition-all"
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Icon Container with Badge */}
              <div className="relative flex items-center justify-center">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.4 : 1.8}
                  className={`transition-colors duration-150 ${
                    isActive
                      ? "text-[#7C3AED] dark:text-[#A78BFA]"
                      : "text-[#A0A0AA] dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200"
                  }`}
                />

                {/* Badge Indicator */}
                {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 h-4 min-w-[16px] px-1 bg-[#7C3AED] text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none ring-2 ring-white dark:ring-[#0f172a] shadow-xs">
                    {tab.badgeCount > 9 ? "9+" : tab.badgeCount}
                  </span>
                )}

                {/* Dot badge if boolean */}
                {tab.badge && !tab.badgeCount && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#7C3AED] ring-2 ring-white dark:ring-[#0f172a] animate-pulse" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] leading-tight tracking-tight mt-[5px] truncate max-w-[64px] text-center transition-colors ${
                  isActive
                    ? "font-bold text-[#7C3AED] dark:text-[#A78BFA]"
                    : "font-semibold text-[#71717A] dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
