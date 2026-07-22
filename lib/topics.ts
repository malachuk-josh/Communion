// Topical verse collections — verses for the moments people reach for
// Scripture. Passages deep-link into the reader.

import type { VerseRef } from "@/lib/devotional";

export interface Topic {
  id: string; // i18n key suffix: topic.<id>
  emoji: string;
  passages: VerseRef[];
}

export const TOPICS: Topic[] = [
  {
    id: "anxiety",
    emoji: "🕊️",
    passages: [
      { b: 50, c: 4, v: 6, ve: 7 },
      { b: 40, c: 6, v: 25, ve: 27 },
      { b: 43, c: 14, v: 27 },
      { b: 19, c: 55, v: 22 },
      { b: 60, c: 5, v: 7 },
      { b: 23, c: 26, v: 3 },
    ],
  },
  {
    id: "hope",
    emoji: "🌅",
    passages: [
      { b: 24, c: 29, v: 11 },
      { b: 45, c: 15, v: 13 },
      { b: 23, c: 40, v: 31 },
      { b: 58, c: 6, v: 19 },
      { b: 19, c: 42, v: 11 },
      { b: 45, c: 8, v: 24, ve: 25 },
    ],
  },
  {
    id: "forgiveness",
    emoji: "🤲",
    passages: [
      { b: 49, c: 4, v: 32 },
      { b: 62, c: 1, v: 9 },
      { b: 51, c: 3, v: 13 },
      { b: 40, c: 6, v: 14 },
      { b: 19, c: 103, v: 12 },
      { b: 33, c: 7, v: 18, ve: 19 },
    ],
  },
  {
    id: "grief",
    emoji: "🕯️",
    passages: [
      { b: 19, c: 34, v: 18 },
      { b: 40, c: 5, v: 4 },
      { b: 66, c: 21, v: 4 },
      { b: 19, c: 147, v: 3 },
      { b: 47, c: 1, v: 3, ve: 4 },
      { b: 43, c: 11, v: 25 },
    ],
  },
  {
    id: "gratitude",
    emoji: "🙌",
    passages: [
      { b: 52, c: 5, v: 16, ve: 18 },
      { b: 19, c: 100, v: 4 },
      { b: 19, c: 107, v: 1 },
      { b: 51, c: 3, v: 15 },
      { b: 59, c: 1, v: 17 },
      { b: 19, c: 118, v: 24 },
    ],
  },
  {
    id: "family",
    emoji: "💞",
    passages: [
      { b: 46, c: 13, v: 4, ve: 7 },
      { b: 49, c: 5, v: 25 },
      { b: 20, c: 22, v: 6 },
      { b: 6, c: 24, v: 15 },
      { b: 51, c: 3, v: 14 },
      { b: 60, c: 4, v: 8 },
    ],
  },
  {
    id: "newbelievers",
    emoji: "🌱",
    passages: [
      { b: 47, c: 5, v: 17 },
      { b: 45, c: 10, v: 9 },
      { b: 43, c: 1, v: 12 },
      { b: 49, c: 2, v: 8, ve: 9 },
      { b: 60, c: 2, v: 2 },
      { b: 45, c: 6, v: 23 },
    ],
  },
];
