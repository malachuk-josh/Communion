"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { scrollToChapterTop, useReading } from "@/lib/reading";
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
  const [pendingNotifs, setPendingNotifs] = useState(0);
  const [navHidden, setNavHidden] = useState(false);

  // In The Word, reading down tucks the bottom nav away for an unbroken
  // page; a brisk upward flick (or nearing the top) brings it back. A slow
  // upward drift keeps it hidden — that's still reading, not reaching.
  useEffect(() => {
    if (pathname !== "/") {
      setNavHidden(false);
      return;
    }
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const y = window.scrollY;
      const now = performance.now();
      const dy = y - lastY;
      const speed = -dy / Math.max(1, now - lastT); // px/ms upward
      if (y < 130) setNavHidden(false);
      else if (dy > 4) setNavHidden(true);
      else if (dy < 0 && (speed > 0.9 || -dy > 110)) setNavHidden(false);
      lastY = y;
      lastT = now;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // the reader's floating chapter arrows drop into the freed space
  useEffect(() => {
    document.documentElement.classList.toggle("navhide", navHidden);
  }, [navHidden]);

  // pending badge: unread messages + unseen notifications. Refreshes on
  // navigation, on returning to the app, and every 45s; mirrors to the
  // app icon badge where the platform supports it.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      api<{ messages: number; notifications: number; total: number }>(
        "/api/messages/unread"
      )
        .then((res) => {
          if (cancelled) return;
          setPendingMsgs(res.messages);
          setPendingNotifs(res.notifications);
          const nav = navigator as Navigator & {
            setAppBadge?: (n: number) => Promise<void>;
            clearAppBadge?: () => Promise<void>;
          };
          if (res.total > 0) nav.setAppBadge?.(res.total).catch(() => {});
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
  }, []);

  // Already reading? The Word tab glides to the top of this chapter, and
  // tapping it again straight after opens the navigator. The first tap still
  // acts at once — waiting to see whether a second one is coming would put a
  // third of a second of lag on the common case.
  const lastWordTap = useRef(0);
  const wordClick = (e: React.MouseEvent) => {
    if (pathname !== "/") return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastWordTap.current < 350) {
      lastWordTap.current = 0;
      setPanelOpen(true);
      return;
    }
    lastWordTap.current = now;
    scrollToChapterTop(position?.chapter);
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
          <div className="nav-links">
            <Link
              href="/"
              className={`nav-link${isWord ? " active" : ""}`}
              onClick={wordClick}
            >
              {t("nav.reader")}
            </Link>
            <Link
              href="/churches"
              className={`nav-link${isChurches ? " active" : ""}`}
            >
              {t("nav.churches")}
            </Link>
            <Link
              href="/discover"
              className={`nav-link${isDiscover ? " active" : ""}`}
            >
              {t("nav.discover")}
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
          <Link
            href="/menu"
            className={`theme-toggle settings-gear${isMenu ? " settings-active" : ""}`}
            aria-label={t("nav.menu")}
            title={t("nav.menu")}
          >
            ☰
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
              {theme === "dark" ? "📰" : theme === "grey" ? "☀️" : "🌙"}
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
      </nav>

      <nav
        className={`bottom-nav glass${navHidden ? " nav-hidden" : ""}`}
        aria-label="Primary"
      >
        <Link href="/" className={isWord ? "active" : ""} onClick={wordClick}>
          <span className="bn-icon">📖</span>
          <span>{t("nav.reader")}</span>
        </Link>
        <Link href="/churches" className={isChurches ? "active" : ""}>
          <span className="bn-icon">⛪</span>
          <span>{t("nav.churches")}</span>
        </Link>
        <Link href="/discover" className={isDiscover ? "active" : ""}>
          <span className="bn-icon">🌐</span>
          <span>{t("nav.discover")}</span>
        </Link>
        <Link
          href="/menu/messages"
          className={`bn-messages${isMessages ? " active" : ""}`}
        >
          <span className="bn-icon">💬</span>
          <span>{t("menu.messages")}</span>
          {pendingMsgs > 0 && (
            <span className="nav-badge bn-badge">{pendingMsgs}</span>
          )}
        </Link>
        <Link
          href="/menu"
          className={`bn-messages${isMenu ? " active" : ""}`}
        >
          <span className="bn-icon">☰</span>
          <span>{t("nav.menu")}</span>
          {pendingNotifs > 0 && (
            <span className="nav-badge bn-badge">{pendingNotifs}</span>
          )}
        </Link>
      </nav>
    </>
  );
}
