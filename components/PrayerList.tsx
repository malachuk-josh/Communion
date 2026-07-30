"use client";

// A prayer list. Requests that are still being carried sit at the top;
// answered ones fall to the bottom and stay, because a list of answered
// prayer is worth as much as the list of open ones.
//
// Two of them, from one component. With a churchId it is a Gathering's list,
// members only, and the place where asking happens. Without one it is the
// prayer wall in Discover: the same requests, drawn together from every
// Gathering the reader can see, and read only — nothing is asked there, so
// there is no compose box and no button to open one.

import Link from "next/link";
import Icon from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";
import type { Church } from "@/lib/types";
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
  /** on the wall only: the Gathering it was asked in */
  churchId?: string;
  churchName?: string;
  mine?: boolean;
}

export default function PrayerList({ churchId }: { churchId?: string }) {
  const wall = !churchId;
  const listPath = wall
    ? "/api/prayers/feed"
    : `/api/churches/${churchId}/prayers`;
  const { lang, t } = useI18n();
  const [prayers, setPrayers] = useState<PrayerRequest[] | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  /** on the wall: which Gatherings this request is going to */
  const [mine, setMine] = useState<Church[] | null>(null);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** the request whose answer is being written */
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  /*
   * Which Gatherings this reader could ask in, fetched when they open the
   * composer rather than when the wall loads: most visits to a prayer wall
   * are to read it and to pray, and asking who somebody belongs to on the
   * chance that they might ask is a request nobody needed.
   */
  useEffect(() => {
    if (!wall || !open || mine !== null) return;
    api<{ churches: Church[] }>("/api/churches")
      .then((res) => {
        setMine(res.churches);
        // One Gathering is not a choice. Ticking the only box you have is a
        // step that exists only to be completed, so it is completed.
        if (res.churches.length === 1) {
          setTargets(new Set([res.churches[0].id]));
        }
      })
      .catch(() => setMine([]));
  }, [wall, open, mine]);

  const load = useCallback(() => {
    api<{ prayers: PrayerRequest[]; myUserId: string; myRole: string }>(listPath)
      .then((res) => {
        setPrayers(res.prayers);
        setMyUserId(res.myUserId);
        setMyRole(res.myRole);
      })
      .catch(() => setPrayers([]));
  }, [listPath]);

  useEffect(load, [load]);

  const add = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      if (wall) {
        /*
         * One request, several rooms. What comes back is a list of what was
         * asked where rather than a single row, so the wall is re-read
         * instead of guessed at — the reader has just written into two or
         * three lists at once, and the whole point of the wall is that it
         * shows all of them.
         */
        await api("/api/prayers", {
          method: "POST",
          body: { text: body, anonymous, churchIds: [...targets] },
        });
        load();
        setTargets(new Set());
      } else {
        const res = await api<{ prayer: PrayerRequest }>(listPath, {
          method: "POST",
          body: { text: body, anonymous },
        });
        setPrayers((prev) => [res.prayer, ...(prev ?? [])]);
      }
      setText("");
      setAnonymous(false);
      setPickerOpen(false);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleTarget = (id: string) =>
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
          {/* on the wall a request is not from nowhere — say whose list it is
              on, and let the reader go and sit with them */}
          {wall && p.churchName && (
            <Link href={`/churches/${p.churchId}`} className="pr-from">
              <Icon name="church" /> {p.churchName}
            </Link>
          )}
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
          <Icon name="prayer" /> {wall ? t("prayers.wall") : t("prayers.title")}
          {openRequests.length > 0 && ` (${openRequests.length})`}
        </h2>
        <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
          ＋ {t("prayers.add")}
        </button>
      </div>

      <p className="pr-privacy cal-hint">
        <Icon name={wall ? "people" : "lock"} />{" "}
        {wall ? t("prayers.wallNote") : t("prayers.privacy")}
      </p>

      {open && (
        <div className="glass card pr-compose">
          <textarea
            value={text}
            autoFocus
            rows={3}
            maxLength={1000}
            placeholder={t(wall ? "prayers.placeholderWall" : "prayers.placeholder")}
            onChange={(e) => setText(e.target.value)}
          />
          {/* Where it is going. Only on the wall: inside a Gathering the
              answer is already settled by being there. */}
          {wall && (
            <div className="pr-where">
              <button
                type="button"
                className="pr-where-btn"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((v) => !v)}
              >
                <span>
                  <Icon name="church" />{" "}
                  {targets.size === 0
                    ? t("prayers.chooseGatherings")
                    : t("prayers.chosen", { n: String(targets.size) })}
                </span>
                <span className={`bn-caret${pickerOpen ? " open" : ""}`}>⌄</span>
              </button>
              {pickerOpen && (
                <div className="pr-where-list">
                  {mine === null ? (
                    <p className="skeleton">{t("common.loading")}</p>
                  ) : mine.length === 0 ? (
                    <p className="cal-hint">
                      {t("prayers.noGatherings")}{" "}
                      <Link href="/churches" className="passage-link">
                        {t("nav.churches")} →
                      </Link>
                    </p>
                  ) : (
                    mine.map((church) => (
                      <label key={church.id} className="toggle-row">
                        <input
                          type="checkbox"
                          checked={targets.has(church.id)}
                          onChange={() => toggleTarget(church.id)}
                        />
                        {church.name}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
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
              disabled={busy || !text.trim() || (wall && targets.size === 0)}
            >
              {/* "Add to the list" is one list; from the wall it may be
                  several, and it is being sent rather than filed */}
              {t(wall ? "prayers.postWall" : "prayers.post")}
            </button>
          </div>
        </div>
      )}

      {prayers === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : prayers.length === 0 ? (
        <div className="glass card empty">
          {wall ? t("prayers.wallEmpty") : t("prayers.empty")}
        </div>
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
