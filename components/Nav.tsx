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
  const { lang, setLang, t } = useI18n();
  const { position } = useReading();
  const positionBook = position ? getBook(position.bookNr) : undefined;
  const passage =
    pathname === "/" && position && positionBook
      ? `${lang === "es" ? positionBook.es : positionBook.en} ${position.chapter}`
      : null;
  const [theme, setTheme] = useState<"dark" | "light">("light");

  // the inline bootstrap script in the layout applies the saved theme before
  // paint; here we just sync React state with what it decided
  useEffect(() => {
    setTheme(
      document.documentElement.dataset.theme === "light" ? "light" : "dark"
    );
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") {
      document.documentElement.dataset.theme = "light";
    } else {
      delete document.documentElement.dataset.theme;
    }
    window.localStorage.setItem("communion.theme", next);
  };

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          Communion
        </Link>
        <div className="nav-links">
          <Link
            href="/"
            className={`nav-link${pathname === "/" ? " active" : ""}`}
          >
            {t("nav.reader")}
          </Link>
          <Link
            href="/churches"
            className={`nav-link${pathname.startsWith("/churches") ? " active" : ""}`}
          >
            {t("nav.churches")}
          </Link>
        </div>
        {passage && <span className="nav-passage">{passage}</span>}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <div className="lang-toggle" role="group" aria-label="Language">
          <button
            className={lang === "en" ? "active" : ""}
            onClick={() => setLang("en")}
          >
            EN
          </button>
          <button
            className={lang === "es" ? "active" : ""}
            onClick={() => setLang("es")}
          >
            ES
          </button>
        </div>
        <AuthControls />
      </div>
    </nav>
  );
}
