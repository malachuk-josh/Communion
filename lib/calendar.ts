// Calendar links and ICS generation — usable from both client and server.

export interface CalendarEvent {
  id: string;
  churchId: string;
  title: string;
  startsAt: number;
  durationMin: number;
  passageRef?: string;
  meetingUrl?: string;
  details?: string;
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
  if (event.details) lines.push(event.details);
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

/**
 * Google Calendar event template for a session that doesn't exist yet —
 * used by the schedule modal's Meet flow. Google attaches a Meet link on
 * save and emails every guest a real invite.
 */
export function googleEventTemplateUrl(opts: {
  title: string;
  startsAt?: number;
  durationMin?: number;
  details?: string;
  guests?: string[];
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
  });
  if (opts.startsAt && Number.isFinite(opts.startsAt)) {
    const end = opts.startsAt + (opts.durationMin ?? 60) * 60 * 1000;
    params.set("dates", `${icsDate(opts.startsAt)}/${icsDate(end)}`);
  }
  if (opts.details) params.set("details", opts.details);
  if (opts.guests && opts.guests.length > 0) {
    params.set("add", opts.guests.join(","));
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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

/*
 * Everything a member typed goes through here before it becomes a line of an
 * ICS file.
 *
 * An ICS file is newline-delimited, so a newline inside a value is not a
 * newline — it is the end of this property and the start of whatever the text
 * says next. A session titled "Prayer\r\nATTENDEE:mailto:someone@example.com"
 * would add a guest to a calendar invitation that never invited them, and
 * "\r\nEND:VEVENT\r\nBEGIN:VEVENT..." would append a whole second event. So
 * the newline is escaped into the literal two characters ICS uses for one.
 *
 * The lone \r is handled separately and deliberately: matching only \r?\n
 * leaves a bare carriage return intact, and a bare CR still ends the line for
 * a good many parsers. Both orderings matter too — backslash is escaped first,
 * or it would go back and double the escapes added after it.
 */
const escapeIcsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");

/**
 * RFC 5545 wants no content line longer than 75 octets, continued by CRLF and
 * a single space. Long-form session details sail past that, and the stricter
 * parsers — Outlook among them — will reject the file rather than guess.
 *
 * Counted in UTF-8 bytes rather than characters, because that is what the
 * limit is measured in, and split on whole code points so a folded line never
 * cuts an em dash in half.
 */
function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const out: string[] = [];
  let chunk = "";
  let bytes = 0;
  // 75 for the first line; continuations spend one octet on the leading space
  let budget = 75;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    if (bytes + size > budget) {
      out.push(chunk);
      chunk = "";
      bytes = 0;
      budget = 74;
    }
    chunk += ch;
    bytes += size;
  }
  if (chunk) out.push(chunk);
  return out.join("\r\n ");
}

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
    `UID:${escapeIcsText(event.id)}@communion`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(event.startsAt)}`,
    `DTEND:${icsDate(endTs(event))}`,
    `SUMMARY:${escapeIcsText(`${event.title} — ${churchName}`)}`,
    `DESCRIPTION:${escapeIcsText(description(event, churchName, appUrl))}`,
  ];
  if (event.meetingUrl) {
    lines.push(`LOCATION:${escapeIcsText(event.meetingUrl)}`);
    // URL is a URI property, not text — but it is still one line, and the
    // member typed it, so it gets the same treatment as everything else here
    lines.push(`URL:${escapeIcsText(event.meetingUrl)}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n");
}
