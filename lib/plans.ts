// Reading plans: fixed sequences of daily readings. Names/descriptions live
// in the i18n dictionaries under plan.<id> / plan.<id>.desc. Per-user
// progress (count of completed days) is stored server-side.

import type { IconName } from "@/components/Icon";
import { MORNING_EVENING } from "@/lib/morningEvening";
import { TREASURY_PARTS } from "@/lib/treasuryParts";

/**
 * One reading: a chapter, or — where a plan has to divide a long one — the
 * run of verses `v` to `ve` within it.
 */
export interface Reading {
  b: number;
  c: number;
  v?: number;
  ve?: number;
  /**
   * A part of a Bookshelf book instead of a chapter of Scripture: the book's
   * slug, the part's id and its title. `b` and `c` are nought on these, so
   * anything that looks up a Bible book for one finds none and moves on.
   */
  shelf?: string;
  part?: string;
  title?: string;
}

export interface PlanDay {
  /** Chapters to read today — usually one, sometimes a short run */
  readings: Reading[];
}

export type PlanCategory =
  | "gospels"
  | "foundations"
  | "wisdom"
  | "journeys"
  | "commentary"
  | "bookshelf";

/**
 * Whose commentary walks beside a plan, day by day. Matthew Henry has written
 * on every chapter of the Bible, and Spurgeon's Treasury of David on every
 * psalm, so either can go with any day of a plan built for them.
 */
export type PlanGuide = "henry" | "spurgeon";

export interface Plan {
  id: string;
  icon: IconName;
  category: PlanCategory;
  /** English title, for server-side notifications (the UI uses i18n) */
  name: string;
  days: PlanDay[];
  /** set on the plans read with a commentary; see components/CommentaryGuide */
  guide?: PlanGuide;
}

export const PLAN_CATEGORIES: PlanCategory[] = [
  "gospels",
  "foundations",
  "wisdom",
  "journeys",
  "commentary",
  "bookshelf",
];

/**
 * "John 3", or "Psalms 119:9–16" for a day that is part of a chapter — or a
 * Bookshelf chapter's own title.
 */
export function readingLabel(r: Reading, bookName: string): string {
  if (r.shelf) return r.title ?? r.part ?? "";
  return `${bookName} ${r.c}${r.v ? `:${r.v}–${r.ve}` : ""}`;
}

/**
 * Where a reading opens: in The Word, at its first verse if it has one, or on
 * the Bookshelf at the part.
 */
export function readingHref(r: Reading, from?: string): string {
  if (r.shelf) {
    return `/bookshelf?b=${r.shelf}&p=${r.part}${from ? `&from=${from}` : ""}`;
  }
  return `/?b=${r.b}&c=${r.c}${r.v ? `&v=${r.v}` : ""}${from ? `&from=${from}` : ""}`;
}

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

const john21: Plan = { id: "john21", icon: "book", category: "gospels",
  name: "The Gospel of John in 21 Days", days: book(43, 21) };
const mark16: Plan = { id: "mark16", icon: "runner", category: "gospels",
  name: "Mark in 16 Days", days: book(41, 16) };
const luke24: Plan = { id: "luke24", icon: "candle", category: "gospels",
  name: "Luke in 24 Days", days: book(42, 24) };

const sermon7: Plan = {
  id: "sermon7",
  icon: "mountain",
  category: "gospels",
  name: "The Sermon on the Mount",
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
  icon: "cross",
  category: "gospels",
  name: "Passion Week",
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
  icon: "seedling",
  category: "foundations",
  name: "First Steps",
  days: across([
    [43, 1], [43, 3], [45, 3], [45, 5], [45, 8], [49, 2], [50, 2],
    [51, 3], [47, 5], [62, 1], [59, 1], [58, 11], [19, 23], [40, 28],
  ]),
};

const romans16: Plan = { id: "romans16", icon: "scroll", category: "foundations",
  name: "Romans in 16 Days", days: book(45, 16) };

