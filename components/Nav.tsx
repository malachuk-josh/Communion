"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/client";
import { primeHaptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";
import { useReading } from "@/lib/reading";
import { getBook } from "@/lib/bible";
import AuthControls from "@/components/AuthControls";

export default function Nav() {
  const pathname = usePathname();
  const { lang, t } = useI18n();
  const { position, panelOpen, setPanelOpen, study, toggleStudy } =
    useReading();
  const chipRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [theme, setTheme] = useState<"dark" | "light" | "grey">("dark");
  const [pendingMsgs, setPendingMsgs] = useState(0);
  const [navHidden, setNavHidden] = useState(false);
  /** where the page was when the bar was asked for; null when it was not */
  const summonedAt = useRef<number | null>(null);

  /**
   * How tall one verse is, here, now.
   *
   * The bar comes back for a tap and goes away again as soon as reading
   * resumes — and "reading resumes" is a verse, not a number of pixels. A
   * verse is two lines in Proverbs and twelve in Esther, so it is measured off
   * the page rather than guessed at, from whatever is under the middle of the
   * screen. Clamped at both ends: without a floor a one-line verse makes the
   * bar impossible to keep, and without a ceiling a long one makes it feel
   * stuck open.
   */
  const verseHeight = () => {
    const mid = document.elementFromPoint(
      window.innerWidth / 2,
      window.innerHeight / 2
    );
    const verse = mid?.closest<HTMLElement>("[data-v]");
    const h = verse?.getBoundingClientRect().height ?? 0;
    return Math.min(Math.max(h || 90, 48), 260);
  };

  // In The Word the bar starts away and stays away — the page is for reading,
  // and the button it leaves behind is how it is asked back. It used to appear
  // near the top of a book, which meant it arrived unbidden every time a
  // chapter was opened. Every other tab simply has it.
  useEffect(() => {
    summonedAt.current = null;
    if (pathname !== "/") {
      setNavHidden(false);
      return;
    }
    setNavHidden(true);
    const onScroll = () => {
      if (summonedAt.current === null) return;
      if (Math.abs(window.scrollY - summonedAt.current) <= verseHeight()) return;
      summonedAt.current = null;
      setNavHidden(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  /** Bring the bar back, and remember from where. */
  const summonNav = () => {
    summonedAt.current = window.scrollY;
    setNavHidden(false);
  };

  // the reader's floating chapter arrows drop into the freed space
  useEffect(() => {
    document.documentElement.classList.toggle("navhide", navHidden);
  }, [navHidden]);

  // pending badge: unread direct messages. Refreshes on navigation, on
  // returning to the app, and every 45s; mirrors to the app icon badge where
  // the platform supports it.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      api<{ messages: number }>("/api/messages/unread")
        .then((res) => {
          if (cancelled) return;
          setPendingMsgs(res.messages);
          const nav = navigator as Navigator & {
            setAppBadge?: (n: number) => Promise<void>;
            clearAppBadge?: () => Promise<void>;
          };
          if (res.messages > 0) nav.setAppBadge?.(res.messages).catch(() => {});
          else nav.clearAppBadge?.().catch(() => {});
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 45000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

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
      if (!document.querySelector(".modal-overlay, .lex-sheet, .side-panel")) {
        chipRef.current?.focus();
      }
    }
    wasOpen.current = panelOpen;
  }, [panelOpen]);

  // the inline bootstrap script in the layout applies the saved theme before
  // paint; here we just sync React state with what it decided
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" || current === "grey" ? current : "dark");
    // iOS taps its Taptic Engine through a control, and a control built and
    // clicked in one tick has not been laid out yet. Build it now so the
    // first tap of the session is as solid as the rest.
    primeHaptics();
  }, []);

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

  // cycles dark → grey → light → dark; the icon shows what comes next
  const toggleTheme = () => {
    const next =
      theme === "dark" ? "grey" : theme === "grey" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    window.localStorage.setItem("communion.theme", next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        next === "light" ? "#ede1c8" : next === "grey" ? "#000000" : "#0b0d1a"
      );
  };

  const isWord = pathname === "/";
  const isChurches =
    pathname.startsWith("/churches") || pathname.startsWith("/join");
  const isCalendar = pathname.startsWith("/calendar");
  const isDiscover = pathname.startsWith("/discover");
  const isMessages = pathname.startsWith("/menu/messages");
  const isMenu =
    (!isMessages && pathname.startsWith("/menu")) ||
    pathname.startsWith("/settings") ||
    isCalendar;

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
              href="/discover"
              className={`nav-link${isDiscover ? " active" : ""}`}
            >
              {t("nav.discover")}
            </Link>
            <Link
              href="/churches"
              className={`nav-link${isChurches ? " active" : ""}`}
            >
              {t("nav.churches")}
            </Link>
            <Link
              href="/"
              className={`nav-link${isWord ? " active" : ""}`}
              onClick={wordClick}
            >
              {t("nav.reader")}
            </Link>
            <Link
              href="/menu/messages"
              className={`nav-link${isMessages ? " active" : ""}`}
            >
              {t("menu.messages")}
              {pendingMsgs > 0 && (
                <span className="nav-badge">{pendingMsgs}</span>
              )}
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
          <Link
            href="/menu"
            className={`theme-toggle settings-gear${isMenu ? " settings-active" : ""}`}
            aria-label={t("nav.menu")}
            title={t("nav.menu")}
          >
            <Icon name="menu" />
          </Link>
          {/* The Word keeps its header for reading: the passage and study
              mode only. Theme and account live on every other tab. */}
          {!isWord && (
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? "Switch to grey scale"
                  : theme === "grey"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
              }
            >
              <Icon name={theme === "dark" ? "news" : theme === "grey" ? "sun" : "moon"} />
            </button>
          )}
          {!isWord && <AuthControls />}
          {showPassage && (
            <button
              type="button"
              role="switch"
              aria-checked={study}
              className={`theme-toggle study-toggle${study ? " on" : ""}`}
              onClick={toggleStudy}
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

      {/* What the bar leaves behind. Small, centred, and always in the same
          place, so that getting the nav back is a thing you can see rather
          than a gesture you have to have been told about. */}
      {navHidden && (
        <button
          type="button"
          className="nav-peek glass"
          onClick={summonNav}
          aria-label={t("nav.showBar")}
          title={t("nav.showBar")}
        >
          <Icon name="menu" />
        </button>
      )}

      <nav
        className={`bottom-nav glass${navHidden ? " nav-hidden" : ""}`}
        aria-label="Primary"
      >
        {/* The Word sits in the middle of the five, under the thumb rather
            than out at the corner — it is the tab this app is for, and the
            one reached most often. Discover leads. */}
        <Link href="/discover" className={isDiscover ? "active" : ""}>
          <span className="bn-icon"><Icon name="globe" /></span>
          <span>{t("nav.discover")}</span>
        </Link>
        <Link href="/churches" className={isChurches ? "active" : ""}>
          <span className="bn-icon"><Icon name="church" /></span>
          <span>{t("nav.churches")}</span>
        </Link>
        <Link href="/" className={isWord ? "active" : ""} onClick={wordClick}>
          <span className="bn-icon"><Icon name="book" /></span>
          <span>{t("nav.reader")}</span>
        </Link>
        <Link
          href="/menu/messages"
          className={`bn-messages${isMessages ? " active" : ""}`}
        >
          <span className="bn-icon"><Icon name="chat" /></span>
          <span>{t("menu.messages")}</span>
          {pendingMsgs > 0 && (
            <span className="nav-badge bn-badge">{pendingMsgs}</span>
          )}
        </Link>
        <Link
          href="/menu"
          className={`bn-messages${isMenu ? " active" : ""}`}
        >
          <span className="bn-icon"><Icon name="menu" /></span>
          <span>{t("nav.menu")}</span>
        </Link>
      </nav>
    </>
  );
}
