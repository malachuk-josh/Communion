"use client";

// When your Gatherings next meet, on the Gatherings page.
//
// The list of Gatherings tells you who you are with. It does not tell you the
// one thing that makes a Gathering a gathering — when it meets — and finding
// that out meant opening each room in turn. So the third tab answers it for
// all of them at once: who I'm with, who else is out there, when we next meet.
//
// Deliberately lighter than the Calendar screen, which is the same events with
// a month grid over them and Google/Outlook/Apple links under each one. That
// is a screen for planning. This is a glance — what is next, whose it is, and
// the way in — with a line at the foot for anyone who wanted the other thing.

import Link from "next/link";
import Icon, { SESSION_ICON } from "@/components/Icon";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { parsePassage } from "@/lib/passage";
import type { WorshipEvent } from "@/lib/types";

type Row = WorshipEvent & { churchName: string };

/** Today, tomorrow, or the day it falls on. */
function dayLabel(at: number, lang: string): string {
  const locale = lang === "es" ? "es" : "en";
  const day = new Date(at);
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (midnight(day) - midnight(new Date())) / 86400000
  );
  const time = day.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (days === 0 || days === 1) {
    // "Today at 7:00 PM" reads as a plan; "Thu 6 Feb, 7:00 PM" reads as a
    // record. The two nearest days are the ones anybody is deciding about.
    const word = days === 0
      ? lang === "es" ? "Hoy" : "Today"
      : lang === "es" ? "Mañana" : "Tomorrow";
    return `${word} · ${time}`;
  }
  return `${day.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${time}`;
}

export default function UpcomingSessions() {
  const { lang, t } = useI18n();
  const [events, setEvents] = useState<Row[] | null>(null);

  useEffect(() => {
    api<{ events: Row[] }>("/api/calendar")
      .then((res) => setEvents(res.events))
      .catch(() => setEvents([]));
  }, []);

  if (events === null) return <p className="skeleton">{t("common.loading")}</p>;

  if (events.length === 0) {
    return (
      <div className="glass card empty">{t("churches.sessionsEmpty")}</div>
    );
  }

  return (
    <div>
      {events.map((event) => {
        const passage = parsePassage(event.passageRef);
        return (
          <div key={event.id} className="glass session">
            <span className="session-icon">
              <Icon name={SESSION_ICON[event.type]} />
            </span>
            <div className="session-body">
              <h3>{event.title}</h3>
              <p className="session-meta">
                {/* whose it is comes first: on this page the Gathering is
                    what the reader is navigating by */}
                <Link
                  href={`/churches/${event.churchId}`}
                  className="passage-link"
                >
                  <Icon name="church" /> {event.churchName}
                </Link>
                {" · "}
                {dayLabel(event.startsAt, lang)}
                {" · "}
                {event.durationMin} {t("common.min")}
                {/* Who is coming is not on this line. A bare head-count next
                    to a duration is two numbers meaning different things, and
                    the one that matters is who — which needs names, which
                    needs the room. The Calendar lists them; so does the
                    Gathering, one tap away through its own name above. */}
              </p>
              {(event.passageRef || event.meetingUrl) && (
                <p className="session-meta">
                  {event.passageRef &&
                    (passage ? (
                      <Link
                        href={`/?b=${passage.bookNr}&c=${passage.chapter}`}
                        className="passage-link"
                      >
                        <Icon name="book" /> {event.passageRef}
                      </Link>
                    ) : (
                      <>
                        <Icon name="book" /> {event.passageRef}
                      </>
                    ))}
                  {event.passageRef && event.meetingUrl && " · "}
                  {event.meetingUrl && (
                    <a href={event.meetingUrl} target="_blank" rel="noreferrer">
                      {t("session.joinCall")}
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>
        );
      })}
      {/* the month grid and the add-to-calendar links live there, not here */}
      <p className="notice">
        <Link href="/calendar" className="passage-link">
          <Icon name="calendar" /> {t("churches.sessionsAll")}
        </Link>
      </p>
    </div>
  );
}
