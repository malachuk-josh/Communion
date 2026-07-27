"use client";

// Messages inbox: conversations sorted by recency, plus a picker of church
// members to start a new conversation.

import Link from "next/link";
import Icon from "@/components/Icon";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import BackToMenu from "@/components/BackToMenu";

interface ConvSummary {
  peerId: string;
  peerName: string;
  lastText: string;
  lastFrom: string;
  ts: number;
  unread: number;
}

interface Contact {
  userId: string;
  displayName: string;
}

interface ThreadRow {
  id: string;
  churchId: string;
  churchName: string;
  title: string;
  lastText: string;
  lastAt: number;
  replies: number;
}

interface NotifEntry {
  title: string;
  body: string;
  url?: string;
  ts: number;
}

/**
 * The shelf life, applied here as well as on the server. The server filters
 * what it sends, but this answer is one the service worker is allowed to keep
 * — so with no signal what arrives is whatever was true when it was last
 * asked, and by tomorrow that could be a day and a half old. Re-checking the
 * age of what is about to be drawn keeps the promise on screen true.
 */
const NOTIF_TTL_MS = 24 * 60 * 60 * 1000;

/** "3:40 PM" for today, "Tue 8:15 AM" for yesterday — never a bare date. */
function whenLabel(ts: number, lang: string): string {
  const locale = lang === "es" ? "es" : "en";
  const time = new Date(ts).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const today = new Date().toDateString() === new Date(ts).toDateString();
  if (today) return time;
  const day = new Date(ts).toLocaleDateString(locale, { weekday: "short" });
  return `${day} ${time}`;
}


export default function Messages() {
  const { lang, t } = useI18n();
  const [convs, setConvs] = useState<ConvSummary[] | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<NotifEntry[] | null>(null);

  useEffect(() => {
    api<{
      conversations: ConvSummary[];
      contacts: Contact[];
      threads: ThreadRow[];
      myUserId: string;
    }>("/api/messages")
      .then((res) => {
        setConvs(res.conversations);
        setContacts(res.contacts);
        setThreads(res.threads ?? []);
        setMyUserId(res.myUserId);
      })
      .catch(() => setConvs([]));
  }, []);

  const clearChat = async (peerId: string) => {
    if (!window.confirm(t("messages.clearConfirm"))) return;
    setConvs((prev) => prev?.filter((c) => c.peerId !== peerId) ?? null);
    try {
      await api(`/api/messages/${peerId}`, { method: "DELETE" });
    } catch {
      // transient — the next load shows the truth
    }
  };

  const toggleHistory = () => {
    const opening = !showHistory;
    setShowHistory(opening);
    if (opening) setShowNew(false);
    // fetched once and kept: a day's worth does not change while it is open,
    // and re-asking on every toggle would be a request for nothing
    if (opening && history === null) {
      api<{ notifications: NotifEntry[] }>("/api/notifications")
        .then((res) => {
          const since = Date.now() - NOTIF_TTL_MS;
          setHistory(res.notifications.filter((n) => n.ts >= since));
        })
        .catch(() => setHistory([]));
    }
  };

  const openConvPeers = new Set(convs?.map((c) => c.peerId) ?? []);
  const newContacts = contacts.filter((c) => !openConvPeers.has(c.userId));

  return (
    <div>
      <BackToMenu />
      <div className="section-head">
        {/* The title stays put. Notifications are a view of the Table, not a
            different screen — and "NOTIFICATIONS" set at this size, uppercased
            by the surrounding rule, is one long word that cannot share a line
            with a button: it wrapped, and left the icon stranded above it. */}
        <h1 className="page-title" style={{ margin: 0 }}>
          <Icon name="chat" /> {t("messages.title")}
        </h1>
        <span className="head-actions">
          <button
            type="button"
            className={`btn btn-sm${showHistory ? " btn-primary" : ""}`}
            onClick={toggleHistory}
            aria-pressed={showHistory}
          >
            {/* not "← The Table": that is the heading above it, and a button
                offering to take you where you already are reads as a mistake */}
            {showHistory
              ? `← ${t("messages.conversations")}`
              : t("messages.history")}
          </button>
          {!showHistory && contacts.length > 0 && (
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
      <p className="subtitle">
        {showHistory ? t("messages.historySubtitle") : t("messages.subtitle")}
      </p>

      {showHistory && (
        <div className="glass card">
          <p className="cal-label notif-label">
            <Icon name="bell" /> {t("messages.history")}
          </p>
          {history === null ? (
            <p className="skeleton">{t("common.loading")}</p>
          ) : history.length === 0 ? (
            <p className="cal-hint">{t("messages.historyEmpty")}</p>
          ) : (
            <div className="notif-list">
              {history.map((n, i) => (
                <Link
                  key={`${n.ts}-${i}`}
                  href={n.url || "/menu/messages"}
                  className="notif-row"
                >
                  <span className="notif-body">
                    <strong>{n.title}</strong>
                    <small>{n.body}</small>
                  </span>
                  <span className="conv-time">{whenLabel(n.ts, lang)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {showNew && !showHistory && (
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
                  {c.displayName}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {showHistory ? null : convs === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : convs.length === 0 && threads.length === 0 ? (
        <div className="glass card empty">
          {contacts.length === 0
            ? t("messages.noContacts")
            : t("messages.empty")}
        </div>
      ) : (
        // direct messages and Gathering discussions share one list,
        // ordered by whichever spoke last
        [
          ...convs.map((c) => ({ kind: "dm" as const, ts: c.ts, dm: c })),
          ...threads.map((th) => ({
            kind: "thread" as const,
            ts: th.lastAt,
            thread: th,
          })),
        ]
          .sort((a, b) => b.ts - a.ts)
          .map((row) =>
            row.kind === "dm" ? (
              <div key={`dm-${row.dm.peerId}`} className="glass card conv-row">
                <Link
                  href={`/menu/messages/${row.dm.peerId}`}
                  className="conv-row-link"
                >
                  <span className="conv-avatar"><Icon name="person" /></span>
                  <span className="conv-body">
                    <strong>
                      {row.dm.peerName}
                      {row.dm.unread > 0 && (
                        <span className="conv-unread">{row.dm.unread}</span>
                      )}
                    </strong>
                    <small>
                      {row.dm.lastFrom === myUserId
                        ? `${t("messages.you")}: `
                        : ""}
                      {row.dm.lastText}
                    </small>
                  </span>
                  <span className="conv-time">
                    {new Date(row.ts).toLocaleDateString(
                      lang === "es" ? "es" : "en",
                      { month: "short", day: "numeric" }
                    )}
                  </span>
                </Link>
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={t("messages.clearChat")}
                  title={t("messages.clearChat")}
                  onClick={() => clearChat(row.dm.peerId)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <Link
                key={`th-${row.thread.id}`}
                href={`/churches/${row.thread.churchId}/threads/${row.thread.id}`}
                className="glass card conv-row"
              >
                <span className="conv-avatar"><Icon name="chat" /></span>
                <span className="conv-body">
                  <strong>{row.thread.title}</strong>
                  <small>
                    <Icon name="church" /> {row.thread.churchName}
                    {row.thread.lastText ? ` · ${row.thread.lastText}` : ""}
                  </small>
                </span>
                <span className="conv-time">
                  {new Date(row.ts).toLocaleDateString(
                    lang === "es" ? "es" : "en",
                    { month: "short", day: "numeric" }
                  )}
                </span>
              </Link>
            )
          )
      )}
      {!showHistory && <p className="notice">{t("messages.hint")}</p>}
    </div>
  );
}
