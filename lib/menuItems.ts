// What is on the menu, written once.
//
// Two things render this: the ☰ dropdown in the header (components/MenuMenu)
// and the /menu page it replaced, which is still there for anyone who has it
// bookmarked or arrives from a link. A list kept in two places is a list that
// will eventually say two different things.
//
// The journal is not here, and neither is offline. The journal is a tab of its
// own, one tap away already; downloading for offline is something you set up
// once and then forget, which is what settings is for.

import type { IconName } from "@/components/Icon";

export interface MenuItem {
  href: string;
  icon: IconName;
  /** the i18n stem: `menu.<key>` names it, `menu.<key>Desc` explains it */
  key: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { href: "/calendar", icon: "calendar", key: "calendar" },
  { href: "/menu/settings", icon: "gear", key: "settings" },
  { href: "/menu/about", icon: "dove", key: "about" },
];

/**
 * Pass Communion on.
 *
 * A phone opens its messages app with the invitation already written, which is
 * what somebody means when they say they will send it to a friend. Everywhere
 * else it goes through the native share sheet if there is one, and to the
 * clipboard if there is not.
 *
 * Returns true only when the text was copied and the caller therefore has to
 * say so — the other two routes have already shown the reader something.
 */
export async function shareCommunion(message: string): Promise<boolean> {
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isMobile) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.location.href = isIOS
      ? `sms:&body=${encodeURIComponent(message)}`
      : `sms:?body=${encodeURIComponent(message)}`;
    return false;
  }
  if (navigator.share) {
    try {
      await navigator.share({ text: message });
      return false;
    } catch {
      // cancelled — fall through to copy
    }
  }
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch {
    // clipboard unavailable — nothing more we can do silently
    return false;
  }
}
