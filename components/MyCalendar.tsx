"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, guestId } from "@/lib/client";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar";
import { useI18n } from "@/lib/i18n";
import { parsePassage } from "@/lib/passage";
import MonthGrid from "@/components/MonthGrid";
import type { SessionType, WorshipEvent } from "@/lib/types";

const EMOJI: Record<SessionType, string> = {
  bible_study: "📖",
  prayer: "🙏",
  communion: "🍞",
  praise_worship: "🎶",
  fellowship: "🤝",
  custom: "✨",
};

type CalendarEventRow = WorshipEvent & { churchName: string };

export default function MyCalendar() {
  const { lang, t } = useI18n();
  const [events, setEvents] = useState<CalendarEventRow[] | null>(null);

  useEffect(() => {
    api<{ events: CalendarEventRow[] }>("/api/calendar")
      .then((res) => setEvents(res.events))
      .catch(() => setEvents([]));
  }, []);

  return (
    <div>
      <h1 className="page-title">{t("calendar.title")}</h1>
      <p className="subtitle">{t("calendar.subtitle")}</p>

      {events === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : events.length === 0 ? (
        <div className="glass card empty">{t("calendar.empty")}</div>
      ) : (
        <>
          <MonthGrid
            events={events}
            onPick={(eventId) =>
              document
                .getElementById(`event-${eventId}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          />
          {events.map((event) => {
            const when = new Date(event.startsAt).toLocaleString(
              lang === "es" ? "es" : "en",
              {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }
            );
            const parsed = parsePassage(event.passageRef);
            return (
              <div key={event.id} className="glass session" id={`event-${event.id}`}>
                <span className="session-icon">{EMOJI[event.type]}</span>
                <div className="session-body">
                  <h3>{event.title}</h3>
                  <p className="session-meta">
                    <Link href={`/churches/${event.churchId}`} className="passage-link">
                      ⛪ {event.churchName}
                    </Link>
                    {" · "}
                    {when} · {event.durationMin} {t("common.min")}
                    {event.details && <> · {event.details}</>}
                    {event.passageRef &&
                      (parsed ? (
                        <>
                          {" · "}
                          <Link
                            href={`/?b=${parsed.bookNr}&c=${parsed.chapter}`}
                            className="passage-link"
                          >
                            📖 {event.passageRef}
                          </Link>
                        </>
                      ) : (
                        <> · {event.passageRef}</>
                      ))}
                    {event.meetingUrl && (
                      <>
                        {" · "}
                        <a href={event.meetingUrl} target="_blank" rel="noreferrer">
                          {t("session.joinCall")}
                        </a>
                      </>
                    )}
                  </p>
                  {(() => {
                    const going = (event.attendees ?? [])
                      .filter((a) => a.status === "going")
                      .map((a) => a.name);
                    const maybe = (event.attendees ?? [])
                      .filter((a) => a.status === "maybe")
                      .map((a) => a.name);
                    if (going.length === 0 && maybe.length === 0) return null;
                    return (
                      <p className="session-meta attendee-line">
                        👥{" "}
                        {going.length > 0 && (
                          <>
                            {t("rsvp.going")}: {going.join(", ")}
                          </>
                        )}
                        {going.length > 0 && maybe.length > 0 && " · "}
                        {maybe.length > 0 && (
                          <>
                            {t("rsvp.maybe")}: {maybe.join(", ")}
                          </>
                        )}
                      </p>
                    );
                  })()}
                  <div className="cal-row">
                    <span className="cal-label">📅 {t("session.addToCalendar")}</span>
                    <a
                      className="cal-link"
                      target="_blank"
                      rel="noreferrer"
                      href={googleCalendarUrl(event, event.churchName, window.location.origin)}
                    >
                      Google
                    </a>
                    <a
                      className="cal-link"
                      target="_blank"
                      rel="noreferrer"
                      href={outlookCalendarUrl(event, event.churchName, window.location.origin)}
                    >
                      Outlook
                    </a>
                    <a
                      className="cal-link"
                      href={`/api/events/${event.id}/ics${
                        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                          ? ""
                          : `?g=${guestId()}`
                      }`}
                    >
                      Apple (.ics)
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
