"use client";

// How to put Communion on this phone's Home Screen: the steps for this phone,
// in this browser, with each button drawn as the phone draws it.
//
// One tap where the browser can be asked (Android, and Chrome or Edge on a
// computer). Three steps on an iPhone or iPad, where it cannot. And where the
// page has been opened inside Instagram or Facebook or TikTok, whose browsers
// cannot add anything to a Home Screen, the way out to the phone's own
// browser first — on Android, one tap straight into Chrome.
//
// Shown in the sheet the Home banner opens (components/InstallSheet) and on
// the page a shared link lands on (app/get), which is the same instructions
// for a reader who has never seen the app.

import { useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import QrCode from "@/components/QrCode";
import { useI18n, type MessageKey } from "@/lib/i18n";
import {
  askToInstall,
  chromeIntent,
  installWay,
  onInstallChange,
  type InstallWay,
} from "@/lib/install";
import { GET_URL } from "@/lib/site";

/** This reader's way, read once in the browser and again if it changes. */
export function useInstallWay(): InstallWay | null {
  const [way, setWay] = useState<InstallWay | null>(null);
  useEffect(() => {
    const read = () => setWay(installWay());
    read();
    const off = onInstallChange(read);
    // a reader who adds it from the browser's own menu, with the page open
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", read);
    return () => {
      off();
      mq?.removeEventListener?.("change", read);
    };
  }, []);
  return way;
}

type Step = { icon?: IconName; key: MessageKey; vars?: Record<string, string> };

/** The steps for a way that has to be walked rather than tapped. */
function stepsFor(way: InstallWay): Step[] {
  const add: Step = { icon: "addSquare", key: "install.ios.add" };
  const confirm: Step = { key: "install.ios.confirm" };
  switch (way.k) {
    case "ios-safari":
      return [
        { icon: "iosShare", key: way.ipad ? "install.ios.shareTop" : "install.ios.shareBottom" },
        add,
        confirm,
      ];
    case "ios-browser":
      return [
        way.browser === "chrome"
          ? { icon: "iosShare", key: "install.iosChrome.share" }
          : way.browser === "edge"
            ? { icon: "dots", key: "install.iosEdge.share" }
            : way.browser === "firefox"
              ? { icon: "burger", key: "install.iosFirefox.share" }
              : { icon: "iosShare", key: "install.iosOther.share" },
        add,
        confirm,
      ];
    case "android": {
      const menu: Record<string, Step[]> = {
        chrome: [
          { icon: "kebab", key: "install.android.chromeMenu" },
          { icon: "addSquare", key: "install.android.chromeAdd" },
        ],
        samsung: [
          { icon: "burger", key: "install.android.samsungMenu" },
          { icon: "addSquare", key: "install.android.samsungAdd" },
        ],
        firefox: [
          { icon: "kebab", key: "install.android.firefoxMenu" },
          { icon: "addSquare", key: "install.android.firefoxAdd" },
        ],
        edge: [
          { icon: "dots", key: "install.android.edgeMenu" },
          { icon: "addSquare", key: "install.android.edgeAdd" },
        ],
      };
      return [
        ...(menu[way.browser] ?? [
          { icon: "kebab", key: "install.android.otherMenu" },
          { icon: "addSquare", key: "install.android.otherAdd" },
        ]),
        { key: "install.android.confirm" },
      ];
    }
    case "inapp": {
      const browser = way.os === "ios" ? "Safari" : "Chrome";
      return [
        { icon: way.os === "ios" ? "dots" : "kebab", key: "install.inapp.menu" },
        { icon: "globe", key: "install.inapp.open", vars: { browser } },
        { icon: "addSquare", key: "install.inapp.again" },
      ];
    }
    default:
      return [];
  }
}

/** A button that copies the page's address, and says so. */
function CopyLink({ url }: { url: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn install-alt"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2500);
        } catch {
          // no clipboard: the address is written out beside the button
        }
      }}
    >
      <Icon name={copied ? "check" : "link"} /> {copied ? t("install.copied") : t("install.copy")}
    </button>
  );
}

export default function InstallSteps({
  way,
  url = GET_URL,
  onDone,
}: {
  way: InstallWay;
  /** the address to copy or to open elsewhere: this page, wherever it is */
  url?: string;
  /** after it has been added, from the one-tap prompt */
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const [result, setResult] = useState<"accepted" | "dismissed" | null>(null);

  if (way.k === "installed" || result === "accepted") {
    return (
      <p className="install-done">
        <Icon name="check" /> {t("install.done")}
      </p>
    );
  }

  if (way.k === "prompt") {
    return (
      <div className="install-steps">
        <button
          type="button"
          className="btn btn-primary install-go"
          onClick={async () => {
            const r = await askToInstall();
            if (r === "accepted") {
              setResult("accepted");
              onDone?.();
            } else if (r === "dismissed") setResult("dismissed");
          }}
        >
          <Icon name="addSquare" /> {t("install.button")}
        </button>
        <p className="install-note">
          {result === "dismissed" ? t("install.promptLater") : t("install.promptNote")}
        </p>
      </div>
    );
  }

  if (way.k === "desktop") {
    return (
      <div className="install-steps install-desktop">
        <QrCode text={GET_URL} label={t("install.qrLabel")} className="qr install-qr" />
        <p className="install-note">{t("install.desktopLead")}</p>
        {way.browser === "safari" && <p className="install-note">{t("install.desktopSafari")}</p>}
      </div>
    );
  }

  if (way.k === "ios-old") {
    return (
      <div className="install-steps">
        <p className="install-lead">{t("install.iosOld")}</p>
        <CopyLink url={url} />
      </div>
    );
  }

  const steps = stepsFor(way);
  return (
    <div className="install-steps">
      {way.k === "inapp" && (
        <p className="install-lead">
          {way.app
            ? t("install.inapp.leadNamed", { app: way.app, browser: way.os === "ios" ? "Safari" : "Chrome" })
            : t("install.inapp.lead", { browser: way.os === "ios" ? "Safari" : "Chrome" })}
        </p>
      )}
      <ol className="install-list">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="install-n" aria-hidden>
              {i + 1}
            </span>
            <span className="install-text">{t(s.key, s.vars)}</span>
            {s.icon && (
              <span className="install-key" aria-hidden>
                <Icon name={s.icon} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {way.k === "inapp" && way.os === "android" && (
        // most in-app browsers on Android hand this straight to Chrome
        <a className="btn btn-primary install-go" href={chromeIntent(url)}>
          <Icon name="globe" /> {t("install.openChrome")}
        </a>
      )}
      {way.k === "inapp" && (
        <>
          <p className="install-note">{t("install.inapp.copy", { browser: way.os === "ios" ? "Safari" : "Chrome" })}</p>
          <CopyLink url={url} />
        </>
      )}
      {(way.k === "ios-safari" || way.k === "ios-browser" || way.k === "android") && (
        <p className="install-note">{t("install.then")}</p>
      )}
    </div>
  );
}
