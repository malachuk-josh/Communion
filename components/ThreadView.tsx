"use client";

// One Fellowship discussion: posts in order, each optionally carrying a
// scripture reference or a shared bookmark/note/word study.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import AttachPicker, { attachRef, type Attach } from "@/components/AttachPicker";

interface ThreadPost {
  id: string;
  from: string;
  fromName: string;
  fromIcon?: string;
  text: string;
  ts: number;
  attach?: Attach;
}

interface ThreadMeta {
  id: string;
  churchId: string;
  title: string;
  createdByName: string;
  createdAt: number;
}

export default function ThreadView({ threadId }: { threadId: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [canDelete, setCanDelete] = useState(false);
  const [meta, setMeta] = useState<ThreadMeta | null>(null);
  const [posts, setPosts] = useState<ThreadPost[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [draft, setDraft] = useState("");
  const [attach, setAttach] = useState<Attach | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<{
      thread: ThreadMeta;
      posts: ThreadPost[];
      myUserId: string;
      canDelete: boolean;
    }>(`/api/threads/${threadId}`)
      .then((res) => {
        setMeta(res.thread);
        setPosts(res.posts);
        setMyUserId(res.myUserId);
        setCanDelete(res.canDelete);
      })
      .catch(() => setNotFound(true));
  }, [threadId]);

  useEffect(load, [load]);

  // keep the discussion fresh while it's open
  useEffect(() => {
    const timer = window.setInterval(load, 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  const post = async () => {
    const text = draft.trim();
    if ((!text && !attach) || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ post: ThreadPost }>(`/api/threads/${threadId}`, {
        method: "POST",
        body: { text, attach: attach ?? undefined },
      });
      setPosts((prev) => [...prev, res.post]);
      setDraft("");
      setAttach(null);
      setPickerOpen(false);
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
        50
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return <p className="empty glass card">{t("join.invalid")}</p>;
  }
  if (!meta) {
    return <p className="skeleton">{t("common.loading")}</p>;
  }

  return (
    <div>
      <Link href={`/churches/${meta.churchId}`} className="passage-link back-link">
        ← {t("threads.backToFellowship")}
      </Link>
      <div className="section-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          {meta.title}
        </h1>
        {canDelete && (
          <button
            type="button"
            className="rsvp-btn"
            aria-label={t("threads.delete")}
            title={t("threads.delete")}
            onClick={async () => {
              if (!window.confirm(t("threads.deleteConfirm"))) return;
              try {
                await api(`/api/threads/${threadId}`, { method: "DELETE" });
                router.push(`/churches/${meta.churchId}`);
              } catch {
                setError(t("reader.error"));
              }
            }}
          >
            🗑
          </button>
        )}
      </div>
      <p className="subtitle">
        {t("threads.startedBy", { name: meta.createdByName })}
      </p>

      {posts.map((p) => (
        <div key={p.id} className="glass card post-row">
          <div className="post-head">
            <span className="conv-avatar">{p.fromIcon || "🙏"}</span>
            <strong>{p.from === myUserId ? t("messages.you") : p.fromName}</strong>
            <span className="conv-time">
              {new Date(p.ts).toLocaleString(lang === "es" ? "es" : "en", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          {p.text && <p className="post-text">{p.text}</p>}
          {p.attach && (
            <Link
              href={`/?b=${p.attach.b}&c=${p.attach.c}${
                p.attach.v ? `&v=${p.attach.v}` : ""
              }`}
              className="verse-card post-attach"
            >
              <span className="verse-card-kind">
                {p.attach.kind === "note"
                  ? `📝 ${t("messages.sharedNote")}`
                  : p.attach.kind === "word"
                    ? `🔤 ${t("messages.sharedWord")}`
                    : p.attach.kind === "bookmark"
                      ? `🔖 ${t("messages.sharedBookmark")}`
                      : `📖 ${t("threads.scripture")}`}
              </span>
              <strong>📖 {attachRef(p.attach, lang === "es")}</strong>
              {p.attach.label && <em>{p.attach.label}</em>}
              <small>{t("messages.tapToRead")}</small>
            </Link>
          )}
        </div>
      ))}
      <div ref={bottomRef} />

      {attach && (
        <div className="glass card attach-chip-row">
          <span>
            📖 {attachRef(attach, lang === "es")}
            {attach.label ? ` — ${attach.label.slice(0, 60)}` : ""}
          </span>
          <button
            type="button"
            className="chip-remove"
            onClick={() => setAttach(null)}
            aria-label={t("session.cancel")}
          >
            ✕
          </button>
        </div>
      )}
      {pickerOpen && (
        <div className="glass card">
          <AttachPicker
            onPick={(a) => {
              setAttach(a);
              setPickerOpen(false);
            }}
          />
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="composer glass">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label={t("threads.addScripture")}
          title={t("threads.addScripture")}
          aria-pressed={pickerOpen}
        >
          📖
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("threads.replyPlaceholder")}
          maxLength={4000}
          onKeyDown={(e) => e.key === "Enter" && post()}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={post}
          disabled={busy || (!draft.trim() && !attach)}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
