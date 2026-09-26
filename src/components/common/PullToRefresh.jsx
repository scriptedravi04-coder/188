import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, ArrowDown, Check, Sparkles } from "lucide-react";

/**
 * Native-feeling Pull-To-Refresh component for mobile feeds.
 * Supports touch gestures, momentum damping, haptic feedback,
 * dynamic progress ring, and smooth collaboration sync states.
 */
export default function PullToRefresh({
  children,
  onRefresh,
  isRefreshing: externalIsRefreshing,
  pullDownThreshold = 72,
  maxPull = 120,
  refreshingHeight = 56,
  pullingText = "Pull to refresh",
  releaseText = "Release to update",
  refreshingText = "Updating collaborations...",
  successText = "Latest collaborations synced",
  lastUpdatedText,
  disabled = false,
  className = "",
  contentClassName = "",
}) {
  const [internalRefreshing, setInternalRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasVibratedThreshold, setHasVibratedThreshold] = useState(false);

  const containerRef = useRef(null);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const isDraggingRef = useRef(false);

  const isRefreshing = externalIsRefreshing !== undefined ? externalIsRefreshing : internalRefreshing;

  // Safe haptic feedback trigger
  const triggerHaptic = useCallback((pattern = 12) => {
    try {
      if (typeof window !== "undefined" && "navigator" in window && typeof window.navigator.vibrate === "function") {
        window.navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration errors on unsupported devices
    }
  }, []);

  // Helper to find scroller and verify if we are at the top
  const isAtTop = useCallback(() => {
    // 1. Check parent app-scroll-container if present
    const appScroller = document.getElementById("app-scroll-container");
    if (appScroller) {
      if (appScroller.scrollTop > 2) return false;
    }

    // 2. Check window scroll
    const windowScrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (windowScrollTop > 2) return false;

    // 3. Check container itself
    if (containerRef.current && containerRef.current.scrollTop > 2) return false;

    return true;
  }, []);

  // Handle Touch Start
  const handleTouchStart = (e) => {
    if (disabled || isRefreshing || isSuccess) return;

    if (!isAtTop()) {
      isPullingRef.current = false;
      return;
    }

    const touch = e.touches[0];
    startYRef.current = touch.clientY;
    startXRef.current = touch.clientX;
    isPullingRef.current = true;
    setHasVibratedThreshold(false);
  };

  // Handle Touch Move
  const handleTouchMove = (e) => {
    if (!isPullingRef.current || disabled || isRefreshing || isSuccess) return;

    const touch = e.touches[0];
    const currentY = touch.clientY;
    const currentX = touch.clientX;

    const deltaY = currentY - startYRef.current;
    const deltaX = currentX - startXRef.current;

    // If scrolling upwards or moving more horizontally than vertically, abort pull-to-refresh
    if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
      if (pullDistance > 0) setPullDistance(0);
      return;
    }

    // Double check that we are still at top of scroll
    if (!isAtTop()) {
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    // Physics damping: Logarithmic / exponential resistance curve
    // Damping formula: distance = Math.min(maxPull, Math.pow(deltaY, 0.82) * 1.7)
    const dampedDistance = Math.min(maxPull, Math.pow(deltaY, 0.82) * 1.7);
    setPullDistance(dampedDistance);

    // Haptic feedback when passing threshold
    if (dampedDistance >= pullDownThreshold && !hasVibratedThreshold) {
      triggerHaptic(14);
      setHasVibratedThreshold(true);
    } else if (dampedDistance < pullDownThreshold && hasVibratedThreshold) {
      setHasVibratedThreshold(false);
    }

    // Prevent native page pull or bounce if we are pulling down
    if (deltaY > 10 && e.cancelable) {
      e.preventDefault();
    }
  };

  // Handle Touch End / Cancel
  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current && !isDraggingRef.current && pullDistance === 0) return;
    isPullingRef.current = false;
    isDraggingRef.current = false;

    if (pullDistance >= pullDownThreshold && !isRefreshing && !isSuccess) {
      // Trigger refresh
      triggerHaptic([8, 25, 8]);
      setInternalRefreshing(true);
      setPullDistance(refreshingHeight);

      try {
        if (typeof onRefresh === "function") {
          await onRefresh();
        }
      } catch (err) {
        console.warn("[PullToRefresh] Error executing onRefresh:", err);
      } finally {
        // Success state
        setIsSuccess(true);
        triggerHaptic(18);

        // Keep success badge visible briefly for clear user feedback
        setTimeout(() => {
          setIsSuccess(false);
          setInternalRefreshing(false);
          setPullDistance(0);
          isPullingRef.current = false;
          isDraggingRef.current = false;
        }, 600);
      }
    } else {
      // Snap back if didn't reach threshold or already refreshing
      setPullDistance(0);
      isPullingRef.current = false;
      isDraggingRef.current = false;
    }
  }, [pullDistance, pullDownThreshold, isRefreshing, isSuccess, triggerHaptic, refreshingHeight, onRefresh]);

  // Support Mouse Drag / Pointer for desktop preview or touch simulation
  const handlePointerDown = (e) => {
    if (disabled || isRefreshing || isSuccess) return;
    // Only handle primary mouse click or touch pointer
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!isAtTop()) return;

    startYRef.current = e.clientY;
    startXRef.current = e.clientX;
    isDraggingRef.current = true;
    isPullingRef.current = true;
    setHasVibratedThreshold(false);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current || disabled || isRefreshing || isSuccess) return;

    const deltaY = e.clientY - startYRef.current;
    const deltaX = e.clientX - startXRef.current;

    if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
      if (pullDistance > 0) setPullDistance(0);
      return;
    }

    if (!isAtTop()) {
      isDraggingRef.current = false;
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    const dampedDistance = Math.min(maxPull, Math.pow(deltaY, 0.82) * 1.7);
    setPullDistance(dampedDistance);

    if (dampedDistance >= pullDownThreshold && !hasVibratedThreshold) {
      triggerHaptic(14);
      setHasVibratedThreshold(true);
    } else if (dampedDistance < pullDownThreshold && hasVibratedThreshold) {
      setHasVibratedThreshold(false);
    }
  };

  const handlePointerUp = () => {
    handleTouchEnd();
  };

  // Global window listeners so releasing pointer anywhere snaps back reliably
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (isPullingRef.current || isDraggingRef.current) {
        handleTouchEnd();
      }
    };
    window.addEventListener("pointerup", handleGlobalRelease);
    window.addEventListener("pointercancel", handleGlobalRelease);
    window.addEventListener("touchend", handleGlobalRelease);
    window.addEventListener("touchcancel", handleGlobalRelease);
    return () => {
      window.removeEventListener("pointerup", handleGlobalRelease);
      window.removeEventListener("pointercancel", handleGlobalRelease);
      window.removeEventListener("touchend", handleGlobalRelease);
      window.removeEventListener("touchcancel", handleGlobalRelease);
    };
  }, [handleTouchEnd]);

  // Sync external refreshing prop changes so pullDistance never gets stuck
  useEffect(() => {
    if (!isRefreshing && !isSuccess && !isPullingRef.current && !isDraggingRef.current) {
      setPullDistance(0);
    }
  }, [isRefreshing, isSuccess]);

  // Auto-recovery safeguard: never stay stuck down if a network request hangs
  useEffect(() => {
    let safetyTimer = null;
    if (pullDistance > 0 || isRefreshing) {
      safetyTimer = setTimeout(() => {
        if (isPullingRef.current || isDraggingRef.current) return;
        setPullDistance(0);
        setInternalRefreshing(false);
        setIsSuccess(false);
      }, 5000);
    }
    return () => {
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [pullDistance, isRefreshing]);

  // Pull progress ratio (0 to 1)
  const pullRatio = Math.min(1, Math.max(0, pullDistance / pullDownThreshold));
  const isReadyToRelease = pullDistance >= pullDownThreshold;

  // Active displayed distance (with spring ease during refresh)
  const displayDistance = isRefreshing || isSuccess ? refreshingHeight : pullDistance;

  // Calculate SVG stroke offset for the circular progress ring
  const circleRadius = 9;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - pullRatio * circumference;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-x-hidden ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: pullDistance > 0 ? "none" : "pan-y" }}
    >
      {/* Floating Native-Style Refresh Indicator */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-40 flex justify-center items-start overflow-visible"
        style={{
          transform: `translateY(${Math.max(10, displayDistance * 0.45)}px)`,
          opacity: displayDistance > 8 ? Math.min(1, displayDistance / 32) : 0,
          transition: isPullingRef.current || isDraggingRef.current ? "opacity 75ms linear" : "all 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          className={`px-3.5 py-1.5 rounded-full shadow-lg border flex items-center gap-2 transition-all duration-200 ${
            isSuccess
              ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46] shadow-emerald-500/10"
              : isReadyToRelease || isRefreshing
              ? "bg-white/95 border-[#DDD6FE] text-[#7C3AED] shadow-[0_8px_20px_rgba(124,58,237,0.15)]"
              : "bg-white/95 border-gray-200 text-gray-700 shadow-sm"
          }`}
        >
          {isSuccess ? (
            /* Success State */
            <>
              <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white shrink-0">
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-[11.5px] font-semibold tracking-tight">{successText}</span>
            </>
          ) : isRefreshing ? (
            /* Refreshing Active State */
            <>
              <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-[var(--violet)]/20 border-t-[var(--violet)] rounded-full"
                />
                <Sparkles size={8} className="absolute text-[var(--violet)] animate-pulse" />
              </div>
              <span className="text-[11.5px] font-semibold text-[var(--violet)] tracking-tight">
                {refreshingText}
              </span>
            </>
          ) : (
            /* Pulling Down / Ready to Release State */
            <>
              <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                {/* Background Ring */}
                <svg className="w-5 h-5 -rotate-90" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r={circleRadius}
                    fill="none"
                    stroke="#E5E7EB"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r={circleRadius}
                    fill="none"
                    stroke="#7C3AED"
                    strokeWidth="2.5"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-75"
                  />
                </svg>
                {/* Center Arrow with dynamic rotation */}
                <ArrowDown
                  size={10}
                  strokeWidth={2.5}
                  className={`absolute text-gray-600 transition-transform duration-200 ${
                    isReadyToRelease ? "rotate-180 text-[var(--violet)]" : ""
                  }`}
                  style={{ transform: `rotate(${isReadyToRelease ? 180 : pullRatio * 180}deg)` }}
                />
              </div>
              <div className="flex flex-col">
                <span className={`text-[11.5px] font-semibold tracking-tight ${isReadyToRelease ? "text-[var(--violet)]" : "text-gray-700"}`}>
                  {isReadyToRelease ? releaseText : pullingText}
                </span>
                {lastUpdatedText && !isReadyToRelease && (
                  <span className="text-[9px] text-gray-400 font-medium -mt-0.5">{lastUpdatedText}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Feed Content with smooth translation when pulled */}
      <div
        className={`w-full transition-transform ease-out duration-150 ${contentClassName}`}
        style={{
          transform: `translate3d(0, ${displayDistance}px, 0)`,
          transitionDuration: isPullingRef.current || isDraggingRef.current ? "0ms" : "250ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}
