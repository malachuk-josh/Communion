"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import { useReading } from "@/lib/reading";
import { onScroll as onPageScroll, scrollToY, scrollY } from "@/lib/scroller";
import { getBook } from "@/lib/bible";
import AuthControls from "@/components/AuthControls";
import MenuMenu from "@/components/MenuMenu";
import { STUDY_AFTER_SIGN_IN, StudySignIn } from "@/components/SignInNeeded";
import { signInNeeded, useAccount } from "@/lib/account";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * The tabs, in the order the bar shows them. The swipe reads this, and the bar
 * and the desktop row are written from the same order by hand — if they ever
 * disagree, a swipe would go somewhere the reader cannot see it went.
 */
const TAB_ORDER = ["/", "/discover", "/menu/journal"] as const;

/*
 * What counts as a swipe across the tabs.
 *
 * Gathered here rather than left inline because they are one judgement made
 * in four numbers, and moving any of them without seeing the others is how a
 * gesture ends up either impossible or firing on every scroll.
 *
 * These were once much stricter — 90px, and a short swipe had to move at
 * 700px/s. That is a hard flick, faster than most people move a thumb, and
 * the common report was that swiping simply did not work. The guard against
 * a wandering scroll is SIDEWAYS, not distance or speed: a scroll's vertical
 * travel dwarfs its horizontal, so requiring the horizontal to lead by a
 * clear margin rules it out on its own. Distance and speed only have to rule
 * out a fidget, and a fidget is small AND slow.
 */
/** Below this the finger has not gone anywhere. */
const SWIPE_MIN_DX = 50;
/** Horizontal must lead vertical by this much — the real scroll guard. */
const SWIPE_SIDEWAYS = 1.3;
/** px/ms. Under this it is a hand being moved, not a page being turned. */
const SWIPE_MIN_SPEED = 0.15;
/** A swipe shorter than this must also be quicker than SWIPE_QUICK. */
const SWIPE_LONG_DX = 110;
const SWIPE_QUICK = 0.3;
/**
 * How near the screen edge a gesture may start.
 *
 * iOS owns the very edge for its own back and forward, and racing it looks
 * broken. This stays a little wider than the ~20px the system claims, and no
 * wider: every pixel here is a pixel where swiping does nothing.
 */
const SWIPE_EDGE = 22;

