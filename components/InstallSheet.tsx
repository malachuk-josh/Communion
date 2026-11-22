"use client";

// The steps to add Communion to the Home Screen, over the page — opened from
// the banner on Home (components/InstallBanner).
//
// On an iPhone in Safari, the button to tap first is in the toolbar at the
// foot of the screen, outside the page, where nothing on the page can point
// at it — except a pointer drawn just above it, at the very bottom of the
// page, which is what this does.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import InstallSteps from "@/components/InstallSteps";
import { useI18n } from "@/lib/i18n";
import type { InstallWay } from "@/lib/install";

export default function InstallSheet({ way, onClose }: { way: InstallWay; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  const pointDown = way.k === "ios-safari" && !way.ipad;
  return createPortal(
    <div className="modal-overlay over-panel install-overlay" onClick={onClose}>
      <div
        className="glass modal install-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mh-head">
          <h2 id="install-title">
            <Icon name="addSquare" /> {t("install.title")}
          </h2>
          <button type="button" className="lex-close" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>
        <p className="install-why">{t("install.why")}</p>
        <InstallSteps way={way} />
      </div>
      {pointDown && (
        <div className="install-pointer" aria-hidden>
          <Icon name="iosShare" />
          <span>↓</span>
        </div>
      )}
    </div>,
    document.body
  );
}
