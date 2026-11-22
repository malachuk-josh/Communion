// Adding Communion to a Home Screen: whether it already is, and how, on this
// phone in this browser.
//
// There is no App Store here. Communion is a web app, and a phone will keep
// one on its Home Screen like any other app — full screen, with its own icon,
// working offline — but every phone and browser hides the way to do it in a
// different place, and some cannot do it at all:
//
//   Chrome, Edge and Samsung Internet on Android (and on a computer) can be
//   asked to install it in one tap: they announce themselves with a
//   `beforeinstallprompt` event, which is caught here as early as the page
//   loads and kept until a button asks for it.
//   Safari on an iPhone or iPad cannot be asked. The reader has to tap Share
//   and then Add to Home Screen — so the steps are shown, with the buttons
//   drawn as the phone draws them. Chrome, Edge and Firefox on an iPhone can
//   do the same from their own Share since iOS 16.4.
//   The browsers built into Instagram, Facebook, TikTok and the rest cannot
//   add anything to a Home Screen. The page has to be opened in the phone's
//   own browser first, and the steps say how.
//
// This only reads the browser; components/InstallSheet.tsx does the telling.

/** How this reader can put Communion on their Home Screen. */
export type InstallWay =
  | { k: "installed" }
  /** a browser that installs it in one tap when asked */
  | { k: "prompt"; os: "android" | "desktop" | "other" }
  | { k: "ios-safari"; ipad: boolean }
  | { k: "ios-browser"; browser: "chrome" | "edge" | "firefox" | "other"; ipad: boolean }
  /** an iPhone too old to add apps from any browser but Safari */
  | { k: "ios-old" }
  | { k: "inapp"; app: string; os: "ios" | "android" }
  | { k: "android"; browser: "chrome" | "samsung" | "firefox" | "edge" | "opera" | "other" }
  | { k: "desktop"; browser: "safari" | "chrome" | "edge" | "firefox" | "other" };

/** The event Chrome-family browsers fire when they would install the app. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());

// Caught as soon as this module is loaded (components/InstallWatch, in the
// layout, loads it with the page): the event fires once, early, and is gone.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    tell();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    tell();
  });
}

/** Hear when either of those changes. */
export function onInstallChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Running from the Home Screen already, rather than in a browser tab. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (installedNow) return true;
  const mode = (m: string) => window.matchMedia?.(`(display-mode: ${m})`).matches;
  return (
    mode("standalone") ||
    mode("fullscreen") ||
    mode("minimal-ui") ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

/** The apps whose own browsers cannot add a page to a Home Screen. */
const IN_APP: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN\/Messenger|MessengerForiOS|MessengerLite/i, "Messenger"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/musical_ly|Bytedance|TikTok/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Pinterest/i, "Pinterest"],
  [/Twitter|XApp/i, "X"],
  [/Threads|Barcelona/i, "Threads"],
  [/\bLine\//i, "LINE"],
  [/GSA\//i, "Google"],
];

/** How this reader, on this device, adds Communion to their Home Screen. */
export function installWay(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): InstallWay {
  if (isInstalled()) return { k: "installed" };
  const touchMac =
    /Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || touchMac;
  const ipad = /iPad/.test(ua) || touchMac;
  const android = /Android/.test(ua);

  for (const [re, app] of IN_APP) {
    if (re.test(ua) && (ios || android)) return { k: "inapp", app, os: ios ? "ios" : "android" };
  }
  // an Android web view inside some other app says "wv"; an iPhone one has no
  // "Safari" in it at all
  if (android && /; wv\)/.test(ua)) return { k: "inapp", app: "", os: "android" };

  if (ios) {
    if (!/Safari\//.test(ua) && !/CriOS|EdgiOS|FxiOS|OPiOS/.test(ua)) {
      return { k: "inapp", app: "", os: "ios" };
    }
    const browser = /CriOS/.test(ua)
      ? "chrome"
      : /EdgiOS/.test(ua)
        ? "edge"
        : /FxiOS/.test(ua)
          ? "firefox"
          : /OPiOS|GSA|YaBrowser|DuckDuckGo/.test(ua)
            ? "other"
            : "safari";
    if (browser === "safari") return { k: "ios-safari", ipad };
    // other browsers on an iPhone gained Add to Home Screen in iOS 16.4
    const v = /OS (\d+)_(\d+)/.exec(ua);
    const major = v ? Number(v[1]) : 99;
    const minor = v ? Number(v[2]) : 0;
    if (major < 16 || (major === 16 && minor < 4)) return { k: "ios-old" };
    return { k: "ios-browser", browser, ipad };
  }

  // asked, it installs in one tap: Chrome, Edge, Samsung Internet, Opera…
  if (deferred) return { k: "prompt", os: android ? "android" : /Mobile/.test(ua) ? "other" : "desktop" };

  if (android) {
    const browser = /SamsungBrowser/.test(ua)
      ? "samsung"
      : /Firefox/.test(ua)
        ? "firefox"
        : /EdgA/.test(ua)
          ? "edge"
          : /OPR|Opera/.test(ua)
            ? "opera"
            : /Chrome/.test(ua)
              ? "chrome"
              : "other";
    return { k: "android", browser };
  }

  const browser = /Edg\//.test(ua)
    ? "edge"
    : /Firefox/.test(ua)
      ? "firefox"
      : /Chrome/.test(ua)
        ? "chrome"
        : /Safari/.test(ua)
          ? "safari"
          : "other";
  return { k: "desktop", browser };
}

/**
 * Ask the browser to install it, where it can be asked. The event can be
 * used once; after it, the browser decides when to offer it again.
 */
export async function askToInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === "accepted") installedNow = true;
    tell();
    return outcome;
  } catch {
    tell();
    return "unavailable";
  }
}

/**
 * Chrome, opened on this page, from inside another app on Android: an intent
 * link most in-app browsers hand straight to Chrome.
 */
export function chromeIntent(url: string): string {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
