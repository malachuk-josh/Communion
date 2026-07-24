"use client";

// Notification feed: session reminders, join requests, and new messages,
// newest first. Opening this page marks the feed seen, clearing its share
// of the pending badge.

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import BackToMenu from "@/components/BackToMenu";

interface NotifEntry {
  title: string;
  body: string;
  url?: string;
  ts: number;
}

export default function Notifications() {
  const { lang, t } = useI18n();
  const [items, setItems] = useState<NotifEntry[] | null>(null);

  useEffect(() => {
    api<{ notifications: NotifEntry[] }>("/api/notifications")
      .then((res) => setItems(res.notifications))
      .catch(() => setItems([]));
    api("/api/notifications", { method: "POST" }).catch(() => {});
  }, []);

  return (
    <div>
      <BackToMenu />
      <h1 className="page-title">🔔 {t("messages.history")}</h1>
      <p className="subtitle">{t("messages.historySubtitle")}</p>

      {items === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <div className="glass card empty">{t("messages.historyEmpty")}</div>
      ) : (
        <div className="glass card">
          <div className="notif-list">
            {items.map((n, i) => (
              <Link key={i} href={n.url || "/menu"} className="notif-row">
                <span className="notif-body">
                  <strong>{n.title}</strong>
                  <small>{n.body}</small>
                </span>
                <span className="conv-time">
                  {new Date(n.ts).toLocaleDateString(
                    lang === "es" ? "es" : "en",
                    { month: "short", day: "numeric" }
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
