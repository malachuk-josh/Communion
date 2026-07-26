// The ASV we shipped came from getBible, which strips the italics marking
// words the translators supplied — and took the spaces around them with it.
// "Paul, called to be an apostle" arrived as "Paul, calledto bean apostle".
// The corruption is upstream, so it cannot be re-fetched from there.
//
// This repairs it from the scrollmapper ASV, and repairs ONLY that. A verse is
// rewritten only when the reference text can be reached from ours by inserting
// spaces, and only where each inserted space falls between two letters — which
// is exactly the shape of the fault. That predicate is the whole safety
// argument: same letters in the same order, no wording changes, no verse
// moves, and any other disagreement with the source is ignored.
//
// It matters that this is narrow. The reference hyphenates a few words
// differently ("first-fruits" as "first- fruits"), and accepting a diff merely
// because it was whitespace-only would import those as new faults.
//
//   node scripts/fix-asv-spacing.mjs <scrollmapper-ASV.json>

import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/fix-asv-spacing.mjs <scrollmapper-ASV.json>");
  process.exit(1);
}

const ASV_DIR = path.join(process.cwd(), "public/bible/asv");

const letter = /[A-Za-z’]/; // the curly apostrophe closes "goats’ hair"

/**
 * Rebuild our verse carrying the spaces the reference has, taking a space only
 * where it falls between two letters. Returns null when our text cannot be
 * aligned into the reference by inserting spaces alone, or when there is
 * nothing to add.
 *
 * Every difference is judged one space at a time rather than all at once,
 * which is what lets the two awkward cases through. Job 16:18 reads
 * "noresting-place" here and "no resting -place" there: the first space is the
 * fault and is taken, the second sits against a hyphen and is left. And the
 * reference opens 116 psalms with a superscription we do not carry, so the
 * search for a starting offset steps over it and repairs the verse beneath.
 */
function respace(from, to) {
  for (let start = 0; start + from.length <= to.length; start++) {
    let i = 0;
    let j = start;
    let out = "";
    let added = 0;
    let ok = true;
    while (i < from.length && j < to.length) {
      if (from[i] === to[j]) {
        out += from[i++];
        j++;
      } else if (/\s/.test(to[j])) {
        if (letter.test(to[j - 1] ?? "") && letter.test(to[j + 1] ?? "")) {
          out += " ";
          added++;
        }
        j++;
      } else {
        ok = false;
        break;
      }
    }
    if (ok && i === from.length) return added > 0 ? { text: out, added } : null;
  }
  return null;
}

// scrollmapper keys books positionally, in the standard 66-book order
const clean = new Map(); // "book:chapter:verse" -> text
const doc = JSON.parse(fs.readFileSync(src, "utf8"));
doc.books.forEach((book, i) => {
  const nr = i + 1;
  for (const ch of book.chapters) {
    for (const v of ch.verses) {
      clean.set(`${nr}:${ch.chapter}:${v.verse}`, v.text);
    }
  }
});
console.log(`reference: ${clean.size} verses from ${path.basename(src)}`);

let verses = 0;
let fixed = 0;
let touchedVerses = 0;
let skippedDifferent = 0;
let missing = 0;
const samples = [];

for (let b = 1; b <= 66; b++) {
  const file = path.join(ASV_DIR, `${b}.json`);
  const book = JSON.parse(fs.readFileSync(file, "utf8"));
  let touched = false;
  for (const [c, rows] of Object.entries(book)) {
    for (const row of rows) {
      const [n, text] = row;
      verses++;
      const ref = clean.get(`${b}:${c}:${n}`);
      if (ref === undefined) {
        missing++;
        continue;
      }
      if (ref === text) continue;
      const fix = respace(text, ref);
      if (!fix) {
        // nothing to add: the wording differs, or the only spaces on offer sit
        // against punctuation. Neither is the fault being fixed.
        skippedDifferent++;
        continue;
      }
      if (samples.length < 6)
        samples.push(`  ${b}:${c}:${n}\n    was: ${text}\n    now: ${fix.text}`);
      row[1] = fix.text;
      fixed += fix.added;
      touchedVerses++;
      touched = true;
    }
  }
  if (touched) fs.writeFileSync(file, JSON.stringify(book));
}

console.log(`verses checked : ${verses}`);
console.log(`verses respaced: ${touchedVerses}`);
console.log(`spaces restored: ${fixed}`);
console.log(`left alone     : ${skippedDifferent} (wording or hyphenation differs — not this fault)`);
console.log(`absent upstream: ${missing}`);
console.log("\nexamples:\n" + samples.join("\n"));
