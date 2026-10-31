"use client";

// When a plan in the Journal asks for you: on or off, which days of the week,
// and at what hour.
//
// Every plan is recommended a reading a day, and asks every morning at seven
// until told otherwise. That is the plan's own cadence and it does not change
// here — a plan's days are counted, not dated, so a reader who keeps it on
// weekdays, or on Sundays and Wednesdays, simply comes to its end later. This
// only says when the plan should come and find them.
//
// A sheet rather than a row of controls on the card: seven days, an hour and
// a switch would crowd every plan in the list for a thing set once. It is put
// on the page's body, since the card it opens from is glass, and glass holds
// anything fixed inside it to its own box.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { DEFAULT_PLAN_HOUR, EVERY_DAY, type PlanDays, type PlanHour } from "@/lib/planSchedule";

type T = (key: MessageKey, vars?: Record<string, string>) => string;

/** A Sunday, to name the days of the week from. */
const SUNDAY = new Date(2023, 0, 1);

/** The week as it is laid out where the reader lives: Monday first in Spanish. */
const weekOrder = (lang: string) => (lang === "es" ? [1, 2, 3, 4, 5, 6, 0] : EVERY_DAY);

function dayName(day: number, lang: string, width: "narrow" | "short" | "long") {
  const date = new Date(SUNDAY);
  date.setDate(SUNDAY.getDate() + day);
  return date.toLocaleDateString(lang === "es" ? "es" : "en", { weekday: width });
}

export function hourName(hour: number, lang: string) {
  return new Date(2020, 0, 1, hour).toLocaleTimeString(lang === "es" ? "es" : "en", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const sameDays = (a: PlanDays, b: number[]) => a.length === b.length && b.every((d) => a.includes(d));
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

/** "Every day · 7:00 AM", "Mon, Wed, Fri · 7:00 PM", or that it is off. */
export function reminderSummary(hour: PlanHour, days: PlanDays, lang: string, t: T) {
  if (hour === "off") return t("journal.remindOff");
  const which = sameDays(days, EVERY_DAY)
    ? t("journal.remindEveryDay")
    : sameDays(days, WEEKDAYS)
      ? t("journal.remindWeekdays")
      : sameDays(days, WEEKEND)
        ? t("journal.remindWeekends")
        : weekOrder(lang)
            .filter((d) => days.includes(d))
            .map((d) => dayName(d, lang, "short"))
            .join(", ");
  return `${which} · ${hourName(hour, lang)}`;
}

export default function PlanReminderSheet({
  name,
  hour,
  days,
  onSave,
  onClose,
}: {
  name: string;
  hour: PlanHour;
  days: PlanDays;
  onSave: (hour: PlanHour, days: PlanDays) => void;
  onClose: () => void;
}) {
  const { lang, t } = useI18n();
  const [on, setOn] = useState(hour !== "off");
  // the hour it had before it was switched off, so switching back finds it
  const [at, setAt] = useState(hour === "off" ? DEFAULT_PLAN_HOUR : hour);
  const [picked, setPicked] = useState<PlanDays>(days);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleDay = (d: number) =>
    setPicked((all) => (all.includes(d) ? all.filter((x) => x !== d) : [...all, d].sort()));
  const recommended = on && at === DEFAULT_PLAN_HOUR && sameDays(picked, EVERY_DAY);
  const noDays = on && picked.length === 0;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass modal remind-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remind-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="remind-sheet-title">
          <Icon name="bell" /> {t("journal.remindTitle")}
        </h2>
        <p className="remind-plan">{name}</p>

        <div className="remind-row">
          <span>{t("journal.remindToggle")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={t("journal.remindToggle")}
            className={`toggle-switch${on ? " on" : ""}`}
            onClick={() => setOn((v) => !v)}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <fieldset className="remind-days" disabled={!on}>
          <legend>{t("journal.remindDays")}</legend>
          <div className="remind-week">
            {weekOrder(lang).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={picked.includes(d)}
                aria-label={dayName(d, lang, "long")}
                title={dayName(d, lang, "long")}
                className={`remind-day${picked.includes(d) ? " on" : ""}`}
                onClick={() => toggleDay(d)}
              >
                {dayName(d, lang, "narrow")}
              </button>
            ))}
          </div>
          <div className="remind-presets">
            {(
              [
                ["journal.remindEveryDay", EVERY_DAY],
                ["journal.remindWeekdays", WEEKDAYS],
                ["journal.remindWeekends", WEEKEND],
              ] as [MessageKey, number[]][]
            ).map(([key, set]) => (
              <button
                key={key}
                type="button"
                className={`chip${sameDays(picked, set) ? " chip-active" : ""}`}
                onClick={() => setPicked([...set])}
              >
                {t(key)}
              </button>
            ))}
          </div>
          {noDays && <p className="error-text">{t("journal.remindPickDay")}</p>}
        </fieldset>

        <label className="remind-row">
          <span>{t("journal.remindTime")}</span>
          <select value={at} disabled={!on} onChange={(e) => setAt(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourName(h, lang)}
              </option>
            ))}
          </select>
        </label>

        <p className="cal-hint remind-note">
          {t("journal.remindRecommended", { time: hourName(DEFAULT_PLAN_HOUR, lang) })}{" "}
          {!recommended && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setOn(true);
                setAt(DEFAULT_PLAN_HOUR);
                setPicked([...EVERY_DAY]);
              }}
            >
              {t("journal.remindUseRecommended")}
            </button>
          )}
        </p>
        <p className="cal-hint remind-note">{t("journal.remindHint")}</p>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={noDays}
            onClick={() => onSave(on ? at : "off", picked.length ? picked : [...EVERY_DAY])}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
