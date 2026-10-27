"use client";

// The reader's prayer list, under the verses on their wall.
//
// What is still being prayed for sits at the top; answered prayer falls below
// and stays, because a list of answered prayer is worth as much as the list
// of open ones. The newest few arrive open and the rest arrive folded to a
// line, which is what kept a full list readable when it belonged to a
// Gathering, and is no less true of one person's.
//
// Nobody else sees any of it. "Prayed today" is the reader keeping their own
// record, not a number shown to anybody.

import Icon from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

interface Prayer {
  id: string;
  text: string;
  at: number;
  /** the days they prayed for it, on their own calendar (YYYY-MM-DD) */
  days: string[];
  answeredAt?: number;
  answer?: string;
}

const PATH = "/api/wall/prayers";
/** how many of the newest open prayers arrive unfolded */
const OPEN_BY_DEFAULT = 3;

/** Today on the reader's own calendar, which is the day they prayed on. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The order the server keeps: open first and newest first, then answered. */
function inOrder(list: Prayer[]): Prayer[] {
  return [...list].sort(
    (a, b) =>
      Number(!!a.answeredAt) - Number(!!b.answeredAt) ||
      (b.answeredAt ?? 0) - (a.answeredAt ?? 0) ||
      b.at - a.at
  );
}

export default function MyPrayers() {
  const { lang, t } = useI18n();
  const [prayers, setPrayers] = useState<Prayer[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** the prayer whose answer is being written */
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  /** the prayer being reworded */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /**
   * The prayers folded down to a line. Null until the first load, so the
   * folds are dealt once from what actually arrived; after that they belong
   * to the reader, and a prayer added since arrives open.
   */
  const [folded, setFolded] = useState<Set<string> | null>(null);

  const load = useCallback(() => {
    api<{ prayers: Prayer[] }>(PATH)
      .then((res) => {
        setPrayers(res.prayers);
        setFolded((prev) => {
          if (prev !== null) return prev;
          const open = res.prayers.filter((p) => !p.answeredAt);
          return new Set(
            res.prayers
              .filter((p) => p.answeredAt || open.indexOf(p) >= OPEN_BY_DEFAULT)
              .map((p) => p.id)
          );
        });
      })
      .catch(() => setPrayers((prev) => prev ?? []));
  }, []);

  useEffect(load, [load]);

  /** Without signal the list still reads, from the worker's copy; it cannot change. */
  const fail = (e: unknown) => {
    const offline =
      (typeof navigator !== "undefined" && navigator.onLine === false) ||
      e instanceof TypeError;
    setError(offline ? t("prayer.offline") : (e as Error).message);
  };

  const replace = (next: Prayer) =>
    setPrayers((prev) =>
      prev ? inOrder(prev.map((p) => (p.id === next.id ? next : p))) : prev
    );

  const unfold = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const add = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ prayer: Prayer }>(PATH, {
        method: "POST",
        body: { text: body },
      });
      setPrayers((prev) => inOrder([res.prayer, ...(prev ?? [])]));
      setText("");
      setComposing(false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const change = async (id: string, body: Record<string, unknown>) => {
    setError("");
    try {
      const res = await api<{ prayer: Prayer }>(PATH, {
        method: "PATCH",
        body: { id, ...body },
      });
      replace(res.prayer);
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  /** Shown at once and asked afterwards; put back if it could not be saved. */
  const togglePrayed = async (p: Prayer) => {
    const day = today();
    const prayed = !p.days.includes(day);
    replace({
      ...p,
      days: prayed ? [...p.days, day].sort() : p.days.filter((d) => d !== day),
    });
    if (!(await change(p.id, { action: "prayed", day, prayed }))) replace(p);
  };

  const saveAnswer = async (p: Prayer) => {
    if (await change(p.id, { action: "answer", answer: answer.trim() })) {
      setAnswering(null);
      setAnswer("");
      // it moves to the answered list; leave it open there, with its answer
      unfold(p.id);
    }
  };

  const saveEdit = async (p: Prayer) => {
    if (!draft.trim()) return;
    if (await change(p.id, { action: "edit", text: draft })) setEditing(null);
  };

  const remove = async (p: Prayer) => {
    if (!window.confirm(t("prayer.deleteConfirm"))) return;
    setError("");
    setPrayers((prev) => prev?.filter((x) => x.id !== p.id) ?? null);
    try {
      await api(`${PATH}?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    } catch (e) {
      fail(e);
      load();
    }
  };

  const when = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(lang === "es" ? "es" : "en", {
      month: "short",
      day: "numeric",
      ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    });
  };

  const toggleFold = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const open = prayers?.filter((p) => !p.answeredAt) ?? [];
  const answered = prayers?.filter((p) => p.answeredAt) ?? [];
  const anyFolded = folded !== null && folded.size > 0;

  const card = (p: Prayer) => {
    const isFolded = (folded?.has(p.id) ?? false) && editing !== p.id;
    const prayedToday = p.days.includes(today());
    const days = p.days.length;
    return (
      <div
        key={p.id}
        className={`glass card pr-card${p.answeredAt ? " answered" : ""}${
          isFolded ? " pr-folded" : ""
        }`}
      >
        <div className="pr-head">
          <span className="pr-who">
            <span className="pr-when">{when(p.at)}</span>
            {days > 0 && (
              <span className="pr-days">
                {days === 1
                  ? t("prayer.dayOne")
                  : t("prayer.days", { n: String(days) })}
              </span>
            )}
          </span>
          {!isFolded && editing !== p.id && (
            <span className="pr-tools">
              <button
                type="button"
                className="pr-icon"
                onClick={() => {
                  setEditing(p.id);
                  setDraft(p.text);
                  setAnswering(null);
                }}
                aria-label={t("prayer.edit")}
                title={t("prayer.edit")}
              >
                <Icon name="note" />
              </button>
              <button
                type="button"
                className="pr-icon danger"
                onClick={() => remove(p)}
                aria-label={t("prayer.delete")}
                title={t("prayer.delete")}
              >
                <Icon name="trash" />
              </button>
            </span>
          )}
          {editing !== p.id && (
            <button
              type="button"
              className="pr-fold"
              aria-expanded={!isFolded}
              onClick={() => toggleFold(p.id)}
              aria-label={t(isFolded ? "prayer.unfold" : "prayer.fold")}
              title={t(isFolded ? "prayer.unfold" : "prayer.fold")}
            >
              <span className={`bn-caret${!isFolded ? " open" : ""}`}>▾</span>
            </button>
          )}
        </div>

        {editing === p.id ? (
          <div className="pr-answer-edit">
            <textarea
              value={draft}
              autoFocus
              rows={3}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={t("prayer.edit")}
            />
            <div className="pr-actions">
              <button type="button" className="rsvp-btn" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!draft.trim()}
                onClick={() => saveEdit(p)}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        ) : isFolded ? (
          <p
            className="pr-text pr-text-folded"
            onClick={() => toggleFold(p.id)}
            title={t("prayer.unfold")}
          >
            {p.text}
          </p>
        ) : (
          <p className="pr-text">{p.text}</p>
        )}

        {!isFolded && p.answeredAt && (
          <p className="pr-answer">
            <Icon name="check" />{" "}
            {p.answer || t("prayer.answeredOn", { date: when(p.answeredAt) })}
          </p>
        )}

        {isFolded || editing === p.id ? null : answering === p.id ? (
          <div className="pr-answer-edit">
            <textarea
              value={answer}
              autoFocus
              rows={3}
              maxLength={1000}
              placeholder={t("prayer.answerPlaceholder")}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <div className="pr-actions">
              <button type="button" className="rsvp-btn" onClick={() => setAnswering(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => saveAnswer(p)}
              >
                {t("prayer.markAnswered")}
              </button>
            </div>
          </div>
        ) : p.answeredAt ? (
          <div className="pr-actions">
            <button
              type="button"
              className="rsvp-btn"
              onClick={() => change(p.id, { action: "reopen" })}
            >
              {t("prayer.reopen")}
            </button>
          </div>
        ) : (
          <div className="pr-actions">
            <button
              type="button"
              className={`rsvp-btn pr-pray${prayedToday ? " active" : ""}`}
              aria-pressed={prayedToday}
              onClick={() => togglePrayed(p)}
            >
              <Icon name={prayedToday ? "check" : "prayer"} />{" "}
              {prayedToday ? t("prayer.prayedToday") : t("prayer.pray")}
            </button>
            <button
              type="button"
              className="rsvp-btn"
              onClick={() => {
                setAnswering(p.id);
                setAnswer("");
              }}
            >
              {t("prayer.markAnswered")}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="prayer-section">
      <div className="section-head">
        <h2>
          <Icon name="prayer" /> {t("prayer.title")}
          {open.length > 0 && ` (${open.length})`}
        </h2>
        <span className="pr-head-tools">
          {prayers !== null && prayers.length > 1 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                setFolded(anyFolded ? new Set() : new Set(prayers.map((p) => p.id)))
              }
            >
              {anyFolded ? t("prayer.unfoldAll") : t("prayer.foldAll")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            aria-expanded={composing}
            onClick={() => setComposing((v) => !v)}
          >
            ＋ {t("prayer.add")}
          </button>
        </span>
      </div>

      <p className="pr-privacy cal-hint">
        <Icon name="lock" /> {t("prayer.privacy")}
      </p>

      {composing && (
        <div className="glass card pr-compose">
          <textarea
            value={text}
            autoFocus
            rows={3}
            maxLength={1000}
            placeholder={t("prayer.placeholder")}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="pr-actions">
            <button
              type="button"
              className="rsvp-btn"
              onClick={() => {
                setComposing(false);
                setText("");
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || !text.trim()}
              onClick={add}
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {prayers === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : prayers.length === 0 ? (
        !composing && <p className="empty glass card">{t("prayer.empty")}</p>
      ) : (
        <>
          <div className="pr-list">{open.map(card)}</div>
          {answered.length > 0 && (
            <>
              <p className="pr-divider">
                {t("prayer.answeredHeading", { n: String(answered.length) })}
              </p>
              <div className="pr-list">{answered.map(card)}</div>
            </>
          )}
        </>
      )}
    </section>
  );
}
