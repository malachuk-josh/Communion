// Where the page scrolls.
//
// It is not the document any more. The document is fixed to the viewport and
// a single element inside it does the scrolling, because on iOS a fixed bar
// over a scrolling DOCUMENT is not reliably fixed: the scroll runs on another
// thread, the URL bar collapses, the page rubber-bands at both ends, and any
// of the three can carry a fixed element up the page. Four attempts to make
// the bottom bar cheap enough to keep up all failed, and this is the reason —
// there was never a version of the bar that would have kept up.
//
// A plain overflow:auto element has none of that. It scrolls, its contents
// move, and everything outside it — the header above, the bar below — is
// simply not part of the scroll.
//
// What it costs is that window.scrollY, window.scrollTo and window's scroll
// event all go quiet, and every one of them had a caller. This module is the
// one place that knows the difference; nothing else should reach for the
// element by id.

export const SCROLLER_ID = "app-scroll";

/** The scrolling element, or null before it is mounted (and on the server). */
export function scroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(SCROLLER_ID);
}

/**
 * How far down the page is.
 *
 * Falls back to the window, which is right in exactly two cases: before the
 * shell has mounted, and if this ever runs somewhere the wrapper is not.
 * Both answer 0, which is also the truth.
 */
export function scrollY(): number {
  const el = scroller();
  if (el) return el.scrollTop;
  return typeof window === "undefined" ? 0 : window.scrollY;
}

export function scrollToY(top: number, behavior?: ScrollBehavior): void {
  const el = scroller();
  if (el) el.scrollTo({ top, behavior });
  else if (typeof window !== "undefined") window.scrollTo({ top, behavior });
}

export function scrollByY(dy: number): void {
  const el = scroller();
  if (el) el.scrollBy({ top: dy });
  else if (typeof window !== "undefined") window.scrollBy(0, dy);
}

/**
 * The height of what can be seen at once.
 *
 * window.innerHeight is the whole screen; the scroller is the screen less the
 * header above it. Every caller wanted the second one and could not tell the
 * difference while they were the same thing.
 */
export function viewportH(): number {
  const el = scroller();
  if (el) return el.clientHeight;
  return typeof window === "undefined" ? 0 : window.innerHeight;
}

/**
 * Where the top of the scroller sits on screen.
 *
 * getBoundingClientRect() is measured from the top of the WINDOW, and the
 * scroller starts below the header — so anything converting a rect into a
 * scroll position has to take this off first. It was zero while the document
 * was the scroller, which is why nothing used to subtract it.
 */
export function scrollerTop(): number {
  return scroller()?.getBoundingClientRect().top ?? 0;
}

/** Listen where the scrolling actually happens. Returns the unsubscribe. */
export function onScroll(fn: () => void): () => void {
  const el: HTMLElement | Window = scroller() ?? window;
  el.addEventListener("scroll", fn, { passive: true });
  return () => el.removeEventListener("scroll", fn);
}
