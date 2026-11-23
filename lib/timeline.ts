// The Bible on one line (public/maps/timeline.json, written by
// scripts/build-era-story.mjs from scripts/era-story.mjs): every era's
// story in the order it happened, with the moments the eras do not tell
// placed among them, and the eras along a ribbon to scale.
//
// Looked over before use, like every map file: served from the offline cache
// first, it can be a copy from an older build.

import { load } from "@/lib/mapData";

export interface TimelineEra {
  id: string;
  /** years, negative before Christ; none for the beginnings */
  from?: number;
  to?: number;
  tone: number;
}

export interface TimelineEvent {
  era: string;
  /** the step of its era's story, to open its map at */
  step?: number;
  /** null before Abraham */
  year: number | null;
  /** about */
  c?: 1;
  title: [string, string];
  words: [string, string];
  ref: [number, number, number, number?];
  journey?: string;
  /** a chapter whose map shows it, where it is not an era's step */
  map?: [number, number];
}

export interface Timeline {
  eras: TimelineEra[];
  events: TimelineEvent[];
}

const pair = (v: unknown): v is [string, string] =>
  Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string";

export async function loadTimeline(): Promise<Timeline | null> {
  const raw = await load<{ v?: number; eras?: unknown; events?: unknown } | null>(
    "/maps/timeline.json",
    null
  );
  if (!raw || raw.v !== 1 || !Array.isArray(raw.eras) || !Array.isArray(raw.events)) return null;
  const eras = raw.eras.filter(
    (e): e is TimelineEra => !!e && typeof e.id === "string" && Number.isFinite(e.tone)
  );
  const events = raw.events.filter(
    (e): e is TimelineEvent =>
      !!e &&
      typeof e.era === "string" &&
      (e.year === null || Number.isFinite(e.year)) &&
      pair(e.title) &&
      pair(e.words) &&
      Array.isArray(e.ref) &&
      e.ref.length >= 3
  );
  return events.length ? { eras, events } : null;
}

/** A year as the reader says it: "c. 2091 BC", "AD 30"; "c. 2091 a. C.", "30 d. C." */
export function yearLabel(year: number, about: boolean, lang: string): string {
  const c = about ? "c. " : "";
  if (lang === "es") return year < 0 ? `${c}${-year} a. C.` : `${c}${year} d. C.`;
  return year < 0 ? `${c}${-year} BC` : `${c}AD ${year}`;
}

/** An era's span, as the reader says it: "c. 2100–1876 BC", "c. 5 BC – AD 30". */
export function spanLabel(from: number, to: number, lang: string): string {
  if (from < 0 && to < 0) {
    return lang === "es" ? `c. ${-from}–${-to} a. C.` : `c. ${-from}–${-to} BC`;
  }
  if (from > 0 && to > 0) {
    return lang === "es" ? `c. ${from}–${to} d. C.` : `c. AD ${from}–${to}`;
  }
  return `${yearLabel(from, true, lang)} – ${yearLabel(to, false, lang)}`;
}
