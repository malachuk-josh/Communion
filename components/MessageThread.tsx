"use client";

// One conversation: bubbles, polling for new messages while open, and a
// composer pinned above the bottom nav.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
}

export default function MessageThread({ peerId }: { peerId: string }) {
  const { lang, t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [peerName, setPeerName] = useState("…");
  const [peerIcon, setPeerIcon] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
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
      peerIcon: string | null;
    }>(`/api/messages/${peerId}`)
      .then((res) => {
        if (cancelled) return;
        setMyUserId(res.myUserId);
        setPeerName(res.peerName);
        setPeerIcon(res.peerIcon);
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

  let lastDay = "";

  return (
    <div className="thread">
      <div className="thread-head">
        <Link href="/menu/messages" className="passage-link">
          ←
        </Link>
        <span className="conv-avatar">{peerIcon || "🙏"}</span>
        <h1>{peerName}</h1>
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
                  {m.text}
                  <span className="bubble-time">
                    {new Date(m.ts).toLocaleTimeString(
                      lang === "es" ? "es" : "en",
                      { hour: "numeric", minute: "2-digit" }
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="composer glass">
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
