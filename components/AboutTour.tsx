"use client";

// The demo, living where somebody curious about the app already is. The strip
// itself is shared with the first-run welcome — see components/TourStrip.

import ShareTour from "@/components/ShareTour";
import TourStrip from "@/components/TourStrip";
import { useI18n } from "@/lib/i18n";

export default function AboutTour() {
  const { t } = useI18n();
  return (
    <>
      <h3>{t("about.tourTitle")}</h3>
      <p className="tour-hint">{t("about.tourHint")}</p>
      <TourStrip />
      <ShareTour />
    </>
  );
}