/** Whether anything from here up scrolls sideways and so owns the gesture. */
function scrollsSideways(from: EventTarget | null): boolean {
  let el = from instanceof Element ? from : null;
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, t } = useI18n();
  const { position, panelOpen, setPanelOpen, study, toggleStudy, setStudyMode } =
    useReading();
  const account = useAccount();
  /** the star was pressed by somebody with no account */
  const [askSignIn, setAskSignIn] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [navHidden, setNavHidden] = useState(false);
  /** which way the last swipe went, read once by the animation after it lands */
  const swipeDir = useRef<number | null>(null);

  /**
   * In The Word, reading down tucks the bottom bar away for an unbroken page;
   * a brisk upward flick, or nearing the top, brings it back. A slow upward
   * drift keeps it hidden — that is still reading, not reaching.
   *
   * This is the gesture that was here before, restored. It was replaced by a
   * small button left behind when the bar tucked away, on the reasoning that a
   * flick is a gesture nobody is told about. The button was easy to find and
   * wrong to use: it put a thing on the page to be aimed at, in the one place
   * that is meant to be nothing but the text.
   *
   * The bar starts visible again with it. Hiding at the outset was only
   * tolerable while the button was there to ask it back; without one, a reader
   * who never flicks would never learn the bar exists.
   */
  useEffect(() => {
    if (pathname !== "/") {
      setNavHidden(false);
      return;
    }
    let lastY = scrollY();
    let lastT = performance.now();
    const onScroll = () => {
      const y = scrollY();
      const now = performance.now();
      const dy = y - lastY;
      const speed = -dy / Math.max(1, now - lastT); // px/ms, upward
      if (y < 130) setNavHidden(false);
      else if (dy > 4) setNavHidden(true);
      else if (dy < 0 && (speed > 0.9 || -dy > 110)) setNavHidden(false);
      lastY = y;
      lastT = now;
    };
    return onPageScroll(onScroll);
  }, [pathname]);

  /*
   * A new screen starts at the top of itself.
   *
   * The browser did this for nothing while the document was what scrolled.
   * It is an element now, and an element keeps its scrollTop across a route
   * change — so without this, opening the Journal from halfway down Discover
   * landed halfway down the Journal.
   *
   * Only between screens. Moving about inside The Word never changes the
   * path, and the reader places itself.
   */
  useEffect(() => {
    scrollToY(0);
  }, [pathname]);

  // the reader's floating chapter arrows drop into the freed space
  useEffect(() => {
    document.documentElement.classList.toggle("navhide", navHidden);
  }, [navHidden]);

  /**
   * Warm the tabs either side of this one.
   *
   * A swipe asks for a page the moment the finger leaves the glass, and until
   * this was here that was the moment the browser started fetching the code
   * for it — which is what the pause between the flick and the new page was.
   * Both neighbours, because the gesture goes either way, and only the
   * neighbours, because that is as far as one flick reaches.
   */
  useEffect(() => {
    const at = TAB_ORDER.indexOf(pathname as (typeof TAB_ORDER)[number]);
    if (at === -1) return;
    const warm = window.setTimeout(() => {
      for (const step of [-1, 1]) {
        const href = TAB_ORDER[at + step];
        if (href) router.prefetch(href);
      }
    }, 300); // after this page has settled; it is the one being read
    return () => window.clearTimeout(warm);
  }, [pathname, router]);

  /**
   * Move the page in from the side it was swiped from.
   *
   * Without it a swipe is a flick followed by a still page that changes — the
   * eye reads the gap as the app hesitating even when it is a tenth of a
   * second. The animation is restarted by hand rather than left to a class
   * change, because two swipes the same way in a row set the same class and a
   * CSS animation will not replay for that.
   */
  useEffect(() => {
    const dir = swipeDir.current;
    swipeDir.current = null;
    if (!dir) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = document.querySelector<HTMLElement>(".page");
    if (!page) return;
    page.classList.remove("page-swipe-next", "page-swipe-prev");
    void page.offsetWidth; // reflow, so the animation runs again
    page.classList.add(dir > 0 ? "page-swipe-next" : "page-swipe-prev");
    const done = () => {
      page.classList.remove("page-swipe-next", "page-swipe-prev");
    };
    page.addEventListener("animationend", done, { once: true });
    return () => page.removeEventListener("animationend", done);
  }, [pathname]);

  /**
   * Swipe across the page: a flick left or right moves a tab.
   *
   * It asks for the movement to be mostly sideways above all — that is what
   * tells a swipe from a scroll that wandered — and then for enough distance
   * and, on a short one, enough speed to rule out a fidget. The thresholds
   * are the SWIPE_ constants at the top of this file.
   *
   * Four things are left alone entirely:
   *  - two fingers, which is the reader's pinch
   *  - gestures beginning at the screen edges, which iOS owns for back and
   *    forward, and which would otherwise race the browser's own animation
   *  - anything begun inside something that scrolls sideways — a table, a row
   *    of chips — which owns the gesture and says so by being scrollable
   *  - anything begun while a sheet or a dialog is open, where the swipe
   *    would move the page out from under whatever is being read on top of it
   *
   * Nothing wraps. Swiping past the last tab does nothing rather than landing
   * on the first: the bar has ends, and a gesture that jumps from one end to
   * the other reads as a mistake even when it was asked for.
   */
  useEffect(() => {
    const at = TAB_ORDER.indexOf(pathname as (typeof TAB_ORDER)[number]);
    // a page under no tab — the menu, settings, a plan somebody shared — is a
    // place the reader arrived at deliberately, and not somewhere to be flicked
    // out of
    if (at === -1) return;

    let from: { x: number; y: number; t: number } | null = null;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (
        e.touches.length !== 1 ||
        touch.clientX < SWIPE_EDGE ||
        touch.clientX > window.innerWidth - SWIPE_EDGE ||
        scrollsSideways(e.target) ||
        // `.welcome` belongs on this list and was missing from it. It is the
        // front door — a full-screen overlay shown before the app — and a
        // swipe across it changed the tab underneath, so a first-time reader
        // brushing sideways over the tour dismissed nothing and silently
        // moved the app to a screen they could not see.
        document.querySelector(
          ".modal-overlay, .lex-sheet, .side-panel, .conc-panel, .welcome"
        )
      ) {
        from = null;
        return;
      }
      from = { x: touch.clientX, y: touch.clientY, t: performance.now() };
    };

    const onEnd = (e: TouchEvent) => {
      const start = from;
      from = null;
      const touch = e.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const speed = Math.abs(dx) / Math.max(1, performance.now() - start.t);
      if (Math.abs(dx) < SWIPE_MIN_DX) return; // a nudge
      // the one that matters: a scroll's vertical travel dwarfs its horizontal
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_SIDEWAYS) return;
      if (speed < SWIPE_MIN_SPEED) return;
      // A long drag may take its time; a short one has to be a flick, or a
      // thumb resettling sideways would turn the page.
      if (speed < SWIPE_QUICK && Math.abs(dx) < SWIPE_LONG_DX) return;
      const next = at + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= TAB_ORDER.length) return;
      swipeDir.current = dx < 0 ? 1 : -1;
      router.push(TAB_ORDER[next]);
    };

    // Halfway through a gesture that is already going one way, ask for the
    // page it is heading to. By the time the finger lifts it is usually here.
    const onMove = (e: TouchEvent) => {
      if (!from) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - from.x;
      // below the distance that could still become a swipe, so the page is
      // usually already here by the time the finger lifts
      if (Math.abs(dx) < SWIPE_MIN_DX - 16) return;
      const next = at + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= TAB_ORDER.length) return;
      router.prefetch(TAB_ORDER[next]);
    };

    const onCancel = () => {
      from = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [pathname, router]);

  /*
   * Clear the app icon's badge, once.
   *
   * It counted unread messages from the Table, and the Table is gone — but a
   * badge set on a home screen icon outlives the code that set it, and with
   * nothing left to count it would sit there for good saying there was
   * something to read.
   */
  useEffect(() => {
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.().catch(() => {});
  }, []);

  /*
   * Study mode is for readers with an account: what it keeps is saved to one,
   * and without one it would be kept nowhere but this device. Left on from
   * before the rule, or from before signing out, it closes the moment Clerk
   * says nobody is signed in — not before, or a signed-in reader would be
   * thrown out of it while Clerk was still loading.
   */
  useEffect(() => {
    if (study && signInNeeded(account)) setStudyMode(false);
  }, [study, account, setStudyMode]);

  // Asked for study mode, went to sign in: open it for them when they are back.
  useEffect(() => {
    if (!account.signedIn) return;
    let wanted = false;
    try {
      wanted = sessionStorage.getItem(STUDY_AFTER_SIGN_IN) === "1";
      sessionStorage.removeItem(STUDY_AFTER_SIGN_IN);
    } catch {
      // storage blocked: nothing was remembered, so there is nothing to do
    }
    if (wanted) setStudyMode(true);
  }, [account.signedIn, setStudyMode]);

  const pressStudy = () => {
    if (!study && signInNeeded(account)) {
      setAskSignIn(true);
      return;
    }
    toggleStudy();
  };

  const positionBook = position ? getBook(position.bookNr) : undefined;
  const bookName = positionBook
    ? lang === "es"
      ? positionBook.es
      : positionBook.en
    : "";
  const showPassage = pathname === "/" && position && positionBook;

  // closing the control sheet hands focus back to the chip that opened it —
  // unless the sheet closed to hand off to another dialog, which owns focus
  useEffect(() => {
    if (wasOpen.current && !panelOpen) {
      if (
        !document.querySelector(
          ".modal-overlay, .lex-sheet, .side-panel, .welcome"
        )
      ) {
        chipRef.current?.focus();
      }
    }
    wasOpen.current = panelOpen;
  }, [panelOpen]);

  /**
   * Already reading? Opening The Word again opens the navigator.
   *
   * It used to glide to the top of the chapter and want a second tap inside a
   * third of a second for the navigator, which meant the thing people wanted
   * was the thing they had to know about — and the thing they got by accident
   * threw away where they were reading. One tap, one door.
   */
  const wordClick = (e: React.MouseEvent) => {
    if (pathname !== "/") return;
    e.preventDefault();
    setPanelOpen(true);
  };

  const isWord = pathname === "/";
  const isDiscover = pathname.startsWith("/discover");
  const isJournal = pathname.startsWith("/menu/journal");
  const isMenu =
    (!isJournal && pathname.startsWith("/menu")) ||
    pathname.startsWith("/settings");

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="brand" onClick={wordClick}>
            Communion
          </Link>
          {/* the same order as the bar below, so the two never disagree about
              where a destination lives */}
          <div className="nav-links">
            <Link
              href="/"
              className={`nav-link${isWord ? " active" : ""}`}
              onClick={wordClick}
            >
              {t("nav.reader")}
            </Link>
            <Link
              href="/discover"
              className={`nav-link${isDiscover ? " active" : ""}`}
            >
              {t("nav.discover")}
            </Link>
            <Link
              href="/menu/journal"
              className={`nav-link${isJournal ? " active" : ""}`}
            >
              {t("nav.journal")}
            </Link>
          </div>
          {showPassage && (
            <button
              type="button"
              ref={chipRef}
              className={`nav-passage${panelOpen ? " pn-open" : ""}`}
              onClick={() => setPanelOpen((open) => !open)}
              aria-expanded={panelOpen}
              aria-haspopup="dialog"
              aria-controls="reader-panel"
              title={`${bookName} ${position!.chapter} — ${t("reader.openControls")}`}
            >
              {/* only the book name may shrink; the chapter and the caret,
                  which is the chip's whole affordance, never truncate */}
              <span className="pn-name">{bookName}</span>
              <span className="pn-tail">
                {position!.chapter}
                <span className="pn-caret" aria-hidden>
                  ⌄
                </span>
              </span>
            </button>
          )}
          <div className="nav-end">
          {/* The Word has no menu button here: its navigator carries one, and
              the header on that tab is kept for the passage and study mode. */}
          {!isWord && (
            <MenuMenu
              className={`theme-toggle settings-gear${isMenu ? " settings-active" : ""}`}
            />
          )}
          {/* The Word keeps its header for reading: the passage and study
              mode only. Theme and account live on every other tab — and on
              that one the theme moved into the navigator, beside the menu. */}
          {!isWord && <ThemeToggle />}
          {!isWord && <AuthControls />}
          {showPassage && (
            <button
              type="button"
              role="switch"
              aria-checked={study}
              className={`theme-toggle study-toggle${study ? " on" : ""}`}
              onClick={pressStudy}
              aria-label={t("reader.study")}
              title={t("reader.study")}
            >
              {/* drawn rather than typed: the ✦ glyph sits off-centre in its
                  em box, and by a different amount in every fallback font */}
              <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 1.4c.62 5.98 4.6 9.96 10.6 10.6-6 .62-9.98 4.6-10.6 10.6-.62-6-4.6-9.98-10.6-10.6C7.4 11.36 11.38 7.38 12 1.4Z"
                />
              </svg>
            </button>
          )}
          </div>
        </div>
      </nav>

      <nav
        className={`bottom-nav glass${navHidden ? " nav-hidden" : ""}`}
        aria-label="Primary"
      >
        {/* Three tabs, for reading on your own: the Word first, because
            reading is what the app is for, then Home and the Journal. The
            Menu lives in the header, reachable without a place in the bar. */}
        <Link href="/" className={isWord ? "active" : ""} onClick={wordClick}>
          <span className="bn-icon"><Icon name="book" /></span>
          <span>{t("nav.reader")}</span>
        </Link>
        <Link href="/discover" className={isDiscover ? "active" : ""}>
          <span className="bn-icon"><Icon name="globe" /></span>
          <span>{t("nav.discover")}</span>
        </Link>
        <Link
          href="/menu/journal"
          className={`bn-messages${isJournal ? " active" : ""}`}
        >
          <span className="bn-icon"><Icon name="scroll" /></span>
          <span>{t("nav.journal")}</span>
        </Link>
      </nav>

      {/* Outside both bars: they are glass, and a backdrop filter makes a
          bar the containing block for anything fixed inside it — an overlay
          placed there would be the size of the header. */}
      {askSignIn && <StudySignIn onClose={() => setAskSignIn(false)} />}
    </>
  );
}
