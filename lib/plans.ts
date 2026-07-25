// Reading plans: fixed sequences of daily readings. Names/descriptions live
// in the i18n dictionaries under plan.<id> / plan.<id>.desc. Per-user
// progress (count of completed days) is stored server-side.

export interface PlanDay {
  /** Chapters to read today — usually one, sometimes a short run */
  readings: { b: number; c: number }[];
}

export type PlanCategory = "gospels" | "foundations" | "wisdom" | "journeys";

export interface Plan {
  id: string;
  emoji: string;
  category: PlanCategory;
  days: PlanDay[];
}

export const PLAN_CATEGORIES: PlanCategory[] = [
  "gospels",
  "foundations",
  "wisdom",
  "journeys",
];

/** One chapter a day through a whole book. */
const book = (b: number, chapters: number): PlanDay[] =>
  Array.from({ length: chapters }, (_, i) => ({ readings: [{ b, c: i + 1 }] }));

/** One chapter a day from a hand-picked list in one book. */
const picks = (b: number, chapters: number[]): PlanDay[] =>
  chapters.map((c) => ({ readings: [{ b, c }] }));

/** One reading a day from pairs across books. */
const across = (refs: [number, number][]): PlanDay[] =>
  refs.map(([b, c]) => ({ readings: [{ b, c }] }));

/** Split a run of chapters into days of `per` chapters each. */
const chunked = (
  refs: { b: number; c: number }[],
  per: number
): PlanDay[] => {
  const days: PlanDay[] = [];
  for (let i = 0; i < refs.length; i += per) {
    days.push({ readings: refs.slice(i, i + per) });
  }
  return days;
};

const chaptersOf = (b: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ b, c: i + 1 }));

/** Spread chapters evenly across an exact number of days. */
const spread = (
  refs: { b: number; c: number }[],
  dayCount: number
): PlanDay[] => {
  const days: PlanDay[] = [];
  const per = refs.length / dayCount;
  let taken = 0;
  for (let day = 0; day < dayCount; day++) {
    const end = Math.round((day + 1) * per);
    days.push({ readings: refs.slice(taken, end) });
    taken = end;
  }
  return days;
};

// ---- Gospels & the life of Christ ----------------------------------------

const john21: Plan = { id: "john21", emoji: "📖", category: "gospels", days: book(43, 21) };
const mark16: Plan = { id: "mark16", emoji: "🏃", category: "gospels", days: book(41, 16) };
const luke24: Plan = { id: "luke24", emoji: "🕯️", category: "gospels", days: book(42, 24) };

const sermon7: Plan = {
  id: "sermon7",
  emoji: "⛰️",
  category: "gospels",
  days: [
    { readings: [{ b: 40, c: 5 }] },
    { readings: [{ b: 40, c: 6 }] },
    { readings: [{ b: 40, c: 7 }] },
    { readings: [{ b: 42, c: 6 }] },
    { readings: [{ b: 59, c: 1 }] },
    { readings: [{ b: 59, c: 2 }] },
    { readings: [{ b: 59, c: 3 }] },
  ],
};

const passion7: Plan = {
  id: "passion7",
  emoji: "✝️",
  category: "gospels",
  days: [
    { readings: [{ b: 40, c: 21 }] },
    { readings: [{ b: 40, c: 24 }] },
    { readings: [{ b: 40, c: 26 }] },
    { readings: [{ b: 43, c: 13 }, { b: 43, c: 14 }] },
    { readings: [{ b: 43, c: 17 }] },
    { readings: [{ b: 40, c: 27 }] },
    { readings: [{ b: 40, c: 28 }, { b: 43, c: 20 }] },
  ],
};

// ---- Foundations ---------------------------------------------------------

const newbeliever14: Plan = {
  id: "newbeliever14",
  emoji: "🌱",
  category: "foundations",
  days: across([
    [43, 1], [43, 3], [45, 3], [45, 5], [45, 8], [49, 2], [50, 2],
    [51, 3], [47, 5], [62, 1], [59, 1], [58, 11], [19, 23], [40, 28],
  ]),
};

