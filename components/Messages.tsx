"use client";

// Messages inbox: conversations sorted by recency, plus a picker of church
// members to start a new conversation.

import Link from "next/link";
import Icon from "@/components/Icon";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { useStickyTab } from "@/lib/stickyTab";
import BackToMenu from "@/components/BackToMenu";
import PrayerList from "@/components/PrayerList";

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

/*
 * There was a second age check here, on top of the server's.
 *
 * It earned its place while the shelf life was a day: this answer is one the
 * service worker may keep, so with no signal what arrived could be a day and
 * a half old, and a screen promising the last day would have been lying by
 * half of it. Against a month, a cached answer a day stale is a cached answer
 * that is still true, and re-filtering it would only throw away rows the
 * server meant to send. The server's window is the only one now.
 */

/**
 * How many notifications are shown before you ask for more.
 *
 * Five is what fits above the fold beside everything else on this screen,
 * and what somebody opening the tab to check what they missed actually
 * wants. The rest are a tap away rather than a scroll away.
 */
const NOTIF_PAGE = 5;

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


/** The toggles, in the order the row shows them. */
const TABLE_TABS = ["convs", "prayer", "history"] as const;

export default function Messages() {
  const { lang, t } = useI18n();
  const [convs, setConvs] = useState<ConvSummary[] | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [showNew, setShowNew] = useState(false);
  /**
   * Which of the Table's three views is up.
   *
   * The prayer wall used to be the third segment of Discover's toggle, which
   * put it behind "find something" — and a request being carried is not
   * something you go looking for, it is something that has arrived for you.
   * Everything that arrives arrives here, so it lives here now, in the same
   * toggle Discover uses.
   *
   * Notifications came in as a button beside the title. With a toggle across
   * the top there is no sense in two ways of changing view within an inch of
   * each other, so it is a segment as well: all three are things waiting at
   * the Table, and they now read as peers.
   */
  const [tab, setTab] = useStickyTab("table", "convs", TABLE_TABS);
  /** how many of them are on screen; grows by NOTIF_PAGE on each request */
  const [notifShown, setNotifShown] = useState(NOTIF_PAGE);
  const showHistory = tab === "history";
  const [history, setHistory] = useState<NotifEntry[] | null>(null);
  /** the directory search: what was typed, who came back, and whether asking */
  const [find, setFind] = useState("");
  const [found, setFound] = useState<Contact[] | null>(null);
  const [finding, setFinding] = useState(false);

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

  // The directory, searched as you type. Debounced because every keystroke
  // would otherwise be a request, and the answers arrive out of order when
  // they are: the timer is cleared on each change so only the last one asks.
  useEffect(() => {
    if (!showNew) return;
    const term = find.trim();
    setFinding(true);
    const timer = window.setTimeout(() => {
      api<{ users: Contact[] }>(
        `/api/users?q=${encodeURIComponent(term)}`
      )
        .then((res) => {
          // people already in your Gatherings are offered above; showing them
          // twice makes the list look like it has duplicates in it
          const known = new Set(contacts.map((c) => c.userId));
          setFound(res.users.filter((u) => !known.has(u.userId)));
        })
        .catch(() => setFound([]))
        .finally(() => setFinding(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      setFinding(false);
    };
  }, [find, showNew, contacts]);

  /*
   * The history, fetched once and kept: a day's worth does not change while
   * it is open, and re-asking on every visit would be a request for nothing.
   *
   * In an effect keyed on the tab rather than in the handler below, and that
   * is not tidying. The tab is remembered between visits now, so it can be
   * restored without anybody pressing anything — and while this fetch lived
   * in the click handler, a reader who left the app on Notifications came
   * back to a loading spinner that never resolved, because nothing had been
   * clicked to start it.
   */
  useEffect(() => {
    if (tab !== "history" || history !== null) return;
    api<{ notifications: NotifEntry[] }>("/api/notifications")
      .then((res) => setHistory(res.notifications))
      .catch(() => setHistory([]));
  }, [tab, history]);

  const goTo = (next: "convs" | "prayer" | "history") => {
    setTab(next);
    if (next !== "convs") setShowNew(false);
    // coming back to the tab starts at the newest five again, not wherever a
    // previous visit had unrolled it to
    if (next === "history") setNotifShown(NOTIF_PAGE);
  };

  const openConvPeers = new Set(convs?.map((c) => c.peerId) ?? []);
  const newContacts = contacts.filter((c) => !openConvPeers.has(c.userId));

  return (
    <div>
      <BackToMenu />
      <div className="section-head">
        {/* The title stays put: none of the three is a different screen. */}
        <h1 className="page-title" style={{ margin: 0 }}>
          <Icon name="table" /> {t("messages.title")}
        </h1>
        <span className="head-actions">
          {/* Always offered. It used to appear only once you shared a
              Gathering with somebody, which was the right gate when that was
              the only way to message anyone — and is exactly the wrong one now
              that the point is reaching believers you share nothing with. */}
          {tab === "convs" && (
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

      {/* the same toggle Discover uses, and the same classes, so the two
          screens are read the same way */}
      <div className="lang-toggle discover-tabs" role="group">
        <button
          className={tab === "convs" ? "active" : ""}
          onClick={() => goTo("convs")}
          aria-pressed={tab === "convs"}
        >
          <Icon name="chat" /> {t("messages.conversations")}
        </button>
        <button
          className={tab === "prayer" ? "active" : ""}
          onClick={() => goTo("prayer")}
          aria-pressed={tab === "prayer"}
        >
          <Icon name="prayer" /> {t("messages.tabPrayer")}
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => goTo("history")}
          aria-pressed={tab === "history"}
        >
          <Icon name="bell" /> {t("messages.history")}
        </button>
      </div>

      <p className="subtitle">
        {tab === "history"
          ? t("messages.historySubtitle")
          : tab === "prayer"
            ? t("messages.prayerSubtitle")
            : t("messages.subtitle")}
      </p>

      {tab === "prayer" && <PrayerList />}

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
            <>
              <div className="notif-list">
                {history.slice(0, notifShown).map((n, i) => (
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
              {history.length > notifShown && (
                <div className="notif-more">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setNotifShown((n) => n + NOTIF_PAGE)}
                  >
                    {t("messages.loadMore", {
                      count: String(history.length - notifShown),
                    })}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showNew && tab === "convs" && (
        <div className="glass card" style={{ marginBottom: 14 }}>
          <p className="cal-label" style={{ marginBottom: 8 }}>
            {t("messages.pickContact")}
          </p>
          {/* Your Gatherings first, because those are the people you are most
              likely to be looking for and they need no typing. */}
          {newContacts.length > 0 && (
            <div className="chips" style={{ marginBottom: 12 }}>
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
          <label className="cal-label" htmlFor="find-believer">
            {t("messages.findAnyone")}
          </label>
          <input
            id="find-believer"
            className="input"
            type="search"
            autoComplete="off"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={t("messages.findPlaceholder")}
          />
          {finding ? (
            <p className="skeleton">{t("common.loading")}</p>
          ) : found === null ? (
            <p className="cal-hint">{t("messages.findHint")}</p>
          ) : found.length === 0 ? (
            <p className="cal-hint">{t("messages.findNone")}</p>
          ) : (
            <div className="chips" style={{ marginTop: 10 }}>
              {found.map((c) => (
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

      {tab !== "convs" ? null : convs === null ? (
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
      {tab === "convs" && <p className="notice">{t("messages.hint")}</p>}
    </div>
  );
}
