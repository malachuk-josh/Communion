// Verify lib/acrostic.ts against the Hebrew.
//
// The table says "Lamentations 4 verse 17 opens with pe". This reads the
// Westminster Leningrad Codex and checks that it does — that the letter is
// there, at the start of the verse, and that a passage's letters run in the
// order the table claims. It also compares verse counts, because the Masoretic
// text numbers a superscription as verse 1 where the KJV prints it as a
// heading, and the offset that creates is the easiest thing in this feature to
// get silently wrong.
//
// Run: node scripts/check-acrostics.mjs

import { readFileSync } from "node:fs";

const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const POINTS = /[֑-ׇ]/g;
/** How far into a verse a letter may sit and still be its opening letter.
 *  Psalm 25:2 begins "my God", Psalm 145:1 with two words of superscription. */
const LEAD = 3;

async function getChapter(translation, book, chapter) {
  for (let tries = 0; tries < 4; tries++) {
    try {
      const res = await fetch(
        `https://api.getbible.net/v2/${translation}/${book}/${chapter}.json`
      );
      if (res.ok) return (await res.json()).verses;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** tries));
  }
  throw new Error(`cannot fetch ${translation} ${book}/${chapter}`);
}

/** Word-initial consonants of a verse, unpointed, final forms folded back. */
function initials(text) {
  return text
    .replace(POINTS, "")
    .split(/[\s־׀׃]+/) // space, maqaf, paseq, sof pasuq
    .filter(Boolean)
    .map((word) => {
      const first = [...word].find((ch) => ch >= "א" && ch <= "ת");
      return first ? FINALS[first] ?? first : "";
    })
    .filter(Boolean);
}

// The table is TypeScript, and this script deliberately has no build step, so
// read the letters the same way a reviewer would: out of the source.
const source = readFileSync(new URL("../lib/acrostic.ts", import.meta.url), "utf8");
const ORDER = source.match(/const ORDER = "([^"]+)"/)[1];
const ORDER_PE_AYIN = source.match(/const ORDER_PE_AYIN = "([^"]+)"/)[1];

const spread = (from, step, order) =>
  Object.fromEntries([...order].map((letter, i) => [from + i * step, letter]));

// Mirrors the table. Kept separate on purpose: a checker that imported the
// module would agree with it by construction and prove nothing.
const EXPECTED = {
  "19:119": { style: "stanza", letters: spread(1, 8, ORDER) },
  "25:3": { style: "stanza", letters: spread(1, 3, ORDER_PE_AYIN) },
  "25:1": { style: "verse", letters: spread(1, 1, ORDER) },
  "25:2": { style: "verse", letters: spread(1, 1, ORDER_PE_AYIN) },
  "25:4": { style: "verse", letters: spread(1, 1, ORDER_PE_AYIN) },
  "20:31": { style: "verse", letters: spread(10, 1, ORDER) },
  "19:25": { style: "verse", letters: spread(1, 1, "אבגדהזחטיכלמנסעפצררשתפ") },
  "19:34": { style: "verse", letters: spread(1, 1, "אבגדהזחטיכלמנסעפצקרשתפ") },
  "19:145": { style: "verse", letters: spread(1, 1, "אבגדהוזחטיכלמסעפצקרשת") },
  "19:37": {
    style: "verse",
    letters: {
      1: "א", 3: "ב", 5: "ג", 7: "ד", 8: "ה", 10: "ו", 12: "ז", 14: "ח",
      16: "ט", 18: "י", 20: "כ", 21: "ל", 23: "מ", 25: "נ", 27: "ס",
      30: "פ", 32: "צ", 34: "ק", 35: "ר", 37: "ש",
    },
  },
  "19:111": {
    style: "verse",
    letters: {
      1: "אב", 2: "גד", 3: "הו", 4: "זח", 5: "טי",
      6: "כל", 7: "מנ", 8: "סע", 9: "פצק", 10: "רשת",
    },
  },
  "19:112": {
    style: "verse",
    letters: {
      1: "אב", 2: "גד", 3: "הו", 4: "זח", 5: "טי",
      6: "כל", 7: "מנ", 8: "סע", 9: "פצק", 10: "רשת",
    },
  },
};

// Everything the table claims must also be what the table says: if the source
// and this list drift apart, the check is worthless.
for (const ref of Object.keys(EXPECTED)) {
  if (!source.includes(`"${ref}"`)) {
    console.error(`✗ ${ref} is checked here but missing from lib/acrostic.ts`);
    process.exit(1);
  }
}
for (const ref of source.match(/"\d+:\d+":/g) ?? []) {
  const key = ref.slice(1, -2);
  if (!EXPECTED[key]) {
    console.error(`✗ ${key} is in lib/acrostic.ts but not checked here`);
    process.exit(1);
  }
}

let failures = 0;
const note = (ok, message) => {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${message}`);
};

for (const [ref, poem] of Object.entries(EXPECTED)) {
  const [bookNr, chapter] = ref.split(":").map(Number);
  const [heb, kjv] = await Promise.all([
    getChapter("codex", bookNr, chapter),
    getChapter("kjv", bookNr, chapter),
  ]);
  const offset = heb.length - kjv.length;
  const byMt = new Map(heb.map((v) => [v.verse, v.text]));

  const marks = Object.entries(poem.letters).map(([verse, letters]) => ({
    verse: Number(verse),
    letters: [...letters],
  }));
  marks.sort((a, b) => a.verse - b.verse);

  let wrong = [];
  for (const mark of marks) {
    if (mark.verse > kjv.length) {
      wrong.push(`v${mark.verse} is past the end of the chapter`);
      continue;
    }
    const text = byMt.get(mark.verse + offset);
    if (!text) {
      wrong.push(`v${mark.verse} has no Hebrew at ${mark.verse + offset}`);
      continue;
    }
    // A verse marked with one letter must open with it, give or take a word of
    // superscription. A verse marked with several is a half-line acrostic, and
    // its letters are spread down the verse by design — there the constraint
    // that means anything is the order, not the distance from the start.
    const all = initials(text);
    const words = mark.letters.length > 1 ? all : all.slice(0, LEAD + 1);
    let at = -1;
    for (const letter of mark.letters) {
      const found = words.indexOf(letter, at + 1);
      if (found === -1) {
        wrong.push(`v${mark.verse} is marked ${letter}, opens ${words.slice(0, 3).join("")}`);
        break;
      }
      at = found;
    }
  }

  const letters = marks.flatMap((m) => m.letters);
  note(
    wrong.length === 0,
    `${ref} — ${marks.length} marks, ${letters.length} letters, MT offset ${offset}` +
      (wrong.length ? `\n    ${wrong.join("\n    ")}` : "")
  );
}

console.log(
  failures === 0
    ? "\nEvery marked letter is where the Hebrew puts it."
    : `\n${failures} passage(s) disagree with the Hebrew.`
);
process.exit(failures === 0 ? 0 : 1);
