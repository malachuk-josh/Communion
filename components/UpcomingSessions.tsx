"use client";

// When your Gatherings next meet, on the Gatherings page.
//
// The list of Gatherings tells you who you are with. It does not tell you the
// one thing that makes a Gathering a gathering — when it meets — and finding
// that out meant opening each room in turn. So the third tab answers it for
// all of them at once: who I'm with, who else is out there, when we next meet.
//
// Open Gatherings are in the list too, marked as such and switchable off. A
// room can then be found by when it meets rather than only by what it is
// called, which is how most people decide whether they can come. The switch
// is there because that half of the list grows with the whole directory
// rather than with anything the reader did, and a page that has become a
// noticeboard is no longer a plan for the week.
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

type Row = WorshipEvent & { churchName: string; open?: boolean };

const OPEN_KEY = "communion.sessionsOpen";

/** Today, tomorrow, or the day it falls on. */
function dayLabel(at: number, lang: string): string {
  const locale = lang === "es" ? "es" : "en";
  const day = new Date(at);
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(day) - midnight(new Date())) / 86400000);
  const time = day.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (days === 0 || days === 1) {
    // "Today at 7:00 PM" reads as a plan; "Thu 6 Feb, 7:00 PM" reads as a
    // record. The two nearest days are the ones anybody is deciding about.
    const word =
      days === 0
        ? lang === "es"
          ? "Hoy"
          : "Today"
        : lang === "es"
          ? "Mañana"
          : "Tomorrow";
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
  const [mine, setMine] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<Row[] | null>(null);
  // On by default: the reader asked for a page about when things happen, and
  // an empty one because their own rooms have nothing booked yet is a worse
  // first answer than a full one they can quieten.
  const [showOpen, setShowOpen] = useState(true);

  useEffect(() => {
    try {
      setShowOpen(window.localStorage.getItem(OPEN_KEY) !== "0");
    } catch {
      // storage blocked — the switch simply starts on
    }
  }, []);

  useEffect(() => {
    api<{ events: Row[] }>("/api/calendar")
      .then((res) => setMine(res.events))
      .catch(() => setMine([]));
  }, []);

  // Fetched the first time it is asked for, and then kept. Turning the switch
  // off and on again should not cost a second sweep of the directory.
  useEffect(() => {
    if (!showOpen || open !== null) return;
    api<{ events: Row[] }>("/api/calendar/open")
      .then((res) => setOpen(res.events.map((e) => ({ ...e, open: true }))))
      .catch(() => setOpen([]));
  }, [showOpen, open]);

  const flip = (next: boolean) => {
    setShowOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // the choice just won't outlive this visit
    }
  };

  // The switch is drawn before anything has loaded, so that turning it off on
  // a slow connection does not mean waiting for the list you did not want.
  const control = (
    <label className="toggle-row sessions-open">
      <input
        type="checkbox"
        checked={showOpen}
        onChange={(e) => flip(e.target.checked)}
      />
      <Icon name="globe" /> {t("churches.sessionsOpen")}
    </label>
  );

  const waiting = mine === null || (showOpen && open === null);
  const rows = [...(mine ?? []), ...(showOpen ? (open ?? []) : [])].sort(
    (a, b) => a.startsAt - b.startsAt
  );

  return (
    <div>
      {control}

      {waiting ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <div className="glass card empty">
          {t(showOpen ? "churches.sessionsEmpty" : "churches.sessionsEmptyMine")}
        </div>
      ) : (
        <>
          {rows.map((event) => {
            const passage = parsePassage(event.passageRef);
            return (
              <div
                key={event.id}
                className={`glass session${event.open ? " session-open" : ""}`}
              >
                <span className="session-icon">
                  <Icon name={SESSION_ICON[event.type]} />
                </span>
                <div className="session-body">
                  {/* The badge rides with the title, not in the line below.
                      It qualifies the whole row rather than the room, and put
                      mid-sentence it broke the meta line in half whenever a
                      Gathering had a long enough name to wrap. */}
                  <h3 className="session-title">
                    {event.title}
                    {/* Said plainly, because the difference matters: one of
                        these you belong to and the other you would be
                        knocking on. */}
                    {event.open && (
                      <span className="chip open-chip">
                        {t("churches.sessionsOpenBadge")}
                      </span>
                    )}
                  </h3>
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
                    {/* Who is coming is not on this line. A bare head-count
                        next to a duration is two numbers meaning different
                        things, and the one that matters is who — which needs
                        names, which needs the room. */}
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
                      {/* Only ever present for a room you are in — the server
                          does not send it for the others (lib/churches.ts). */}
                      {event.meetingUrl && (
                        <a
                          href={event.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
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
        </>
      )}
    </div>
  );
}
