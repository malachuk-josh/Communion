"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export default function Nav() {
  const pathname = usePathname();
  const { lang, setLang, t } = useI18n();

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
      </div>
    </nav>
  );
}
