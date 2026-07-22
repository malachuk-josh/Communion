// Verse of the Day: a curated rotation, deterministic by UTC date so the
// whole community sees the same verse together.

export interface VerseRef {
  b: number; // book nr
  c: number; // chapter
  v: number; // first verse
  ve?: number; // last verse (inclusive) for short ranges
}

export const DAILY_VERSES: VerseRef[] = [
  { b: 43, c: 3, v: 16 },
  { b: 19, c: 23, v: 1 },
  { b: 20, c: 3, v: 5, ve: 6 },
  { b: 23, c: 40, v: 31 },
  { b: 50, c: 4, v: 13 },
  { b: 45, c: 8, v: 28 },
  { b: 24, c: 29, v: 11 },
  { b: 19, c: 46, v: 1 },
  { b: 40, c: 11, v: 28 },
  { b: 6, c: 1, v: 9 },
  { b: 19, c: 119, v: 105 },
  { b: 23, c: 41, v: 10 },
  { b: 45, c: 12, v: 2 },
  { b: 48, c: 5, v: 22, ve: 23 },
  { b: 58, c: 11, v: 1 },
  { b: 55, c: 1, v: 7 },
  { b: 46, c: 13, v: 4 },
  { b: 19, c: 27, v: 1 },
  { b: 40, c: 6, v: 33 },
  { b: 43, c: 14, v: 6 },
  { b: 49, c: 2, v: 8 },
  { b: 19, c: 121, v: 1, ve: 2 },
  { b: 20, c: 18, v: 10 },
  { b: 25, c: 3, v: 22, ve: 23 },
  { b: 33, c: 6, v: 8 },
  { b: 36, c: 3, v: 17 },
  { b: 43, c: 8, v: 12 },
  { b: 45, c: 5, v: 8 },
  { b: 60, c: 5, v: 7 },
  { b: 51, c: 3, v: 23 },
  { b: 19, c: 37, v: 4 },
];

export function verseOfTheDay(date = new Date()): VerseRef {
  const daysSinceEpoch = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  return DAILY_VERSES[daysSinceEpoch % DAILY_VERSES.length];
}
