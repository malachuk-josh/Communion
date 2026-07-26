"use client";

// One conversation: bubbles, polling for new messages while open, and a
// composer pinned above the bottom nav.

import Link from "next/link";
import Icon from "@/components/Icon";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBook } from "@/lib/bible";
import { api } from "@/lib/client";
import { parseBmKey } from "@/lib/bookmarkKey";
import { useI18n } from "@/lib/i18n";

interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  attach?: {
    b: number;
    c: number;
    v: number;
    kind: "bookmark" | "note" | "word";
    label?: string;
  };
}

interface ShareItem {
  b: number;
  c: number;
  v: number;
  kind: "bookmark" | "note";
  label?: string;
}

export default function MessageThread({ peerId }: { peerId: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [peerName, setPeerName] = useState("…");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareItems, setShareItems] = useState<ShareItem[] | null>(null);
  const lastTs = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      if (fresh.length === 0) return prev;
      const next = [...prev, ...fresh].sort((a, b) => a.ts - b.ts);
      return next;
    });
    const maxTs = Math.max(...incoming.map((m) => m.ts));
    if (maxTs > lastTs.current) lastTs.current = maxTs;
  }, []);

  // initial load, then poll for new messages while the thread is open
  useEffect(() => {
    let cancelled = false;
    api<{
      messages: ChatMessage[];
      myUserId: string;
      peerName: string;
    }>(`/api/messages/${peerId}`)
      .then((res) => {
        if (cancelled) return;
        setMyUserId(res.myUserId);
        setPeerName(res.peerName);
        merge(res.messages);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    const timer = window.setInterval(() => {
      api<{ messages: ChatMessage[] }>(
        `/api/messages/${peerId}?since=${lastTs.current}`
      )
        .then((res) => merge(res.messages))
        .catch(() => {});
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [peerId, merge]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await api<{ message: ChatMessage }>(
        `/api/messages/${peerId}`,
        { method: "POST", body: { text } }
      );
      merge([res.message]);
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const removeMessage = async (id: string) => {
    if (!window.confirm(t("messages.deleteConfirm"))) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try {
      await api(`/api/messages/${peerId}`, {
        method: "DELETE",
        body: { messageId: id },
      });
    } catch {
      setError(t("reader.error"));
    }
  };

  const clearChat = async () => {
    if (!window.confirm(t("messages.clearConfirm"))) return;
    try {
      await api(`/api/messages/${peerId}`, { method: "DELETE" });
      router.push("/menu/messages");
    } catch {
      setError(t("reader.error"));
    }
  };

  const openPicker = () => {
    setPickerOpen((v) => !v);
    if (shareItems === null) {
      Promise.all([
        api<{ bookmarks: Record<string, { t: number; l?: string }> }>(
          "/api/bookmarks"
        ).catch(() => ({ bookmarks: {} })),
        api<{ notes: { b: number; c: number; v: number; text: string }[] }>(
          "/api/notes"
        ).catch(() => ({ notes: [] })),
      ]).then(([bm, nt]) => {
        const items: ShareItem[] = [];
        for (const [key, entry] of Object.entries(bm.bookmarks)) {
          // a run attaches at the verse it starts on
          const ref = parseBmKey(key);
          if (!ref) continue;
          items.push({ b: ref.b, c: ref.c, v: ref.v, kind: "bookmark", label: entry.l });
        }
        for (const n of nt.notes) {
          items.push({ b: n.b, c: n.c, v: n.v, kind: "note", label: n.text });
        }
        items.sort((a, b) => a.b - b.b || a.c - b.c || a.v - b.v);
        setShareItems(items);
      });
    }
  };

  const refLabel = (item: { b: number; c: number; v: number }) => {
    const book = getBook(item.b);
    const name = book ? (lang === "es" ? book.es : book.en) : "";
    return `${name} ${item.c}:${item.v}`;
  };

  const sendShare = async (item: ShareItem) => {
    if (sending) return;
    setSending(true);
    setError("");
    setPickerOpen(false);
    try {
      const res = await api<{ message: ChatMessage }>(
        `/api/messages/${peerId}`,
        {
          method: "POST",
          body: {
            text: refLabel(item),
            attach: {
              b: item.b,
              c: item.c,
              v: item.v,
              kind: item.kind,
              label: item.label,
            },
          },
        }
      );
      merge([res.message]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  let lastDay = "";

  return (
    <div className="thread">
      <div className="thread-head">
        <Link href="/menu/messages" className="passage-link">
          ←
        </Link>
        <span className="conv-avatar"><Icon name="person" /></span>
        <h1>{peerName}</h1>
        <button
          type="button"
          className="rsvp-btn"
          onClick={clearChat}
          aria-label={t("messages.clearChat")}
          title={t("messages.clearChat")}
        ><Icon name="trash" /></button>
      </div>

      <div className="thread-scroll">
        {!loaded ? (
          <p className="skeleton">{t("common.loading")}</p>
        ) : messages.length === 0 ? (
          <div className="glass card empty">{t("messages.threadEmpty")}</div>
        ) : (
          messages.map((m) => {
            const day = new Date(m.ts).toLocaleDateString(
              lang === "es" ? "es" : "en",
              { weekday: "short", month: "short", day: "numeric" }
            );
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay && <p className="thread-day">{day}</p>}
                <div
                  className={`bubble${m.from === myUserId ? " mine" : ""}`}
                >
                  {m.attach ? (
                    <Link
                      href={`/?b=${m.attach.b}&c=${m.attach.c}&v=${m.attach.v}`}
                      className="verse-card"
                    >
                      <span className="verse-card-kind">
                        {m.attach.kind === "note"
                          ? t("messages.sharedNote")
                          : m.attach.kind === "word"
                            ? t("messages.sharedWord")
                            : t("messages.sharedBookmark")}
                      </span>
                      <strong><Icon name="book" /> {refLabel(m.attach)}</strong>
                      {m.attach.label && <em>{m.attach.label}</em>}
                      <small>{t("messages.tapToRead")}</small>
                    </Link>
                  ) : (
                    m.text
                  )}
                  <span className="bubble-time">
                    {new Date(m.ts).toLocaleTimeString(
                      lang === "es" ? "es" : "en",
                      { hour: "numeric", minute: "2-digit" }
                    )}
                  </span>
                  {m.from === myUserId && (
                    <button
                      type="button"
                      className="bubble-del"
                      onClick={() => removeMessage(m.id)}
                      aria-label={t("messages.deleteMessage")}
                      title={t("messages.deleteMessage")}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error-text">{error}</p>}
      {pickerOpen && (
        <div className="glass card share-picker">
          <p className="cal-label" style={{ marginBottom: 8 }}>
            {t("messages.share")}
          </p>
          {shareItems === null ? (
            <p className="skeleton">{t("common.loading")}</p>
          ) : shareItems.length === 0 ? (
            <p className="cal-hint">{t("messages.shareEmpty")}</p>
          ) : (
            <div className="share-list">
              {shareItems.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  className="share-row"
                  onClick={() => sendShare(item)}
                >
                  <span><Icon name={item.kind === "note" ? "note" : "bookmark"} /></span>
                  <span className="share-row-body">
                    <strong>{refLabel(item)}</strong>
                    {item.label && <small>{item.label}</small>}
                  </span>
                  <span className="menu-tile-arrow">↑</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="composer glass">
        <button
          type="button"
          className="btn btn-sm"
          onClick={openPicker}
          aria-label={t("messages.share")}
          title={t("messages.share")}
          aria-pressed={pickerOpen}
        ><Icon name="bookmark" /></button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("messages.placeholder")}
          maxLength={2000}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={send}
          disabled={!draft.trim() || sending}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
