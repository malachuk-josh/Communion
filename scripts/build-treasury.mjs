// Turns Spurgeon's Treasury of David into one file, keyed by psalm.
//
// The source is CrossWire's TDavid SWORD module, which states its own terms:
// "DistributionLicense=Public Domain". Spurgeon died in 1892. It matters that
// this is the CrossWire edition and not one of the scans floating about — it
// is a transcription taken from archive.spurgeon.org and still being corrected
// in 2022, where the archive.org OCR of the 1878 printing carries a visible
// error every forty words or so. Text that sits beside Scripture has to be
// right, and OCR of a Victorian octavo is not.
//
// The Treasury is three books in one, and only part of it is Spurgeon:
//
//   OVERVIEW / EXPOSITION            his own, on the psalm and on each verse
//   HINTS TO THE VILLAGE PREACHER    his own, sermon outlines
//   EXPLANATORY NOTES AND QUAINT
//     SAYINGS                        two thirds of the whole, and none of it
//                                    his — comments he gathered from dozens
//                                    of older writers
//
// Only what Spurgeon wrote himself is kept. The quotations are the larger
// half by a distance and are a different proposition: a reader who taps a
// verse expecting Spurgeon should get Spurgeon.
//
// Usage: node scripts/build-treasury.mjs <TDavid.zip>
// Writes public/treasury/19.json — Psalms is book 19, and the Treasury is
// Psalms and nothing else. Run once, output committed.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import zlib from "zlib";

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("usage: node scripts/build-treasury.mjs <TDavid.zip>");
  process.exit(1);
}

const OUT = path.join(process.cwd(), "public", "treasury");

/** Pull the module's compressed blocks straight out of the zip. */
function moduleText(zipPath) {
  const dir = execFileSync("mktemp", ["-d"]).toString().trim();
  execFileSync("unzip", ["-qo", zipPath, "-d", dir]);
  const base = path.join(dir, "modules/comments/zcom/tdavid");
  const bzs = readFileSync(path.join(base, "ot.bzs"));
  const bzz = readFileSync(path.join(base, "ot.bzz"));
  let out = "";
  for (let i = 0; i < bzs.length / 12; i++) {
    const offset = bzs.readUInt32LE(i * 12);
    const size = bzs.readUInt32LE(i * 12 + 4);
    if (size > 0) out += zlib.inflateSync(bzz.subarray(offset, offset + size)).toString("utf8");
  }
  return out;
}

/**
 * OSIS to plain paragraphs.
 *
 * The markup is mostly emphasis, which a panel of prose does not need, and
 * paragraph milestones, which it very much does — Spurgeon writes at length
 * and an unbroken wall of it is unreadable. So the paragraph divs become the
 * breaks and everything else goes.
 */
function paragraphs(xml) {
  return xml
    .replace(/<div[^>]*type="x-p"[^>]*\/>/g, "\n\n")
    .replace(/<lb[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim())
    .filter((p) => p.length > 1);
}

/** "Verse 1." / "Verses 1-3." / "Verses 1, 2." → the span it names. */
function spanOf(label) {
  const nums = (label.match(/\d+/g) ?? []).map(Number);
  if (nums.length === 0) return null;
  return { from: nums[0], to: nums[nums.length - 1] };
}

const xml = moduleText(SOURCE);

/** Split a chapter into its named sections, in order. */
function sectionsOf(chapterXml) {
  const out = [];
  const re = /<title[^>]*>(.*?)<\/title>/gs;
  let last = null;
  let cursor = 0;
  for (const m of chapterXml.matchAll(re)) {
    if (last) out.push({ name: last, xml: chapterXml.slice(cursor, m.index) });
    last = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    cursor = m.index + m[0].length;
  }
  if (last) out.push({ name: last, xml: chapterXml.slice(cursor) });
  return out;
}

/** Break a section on its bold "Verse N." markers. */
function byVerse(sectionXml) {
  // "Ver. 2." as well as "Verse 2." — Psalm 119 is set differently from the
  // rest of the Treasury, and abbreviating is the whole of the difference
  const re =
    /<hi type="bold">\s*((?:Verses?|Ver\.)\s*\d[^<]*?|Whole Psalm\.?)\s*<\/hi>/g;
  const hits = [...sectionXml.matchAll(re)];
  if (hits.length === 0) return [];
  const out = [];
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : sectionXml.length;
    const body = paragraphs(sectionXml.slice(m.index + m[0].length, end));
    if (body.length === 0) return;
    const label = m[1].trim();
    // "Whole Psalm" has no number: it belongs to the psalm, not to a verse
    const span = /whole psalm/i.test(label) ? { from: 0, to: 0 } : spanOf(label);
    if (span) out.push({ ...span, text: body.join("\n\n") });
  });
  return out;
}

