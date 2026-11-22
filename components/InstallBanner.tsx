"use client";

// An invitation at the top of Home, to anyone reading Communion in a browser:
// put it on your Home Screen. One button — which on Android installs it in a
// tap, and everywhere else opens the steps for that phone (InstallSheet).
//
// Never shown once it is installed, and never again once closed: a banner
// that keeps coming back is one a reader learns to look past, and this one
// has only one thing to say.

import { useState } from "react";
import Icon from "@/components/Icon";
import { useInstallWay } from "@/components/InstallSteps";
import InstallSheet from "@/components/InstallSheet";
import { useI18n } from "@/lib/i18n";
import { askToInstall } from "@/lib/install";
import { readLocal, writeLocal } from "@/lib/storage";

const CLOSED_KEY = "communion.installBanner";

export default function InstallBanner() {
  const { t } = useI18n();
  const way = useInstallWay();
  const [closed, setClosed] = useState(() => readLocal(CLOSED_KEY) === "0");
  const [open, setOpen] = useState(false);

  if (!way || way.k === "installed" || closed) return null;

  const go = async () => {
    // where the browser can simply be asked, ask it; the sheet is for the rest
    if (way.k === "prompt") {
      const r = await askToInstall();
      if (r !== "unavailable") return;
    }
    setOpen(true);
  };

  return (
    <>
      <div className="glass card install-banner" role="region" aria-label={t("install.bannerTitle")}>
        <span className="install-banner-icon" aria-hidden>
          <img src="/icons/icon-192.png" alt="" width={44} height={44} />
        </span>
        <div className="install-banner-body">
          <strong>{t("install.bannerTitle")}</strong>
          <small>{t("install.bannerText")}</small>
          <button type="button" className="btn btn-primary install-banner-go" onClick={go}>
            <Icon name="addSquare" /> {t("install.button")}
          </button>
        </div>
        <button
          type="button"
          className="install-banner-close"
          aria-label={t("install.notNow")}
          title={t("install.notNow")}
          onClick={() => {
            writeLocal(CLOSED_KEY, "0");
            setClosed(true);
          }}
        >
          ✕
        </button>
      </div>
      {open && <InstallSheet way={way} onClose={() => setOpen(false)} />}
    </>
  );
}
