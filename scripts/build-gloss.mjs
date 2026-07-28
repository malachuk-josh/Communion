// Build the data that lets an untagged translation be read word by word.
//
// Source: the Berean Standard Bible's interlinear table, which publishes a
// modern English translation tagged word by word with Strong's numbers. Two
// files come out of it.
//
//   public/gloss/{book}.json   per verse, the English phrases of that verse in
//                              order, each with the original behind it. This
//                              is the anchor set: another modern translation
//                              of the same verse mostly uses the same words in
//                              the same order, so matching against it is
//                              matching against evidence rather than guessing.
//
//   public/gloss/vocab.json    for every Strong's number, every stem the
//                              Berean ever renders it with, anywhere in the
//                              Bible. This catches the word a translation
//                              chose that the Berean happened not to use in
//                              this verse but does use elsewhere.
//
// Run: node scripts/build-gloss.mjs <bsb_words.jsonl>
//
// The jsonl is extracted from bereanbible.com's bsb_tables.xlsx — see the
// audit in the commit that added this. It is not checked in; the two files
// below are what the app reads.

import fs from "node:fs";
import path from "node:path";

const NAMES = [
  "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth",
  "1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra",
  "Nehemiah","Esther","Job","Psalm","Proverbs","Ecclesiastes","Song of Solomon",
  "Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos",
  "Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah",
  "Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians",
  "2 Corinthians","Galatians","Ephesians","Philippians","Colossians",
  "1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon",
  "Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation",
];
const numOf = new Map(NAMES.map((n, i) => [n, i + 1]));

/**
 * The app's own Strong's data writes numbers unpadded — "H430", "G25" — and
 * the lexicon is keyed the same way. Anything else here would produce numbers
 * that match nothing on the other side.
 */
const norm = (n) => {
  const m = /^([HG])(\d+)$/.exec(n ?? "");
  return m ? m[1] + String(Number(m[2])) : null;
};

/** Same reduction the reader uses, kept in step with lib/align.ts. */
const stem = (word) => {
  const bare = word.toLowerCase().replace(/[^a-z]/g, "");
  if (bare.length <= 3) return bare;
  for (const suffix of ["eth", "est", "ings", "ing", "edst", "ed", "es", "s"]) {
    if (bare.endsWith(suffix) && bare.length - suffix.length >= 3) {
      return bare.slice(0, bare.length - suffix.length);
    }
  }
  return bare;
};

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/build-gloss.mjs <bsb_words.jsonl>");
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public", "gloss");
fs.mkdirSync(outDir, { recursive: true });

/** bookNr -> "ch:v" -> [[strongs, phrase], ...] */
const byBook = new Map();
/** strongs -> Set(stem) */
const vocab = new Map();

let verses = 0;
for (const line of fs.readFileSync(source, "utf8").split("\n")) {
  if (!line) continue;
  const row = JSON.parse(line);
  const m = /^(.+) (\d+):(\d+)$/.exec(row.ref);
  if (!m) continue;
  const bookNr = numOf.get(m[1]);
  if (!bookNr) continue;

  const entries = [];
  for (const [rawNum, phrase] of row.w) {
    const num = norm(rawNum);
    const text = String(phrase ?? "").trim();
    if (!text) continue;
    entries.push([num, text]);
    if (!num) continue;
    let set = vocab.get(num);
    if (!set) vocab.set(num, (set = new Set()));
    for (const word of text.split(/\s+/)) {
      const s = stem(word);
      // one- and two-letter stems say nothing about which word this is
      if (s.length >= 3) set.add(s);
    }
  }
  if (entries.length === 0) continue;
  if (!byBook.has(bookNr)) byBook.set(bookNr, {});
  byBook.get(bookNr)[`${m[2]}:${m[3]}`] = entries;
  verses++;
}

let bytes = 0;
for (const [bookNr, book] of [...byBook].sort((a, b) => a[0] - b[0])) {
  const file = path.join(outDir, `${bookNr}.json`);
  const json = JSON.stringify(book);
  fs.writeFileSync(file, json);
  bytes += json.length;
}

// Stems that render dozens of different originals — "the", "of", "and" — are
// evidence of nothing, and keeping them would let a word match anything.
const spread = new Map();
for (const [num, set] of vocab) {
  for (const s of set) spread.set(s, (spread.get(s) ?? 0) + 1);
}
const TOO_COMMON = 60;
const vocabOut = {};
let dropped = 0;
for (const [num, set] of vocab) {
  const keep = [...set].filter((s) => (spread.get(s) ?? 0) <= TOO_COMMON);
  dropped += set.size - keep.length;
  if (keep.length) vocabOut[num] = keep;
}
const vocabJson = JSON.stringify(vocabOut);
fs.writeFileSync(path.join(outDir, "vocab.json"), vocabJson);

console.log(`verses     ${verses}`);
console.log(`books      ${byBook.size}`);
console.log(`per-book   ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`vocab      ${Object.keys(vocabOut).length} numbers, ${(vocabJson.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`stems dropped as too common (>${TOO_COMMON} originals): ${dropped}`);
