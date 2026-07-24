"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n, type MessageKey } from "@/lib/i18n";

// The Menu tab: a hub of tiles for profile, notifications, settings, about,
// and sharing the app itself.

const TILES: { href: string; emoji: string; key: string }[] = [
  { href: "/menu/profile", emoji: "👤", key: "profile" },
  { href: "/menu/notifications", emoji: "🔔", key: "notifications" },
  { href: "/menu/settings", emoji: "⚙️", key: "settings" },
  { href: "/menu/about", emoji: "🕊️", key: "about" },
];

export default function MenuHub() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const shareApp = async () => {
    const message = t("menu.shareMessage", {
      url: "https://communion-mu.vercel.app",
    });
    // phones: open Messages with the invitation prefilled
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isMobile) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      window.location.href = isIOS
        ? `sms:&body=${encodeURIComponent(message)}`
        : `sms:?body=${encodeURIComponent(message)}`;
      return;
    }
    // desktop: native share sheet, else copy the message
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        // cancelled — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable — nothing more we can do silently
    }
  };

  return (
    <div>
      <h1 className="page-title">{t("menu.title")}</h1>
      <p className="subtitle">{t("menu.subtitle")}</p>
      <div className="menu-tiles">
        {TILES.map((tile) => (
          <Link key={tile.key} href={tile.href} className="glass card menu-tile">
            <span className="menu-tile-emoji">{tile.emoji}</span>
            <span className="menu-tile-body">
              <strong>{t(`menu.${tile.key}` as MessageKey)}</strong>
              <small>{t(`menu.${tile.key}Desc` as MessageKey)}</small>
            </span>
            <span className="menu-tile-arrow">→</span>
          </Link>
        ))}
        <button type="button" className="glass card menu-tile" onClick={shareApp}>
          <span className="menu-tile-emoji">💬</span>
          <span className="menu-tile-body">
            <strong>{t("menu.share")}</strong>
            <small>
              {copied ? `✓ ${t("reader.shareCopied")}` : t("menu.shareDesc")}
            </small>
          </span>
          <span className="menu-tile-arrow">→</span>
        </button>
      </div>
    </div>
  );
}
