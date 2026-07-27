// Where the paragraphs are, and which of them are poetry.
//
// The reader can set a book as running prose only if it knows where one
// paragraph ends and the next begins. Nothing in the verse-per-verse JSON this
// app ships says that — a chapter is a list of verses and nothing else — so
// until now prose was possible only in the twenty-eight books that happened to
// have hand-written section headings, and everywhere else a paragraph would
// have run the length of a chapter.
//
// The World English Bible is in the public domain and is published as USFM,
// which marks all of this explicitly: \p opens a paragraph, \q1..\q4 open a
// line of poetry. Its versification is the King James', the same as every text
// here, so a break at 2:14 falls at 2:14 in all of them. What is taken is the
// structure and not a word of the text — which is why this outlived the WEB
// itself being dropped from the app: nothing of the translation is used, only
// where its typesetters put the breaks, and that is public domain too.
//
// Poetry is kept apart from prose deliberately. Isaiah, Jeremiah and the minor
// prophets are mostly verse, and running verse together as paragraphs loses the
// shape it was written in — so each run is marked, and the reader sets the
// poetry as lines and the prose as paragraphs, which is what a printed Bible
// does.
//
//   node scripts/build-paragraphs.mjs <usfm-dir> public/paragraphs
//
// Source: https://ebible.org/Scriptures/eng-web_usfm.zip

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const USFM = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
  "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
  "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
  "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
  "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
  "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];
const NUMBER_OF = new Map(USFM.map((code, i) => [code, i + 1]));

/** Chapters per book, so a stray reference cannot pass unnoticed. */
const CHAPTERS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
  31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16,
  24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1,
  1, 22,
];

/** Opens a paragraph of prose. \nb is excluded: it means explicitly *not*. */
const PROSE = /^\\(p|m|pi\d?|pc|pr|pmo|pm|pmc|pmr|li\d?|lh|lf)\b/;
/** Opens a line of poetry. */
const POETRY = /^\\(q\d?|qc|qr|qm\d?)\b/;
/** A stanza break: whatever follows starts afresh even if it is another \q. */
const BREAK = /^\\b\b/;

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error("usage: build-paragraphs.mjs <usfm-dir> <out-dir>");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const problems = [];
let books = 0;
let runs = 0;

for (const file of readdirSync(srcDir)) {
  if (!file.endsWith(".usfm")) continue;
  const code = file.match(/^\d+-([A-Z0-9]{3})/)?.[1];
  const bookNr = code ? NUMBER_OF.get(code) : undefined;
  // the archive carries front matter and the deuterocanon; both are not ours
  if (!bookNr) continue;

  const out = {};
  let chapter = 0;
  /** what the next \v should be filed as, or null if it continues a run */
  let pending = null;
  /** whether the run currently open is poetry, so a \q after a \q is not new */
  let inPoetry = false;

  for (const line of readFileSync(join(srcDir, file), "utf8").split("\n")) {
    const chap = line.match(/^\\c\s+(\d+)/);
    if (chap) {
      chapter = Number(chap[1]);
      // a chapter always opens a run, whatever marker follows
      pending = pending ?? { poetry: false };
      inPoetry = false;
      continue;
    }
    if (BREAK.test(line)) {
      inPoetry = false;
      continue;
    }
    if (PROSE.test(line)) {
      pending = { poetry: false };
      inPoetry = false;
      continue;
    }
    if (POETRY.test(line)) {
      // consecutive poetic lines are one run: a stanza, not a paragraph each
      if (!inPoetry) pending = { poetry: true };
      inPoetry = true;
      continue;
    }
    const verse = line.match(/^\\v\s+(\d+)/);
    if (verse && pending) {
      const v = Number(verse[1]);
      if (chapter < 1 || chapter > CHAPTERS[bookNr - 1]) {
        problems.push(`${file}: chapter ${chapter} out of range`);
      } else {
        (out[chapter] ??= []).push([v, pending.poetry ? 1 : 0]);
        runs++;
      }
      pending = null;
    }
  }

  // every chapter must open a run, or the reader has nothing to start with
  for (let c = 1; c <= CHAPTERS[bookNr - 1]; c++) {
    const first = out[c]?.[0];
    if (!first) problems.push(`${file}: chapter ${c} has no runs`);
    else if (first[0] !== 1) problems.push(`${file}: chapter ${c} starts at verse ${first[0]}`);
  }

  writeFileSync(join(outDir, `${bookNr}.json`), JSON.stringify(out));
  books++;
}

console.log(`${books} books, ${runs} runs`);
if (problems.length) {
  console.error(`\n${problems.length} problems:`);
  for (const p of problems.slice(0, 40)) console.error("  " + p);
  process.exit(1);
}
console.log("Every chapter opens a run at verse 1.");
