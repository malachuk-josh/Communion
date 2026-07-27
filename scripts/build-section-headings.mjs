// Section headings for the books that had none.
//
// Twenty-eight books — Genesis and the New Testament — carry headings written
// by hand, in English and Spanish. The other thirty-eight had nothing, so a
// chapter of Exodus arrived as paragraphs with no titles over them.
//
// The Berean Standard Bible is public domain and is published as USFM with
// \s1 section headings throughout: three thousand of them, across every book.
// Its versification is the King James', the same as every text here, so a
// heading standing over 3:16 stands over 3:16 in all of them.
//
// The World English Bible was the obvious candidate and turned out to have
// none at all — its only \s markers are the speaker labels in Song of Songs.
// Worth recording, so nobody goes looking there again.
//
// These are English only. A book that already has hand-written headings is
// left alone rather than overwritten: those have Spanish, and Spanish is the
// one thing this source cannot give. The reader shows a heading only in a
// language it actually has, so a Spanish reading is never interrupted by an
// English title — it simply has no heading there, exactly as before.
//
//   node scripts/build-section-headings.mjs <usfm-dir> public/headings
//
// Source: https://ebible.org/Scriptures/engbsb_usfm.zip

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
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

const CHAPTERS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
  31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16,
  24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1,
  1, 22,
];

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error("usage: build-section-headings.mjs <usfm-dir> <out-dir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const problems = [];
let written = 0;
let kept = 0;
let titles = 0;

for (const file of readdirSync(srcDir)) {
  if (!file.endsWith(".usfm")) continue;
  const code = file.match(/^\d+-([A-Z0-9]{3})/)?.[1];
  const bookNr = code ? NUMBER_OF.get(code) : undefined;
  if (!bookNr) continue;

  const target = join(outDir, `${bookNr}.json`);
  if (existsSync(target)) {
    // written by hand, in two languages. Not ours to replace.
    kept++;
    continue;
  }

  const out = {};
  let chapter = 0;
  let pending = null;

  for (const line of readFileSync(join(srcDir, file), "utf8").split("\n")) {
    const chap = line.match(/^\\c\s+(\d+)/);
    if (chap) {
      chapter = Number(chap[1]);
      // a heading belongs to the chapter its verse is in, not the one it was
      // printed after — a title at a chapter boundary carries forward
      continue;
    }
    const head = line.match(/^\\s1?\s+(.+?)\s*$/);
    if (head) {
      pending = head[1].replace(/\s+/g, " ").trim();
      continue;
    }
    const verse = line.match(/^\\v\s+(\d+)/);
    if (verse && pending) {
      const v = Number(verse[1]);
      if (chapter < 1 || chapter > CHAPTERS[bookNr - 1]) {
        problems.push(`${file}: chapter ${chapter} out of range`);
      } else {
        (out[chapter] ??= []).push({ v, en: pending });
        titles++;
      }
      pending = null;
    }
  }

  writeFileSync(target, JSON.stringify(out));
  written++;
}

console.log(`${written} books written, ${kept} left as hand-written, ${titles} headings`);
if (problems.length) {
  console.error(`\n${problems.length} problems:`);
  for (const p of problems.slice(0, 30)) console.error("  " + p);
  process.exit(1);
}
