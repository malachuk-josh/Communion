"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useReading } from "@/lib/reading";
import { getBook } from "@/lib/bible";
import AuthControls from "@/components/AuthControls";

export default function Nav() {
  const pathname = usePathname();
  const { lang, t } = useI18n();
  const { position } = useReading();
  const [theme, setTheme] = useState<"dark" | "light" | "grey">("dark");

  const positionBook = position ? getBook(position.bookNr) : undefined;
  const bookName = positionBook
    ? lang === "es"
      ? positionBook.es
      : positionBook.en
    : "";
  // compact form for narrow screens: "Deuteronomy" → "Deut."
  const bookAbbr =
    bookName.length > 8 ? `${bookName.slice(0, 4).trimEnd()}.` : bookName;
  const showPassage = pathname === "/" && position && positionBook;

  // the inline bootstrap script in the layout applies the saved theme before
  // paint; here we just sync React state with what it decided
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" || current === "grey" ? current : "dark");
  }, []);

  // already reading? The Word tab glides back to the top instead of snapping
  const wordClick = (e: React.MouseEvent) => {
    if (pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
          <Link href="/" className="brand">
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
            </Link>
          </div>
          {showPassage && (
            <button
              type="button"
              className="nav-passage"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              title={`${bookName} ${position!.chapter}`}
            >
              <span className="pn-full">{bookName}</span>
              <span className="pn-abbr">{bookAbbr}</span> {position!.chapter}
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
          <AuthControls />
        </div>
      </nav>

      <nav className="bottom-nav glass" aria-label="Primary">
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
        <Link href="/menu/messages" className={isMessages ? "active" : ""}>
          <span className="bn-icon">💬</span>
          <span>{t("menu.messages")}</span>
        </Link>
        <Link href="/menu" className={isMenu ? "active" : ""}>
          <span className="bn-icon">☰</span>
          <span>{t("nav.menu")}</span>
        </Link>
      </nav>
    </>
  );
}
