"use client";

// Pull-to-refresh for the installed (home screen) experience, where no
// browser chrome exists. Pull down firmly from the top of the page: an
// indicator follows the pull, arms at the threshold, and releasing
// reloads the app. Purely additive — native scrolling is never blocked.

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

const ARM_AT = 60; // scaled pull distance (~130px of finger travel)

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  /** whether the last move had the gesture armed, so the tap fires once */
  const wasArmed = useRef(false);

  useEffect(() => {
    const setPullBoth = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing || window.scrollY > 0) return;
      // In the reader, dragging down IS scrolling up — you reach the top of a
      // book by making exactly this gesture, and reloading there is both a
      // surprise and, offline, pointless. Every other screen keeps it.
      if (document.documentElement.classList.contains("reading")) return;
      // reloading would destroy an open sheet or modal — including one the
      // finger never touched, since sheets leave the page behind them live
      if (document.querySelector(".modal-overlay, .lex-sheet, .side-panel"))
        return;
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      if (window.scrollY > 0) {
        startY.current = null;
        setPullBoth(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      const next = delta > 0 ? Math.min(delta * 0.45, 120) : 0;
      // one tap as the gesture arms, and one only — the finger crosses the
      // threshold repeatedly while it hovers there, and buzzing on each
      // crossing would turn the indicator into a rattle
      const armed = next >= ARM_AT;
      if (armed !== wasArmed.current) {
        wasArmed.current = armed;
        if (armed) haptic("arm");
      }
      setPullBoth(next);
    };

    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      wasArmed.current = false;
      if (pullRef.current >= ARM_AT) {
        haptic("medium");
        setRefreshing(true);
        window.location.reload();
      } else {
        setPullBoth(0);
      }
    };

    // iOS ignores user-scalable=no in the browser; blocking its proprietary
    // gesture events is what actually stops accidental pinch zoom
    const blockGesture = (e: Event) => e.preventDefault();

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    document.addEventListener("gesturestart", blockGesture);
    document.addEventListener("gesturechange", blockGesture);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
    };
  }, [refreshing]);

  const visible = pull > 8 || refreshing;
  return (
    <div
      className={`ptr${pull >= ARM_AT || refreshing ? " armed" : ""}${
        refreshing ? " refreshing" : ""
      }`}
      style={{
        transform: `translate(-50%, ${(refreshing ? 70 : pull) - 56}px)`,
        opacity: visible ? 1 : 0,
      }}
      aria-hidden
    >
      <span
        className="ptr-icon"
        style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
      >
        ↻
      </span>
    </div>
  );
}
