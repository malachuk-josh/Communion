"use client";

// One button that hands the demo to wherever the reader already talks.
//
// On a phone this opens the system share sheet — Messages, Instagram,
// X, WhatsApp, whatever is installed — with the tour's address and a line
// about the app. The page behind that address carries its own card image
// and description, so wherever the link lands it unfurls as a picture of
// the app rather than a bare URL. Where there is no share sheet (most
// desktops), the same button copies the link and says so.

import Icon from "@/components/Icon";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

const TOUR_URL = "https://communion-mu.vercel.app/tour";

export default function ShareTour({ className = "tour-share" }: { className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Communion",
          text: t("tour.shareText"),
          url: TOUR_URL,
        });
        return;
      } catch {
        // cancelled, or the target refused — fall through to the clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${t("tour.shareText")} ${TOUR_URL}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable too — nothing more to be done silently
    }
  };

  return (
    <button type="button" className={className} onClick={share}>
      <Icon name="share" />{" "}
      {copied ? `✓ ${t("reader.shareCopied")}` : t("tour.share")}
    </button>
  );
}
