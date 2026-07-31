"use client";

// The first thing a new reader sees.
//
// Once, and only once: a guest arriving for the first time, or somebody who
// has just signed up, gets the tour before they get the app — the wordmark,
// one line about what this is, the ten screens, and a door. Everyone else
// opens straight onto Scripture, every time, because a welcome that keeps
// welcoming is a doorman who won't let you in.
//
// "Once" is a browser-local flag rather than anything on the server, and
// that is the right scope: the welcome exists to orient a person at THIS
// screen, and a phone and a laptop are two first arrivals. At rollout it
// also means every existing reader sees it a single time — which is not a
// bug; it is the announcement.
//
// The push prompt waits its turn. It fires three seconds after the app
// settles, which on a first visit would put the browser's permission ask on
// top of this screen — the worst possible moment to ask for anything. So
// dismissing the welcome announces itself (see WELCOMED_EVENT), and the
// prompt starts its clock from that announcement instead.

import Link from "next/link";
import { useEffect, useState } from "react";
import ShareTour from "@/components/ShareTour";
import TourStrip from "@/components/TourStrip";
import { useI18n } from "@/lib/i18n";

export const WELCOMED_KEY = "communion.welcomed";
export const WELCOMED_EVENT = "communion:welcomed";

export default function Welcome() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(WELCOMED_KEY) === "1") return;
    } catch {
      // private mode with storage blocked: showing a welcome every visit is
      // worse than never showing one
      return;
    }
    setOpen(true);
  }, []);

  // The page behind this screen should not scroll under a settled thumb.
  useEffect(() => {
    document.documentElement.classList.toggle("welcoming", open);
    return () => document.documentElement.classList.remove("welcoming");
  }, [open]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      // nothing to be done; it will offer itself again next visit
    }
    setOpen(false);
    window.dispatchEvent(new Event(WELCOMED_EVENT));
  };

  if (!open) return null;

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label={t("welcome.title")}>
      <div className="welcome-inner">
        <p className="welcome-brand">Communion</p>
        <p className="welcome-tagline">{t("app.tagline")}</p>
        <p className="welcome-lede">{t("welcome.lede")}</p>

        <TourStrip />

        <div className="welcome-actions">
          <button type="button" className="btn btn-primary welcome-begin" onClick={dismiss} autoFocus>
            {t("welcome.begin")}
          </button>
          <ShareTour />
          <Link href="/menu/about" className="welcome-more" onClick={dismiss}>
            {t("welcome.more")}
          </Link>
        </div>
      </div>
    </div>
  );
}
