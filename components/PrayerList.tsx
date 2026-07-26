"use client";

// The prayer list inside a Gathering. Requests that are still being carried
// sit at the top; answered ones fall to the bottom and stay, because a list
// of answered prayer is worth as much as the list of open ones.

import Icon from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

interface PrayerRequest {
  id: string;
  /** empty when the request was made anonymously */
  from: string;
  fromName: string;
  text: string;
  ts: number;
  prayed: number;
  iPrayed: boolean;
  answeredAt?: number;
  answer?: string;
}

export default function PrayerList({ churchId }: { churchId: string }) {
  const { lang, t } = useI18n();
  const [prayers, setPrayers] = useState<PrayerRequest[] | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** the request whose answer is being written */
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  const load = useCallback(() => {
    api<{ prayers: PrayerRequest[]; myUserId: string; myRole: string }>(
      `/api/churches/${churchId}/prayers`
    )
      .then((res) => {
        setPrayers(res.prayers);
        setMyUserId(res.myUserId);
        setMyRole(res.myRole);
      })
      .catch(() => setPrayers([]));
  }, [churchId]);

  useEffect(load, [load]);

  const add = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ prayer: PrayerRequest }>(
        `/api/churches/${churchId}/prayers`,
        { method: "POST", body: { text: body, anonymous } }
      );
      setPrayers((prev) => [res.prayer, ...(prev ?? [])]);
      setText("");
      setAnonymous(false);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Praying shows at once and asks afterwards. The server owns the count —
   * it is a set of who, not a number — so its answer replaces the guess.
   */
  const pray = async (id: string) => {
    setPrayers(
      (prev) =>
        prev?.map((p) =>
          p.id === id
            ? { ...p, iPrayed: !p.iPrayed, prayed: p.prayed + (p.iPrayed ? -1 : 1) }
            : p
        ) ?? null
    );
    try {
      const state = await api<{ prayed: number; iPrayed: boolean }>(
        `/api/prayers/${id}`,
        { method: "PATCH", body: { action: "pray" } }
      );
      setPrayers(
        (prev) => prev?.map((p) => (p.id === id ? { ...p, ...state } : p)) ?? null
      );
    } catch {
      load();
    }
  };

  const saveAnswer = async (id: string) => {
    setAnswering(null);
    const said = answer.trim();
    setAnswer("");
    try {
      await api(`/api/prayers/${id}`, {
        method: "PATCH",
        body: { action: "answer", answer: said },
      });
    } finally {
      load();
    }
  };

  const reopen = async (id: string) => {
    try {
      await api(`/api/prayers/${id}`, {
        method: "PATCH",
        body: { action: "reopen" },
      });
    } finally {
      load();
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t("prayers.deleteConfirm"))) return;
    setPrayers((prev) => prev?.filter((p) => p.id !== id) ?? null);
    try {
      await api(`/api/prayers/${id}`, { method: "DELETE" });
    } catch {
      load();
    }
  };

  const when = (ts: number) =>
    new Date(ts).toLocaleDateString(lang === "es" ? "es" : "en", {
      month: "short",
      day: "numeric",
    });

  const openRequests = prayers?.filter((p) => !p.answeredAt) ?? [];
  const answered = prayers?.filter((p) => p.answeredAt) ?? [];
  /** An anonymous request has no author to check, so only an admin may close it. */
  const canClose = (p: PrayerRequest) =>
    (!!p.from && p.from === myUserId) || myRole === "founder";

  const card = (p: PrayerRequest) => (
    <div key={p.id} className={`glass card pr-card${p.answeredAt ? " answered" : ""}`}>
      <div className="pr-head">
        <span className="pr-who">
          {p.from ? (
            p.fromName
          ) : (
            <em className="pr-anon">{t("prayers.anonymous")}</em>
          )}
          <span className="pr-when">{when(p.ts)}</span>
        </span>
        {canClose(p) && (
          <span className="pr-tools">
            {p.answeredAt ? (
              <button
                type="button"
                className="rsvp-btn"
                onClick={() => reopen(p.id)}
              >
                {t("prayers.reopen")}
              </button>
            ) : (
              <button
                type="button"
                className="rsvp-btn"
                onClick={() => {
                  setAnswering(p.id);
                  setAnswer("");
                }}
              >
                {t("prayers.markAnswered")}
              </button>
            )}
            <button
              type="button"
              className="chip-remove"
              onClick={() => remove(p.id)}
              aria-label={t("prayers.delete")}
              title={t("prayers.delete")}
            >
              <Icon name="trash" />
            </button>
          </span>
        )}
      </div>

      <p className="pr-text">{p.text}</p>

      {p.answeredAt && (
        <p className="pr-answer">
          <Icon name="check" /> {p.answer || t("prayers.answered")}
        </p>
      )}

      {answering === p.id ? (
        <div className="pr-answer-edit">
          <textarea
            value={answer}
            autoFocus
            rows={3}
            maxLength={1000}
            placeholder={t("prayers.answerPlaceholder")}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="pr-actions">
            <button
              type="button"
              className="rsvp-btn"
              onClick={() => setAnswering(null)}
            >
              {t("session.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => saveAnswer(p.id)}
            >
              {t("prayers.markAnswered")}
            </button>
          </div>
        </div>
      ) : (
        <div className="pr-actions">
          <button
            type="button"
            className={`rsvp-btn pr-pray${p.iPrayed ? " active" : ""}`}
            aria-pressed={p.iPrayed}
            onClick={() => pray(p.id)}
          >
            <Icon name="prayer" />{" "}
            {p.iPrayed ? t("prayers.praying") : t("prayers.pray")}
          </button>
          {p.prayed > 0 && (
            <span className="pr-count">
              {t("prayers.count", { n: String(p.prayed) })}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="section-head">
        <h2>
          <Icon name="prayer" /> {t("prayers.title")}
          {openRequests.length > 0 && ` (${openRequests.length})`}
        </h2>
        <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
          ＋ {t("prayers.add")}
        </button>
      </div>

      {open && (
        <div className="glass card pr-compose">
          <textarea
            value={text}
            autoFocus
            rows={3}
            maxLength={1000}
            placeholder={t("prayers.placeholder")}
            onChange={(e) => setText(e.target.value)}
          />
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            {t("prayers.anonymously")}
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="pr-actions">
            <button
              type="button"
              className="rsvp-btn"
              onClick={() => setOpen(false)}
            >
              {t("session.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={add}
              disabled={busy || !text.trim()}
            >
              {t("prayers.post")}
            </button>
          </div>
        </div>
      )}

      {prayers === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : prayers.length === 0 ? (
        <div className="glass card empty">{t("prayers.empty")}</div>
      ) : (
        <>
          {openRequests.map(card)}
          {answered.length > 0 && (
            <>
              <p className="pr-divider">
                {t("prayers.answeredCount", { n: String(answered.length) })}
              </p>
              {answered.map(card)}
            </>
          )}
        </>
      )}
    </>
  );
}
