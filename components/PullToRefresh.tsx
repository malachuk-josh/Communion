"use client";

// Pull-to-refresh for the installed (home screen) experience, where no
// browser chrome exists. Pull down firmly from the top of the page: an
// indicator follows the pull, arms at the threshold, and releasing
// reloads the app. Purely additive — native scrolling is never blocked.

import { useEffect, useRef, useState } from "react";
import { scrollY } from "@/lib/scroller";

const ARM_AT = 60; // scaled pull distance (~130px of finger travel)

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const setPullBoth = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing || scrollY() > 0) return;
      // In the reader, dragging down IS scrolling up — you reach the top of a
      // book by making exactly this gesture, and reloading there is both a
      // surprise and, offline, pointless. Every other screen keeps it.
      if (document.documentElement.classList.contains("reading")) return;
      /*
       * Reloading would destroy an open sheet, modal or the welcome — including
       * one the finger never touched, since they leave the page behind them
       * live.
       *
       * The welcome matters most and was missing. It is a fixed overlay with
       * its own scroller, so the page beneath it never moves and `scrollY` is
       * always 0 — every downward drag inside the tour read as a pull from the
       * top of the app. A first-time reader scrolling the tour reloaded the
       * app out from under themselves, and since the welcome shows once, they
       * came back to the screen it was introducing and never saw the rest.
       */
      if (
        document.querySelector(
          ".modal-overlay, .lex-sheet, .side-panel, .welcome"
        )
      )
        return;
      /*
       * A sideways swipe is not a pull. The tour is a horizontal scroll-snap
       * strip, and no thumb travels perfectly level: the vertical drift in a
       * swipe across it was enough to arm the refresh and throw the page away
       * between one screen of the tour and the next.
       */
      const target = e.target;
      if (target instanceof Element && target.closest(".tour-strip")) return;
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      if (scrollY() > 0) {
        startY.current = null;
        setPullBoth(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      setPullBoth(delta > 0 ? Math.min(delta * 0.45, 120) : 0);
    };

    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= ARM_AT) {
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
