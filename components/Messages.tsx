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

interface ThreadRow {
  id: string;
  churchId: string;
  churchName: string;
  title: string;
  lastText: string;
  lastAt: number;
  replies: number;
}


export default function Messages() {
  const { lang, t } = useI18n();
  const [convs, setConvs] = useState<ConvSummary[] | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [showNew, setShowNew] = useState(false);

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

  const openConvPeers = new Set(convs?.map((c) => c.peerId) ?? []);
  const newContacts = contacts.filter((c) => !openConvPeers.has(c.userId));

  return (
    <div>
      <BackToMenu />
      <div className="section-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          💬 {t("messages.title")}
        </h1>
        {contacts.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setShowNew((v) => !v)}
          >
            ＋ {t("messages.new")}
          </button>
        )}
      </div>
      <p className="subtitle">{t("messages.subtitle")}</p>

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
      ) : convs.length === 0 && threads.length === 0 ? (
        <div className="glass card empty">
          {contacts.length === 0
            ? t("messages.noContacts")
            : t("messages.empty")}
        </div>
      ) : (
        // direct messages and Fellowship discussions share one list,
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
                  <span className="conv-avatar">{row.dm.peerIcon || "🙏"}</span>
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
                <span className="conv-avatar">💬</span>
                <span className="conv-body">
                  <strong>{row.thread.title}</strong>
                  <small>
                    ⛪ {row.thread.churchName}
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
      <p className="notice">{t("messages.hint")}</p>
    </div>
  );
}