const psalms = {};
let expositions = 0;
let hintCount = 0;
let overviews = 0;

const chapterRe = /<chapter[^>]*osisID="Ps\.(\d+)"[^>]*sID="Ps\.\1"[^>]*\/>/g;
const starts = [...xml.matchAll(chapterRe)];
for (let i = 0; i < starts.length; i++) {
  const n = Number(starts[i][1]);
  const from = starts[i].index + starts[i][0].length;
  const to = i + 1 < starts.length ? starts[i + 1].index : xml.length;
  const body = xml.slice(from, to);

  const entry = { verses: [] };
  for (const section of sectionsOf(body)) {
    const name = section.name.toUpperCase();
    // the quoted writers are not Spurgeon; the reading lists are not commentary
    // "Explanatory Notes and Quaint Sayings", and the "Notes relating to the
    // psalm as a whole" that Psalm 119 uses in its place, are both gathered
    // from other writers. The reading lists are bibliography, not commentary.
    if (/NOTES|QUAINT SAYINGS/.test(name) || name.startsWith("WORK")) continue;

    /*
     * The heading over a psalm is not always called the same thing. Most have
     * an OVERVIEW; a good many put the same material under TITLE, DIVISION,
     * SUBJECT or AUTHOR instead, and Psalm 119 uses three of them at once.
     * They are all Spurgeon introducing the psalm, so they are all the
     * overview, joined in the order he set them.
     */
    if (/OVERVIEW|^TITLE|^DIVISION|^SUBJECT|^AUTHOR/.test(name)) {
      const text = paragraphs(section.xml).join("\n\n");
      if (text) {
        entry.overview = entry.overview ? `${entry.overview}\n\n${text}` : text;
      }
    } else if (name.includes("EXPOSITION")) {
      const verses = byVerse(section.xml);
      entry.verses.push(...verses);
      expositions += verses.length;
    } else if (name.startsWith("HINTS")) {
      const hints = byVerse(section.xml);
      if (hints.length > 0) {
        entry.hints = hints;
        hintCount += hints.length;
      }
    }
  }
  if (entry.overview) overviews++;
  if (entry.overview || entry.verses.length > 0) psalms[n] = entry;
}

// Each exposition runs to the verse the next one starts at, for the reason the
// Matthew Henry build does the same: the printed labels leave gaps, and a
// verse with commentary sitting right beside it should not look as if it has
// none.
for (const entry of Object.values(psalms)) {
  entry.verses.sort((a, b) => a.from - b.from);
  /*
   * One verse, one entry.
   *
   * Spurgeon sometimes writes on the same verse twice — a note on the whole
   * and then a note on a phrase within it — and the Treasury prints both
   * under the same heading. Left as two, the stretch below would hand the
   * first of them a range ending before it began, and the reader would get
   * whichever the lookup happened to reach. Joined instead, so nothing he
   * wrote is dropped and every verse has exactly one place to be found.
   */
  const merged = [];
  for (const v of entry.verses) {
    const last = merged[merged.length - 1];
    if (last && last.from === v.from) last.text = `${last.text}\n\n${v.text}`;
    else merged.push(v);
  }
  entry.verses = merged;
  entry.verses.forEach((v, i) => {
    const next = entry.verses[i + 1];
    if (next) v.to = next.from - 1;
    else delete v.to;
  });
  if (entry.verses.length > 0) entry.verses[0].from = 1;
}

mkdirSync(OUT, { recursive: true });
const json = JSON.stringify(psalms);
writeFileSync(path.join(OUT, "19.json"), json);

console.log(`psalms      : ${Object.keys(psalms).length} of 150`);
console.log(`overviews   : ${overviews}`);
console.log(`expositions : ${expositions}`);
console.log(`hints       : ${hintCount}`);
console.log(`size        : ${(json.length / 1048576).toFixed(1)} MB`);
