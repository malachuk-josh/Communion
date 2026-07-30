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
import { useI18n, type MessageKey } from "@/lib/i18n";

type Attachment =
  | {
      kind: "bookmark" | "note" | "word";
      b: number;
      c: number;
      v: number;
      label?: string;
    }
  | { kind: "collection"; token: string; name: string; count: number };

/** The five ways to answer without writing. Server-side twin: lib/messages. */
const REACTIONS = ["like", "heart", "question", "emphasize", "laugh"] as const;
type ReactionKind = (typeof REACTIONS)[number];

/**
 * Drawn as emoji, and alone in this app in being so.
 *
 * Everything else here is a line icon, because an icon is a label and the app
 * wants one voice. A reaction is not a label — it IS the thing said, the way a
 * word in a message is, and rendering "heart" as a monochrome outline would
 * turn an answer back into a button.
 */
const REACTION_GLYPH: Record<ReactionKind, string> = {
  like: "👍",
  heart: "❤️",
  question: "❓",
  emphasize: "‼️",
  laugh: "😂",
};

interface Reactions {
  counts: Partial<Record<ReactionKind, number>>;
  mine?: ReactionKind;
}

interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  attach?: Attachment;
  reactions?: Reactions;
}

type VerseShare = {
  kind: "bookmark" | "note";
  b: number;
  c: number;
  v: number;
  label?: string;
};

/**
 * Something of yours you can hand to the person you are talking with.
 *
 * A verse carries its own address. A collection carries only its id here — the
 * link it is sent as does not exist until it is picked, and publishing every
 * shelf you own just to open a picker would be the wrong trade.
 */
type ShareItem =
  | VerseShare
  | { kind: "collection"; id: string; name: string; count: number };

