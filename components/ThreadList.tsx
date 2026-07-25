"use client";

// Discussions inside a Gathering: the thread list plus a composer for
// starting a new topic (with an optional scripture or bookmark).

import Link from "next/link";
import Icon from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import AttachPicker, { attachRef, type Attach } from "@/components/AttachPicker";

interface ThreadSummary {
  id: string;
  title: string;
  createdBy: string;
  createdByName: string;
  lastAt: number;
  replies: number;
  lastText: string;
}

export default function ThreadList({ churchId }: { churchId: string }) {
  const { lang, t } = useI18n();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [attach, setAttach] = useState<Attach | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<{ threads: ThreadSummary[]; myUserId: string; myRole: string }>(
      `/api/churches/${churchId}/threads`
    )
      .then((res) => {
        setThreads(res.threads);
        setMyUserId(res.myUserId);
        setMyRole(res.myRole);
      })
      .catch(() => setThreads([]));
  }, [churchId]);

  const remove = async (id: string) => {
    if (!window.confirm(t("threads.deleteConfirm"))) return;
    setThreads((prev) => prev?.filter((th) => th.id !== id) ?? null);
    try {
      await api(`/api/threads/${id}`, { method: "DELETE" });
    } catch {
      load();
    }
  };

  useEffect(load, [load]);

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/churches/${churchId}/threads`, {
        method: "POST",
        body: { title, text, attach: attach ?? undefined },
      });
      setTitle("");
      setText("");
      setAttach(null);
      setPickerOpen(false);
      setOpen(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="section-head">
        <h2>{t("threads.title")}</h2>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => setOpen((v) => !v)}
        >
          ＋ {t("threads.new")}
        </button>
      </div>

      {open && (
        <div className="glass card" style={{ marginBottom: 12 }}>
          <label className="field">
            <span>{t("threads.topic")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("threads.topicPlaceholder")}
              maxLength={120}
              autoFocus
            />
          </label>
          <label className="field">
            <span>{t("threads.firstPost")}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("threads.replyPlaceholder")}
              maxLength={4000}
              rows={3}
            />
          </label>
          {attach && (
            <div className="attach-chip-row">
              <span>
                <Icon name="book" /> {attachRef(attach, lang === "es")}
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
            <AttachPicker
              onPick={(a) => {
                setAttach(a);
                setPickerOpen(false);
              }}
            />
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button
              className="btn"
              onClick={() => setPickerOpen((v) => !v)}
              aria-pressed={pickerOpen}
            >
              <Icon name="book" /> {t("threads.addScripture")}
            </button>
            <button
              className="btn btn-primary"
              onClick={create}
              disabled={!title.trim() || busy}
            >
              {t("threads.post")}
            </button>
          </div>
        </div>
      )}

      {threads === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : threads.length === 0 ? (
        <div className="glass card empty">{t("threads.empty")}</div>
      ) : (
        threads.map((th) => (
          <div key={th.id} className="glass card conv-row">
            <Link
              href={`/churches/${churchId}/threads/${th.id}`}
              className="conv-row-link"
            >
              <span className="conv-avatar"><Icon name="chat" /></span>
              <span className="conv-body">
                <strong>{th.title}</strong>
                <small>
                  {th.createdByName}
                  {th.lastText ? ` · ${th.lastText}` : ""}
                </small>
              </span>
              <span className="conv-time">
                {th.replies > 0 && `${th.replies} · `}
                {new Date(th.lastAt).toLocaleDateString(
                  lang === "es" ? "es" : "en",
                  { month: "short", day: "numeric" }
                )}
              </span>
            </Link>
            {(th.createdBy === myUserId || myRole === "founder") && (
              <button
                type="button"
                className="chip-remove"
                aria-label={t("threads.delete")}
                title={t("threads.delete")}
                onClick={() => remove(th.id)}
              >
                ✕
              </button>
            )}
          </div>
        ))
      )}
    </>
  );
}
