"use client";

import Link from "next/link";
import Icon from "@/components/Icon";
import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { MENU_ITEMS, shareCommunion } from "@/lib/menuItems";

// The /menu page: the same list as the ☰ dropdown, as tiles.
//
// The dropdown is how anybody reaches this now — it opens over whatever page
// they were on instead of taking them off it. This is kept because the route
// still exists: it is bookmarked, it is linked from the ← on settings and
// about, and a URL that has worked should go on working. Both are written from
// MENU_ITEMS, so neither can quietly grow an entry the other does not have.

export default function MenuHub() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // The admin tile appears for the owner, and for anyone the owner has
  // trusted — the server decides which, and says so here in one word. Nobody
  // else is told the tile could exist.
  useEffect(() => {
    api<{ isAdmin?: boolean }>("/api/profile")
      .then((res) => setIsAdmin(!!res.isAdmin))
      .catch(() => {});
  }, []);

  const shareApp = async () => {
    const done = await shareCommunion(
      t("menu.shareMessage", { url: "https://communion-mu.vercel.app" })
    );
    if (!done) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div>
      <h1 className="page-title">{t("menu.title")}</h1>
      <p className="subtitle">{t("menu.subtitle")}</p>
      <div className="menu-tiles">
        {MENU_ITEMS.map((tile) => (
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
        {isAdmin && (
          <Link href="/admin" className="glass card menu-tile admin-tile">
            <span className="menu-tile-emoji"><Icon name="tools" /></span>
            <span className="menu-tile-body">
              <strong>Admin</strong>
              <small>People, Gatherings, and activity</small>
            </span>
            <span className="menu-tile-arrow">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
