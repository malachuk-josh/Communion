"use client";

import Link from "next/link";
import Icon, { type IconName } from "@/components/Icon";
import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n, type MessageKey } from "@/lib/i18n";

// The Menu tab: a hub of tiles for the journal, the calendar, settings, about,
// and sharing the app itself.
//
// Downloading for offline used to be a tile of its own. It is a thing you set
// up once and then forget, which is what the settings screen is for, so it
// lives there now — and the invitation takes the place it left, directly under
// settings, where it is the likeliest thing anyone came to this screen to do.

const TILES: { href: string; icon: IconName; key: string }[] = [
  { href: "/menu/journal", icon: "scroll", key: "journal" },
  { href: "/calendar", icon: "calendar", key: "calendar" },
  { href: "/menu/settings", icon: "gear", key: "settings" },
  { href: "/menu/about", icon: "dove", key: "about" },
];

export default function MenuHub() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // the admin tile only appears for the app owner, and only on desktop
  useEffect(() => {
    api<{ isOwner?: boolean }>("/api/profile")
      .then((res) => setIsOwner(!!res.isOwner))
      .catch(() => {});
  }, []);

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
          <Fragment key={tile.key}>
            <Link href={tile.href} className="glass card menu-tile">
              <span className="menu-tile-emoji"><Icon name={tile.icon} /></span>
              <span className="menu-tile-body">
                <strong>{t(`menu.${tile.key}` as MessageKey)}</strong>
                <small>{t(`menu.${tile.key}Desc` as MessageKey)}</small>
              </span>
              <span className="menu-tile-arrow">→</span>
            </Link>
            {/* not a link, so it cannot live in the list — but it belongs
                directly under settings, so it is placed rather than appended */}
            {tile.key === "settings" && (
              <button
                type="button"
                className="glass card menu-tile"
                onClick={shareApp}
              >
                <span className="menu-tile-emoji"><Icon name="phone" /></span>
                <span className="menu-tile-body">
                  <strong>{t("menu.share")}</strong>
                  <small>
                    {copied ? `✓ ${t("reader.shareCopied")}` : t("menu.shareDesc")}
                  </small>
                </span>
                <span className="menu-tile-arrow">→</span>
              </button>
            )}
          </Fragment>
        ))}
        {isOwner && (
          <Link href="/admin" className="glass card menu-tile admin-tile">
            <span className="menu-tile-emoji"><Icon name="tools" /></span>
            <span className="menu-tile-body">
              <strong>Admin</strong>
              <small>Users, fellowships, and activity — desktop only</small>
            </span>
            <span className="menu-tile-arrow">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
