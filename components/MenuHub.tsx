"use client";

import Link from "next/link";
import { useI18n, type MessageKey } from "@/lib/i18n";

// The Menu tab: a hub of tiles for profile, notifications, settings, about.

const TILES: { href: string; emoji: string; key: string }[] = [
  { href: "/menu/profile", emoji: "👤", key: "profile" },
  { href: "/menu/notifications", emoji: "🔔", key: "notifications" },
  { href: "/menu/settings", emoji: "⚙️", key: "settings" },
  { href: "/menu/about", emoji: "🕊️", key: "about" },
];

export default function MenuHub() {
  const { t } = useI18n();
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
      </div>
    </div>
  );
}
