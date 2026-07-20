// Calendar links and ICS generation — usable from both client and server.

export interface CalendarEvent {
  id: string;
  churchId: string;
  title: string;
  startsAt: number;
  durationMin: number;
  passageRef?: string;
  meetingUrl?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC timestamp in ICS basic format: 20260721T183000Z */
function icsDate(ts: number): string {
  const d = new Date(ts);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function endTs(event: CalendarEvent): number {
  return event.startsAt + event.durationMin * 60 * 1000;
}

function description(
  event: CalendarEvent,
  churchName: string,
  appUrl: string
): string {
  const lines = [`${churchName} — Communion`];
  if (event.passageRef) lines.push(`Passage: ${event.passageRef}`);
  if (event.meetingUrl) lines.push(`Join: ${event.meetingUrl}`);
  lines.push(`${appUrl}/churches/${event.churchId}`);
  return lines.join("\n");
}

export function googleCalendarUrl(
  event: CalendarEvent,
  churchName: string,
  appUrl: string
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${event.title} — ${churchName}`,
    dates: `${icsDate(event.startsAt)}/${icsDate(endTs(event))}`,
    details: description(event, churchName, appUrl),
  });
  if (event.meetingUrl) params.set("location", event.meetingUrl);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(
  event: CalendarEvent,
  churchName: string,
  appUrl: string
): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: `${event.title} — ${churchName}`,
    startdt: new Date(event.startsAt).toISOString(),
    enddt: new Date(endTs(event)).toISOString(),
    body: description(event, churchName, appUrl),
  });
  if (event.meetingUrl) params.set("location", event.meetingUrl);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Teams' "new meeting" deep link, prefilled with subject and time. */
export function teamsNewMeetingUrl(
  title: string,
  startsAt?: number,
  durationMin?: number
): string {
  const params = new URLSearchParams({ subject: title });
  if (startsAt && Number.isFinite(startsAt)) {
    params.set("startTime", new Date(startsAt).toISOString());
    params.set(
      "endTime",
      new Date(startsAt + (durationMin ?? 60) * 60 * 1000).toISOString()
    );
  }
  return `https://teams.microsoft.com/l/meeting/new?${params.toString()}`;
}

const escapeIcsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/** RFC 5545 calendar file — recognized by Apple Calendar, Outlook, Google. */
export function buildIcs(
  event: CalendarEvent,
  churchName: string,
  appUrl: string
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Communion//Worship Sessions//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@communion`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(event.startsAt)}`,
    `DTEND:${icsDate(endTs(event))}`,
    `SUMMARY:${escapeIcsText(`${event.title} — ${churchName}`)}`,
    `DESCRIPTION:${escapeIcsText(description(event, churchName, appUrl))}`,
  ];
  if (event.meetingUrl) {
    lines.push(`LOCATION:${escapeIcsText(event.meetingUrl)}`);
    lines.push(`URL:${event.meetingUrl}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
