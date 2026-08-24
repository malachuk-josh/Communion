// Turns Spurgeon's Morning and Evening into one file, keyed by day of the year.
//
// CCEL's plain-text edition, which states its own terms: "Rights: Public
// Domain". Spurgeon died in 1892.
//
// Two readings a day for a leap year's worth of days, each one a verse and a
// short meditation on it. The layout is regular:
//
//     Morning, January 1
//        [33]Go To Evening Reading          <- navigation, not text
//        "They did eat of the fruit ..."    <- the verse, as he quoted it
//       Joshua 5:12                         <- indented two, not three
//        Israel's weary wanderings ...      <- the meditation
//
// The reference is told apart from everything around it by its indent: two
// spaces where the body has three. That is the only thing separating them,
// and it holds for all 732 entries.
//
// Keyed by day-of-year rather than by date string, because that is what the
// reading plan needs: day one is the first of January, and a reader who
// starts in August simply starts at the beginning, as with any other plan.
//
// Usage: node scripts/build-devotional.mjs <morneve.txt>
// Writes public/devotional/morneve.json. Run once, output committed.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("usage: node scripts/build-devotional.mjs <morneve.txt>");
  process.exit(1);
}

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "devotional");

const BOOKS = [
  ...readFileSync(path.join(ROOT, "lib", "bible.ts"), "utf8").matchAll(
    /\{ nr: (\d+), en: "([^"]+)", es: "[^"]+", chapters: (\d+)/g
  ),
].map((m) => ({ nr: Number(m[1]), en: m[2], chapters: Number(m[3]) }));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const BY_NAME = new Map(BOOKS.map((b) => [norm(b.en), b.nr]));
// what Spurgeon calls them where it differs from the app's list
for (const [alias, en] of [
  ["psalm", "Psalms"],
  ["canticles", "Song of Solomon"],
  ["songofsongs", "Song of Solomon"],
  ["revelations", "Revelation"],
]) {
  const nr = BY_NAME.get(norm(en));
  if (nr) BY_NAME.set(alias, nr);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// a leap year, so 29 February has its reading like every other day
const LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dayOfYear = (month, day) =>
  LENGTHS.slice(0, month).reduce((a, b) => a + b, 0) + day;

/** "Joshua 5:12" → the place it points at. */
function refToPlace(ref) {
  const m = /^(.+?)\s+(\d+)(?::(\d+))?/.exec(ref.trim());
  if (!m) return null;
  const nr = BY_NAME.get(norm(m[1]));
  if (!nr) return null;
  const book = BOOKS.find((b) => b.nr === nr);
  if (!book) return null;

  /*
   * "Jude 20" is verse twenty, not chapter twenty.
   *
   * Obadiah, Philemon, 2 John, 3 John and Jude have one chapter each, and
   * nobody writes "Jude 1:20" — they write "Jude 20", and so does Spurgeon.
   * Read as a chapter it points past the end of the book and resolves to
   * nothing at all.
   */
  if (book.chapters === 1 && !m[3]) {
    return { b: nr, c: 1, v: Number(m[2]) };
  }
  const c = Number(m[2]);
  if (c < 1 || c > book.chapters) return null;
  return { b: nr, c, ...(m[3] ? { v: Number(m[3]) } : {}) };
}

const lines = readFileSync(SOURCE, "utf8").split("\n");
const HEAD = /^(Morning|Evening),\s+([A-Z][a-z]+)\s+(\d{1,2})\s*$/;
const LINK = /^\s*\[\d+\][A-Za-z]/;

const days = {};
let unmatched = [];
let entries = 0;

for (let i = 0; i < lines.length; i++) {
  const head = HEAD.exec(lines[i]);
  if (!head) continue;
  const [, when, monthName, dayStr] = head;
  const month = MONTHS.indexOf(monthName);
  if (month < 0) continue;
  const key = dayOfYear(month, Number(dayStr));

  // gather to the next heading
  let end = i + 1;
  while (end < lines.length && !HEAD.test(lines[end])) end++;

  const quote = [];
  const body = [];
  let ref = null;
  for (let j = i + 1; j < end; j++) {
    const line = lines[j];
    if (!line.trim() || LINK.test(line)) continue;
    // the reference: indented two, where everything else has three
    // A reference, told from a quote by its indent — and by not opening with
    // a quotation mark, which two of the 732 do where the verse itself got
    // set at the reference's indent.
    if (
      !ref &&
      /^ {2}\S/.test(line) &&
      !/^ {3}/.test(line) &&
      !/^\s*["“]/.test(line)
    ) {
      ref = line.trim();
      continue;
    }
    (ref ? body : quote).push(line.trim());
  }
  if (!ref) continue;

  const place = refToPlace(ref);
  if (!place) unmatched.push(ref);

  const entry = {
    ref,
    ...(place ?? {}),
    verse: quote.join(" ").replace(/\s+/g, " ").trim(),
    text: body.join(" ").replace(/\s+/g, " ").trim(),
  };
  if (!entry.text) continue;
  days[key] = days[key] ?? {};
  days[key][when === "Morning" ? "m" : "e"] = entry;
  entries++;
  i = end - 1;
}

mkdirSync(OUT, { recursive: true });
const json = JSON.stringify(days);
writeFileSync(path.join(OUT, "morneve.json"), json);

/*
 * And the plan's own day list, as a tiny TypeScript file.
 *
 * The reading plan needs to know which two chapters each day points at, and
 * it is imported into the client bundle — so it cannot be the 1.7MB of
 * devotional text. Four numbers a day is about five kilobytes for the year,
 * and the text itself is fetched only when somebody opens it.
 */
const rows = [];
for (let day = 1; day <= 366; day++) {
  const d = days[day];
  if (!d?.m || !d?.e) continue;
  rows.push(`  [${d.m.b}, ${d.m.c}, ${d.e.b}, ${d.e.c}],`);
}
writeFileSync(
  path.join(ROOT, "lib", "morningEvening.ts"),
  `// Generated by scripts/build-devotional.mjs — do not edit by hand.\n` +
    `//\n` +
    `// One row per day of the year: the book and chapter of the morning\n` +
    `// reading, then of the evening. The meditations themselves live in\n` +
    `// public/devotional/morneve.json and are fetched when they are opened.\n\n` +
    `/** [morning book, morning chapter, evening book, evening chapter] */\n` +
    `export const MORNING_EVENING: [number, number, number, number][] = [\n` +
    rows.join("\n") +
    `\n];\n`
);

const complete = Object.values(days).filter((d) => d.m && d.e).length;
console.log(`days      : ${Object.keys(days).length} of 366 (${complete} with both readings)`);
console.log(`entries   : ${entries} of 732`);
console.log(`placed    : ${entries - unmatched.length} references resolved`);
console.log(`size      : ${(json.length / 1048576).toFixed(1)} MB`);
if (unmatched.length) {
  console.log(`UNMATCHED : ${[...new Set(unmatched)].slice(0, 10).join(" | ")}`);
}
