"use client";

// One measurement of the keyboard, published as CSS custom properties that
// every overlay in the app reads.
//
// On iOS a software keyboard shrinks the VISUAL viewport and leaves the
// LAYOUT viewport untouched. Nothing in CSS notices: vh, svh, lvh and dvh all
// derive from the initial containing block, which the keyboard never touches,
// so every position:fixed element stays pinned behind it. WebKit implements
// neither `interactive-widget` (webkit.org/b/259770, still open) nor
// env(keyboard-inset-*), so visualViewport is the only signal there is.
//
// Published on <html>:
//   --kb      keyboard height in px, 0 when it is down
//   --vv-top  how far the visible band is pushed down from the top, px
//   --vvh     height of the visible band, px
// with --kb + --vv-top + --vvh always summing to the layout viewport height,
// so no two of them can disagree. Also toggles a `kb-up` class for anything
// that wants a switch rather than a length.
//
// Mounted once, from app/layout.tsx.

import { useEffect } from "react";

// A real keyboard is never this short; a phantom offset always is. iOS 26
// leaves ~24px of residual offsetTop behind after the keyboard closes
// (webkit.org/b/297779, fixed in 26.1) and that must not read as a keyboard.
// A paired hardware keyboard's accessory bar runs about 55px, above this
// line, so it counts as a small keyboard and overlays lift by 55px — which is
// right, because the bar occludes exactly that.
const DEAD_ZONE = 40;

/** Containers that scroll internally once they have been clamped to the band. */
const SCROLLERS = ".modal, .lex-sheet, .sp-body";

export function useViewportInsets() {
  useEffect(() => {
    const vv = window.visualViewport;
    // iOS 12 and older. The :root fallbacks in globals.css reproduce the
    // pre-fix layout exactly, so standing down is the correct behaviour.
    if (!vv) return;

    const root = document.documentElement;
    let frame = 0;
    let last = "";

    // Bring the focused field back into view inside whichever container
    // scrolls. Only meaningful once --kb has clamped that container: before
    // that, both the document and the dialog are already at their scroll
    // limit and this is a guaranteed no-op.
    const reveal = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el?.matches?.("input, textarea, select, [contenteditable]")) return;
      const scroller = el.closest(SCROLLERS);
      if (!scroller) return;
      // Only move a field that is genuinely out of sight. WebKit runs its own
      // reveal on the same event, and two of us scrolling one element is what
      // a double-jump is made of. The scroll margins count here for the same
      // reason scrollIntoView honours them: the row under the field — usually
      // its Save button — has to come up too.
      const box = el.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const above = parseFloat(cs.scrollMarginTop) || 0;
      const below = parseFloat(cs.scrollMarginBottom) || 0;
      if (box.top - above >= view.top && box.bottom + below <= view.bottom) {
        return;
      }
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    const measure = () => {
      frame = 0;
      // Pinch-zoom shrinks the visual viewport exactly as a keyboard does,
      // and the subtraction below cannot tell them apart: at 2x it reads a
      // 426px keyboard that is not there, and every overlay collapses to a
      // sliver that then chases the pan. iOS has ignored user-scalable=no
      // since iOS 10, so the meta tag does not prevent this in a browser
      // tab. Zoomed in, publish nothing and leave the page alone.
      if (vv.scale > 1.01) {
        if (last === "zoom") return;
        last = "zoom";
        root.style.setProperty("--kb", "0px");
        root.style.setProperty("--vv-top", "0px");
        root.style.setProperty("--vvh", `${window.innerHeight}px`);
        root.classList.remove("kb-up");
        return;
      }
      const raw = window.innerHeight - vv.height - vv.offsetTop;
      // Where the keyboard shrinks the layout viewport too (Firefox for
      // Android, and Chrome under interactive-widget=resizes-content) this
      // lands at ~0 on its own and the whole mechanism stands down — which is
      // right, because there a fixed element is already clear of it.
      const kb = raw > DEAD_ZONE ? Math.round(raw) : 0;
      const top = vv.offsetTop > DEAD_ZONE ? Math.round(vv.offsetTop) : 0;
      const next = `${kb}|${top}`;
      if (next === last) return;
      last = next;
      root.style.setProperty("--kb", `${kb}px`);
      root.style.setProperty("--vv-top", `${top}px`);
      root.style.setProperty("--vvh", `${window.innerHeight - kb - top}px`);
      root.classList.toggle("kb-up", kb > 0);
      // The keyboard was still on its way up when focus landed, so this is
      // the pass that actually gets the field on screen.
      reveal();
    };

    // visualViewport fires on every frame of a scroll. Coalescing to one rAF
    // keeps it off the critical path, and writing straight to the style
    // attribute rather than React state keeps it out of the render tree.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    vv.addEventListener("resize", schedule);
    // scroll is not optional: offsetTop moves without height ever changing.
    vv.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    // covers moving between fields while the keyboard is already up, where
    // --kb never changes and measure() short-circuits
    // one frame late, so the style recalc and the clamp that depends on --kb
    // have both settled before anything is measured
    const onFocusIn = () => requestAnimationFrame(reveal);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("focusin", onFocusIn);
      root.style.removeProperty("--kb");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vvh");
      root.classList.remove("kb-up");
    };
  }, []);
}

export default function ViewportInsets() {
  useViewportInsets();
  return null;
}