const romans16: Plan = { id: "romans16", emoji: "📜", category: "foundations", days: book(45, 16) };

const nt30: Plan = {
  id: "nt30",
  emoji: "✨",
  category: "foundations",
  days: across([
    [40, 5], [40, 6], [40, 7], [42, 15], [43, 1], [43, 3], [43, 14],
    [43, 15], [44, 2], [45, 8], [45, 12], [46, 13], [46, 15], [48, 5],
    [49, 2], [49, 6], [50, 4], [51, 3], [52, 4], [58, 11], [58, 12],
    [59, 1], [60, 1], [61, 1], [62, 4], [66, 21], [66, 22], [40, 28],
    [42, 24], [44, 1],
  ]),
};

const prayer10: Plan = {
  id: "prayer10",
  emoji: "🙏",
  category: "foundations",
  days: across([
    [40, 6], [42, 11], [43, 17], [19, 51], [19, 145], [50, 4],
    [46, 14], [51, 4], [59, 5], [62, 5],
  ]),
};

const armor7: Plan = {
  id: "armor7",
  emoji: "🛡️",
  category: "foundations",
  days: across([
    [49, 6], [45, 8], [59, 4], [60, 5], [47, 10], [19, 91], [23, 41],
  ]),
};

// ---- Wisdom & worship ----------------------------------------------------

const psalms14: Plan = {
  id: "psalms14",
  emoji: "🕊️",
  category: "wisdom",
  days: picks(19, [23, 27, 34, 46, 91, 121, 139, 42, 62, 63, 103, 116, 130, 145]),
};

const proverbs31: Plan = { id: "proverbs31", emoji: "🦉", category: "wisdom", days: book(20, 31) };

const psalms150: Plan = {
  id: "psalms150",
  emoji: "🎶",
  category: "wisdom",
  days: chunked(chaptersOf(19, 150), 3),
};

const ecclesiastes12: Plan = {
  id: "ecclesiastes12",
  emoji: "⏳",
  category: "wisdom",
  days: book(21, 12),
};

// ---- Longer journeys -----------------------------------------------------

const genesis50: Plan = { id: "genesis50", emoji: "🌍", category: "journeys", days: book(1, 50) };
const acts28: Plan = { id: "acts28", emoji: "🔥", category: "journeys", days: book(44, 28) };

/** The New Testament, Matthew → Revelation, about two chapters a day. */
const nt90: Plan = {
  id: "nt90",
  emoji: "📚",
  category: "journeys",
  days: (() => {
    const NT: [number, number][] = [
      [40, 28], [41, 16], [42, 24], [43, 21], [44, 28], [45, 16], [46, 16],
      [47, 13], [48, 6], [49, 6], [50, 4], [51, 4], [52, 5], [53, 3],
      [54, 6], [55, 4], [56, 3], [57, 1], [58, 13], [59, 5], [60, 5],
      [61, 3], [62, 5], [63, 1], [64, 1], [65, 1], [66, 22],
    ];
    const refs = NT.flatMap(([b, count]) => chaptersOf(b, count));
    return spread(refs, 90);
  })(),
};

/** The whole Bible, Genesis → Revelation, in a year. */
const bible365: Plan = {
  id: "bible365",
  emoji: "🌟",
  category: "journeys",
  days: (() => {
    const COUNTS = [
      50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42,
      150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
      28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5,
      3, 5, 1, 1, 1, 22,
    ];
    const refs = COUNTS.flatMap((count, i) => chaptersOf(i + 1, count));
    // 1,189 chapters across 365 days — a few days carry an extra chapter
    return spread(refs, 365);
  })(),
};

export const PLANS: Plan[] = [
  john21,
  mark16,
  luke24,
  sermon7,
  passion7,
  newbeliever14,
  romans16,
  nt30,
  prayer10,
  armor7,
  psalms14,
  proverbs31,
  psalms150,
  ecclesiastes12,
  genesis50,
  acts28,
  nt90,
  bible365,
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
