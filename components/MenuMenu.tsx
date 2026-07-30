"use client";

// The menu, as a menu.
//
// It used to be a page: tapping the ☰ took you off whatever you were doing to
// a screen of four tiles, and getting back was a second decision. But nothing
// on it is a destination in its own right — the calendar, settings, about,
// and inviting somebody. It is a list of ways out, and a list of ways out is
// what a menu is. So it opens where it is, over the page, and closes without
// going anywhere.
//
// /menu still exists and still works. Anyone who has it bookmarked, or lands
// on it from a link, gets the tiles as before; the two are written from the
// same list (lib/menuItems.ts) so they cannot come to disagree about what is
// on the menu.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/client";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { MENU_ITEMS, shareCommunion } from "@/lib/menuItems";

export default function MenuMenu({
  className = "theme-toggle settings-gear",
  onNavigate,
}: {
  className?: string;
  /** the reader's navigator closes itself when the menu takes you somewhere */
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Asked once the menu is first opened rather than on every page load. The
  // answer is the same all session, and nobody who never opens the menu needs
  // it asked at all.
  useEffect(() => {
    if (!open || isAdmin) return;
    api<{ isAdmin?: boolean }>("/api/profile")
      .then((res) => setIsAdmin(!!res.isAdmin))
      .catch(() => {});
  }, [open, isAdmin]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A menu that is still hanging open over the page you asked it for is a
  // menu that did not do its job.
  useEffect(() => setOpen(false), [pathname]);

  const share = async () => {
    const copiedIt = await shareCommunion(
      t("menu.shareMessage", { url: "https://communion-mu.vercel.app" })
    );
    if (!copiedIt) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const leave = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div className="menu-pop-wrap" ref={box}>
      <button
        type="button"
        className={`${className}${open ? " settings-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("nav.menu")}
        title={t("nav.menu")}
      >
        <Icon name="menu" />
      </button>

      {open && (
        <div className="menu-pop glass" role="menu">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              role="menuitem"
              className={`menu-pop-item${
                pathname.startsWith(item.href) ? " on" : ""
              }`}
              onClick={leave}
            >
              <Icon name={item.icon} />
              <span>
                <strong>{t(`menu.${item.key}` as MessageKey)}</strong>
                <small>{t(`menu.${item.key}Desc` as MessageKey)}</small>
              </span>
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            className="menu-pop-item"
            onClick={share}
          >
            <Icon name="phone" />
            <span>
              <strong>{t("menu.share")}</strong>
              <small>
                {copied ? `✓ ${t("reader.shareCopied")}` : t("menu.shareDesc")}
              </small>
            </span>
          </button>
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              className="menu-pop-item"
              onClick={leave}
            >
              <Icon name="tools" />
              <span>
                <strong>Admin</strong>
                <small>People, Gatherings, and activity</small>
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
