// Which words in the King James are the words of Christ.
//
// Red letters are a printing convention older than any of us and the one
// thing readers most often ask a Bible app for. The hard part is not the
// colour, it is knowing where the speech starts and stops — and that is a
// judgement about the text, not something to be guessed at from "Jesus said"
// and a comma.
//
// Source: the eBible.org OSIS edition of the King James, which marks every
// one of them explicitly:
//
//   <q who="Jesus" sID="Matt.4.4.seID.30040" />It is written…<q eID="…" />
//
// Two thousand and twenty-one such spans, placed by the people who prepared
// the edition. The file states its own licence: public domain.
//
//   https://github.com/seven1m/open-bibles  ·  eng-kjv.osis.xml
//
// Run: node scripts/build-redletter.mjs <eng-kjv.osis.xml>
//
// Output: public/redletter/{bookNr}.json, per verse a list of [first, last]
// WORD indices — not character offsets. The OSIS text and this app's own
// King James disagree about 21% of the time, always over the same two
// things: LORD set as small capitals reads back as "LORD" in one and "Lord"
// in the other, and the two disagree about a comma here and there. Neither
// moves a word. So the spans are recorded by counting words, which both
// texts agree about, and the reader counts words the same way.

import fs from "node:fs";
import path from "node:path";

const OSIS_BOOKS = [
  "Gen","Exod","Lev","Num","Deut","Josh","Judg","Ruth","1Sam","2Sam","1Kgs",
  "2Kgs","1Chr","2Chr","Ezra","Neh","Esth","Job","Ps","Prov","Eccl","Song",
  "Isa","Jer","Lam","Ezek","Dan","Hos","Joel","Amos","Obad","Jonah","Mic",
  "Nah","Hab","Zeph","Hag","Zech","Mal","Matt","Mark","Luke","John","Acts",
  "Rom","1Cor","2Cor","Gal","Eph","Phil","Col","1Thess","2Thess","1Tim",
  "2Tim","Titus","Phlm","Heb","Jas","1Pet","2Pet","1John","2John","3John",
  "Jude","Rev",
];
const nrOf = new Map(OSIS_BOOKS.map((n, i) => [n, i + 1]));

/** A word reduced to what two editions of the same translation agree on. */
const norm = (w) => w.toLowerCase().replace(/[^a-z]/g, "");

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/build-redletter.mjs <eng-kjv.osis.xml>");
  process.exit(1);
}
const xml = fs.readFileSync(source, "utf8");

/*
 * Walk the document once, in order.
 *
 * A speech runs past the end of a verse more often than not — the Sermon on
 * the Mount is one span across three chapters — so this cannot be done verse
 * by verse. Instead: keep a count of how many Jesus spans are open, and a
 * pointer to the verse currently being read, and hand every word that falls
 * out to whichever verse is open with whichever flag is current.
 */
const words = new Map(); // "bookNr:ch:v" -> [{ word, red }]
let verse = null;
let depth = 0;

const TOKEN = /<\/?[^>]+>|[^<]+/g;
for (const chunk of xml.match(TOKEN) ?? []) {
  if (chunk[0] === "<") {
    let m;
    if ((m = /^<verse osisID="([^"]+)"[^>]*sID=/.exec(chunk))) {
      const parts = /^(\w+)\.(\d+)\.(\d+)$/.exec(m[1]);
      const nr = parts && nrOf.get(parts[1]);
      verse = nr ? `${nr}:${parts[2]}:${parts[3]}` : null;
      if (verse && !words.has(verse)) words.set(verse, []);
    } else if (/^<verse eID=/.test(chunk)) {
      verse = null;
    } else if (/^<q\b/.test(chunk) && /who="Jesus"/.test(chunk) && /sID=/.test(chunk)) {
      depth++;
    } else if (/^<q\b/.test(chunk) && /eID=/.test(chunk)) {
      // Only closes a span we opened. A quotation that is not Christ's opens
      // nothing, so its close must take nothing down with it.
      if (depth > 0) depth--;
    }
    continue;
  }
  if (!verse) continue;
  // entities the reader will never see as markup
  const text = chunk
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  const bag = words.get(verse);
  for (const w of text.split(/\s+/)) {
    if (!w) continue;
    // Where a speech ends mid-sentence the markup leaves the full stop
    // standing on its own — "reveal him <q eID/> ." — and a lone stop is not
    // a word. It belongs to the word in front of it, which is where every
    // printed edition puts it, red and all.
    if (!/[a-zA-Z0-9]/.test(w) && bag.length > 0) {
      bag[bag.length - 1].word += w;
      continue;
    }
    bag.push({ word: w, red: depth > 0 });
  }
}