const nt30: Plan = {
  id: "nt30",
  icon: "sparkle",
  category: "foundations",
  name: "New Testament Highlights",
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
  icon: "prayer",
  category: "foundations",
  name: "Learning to Pray",
  days: across([
    [40, 6], [42, 11], [43, 17], [19, 51], [19, 145], [50, 4],
    [46, 14], [51, 4], [59, 5], [62, 5],
  ]),
};

/**
 * For anybody walking back.
 *
 * Written for the readers of the "When We Were Young" Gathering — people
 * raised in church who left it for a while and are living for Christ again —
 * but it is not theirs alone, and nothing in it assumes a particular story.
 *
 * The order is the point, and it is the order of the thing itself rather than
 * the order of the canon. It opens where the whole idea comes from, sits in
 * the far country long enough to be honest about it, and only then turns. The
 * turn is deliberately placed at day 11, Romans 8, so that ten days of weight
 * are answered by "no condemnation" from the middle of the plan rather than
 * at the end of it — grace arrives before the reader has finished proving
 * anything, which is the argument Romans is making.
 *
 * Proverbs 26 sits at day 8 on purpose. It is the hardest verse in this
 * territory and the one a returning reader has usually already heard thrown
 * at them; putting it inside the plan, before the mercy rather than after,
 * means the plan has said the severe thing itself and has not left it as
 * something waiting outside.
 */
const cominghome21: Plan = {
  id: "cominghome21",
  icon: "sunrise",
  category: "foundations",
  name: "Coming Home — 21 Days",
  days: across([
    // where the idea comes from: a son, a far country, and a father who saw
    // him a great way off — because he had never stopped watching the road
    [42, 15],
    // the far country, told honestly
    [19, 32], [19, 51], [32, 2], [28, 14], [23, 55], [29, 2], [20, 26],
    // the war, and the end of it
    [45, 6], [45, 7], [45, 8],
    // who you now are
    [49, 2], [49, 5], [50, 3], [51, 3], [48, 5],
    // and how to walk it out
    [62, 1], [58, 12], [47, 5], [19, 40], [66, 3],
  ]),
};

const armor7: Plan = {
  id: "armor7",
  icon: "shield",
  category: "foundations",
  name: "Strength for the Battle",
  days: across([
    [49, 6], [45, 8], [59, 4], [60, 5], [47, 10], [19, 91], [23, 41],
  ]),
};

// ---- Wisdom & worship ----------------------------------------------------

const psalms14: Plan = {
  id: "psalms14",
  icon: "dove",
  category: "wisdom",
  name: "Psalms of Comfort",
  days: picks(19, [23, 27, 34, 46, 91, 121, 139, 42, 62, 63, 103, 116, 130, 145]),
};

const proverbs31: Plan = { id: "proverbs31", icon: "owl", category: "wisdom",
  name: "Proverbs in a Month", days: book(20, 31) };

const psalms150: Plan = {
  id: "psalms150",
  icon: "music",
  category: "wisdom",
  name: "All 150 Psalms",
  days: chunked(chaptersOf(19, 150), 3),
};

const ecclesiastes12: Plan = {
  id: "ecclesiastes12",
  icon: "hourglass",
  category: "wisdom",
  name: "Ecclesiastes in 12 Days",
  days: book(21, 12),
};

// ---- Longer journeys -----------------------------------------------------

const genesis50: Plan = { id: "genesis50", icon: "globe", category: "journeys",
  name: "Genesis in 50 Days", days: book(1, 50) };
const acts28: Plan = { id: "acts28", icon: "fire", category: "journeys",
  name: "Acts in 28 Days", days: book(44, 28) };

/** Every chapter of the Bible, Genesis → Revelation, in order. */
const BIBLE = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42,
  150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5,
  3, 5, 1, 1, 1, 22,
].flatMap((count, i) => chaptersOf(i + 1, count));

/** The New Testament's 260 chapters, Matthew → Revelation. */
const NEW_TESTAMENT = BIBLE.filter((r) => r.b >= 40);

/** The New Testament, Matthew → Revelation, about two chapters a day. */
const nt90: Plan = {
  id: "nt90",
  icon: "books",
  category: "journeys",
  name: "The New Testament in 90 Days",
  days: spread(NEW_TESTAMENT, 90),
};

