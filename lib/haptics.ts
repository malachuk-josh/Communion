"use client";

// A small tap under the finger when something lands: a verse kept, a prayer
// prayed, a row picked up and put down. Never for navigation, never for
// scrolling, never twice for the same act — a phone that buzzes at everything
// is a phone people turn off.
//
// Two engines, because there is no one way to do this on the web.
//
// Android and anything else with the Vibration API gets navigator.vibrate,
// which takes a duration in milliseconds.
//
// iOS has never implemented it — not on iPhone, not on iPad, not in any
// browser on either, because every iOS browser is Safari underneath. What iOS
// does have, since 17.4, is a switch control that taps the Taptic Engine when
// it flips. So there is one off-screen switch on the page, and asking for a
// haptic clicks its label. It is a lever pulled for the vibration and not for
// the switch, which is why the checkbox it toggles is never read.
//
// Below 17.4, and on desktop, both paths come to nothing and the app is
// exactly as it was. There is no way to feature-detect the Taptic path — the
// element exists whether or not it buzzes — so nothing is promised about it.

const KEY = "communion.haptics";

export type Haptic =
  /** something small landed: a verse kept, a chip pressed */
  | "light"
  /** something committed: a row dropped into place, a request sent */
  | "medium"
  /** a gesture armed and will fire when released */
  | "arm";

/** Milliseconds of buzz, for the engine that measures in milliseconds. */
const MS: Record<Haptic, number> = { light: 10, medium: 18, arm: 12 };

/**
 * On by default, which is what the platforms do and what people expect. Only
 * an explicit "off" turns it off, so a first visit with nothing stored is on.
 */
export function hapticsOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // storage blocked — the setting lasts the session and no more
  }
}

/** A pointer that is a finger. Mice do not buzz, and should not be asked to. */
function isTouch(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator.maxTouchPoints > 0 ||
      window.matchMedia?.("(pointer: coarse)").matches === true)
  );
}

let taptic: HTMLLabelElement | null = null;

/**
 * The iOS lever, built once and left in the page.
 *
 * It has to be built ahead of the first tap rather than at it: a control
 * created and clicked in the same tick has not been through layout, and iOS
 * gives nothing for it. So this is called on startup and the element waits.
 *
 * Off-screen rather than display:none — a control that is not being laid out
 * is not a control iOS will animate, and the haptic rides on the animation.
 */
export function primeHaptics(): void {
  if (taptic || typeof document === "undefined") return;
  const input = document.createElement("input");
  input.type = "checkbox";
  // the attribute iOS 17.4 looks for; unknown attributes are ignored elsewhere
  input.setAttribute("switch", "");
  input.id = "communion-taptic";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  const label = document.createElement("label");
  label.htmlFor = input.id;
  label.setAttribute("aria-hidden", "true");
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
  box.append(input, label);
  document.body.append(box);
  taptic = label;
}

/**
 * Ask for a tap. Silent everywhere it cannot happen, and cheap enough to call
 * from a handler without thinking about it.
 */
export function haptic(kind: Haptic = "light"): void {
  if (typeof window === "undefined" || !isTouch() || !hapticsOn()) return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(MS[kind]);
      return;
    }
    primeHaptics();
    taptic?.click();
  } catch {
    // a platform that refuses is a platform without haptics, which is fine
  }
}