export default function MessageThread({ peerId }: { peerId: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [peerName, setPeerName] = useState("…");
  /** the Gatherings both of us are in, which is usually who this is */
  const [shared, setShared] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** the message whose reaction picker is open, if any */
  const [reactFor, setReactFor] = useState<string | null>(null);
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
      shared?: { id: string; name: string }[];
    }>(`/api/messages/${peerId}`)
      .then((res) => {
        if (cancelled) return;
        setMyUserId(res.myUserId);
        setPeerName(res.peerName);
        setShared(res.shared ?? []);
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

  /**
   * Answer a message, or take the answer back.
   *
   * Applied on screen before the server is asked. A reaction is a small thing
   * said quickly, often several in a row, and a round trip between the tap
   * and the mark is long enough to make somebody tap again. The poll below
   * is the arbiter: if the write failed, the next read puts it back.
   */
  const react = async (messageId: string, kind: ReactionKind) => {
    setReactFor(null);
    /*
     * What it becomes is worked out here and not inside the updater below.
     *
     * React runs a functional update during render rather than at the moment
     * it is called, so a variable assigned inside one still holds its old
     * value on the next line — which meant taking a reaction back sent the
     * server the reaction again, and it stayed. The screen was right and the
     * store was wrong, which is the worst of the two.
     */
    const mine = messages.find((m) => m.id === messageId)?.reactions?.mine;
    // the one you already gave, given again, is taken back
    const next: ReactionKind | null = mine === kind ? null : kind;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const counts = { ...(m.reactions?.counts ?? {}) };
        const had = m.reactions?.mine;
        if (had) {
          const left = (counts[had] ?? 1) - 1;
          if (left > 0) counts[had] = left;
          else delete counts[had];
        }
        if (next) counts[next] = (counts[next] ?? 0) + 1;
        return { ...m, reactions: { counts, ...(next ? { mine: next } : {}) } };
      })
    );
    try {
      await api(`/api/messages/${peerId}/reactions`, {
        method: "POST",
        body: { messageId, kind: next },
      });
    } catch {
      // the next poll is the arbiter
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
        api<{
          bookmarks: Record<string, { t: number; l?: string; c?: string }>;
          collections: Record<string, { name: string }>;
        }>("/api/bookmarks").catch(() => ({ bookmarks: {}, collections: {} })),
        api<{ notes: { b: number; c: number; v: number; text: string }[] }>(
          "/api/notes"
        ).catch(() => ({ notes: [] })),
      ]).then(([bm, nt]) => {
        const verses: VerseShare[] = [];
        const filed: Record<string, number> = {};
        for (const [key, entry] of Object.entries(bm.bookmarks)) {
          // a run attaches at the verse it starts on
          const ref = parseBmKey(key);
          if (!ref) continue;
          if (entry.c) filed[entry.c] = (filed[entry.c] ?? 0) + 1;
          verses.push({ b: ref.b, c: ref.c, v: ref.v, kind: "bookmark", label: entry.l });
        }
        for (const n of nt.notes) {
          verses.push({ b: n.b, c: n.c, v: n.v, kind: "note", label: n.text });
        }
        verses.sort((a, b) => a.b - b.b || a.c - b.c || a.v - b.v);
        // Shelves first, and an empty one is not offered — there would be
        // nothing on the other end of the link for the person who tapped it.
        const shelves: ShareItem[] = Object.entries(bm.collections ?? {})
          .filter(([id]) => (filed[id] ?? 0) > 0)
          .map(([id, coll]) => ({
            kind: "collection" as const,
            id,
            name: coll.name,
            count: filed[id],
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setShareItems([...shelves, ...verses]);
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
      // A collection is published on the way out, not before: the snapshot it
      // points at is made from the shelf as it stands now, and the token comes
      // back the same on every later send, so the same shelf keeps one address.
      const payload =
        item.kind === "collection"
          ? await api<{ url: string }>(`/api/collections/${item.id}/share`, {
              method: "POST",
            }).then((res) => ({
              text: item.name,
              attach: { kind: "collection", token: res.url.split("/").pop() },
            }))
          : {
              text: refLabel(item),
              attach: {
                b: item.b,
                c: item.c,
                v: item.v,
                kind: item.kind,
                label: item.label,
              },
            };
      const res = await api<{ message: ChatMessage }>(
        `/api/messages/${peerId}`,
        { method: "POST", body: payload }
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

      {/* Under the name, above the conversation: who this is, in the only
          terms the app can answer it in. It is not repeated with every poll —
          the shared list comes back on the first load and does not change
          while somebody is typing. */}
      {shared.length > 0 && (
        <p className="thread-shared">
          <Icon name="church" />
          <span>
            {t("messages.shared")}{" "}
            {shared.map((g, i) => (
              <span key={g.id}>
                {i > 0 && " · "}
                <Link href={`/churches/${g.id}`} className="passage-link">
                  {g.name}
                </Link>
              </span>
            ))}
          </span>
        </p>
      )}

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
                  {!m.attach ? (
                    m.text
                  ) : m.attach.kind === "collection" ? (
                    /* Not into The Word but onto the shared page, which is
                       where a collection can be read whole and kept whole —
                       the reader has no way to show a shelf, only a verse. */
                    <Link
                      href={`/shared/${m.attach.token}`}
                      className="verse-card"
                    >
                      <span className="verse-card-kind">
                        {t("messages.sharedCollection")}
                      </span>
                      <strong>
                        <Icon name="collection" /> {m.attach.name}
                      </strong>
                      <em>
                        {t("messages.collectionVerses", {
                          count: String(m.attach.count),
                        })}
                      </em>
                      <small>{t("messages.tapToOpen")}</small>
                    </Link>
                  ) : (
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

                {/* Under the bubble and aligned with it: what has been said
                    back without words. The picker opens from the same row,
                    so answering and seeing the answers are one place. */}
                <div
                  className={`react-row${m.from === myUserId ? " mine" : ""}`}
                >
                  {REACTIONS.filter((k) => (m.reactions?.counts[k] ?? 0) > 0).map(
                    (k) => (
                      <button
                        key={k}
                        type="button"
                        className={`react-chip${
                          m.reactions?.mine === k ? " on" : ""
                        }`}
                        onClick={() => react(m.id, k)}
                        aria-pressed={m.reactions?.mine === k}
                        aria-label={t(`react.${k}` as MessageKey)}
                        title={t(`react.${k}` as MessageKey)}
                      >
                        {REACTION_GLYPH[k]}
                        <span>{m.reactions?.counts[k]}</span>
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className="react-add"
                    onClick={() =>
                      setReactFor((cur) => (cur === m.id ? null : m.id))
                    }
                    aria-expanded={reactFor === m.id}
                    aria-label={t("react.add")}
                    title={t("react.add")}
                  >
                    <Icon name="thought" />
                  </button>
                  {reactFor === m.id && (
                    <span className="react-picker">
                      {REACTIONS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={m.reactions?.mine === k ? "on" : ""}
                          onClick={() => react(m.id, k)}
                          aria-label={t(`react.${k}` as MessageKey)}
                          title={t(`react.${k}` as MessageKey)}
                        >
                          {REACTION_GLYPH[k]}
                        </button>
                      ))}
                    </span>
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
                  <span>
                    <Icon
                      name={
                        item.kind === "note"
                          ? "note"
                          : item.kind === "collection"
                            ? "collection"
                            : "bookmark"
                      }
                    />
                  </span>
                  <span className="share-row-body">
                    <strong>
                      {item.kind === "collection" ? item.name : refLabel(item)}
                    </strong>
                    {item.kind === "collection" ? (
                      <small>
                        {t("messages.collectionVerses", {
                          count: String(item.count),
                        })}
                      </small>
                    ) : (
                      item.label && <small>{item.label}</small>
                    )}
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
