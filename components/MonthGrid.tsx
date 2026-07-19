"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { WorshipEvent } from "@/lib/types";

const TYPE_DOT: Record<string, string> = {
  bible_study: "📖",
  prayer: "🙏",
  communion: "🍞",
  praise_worship: "🎶",
  custom: "✨",
};

export default function MonthGrid({
  events,
  onPick,
}: {
  events: WorshipEvent[];
  onPick: (eventId: string) => void;
}) {
  const { lang, t } = useI18n();
  const [offset, setOffset] = useState(0);

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = first.getDay(); // week starts Sunday

  const byDay = new Map<number, WorshipEvent[]>();
  for (const event of events) {
    const d = new Date(event.startsAt);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const list = byDay.get(d.getDate());
      if (list) list.push(event);
      else byDay.set(d.getDate(), [event]);
    }
  }

  const locale = lang === "es" ? "es" : "en";
  // 2023-01-01 was a Sunday — a stable anchor for localized weekday initials
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, i + 1).toLocaleDateString(locale, { weekday: "narrow" })
  );
  const title = first.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  const isThisMonth =
    now.getFullYear() === year && now.getMonth() === month;

  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="glass card month-grid">
      <div className="month-head">
        <button
          className="btn btn-sm"
          onClick={() => setOffset(offset - 1)}
          aria-label={t("calendar.prevMonth")}
        >
          ←
        </button>
        <span className="month-title">{title}</span>
        <button
          className="btn btn-sm"
          onClick={() => setOffset(offset + 1)}
          aria-label={t("calendar.nextMonth")}
        >
          →
        </button>
      </div>
      <div className="month-cells">
        {weekdays.map((w, i) => (
          <span key={`w${i}`} className="dow">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const dayEvents = byDay.get(day);
          const isToday = isThisMonth && day === now.getDate();
          return (
            <button
              key={day}
              className={`day${isToday ? " today" : ""}${dayEvents ? " has-events" : ""}`}
              disabled={!dayEvents}
              onClick={() => dayEvents && onPick(dayEvents[0].id)}
            >
              <span className="day-nr">{day}</span>
              {dayEvents && (
                <span className="day-dots">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span key={event.id}>{TYPE_DOT[event.type] ?? "✨"}</span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