/**
 * Spurgeon's Morning and Evening, as a year.
 *
 * A devotional rather than a course of reading, and it earns its place among
 * the plans anyway: it is a year long, it is walked a day at a time, and
 * everything the app already does for a plan — enrolling, the day count, the
 * hour it asks at — is exactly what somebody reading a daily devotional
 * wants.
 *
 * Each day points at the two chapters his two meditations are drawn from, so
 * the reading is there to open in context. The meditations themselves are
 * fetched when they are opened; see components/Devotional.
 *
 * Day one is the first of January. Somebody starting in August starts at the
 * beginning, as with any other plan — Spurgeon numbered by the calendar, but
 * the book has never needed to be read on his dates to be read.
 */
const morneve: Plan = {
  id: "morneve",
  icon: "sun",
  category: "journeys",
  name: "Morning and Evening",
  days: MORNING_EVENING.map(([mb, mc, eb, ec]) => ({
    readings: [
      { b: mb, c: mc },
      { b: eb, c: ec },
    ],
  })),
};

/** The whole Bible, Genesis → Revelation, in a year. */
const bible365: Plan = {
  id: "bible365",
  icon: "sparkle",
  category: "journeys",
  name: "The Whole Bible in a Year",
  // 1,189 chapters across 365 days — a few days carry an extra chapter
  days: spread(BIBLE, 365),
};

// ---- With commentary -----------------------------------------------------
//
// Plans read beside one of the commentaries the app carries, so each day has
// a guide as well as a reading: Matthew Henry, who wrote on every chapter, or
// Spurgeon's Treasury of David on the Psalms. The readings are ordinary — the
// commentary is what makes them these plans, and it opens from the day in the
// Journal (components/CommentaryGuide).
//
// Henry's plans go a chapter at a time, because that is how he wrote: his
// notes on a chapter are a few minutes' reading, about five hundred words in
// the Old Testament and nine hundred in the New. The year is the exception,
// at three or four chapters a day, and its description says so.

const henryjohn21: Plan = { id: "henryjohn21", icon: "book", category: "commentary",
  name: "John with Matthew Henry", days: book(43, 21), guide: "henry" };
const henryromans16: Plan = { id: "henryromans16", icon: "scroll", category: "commentary",
  name: "Romans with Matthew Henry", days: book(45, 16), guide: "henry" };
const henryproverbs31: Plan = { id: "henryproverbs31", icon: "owl", category: "commentary",
  name: "Proverbs with Matthew Henry", days: book(20, 31), guide: "henry" };
const henrygenesis50: Plan = { id: "henrygenesis50", icon: "sunrise", category: "commentary",
  name: "Genesis with Matthew Henry", days: book(1, 50), guide: "henry" };

/** A chapter a day: 260 days, which is a year of weekdays. */
const henrynt260: Plan = {
  id: "henrynt260",
  icon: "books",
  category: "commentary",
  name: "The New Testament with Matthew Henry",
  days: chunked(NEW_TESTAMENT, 1),
  guide: "henry",
};

const henrybible365: Plan = {
  id: "henrybible365",
  icon: "candle",
  category: "commentary",
  name: "The Bible in a Year with Matthew Henry",
  days: spread(BIBLE, 365),
  guide: "henry",
};

/**
 * Psalms read with the Treasury, a psalm a day — or part of one, where
 * Spurgeon wrote too much on it for a single sitting. Where those divisions
 * fall is worked out from the Treasury itself; see lib/treasuryParts.
 */
const withTreasury = (psalms: number[]): PlanDay[] =>
  psalms.flatMap((c) =>
    TREASURY_PARTS[c]
      ? TREASURY_PARTS[c].map(([v, ve]) => ({ readings: [{ b: 19, c, v, ve }] }))
      : [{ readings: [{ b: 19, c }] }]
  );

/** The same fourteen as Psalms of Comfort, read with Spurgeon. */
const treasurycomfort: Plan = {
  id: "treasurycomfort",
  icon: "dove",
  category: "commentary",
  name: "Psalms of Comfort with Spurgeon",
  days: withTreasury([23, 27, 34, 46, 91, 121, 139, 42, 62, 63, 103, 116, 130, 145]),
  guide: "spurgeon",
};

