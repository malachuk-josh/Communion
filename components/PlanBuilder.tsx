"use client";

// Writing your own reading plan.
//
// The hard part of a plan is not the list of chapters, it is deciding how much
// to read in a sitting — so that is what this asks. Pick a book, pick the run
// of it you mean to read, say how many chapters a day, and the days are worked
// out for you. Add another book and it appends. Nobody types a day at a time.
//
// The plan is shown as it is built, day by day, so the answer to "how long is
// this?" is on screen before it is saved rather than discovered a week in.

import Icon from "@/components/Icon";
import { useEffect, useMemo, useState } from "react";
import { BOOKS, getBook } from "@/lib/bible";
import { api } from "@/lib/client";
import { useI18n, type Lang } from "@/lib/i18n";
import type { CustomPlanRow, Ref } from "@/lib/customPlanTypes";

const MAX_DAYS = 400;
const MAX_NAME = 60;

const bookName = (nr: number, lang: Lang) => {
  const book = getBook(nr);
  return book ? (lang === "es" ? book.es : book.en) : "";
};

export default function PlanBuilder({
  editing,
  onClose,
  onSaved,
}: {
  /** the plan being corrected, or null when building a new one */
  editing: CustomPlanRow | null;
  onClose: () => void;
  onSaved: (plan: CustomPlanRow) => void;
}) {
  const { lang, t } = useI18n();
  const [name, setName] = useState(editing?.name ?? "");
  const [days, setDays] = useState<Ref[][]>(editing?.days ?? []);
  const [listed, setListed] = useState(editing?.listed ?? false);
  const [book, setBook] = useState(40);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [perDay, setPerDay] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const chapters = getBook(book)?.chapters ?? 1;

  // Changing book resets the run to the whole of it, which is what somebody
  // adding a book almost always means and is one fewer thing to set.
  useEffect(() => {
    setFrom(1);
    setTo(getBook(book)?.chapters ?? 1);
  }, [book]);

  /** The days this block would add, so the button can say how many. */
  const pending = useMemo(() => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const refs: Ref[] = [];
    for (let c = lo; c <= hi; c++) refs.push([book, c]);
    const out: Ref[][] = [];
    for (let i = 0; i < refs.length; i += perDay) {
      out.push(refs.slice(i, i + perDay));
    }
    return out;
  }, [book, from, to, perDay]);

  const room = MAX_DAYS - days.length;

  const add = () => {
    setError("");
    if (pending.length > room) {
      setError(t("builder.tooLong", { n: String(MAX_DAYS) }));
      return;
    }
    setDays((prev) => [...prev, ...pending]);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await api<{ plan: CustomPlanRow }>("/api/plans/custom", {
        method: "POST",
        body: { id: editing?.id, name: name.trim(), days, listed },
      });
      onSaved(res.plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const label = (ref: Ref) => `${bookName(ref[0], lang)} ${ref[1]}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass card modal builder"
        role="dialog"
        aria-label={t("builder.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lex-head">
          <span className="lex-lemma">
            <Icon name="plan" />{" "}
            {editing ? t("builder.editTitle") : t("builder.title")}
          </span>
          <button
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        <label className="field">
          <span>{t("builder.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("builder.namePlaceholder")}
            maxLength={MAX_NAME}
            autoFocus
          />
        </label>

        <p className="cal-label">{t("builder.add")}</p>
        <div className="builder-row">
          <label className="builder-field builder-book">
            <span>{t("builder.book")}</span>
            <select
              value={book}
              onChange={(e) => setBook(Number(e.target.value))}
            >
              {BOOKS.map((b) => (
                <option key={b.nr} value={b.nr}>
                  {lang === "es" ? b.es : b.en}
                </option>
              ))}
            </select>
          </label>
          <label className="builder-field">
            <span>{t("builder.from")}</span>
            <select
              value={from}
              onChange={(e) => setFrom(Number(e.target.value))}
            >
              {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="builder-field">
            <span>{t("builder.to")}</span>
            <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="builder-field">
            <span>{t("builder.perDay")}</span>
            <select
              value={perDay}
              onChange={(e) => setPerDay(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={add}
          disabled={pending.length === 0 || room <= 0}
        >
          + {t("builder.addDays", { n: String(pending.length) })}
        </button>

        {/* What has been built so far. Shown rather than summarised: the
            question anybody has while building a plan is what day forty
            actually says, and a count cannot answer it. */}
        <div className="builder-days">
          <p className="cal-label">
            {t("builder.dayCount", { n: String(days.length) })}
            {days.length > 0 && (
              <button
                type="button"
                className="passage-link builder-clear"
                onClick={() => setDays([])}
              >
                {t("builder.clear")}
              </button>
            )}
          </p>
          {days.length === 0 ? (
            <p className="cal-hint">{t("builder.empty")}</p>
          ) : (
            <ol className="builder-list">
              {days.map((day, i) => (
                <li key={i}>
                  <span className="builder-day-n">{i + 1}</span>
                  <span>{day.map(label).join(" · ")}</span>
                  <button
                    type="button"
                    className="jr-share jr-danger"
                    onClick={() =>
                      setDays((prev) => prev.filter((_, at) => at !== i))
                    }
                    aria-label={t("builder.removeDay", { n: String(i + 1) })}
                    title={t("builder.removeDay", { n: String(i + 1) })}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Offered at the point of saving, because that is when somebody
            knows whether what they built is worth anybody else's time. Off
            unless asked for: a plan is yours until you say otherwise. */}
        <label className="toggle-row builder-public">
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
          />
          <Icon name="globe" /> {t("builder.listed")}
        </label>
        <p className="cal-hint">{t("builder.listedHint")}</p>

        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {t("session.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={save}
            disabled={saving || !name.trim() || days.length === 0}
          >
            {saving ? t("common.loading") : t("builder.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
