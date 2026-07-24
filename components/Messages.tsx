"use client";

// Messages inbox: conversations sorted by recency, plus a picker of church
// members to start a new conversation.

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import BackToMenu from "@/components/BackToMenu";

interface ConvSummary {
  peerId: string;
  peerName: string;
  peerIcon?: string;
  lastText: string;
  lastFrom: string;
  ts: number;
  unread: number;
}

interface Contact {
  userId: string;
  displayName: string;
  icon?: string;
}

interface NotifEntry {
  title: string;
  body: string;
  url?: string;
  ts: number;
}

export default function Messages() {
  const { lang, t } = useI18n();
  const [convs, setConvs] = useState<ConvSummary[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<NotifEntry[] | null>(null);

  const toggleHistory = () => {
    setShowHistory((v) => !v);
    if (history === null) {
      api<{ notifications: NotifEntry[] }>("/api/notifications")
        .then((res) => setHistory(res.notifications))
        .catch(() => setHistory([]));
    }
  };

  useEffect(() => {
    api<{
      conversations: ConvSummary[];
      contacts: Contact[];
      myUserId: string;
    }>("/api/messages")
      .then((res) => {
        setConvs(res.conversations);
        setContacts(res.contacts);
        setMyUserId(res.myUserId);
      })
      .catch(() => setConvs([]));
  }, []);

  const openConvPeers = new Set(convs?.map((c) => c.peerId) ?? []);
  const newContacts = contacts.filter((c) => !openConvPeers.has(c.userId));

  return (
    <div>
      <BackToMenu />
      <div className="section-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          💬 {t("messages.title")}
        </h1>
        <span style={{ display: "inline-flex", gap: 8 }}>
          <button
            type="button"
            className={`btn btn-sm${showHistory ? " btn-primary" : ""}`}
            onClick={toggleHistory}
            aria-pressed={showHistory}
          >
            🔔 {t("messages.history")}
          </button>
          {contacts.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setShowNew((v) => !v)}
            >
              ＋ {t("messages.new")}
            </button>
          )}
        </span>
      </div>
      <p className="subtitle">{t("messages.subtitle")}</p>

      {showHistory && (
        <div className="glass card" style={{ marginBottom: 14 }}>
          <p className="cal-label" style={{ marginBottom: 8 }}>
            🔔 {t("messages.history")}
          </p>
          {history === null ? (
            <p className="skeleton">{t("common.loading")}</p>
          ) : history.length === 0 ? (
            <p className="cal-hint">{t("messages.historyEmpty")}</p>
          ) : (
            <div className="notif-list">
              {history.map((n, i) => (
                <Link
                  key={i}
                  href={n.url || "/menu/messages"}
                  className="notif-row"
                >
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
          )}
        </div>
      )}

      {showNew && (
        <div className="glass card" style={{ marginBottom: 14 }}>
          <p className="cal-label" style={{ marginBottom: 8 }}>
            {t("messages.pickContact")}
          </p>
          {newContacts.length === 0 ? (
            <p className="cal-hint">{t("messages.allStarted")}</p>
          ) : (
            <div className="chips">
              {newContacts.map((c) => (
                <Link
                  key={c.userId}
                  href={`/menu/messages/${c.userId}`}
                  className="chip"
                >
                  {c.icon && <span className="chip-icon">{c.icon}</span>}
                  {c.displayName}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {convs === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : convs.length === 0 ? (
        <div className="glass card empty">
          {contacts.length === 0
            ? t("messages.noContacts")
            : t("messages.empty")}
        </div>
      ) : (
        convs.map((conv) => (
          <Link
            key={conv.peerId}
            href={`/menu/messages/${conv.peerId}`}
            className="glass card conv-row"
          >
            <span className="conv-avatar">{conv.peerIcon || "🙏"}</span>
            <span className="conv-body">
              <strong>
                {conv.peerName}
                {conv.unread > 0 && (
                  <span className="conv-unread">{conv.unread}</span>
                )}
              </strong>
              <small>
                {conv.lastFrom === myUserId ? `${t("messages.you")}: ` : ""}
                {conv.lastText}
              </small>
            </span>
            <span className="conv-time">
              {new Date(conv.ts).toLocaleDateString(
                lang === "es" ? "es" : "en",
                { month: "short", day: "numeric" }
              )}
            </span>
          </Link>
        ))
      )}
      <p className="notice">{t("messages.hint")}</p>
    </div>
  );
}