const treasury: Plan = {
  id: "treasury",
  icon: "music",
  category: "commentary",
  name: "The Psalms with Spurgeon",
  days: withTreasury(Array.from({ length: 150 }, (_, i) => i + 1)),
  guide: "spurgeon",
};

/*
 * The Bookshelf's books, a chapter a day. The titles are the book's own (its
 * book.json), repeated here because plans are read on the server too — by the
 * reminder sweep, which names the day's reading in its notification.
 */
const PILGRIM = [
  "The City of Destruction",
  "Mr. Worldly Wiseman",
  "The Wicket Gate",
  "The Interpreter’s House",
  "The Cross and the Hill Difficulty",
  "The Palace Beautiful",
  "Apollyon",
  "The Valley of the Shadow of Death",
  "Faithful",
  "Talkative",
  "Vanity Fair",
  "The Trial of Faithful",
  "Mr. Self-Interest",
  "Demas and the Pillar of Salt",
  "Doubting Castle",
  "The Delectable Mountains",
  "Ignorance and Little-Faith",
  "The Enchanted Ground",
  "Ignorance and Temporary",
  "The Land of Beulah and the River",
  "The Celestial City",
];

const PILGRIM_TWO = [
  "Christiana’s Call",
  "The Wicket Gate",
  "The Interpreter’s House",
  "The Hill Difficulty and Giant Grim",
  "The Palace Beautiful",
  "The Valley of Humiliation",
  "The Valley of the Shadow of Death",
  "Mr. Honest",
  "Gaius’s Inn",
  "Giant Slay-good and Mr. Feeble-mind",
  "Vanity Fair",
  "Doubting Castle Destroyed",
  "The Delectable Mountains",
  "Mr. Valiant-for-truth",
  "The Enchanted Ground",
  "The Land of Beulah and the River",
];

const SIEGE = [
  "The Fall of Mansoul",
  "Mansoul Under Diabolus",
  "Tidings at Court",
  "The Four Captains",
  "Winter Quarters",
  "Emmanuel Comes",
  "Mr. Won’t-bow",
  "The Breaking of Ear-gate",
  "Diabolus in Chains",
  "The Pardon",
  "Emmanuel Enters Mansoul",
  "The Trial of the Diabolonians",
  "The New Charter",
  "Mr. Carnal-Security",
  "Letters to the Pit",
  "The Council in Hell",
  "The Army of Doubters",
  "Willbewill Plays the Man",
  "Feel-gate Falls",
  "Emmanuel Returns",
  "The Bloodmen",
  "Mr. Evil-Questioning",
  "Hold Fast Till I Come",
];

/** A chapter a day through a Bookshelf book, from its chapters' titles. */
const shelfDays = (shelf: string, titles: string[]): PlanDay[] =>
  titles.map((title, i) => ({
    readings: [{ b: 0, c: 0, shelf, part: String(i + 1).padStart(2, "0"), title }],
  }));

const pilgrim21: Plan = {
  id: "pilgrim21",
  icon: "mountain",
  category: "bookshelf",
  name: "From This World to the Next",
  days: shelfDays("from-this-world", PILGRIM),
};

const pilgrimtwo16: Plan = {
  id: "pilgrimtwo16",
  icon: "mountain",
  category: "bookshelf",
  name: "From This World to the Next, Part Two",
  days: shelfDays("from-this-world-part-two", PILGRIM_TWO),
};

const siege23: Plan = {
  id: "siege23",
  icon: "shield",
  category: "bookshelf",
  name: "The Siege of Mansoul",
  days: shelfDays("siege-of-mansoul", SIEGE),
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
  cominghome21,
  armor7,
  psalms14,
  proverbs31,
  psalms150,
  ecclesiastes12,
  genesis50,
  acts28,
  nt90,
  bible365,
  morneve,
  treasurycomfort,
  henryjohn21,
  henryromans16,
  henryproverbs31,
  henrygenesis50,
  treasury,
  henrynt260,
  henrybible365,
  pilgrim21,
  pilgrimtwo16,
  siege23,
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