/*
 * Lay the flags over this app's own King James.
 *
 * The two editions must agree on how many words the verse has — that is what
 * makes an index in one an index in the other. They are allowed to disagree
 * about how a few of them are spelled, because they do: Caesarea and Cesarea,
 * Judaea and Judea, farther and further. Those are the same word set in type
 * by different printers three hundred years apart, and refusing them would
 * throw away whole chapters of the Sermon on the Mount over an 'a'.
 *
 * A few words of the verse may differ that way — Render unto Caesar has three
 * Caesars in twenty-seven words, so the allowance has to be a count and not
 * only a fraction. Past that the two are not the same verse however well the
 * lengths line up, and it is left alone rather than approximated: a red
 * letter in the wrong place is a claim about who said something, and there is
 * no such thing as an almost-right one.
 */
const out = new Map();
let verses = 0, matched = 0, mismatched = 0, redVerses = 0, redWords = 0;
let spelling = 0;
const misses = [];

for (const [ref, list] of words) {
  const [nr, ch, v] = ref.split(":").map(Number);
  const file = path.join(process.cwd(), "public", "bible", "kjv", `${nr}.json`);
  if (!fs.existsSync(file)) continue;
  const book = JSON.parse(fs.readFileSync(file, "utf8"));
  const row = (book[String(ch)] ?? []).find(([n]) => n === v);
  if (!row) continue;
  verses++;

  const mine = String(row[1]).split(/\s+/).filter(Boolean);
  const theirs = list.map((x) => x.word);
  let off = 0;
  if (mine.length === theirs.length) {
    for (let i = 0; i < mine.length; i++) {
      if (norm(mine[i]) !== norm(theirs[i])) off++;
    }
  }
  const same =
    mine.length === theirs.length && off <= Math.max(3, mine.length * 0.1);
  if (off > 0 && same) spelling++;
  if (!same) {
    mismatched++;
    if (list.some((x) => x.red) && misses.length < 8) {
      misses.push({ ref, mine: mine.join(" ").slice(0, 90), theirs: theirs.join(" ").slice(0, 90) });
    }
    continue;
  }
  matched++;

  // runs of red, as [first, last] word indices
  const runs = [];
  let start = -1;
  list.forEach((x, i) => {
    if (x.red && start < 0) start = i;
    if (!x.red && start >= 0) { runs.push([start, i - 1]); start = -1; }
  });
  if (start >= 0) runs.push([start, list.length - 1]);
  if (runs.length === 0) continue;

  redVerses++;
  redWords += runs.reduce((n, [a, b]) => n + (b - a + 1), 0);
  if (!out.has(nr)) out.set(nr, {});
  out.get(nr)[`${ch}:${v}`] = runs;
}

const dir = path.join(process.cwd(), "public", "redletter");
fs.mkdirSync(dir, { recursive: true });
let bytes = 0;
for (const [nr, book] of [...out].sort((a, b) => a[0] - b[0])) {
  const json = JSON.stringify(book);
  fs.writeFileSync(path.join(dir, `${nr}.json`), json);
  bytes += json.length;
}

const pct = (a, b) => `${((a / b) * 100).toFixed(2)}%`;
console.log(`verses compared    ${verses}`);
console.log(`  aligned          ${matched}  (${pct(matched, verses)})`);
console.log(`  of those, spelt differently somewhere  ${spelling}`);
console.log(`  left alone       ${mismatched}  (${pct(mismatched, verses)})`);
console.log(`verses with red    ${redVerses}`);
console.log(`words in red       ${redWords}`);
console.log(`books written      ${out.size}   ${(bytes / 1024).toFixed(0)} KB`);
if (misses.length) {
  console.log("\nspeech dropped for want of an exact match:");
  for (const m of misses) {
    console.log(`  ${m.ref}\n    mine:   ${m.mine}\n    theirs: ${m.theirs}`);
  }
}
