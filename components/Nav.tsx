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

  // cycles dark → light → grey → dark; the icon shows what comes next
  const toggleTheme = () => {
    const next =
      theme === "dark" ? "light" : theme === "light" ? "grey" : "dark";
    setTheme(next);
    if (next === "dark") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    window.localStorage.setItem("communion.theme", next);
  };

  const isWord = pathname === "/";
  const isChurches =
    pathname.startsWith("/churches") || pathname.startsWith("/join");
  const isCalendar = pathname.startsWith("/calendar");
  const isDiscover = pathname.startsWith("/discover");
  const isMenu =
    pathname.startsWith("/menu") || pathname.startsWith("/settings");

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="brand">
            Communion
          </Link>
          <div className="nav-links">
            <Link href="/" className={`nav-link${isWord ? " active" : ""}`}>
              {t("nav.reader")}
            </Link>
            <Link
              href="/churches"
              className={`nav-link${isChurches ? " active" : ""}`}
            >
              {t("nav.churches")}
            </Link>
            <Link
              href="/calendar"
              className={`nav-link${isCalendar ? " active" : ""}`}
            >
              {t("nav.calendar")}
            </Link>
            <Link
              href="/discover"
              className={`nav-link${isDiscover ? " active" : ""}`}
            >
              {t("nav.discover")}
            </Link>
          </div>
          {showPassage && (
            <span className="nav-passage">
              <span className="pn-full">{bookName}</span>
              <span className="pn-abbr">{bookAbbr}</span> {position!.chapter}
            </span>
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
                ? "Switch to light mode"
                : theme === "light"
                  ? "Switch to grey scale"
                  : "Switch to dark mode"
            }
          >
            {theme === "dark" ? "☀️" : theme === "light" ? "🩶" : "🌙"}
          </button>
          <AuthControls />
        </div>
      </nav>

      <nav className="bottom-nav glass" aria-label="Primary">
        <Link href="/" className={isWord ? "active" : ""}>
          <span className="bn-icon">📖</span>
          <span>{t("nav.reader")}</span>
        </Link>
        <Link href="/churches" className={isChurches ? "active" : ""}>
          <span className="bn-icon">⛪</span>
          <span>{t("nav.churches")}</span>
        </Link>
        <Link href="/calendar" className={isCalendar ? "active" : ""}>
          <span className="bn-icon">📅</span>
          <span>{t("nav.calendar")}</span>
        </Link>
        <Link href="/discover" className={isDiscover ? "active" : ""}>
          <span className="bn-icon">🌐</span>
          <span>{t("nav.discover")}</span>
        </Link>
        <Link href="/menu" className={isMenu ? "active" : ""}>
          <span className="bn-icon">☰</span>
          <span>{t("nav.menu")}</span>
        </Link>
      </nav>
    </>
  );
}
