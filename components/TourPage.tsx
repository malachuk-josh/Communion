"use client";

// The body of /tour — the welcome screen's content, laid out as a page.
// See app/tour/page.tsx for why this address exists.

import Link from "next/link";
import { useEffect } from "react";
import ShareTour from "@/components/ShareTour";
import TourStrip from "@/components/TourStrip";
import { WELCOMED_EVENT, WELCOMED_KEY } from "@/components/Welcome";
import { useI18n } from "@/lib/i18n";

export default function TourPageBody() {
  const { t } = useI18n();

  // Arriving here IS being welcomed — this page and the first-run welcome
  // are the same tour. Without this, somebody following a shared link would
  // get the welcome overlay on top of the page it duplicates, and then once
  // more after tapping Begin. Page effects run before the layout's, so the
  // flag is down before the welcome ever checks it.
  useEffect(() => {
    try {
      window.localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      // storage blocked: the welcome will not show either
    }
    window.dispatchEvent(new Event(WELCOMED_EVENT));
  }, []);
  return (
    <div className="tour-page">
      <p className="welcome-brand">Communion</p>
      <p className="welcome-tagline">{t("app.tagline")}</p>
      <p className="welcome-lede">{t("welcome.lede")}</p>

      <TourStrip />

      <div className="welcome-actions">
        <Link href="/" className="btn btn-primary welcome-begin">
          {t("welcome.begin")}
        </Link>
        <ShareTour />
      </div>
    </div>
  );
}
