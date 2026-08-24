// Turns Matthew Henry's Concise Commentary into one file per book.
//
// The source is CCEL's plain-text edition, which carries its own rights line:
// Matthew Henry died in 1714 and the text is public domain. That is why this
// one can be shipped as files at all, the way the King James is, instead of
// being fetched from behind a key like the modern translations.
//
// It is laid out for a page rather than for a parser, and in three different
// ways, which is the whole of the difficulty. Most books mark a section with
// a heading hard against the left margin:
//
//     Verses 1, 2
//
// Ecclesiastes through Joel instead open the paragraph with the reference:
//
//        Is. 1:1-9 Isaiah signifies, "The salvation of the Lord;" ...
//
// and a chapter short enough to need no sections — most of the genealogies —
// is written straight through, with its title on the line beneath:
//
//     Chapter 3
//        Genealogies.
//        --Of all the families of Israel, none were so illustrious ...
//
// Which of the first two a book uses is not guessed. The file is read twice:
// once to see whether a book contains a single "Verses" heading anywhere, and
// again to parse it accordingly. That matters because the thirteen books that
// appear to use both are not really doing so — those are ordinary scripture
// citations that happen to start a wrapped line, and reading them as headings
// would chop those books into fragments.
//
// Section titles come from the chapter outline and are worth the trouble.
// Henry's sections have no titles of their own — "Verses 3-5" is not a thing
// to put at the head of a panel — and the outline is where the names for them
// live. Paired back up by verse range, most sections arrive with the name
// their own author gave them.
//
// Usage: node scripts/build-commentary.mjs <mhcc.txt>
// Writes public/commentary/<bookNr>.json. Meant to be run once with its
// output committed: a build must not depend on a third-party site being up.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("usage: node scripts/build-commentary.mjs <mhcc.txt>");
  process.exit(1);
}

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "commentary");

/** The canonical list, read from the app rather than typed out again here. */
const BOOKS = [
  ...readFileSync(path.join(ROOT, "lib", "bible.ts"), "utf8").matchAll(
    /\{ nr: (\d+), en: "([^"]+)", es: "[^"]+", chapters: (\d+)/g
  ),
].map((m) => ({ nr: Number(m[1]), en: m[2], chapters: Number(m[3]) }));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const BY_NAME = new Map(BOOKS.map((b) => [norm(b.en), b.nr]));

const CENTRED = /^ {20,}(\S.{0,40}?)\s*$/;
const CHAPTER = /^Chapter (\d+)\s*$/;
const VERSES = /^Verses? ([\d,\s-]+?)\s*$/;
const OUTLINE_RANGE = /^ {20,}\(([\d,\s-]+)\)\s*$/;
/** a prophet-style section: the reference opens the paragraph */
const INLINE = /^ {3}[1-3]?\s?[A-Za-z]{1,6}\.?\s*(\d+):(\d+)(?:-(\d+))?\s+(\S)/;
const RULE = /^\s*_{10,}\s*$/;

/** "1, 2" and "3-5" and "31" all mean a first verse and a last one. */
function spanOf(raw) {
  const nums = (raw.match(/\d+/g) ?? []).map(Number);
  if (nums.length === 0) return null;
  return { from: nums[0], to: nums[nums.length - 1] };
}

const lines = readFileSync(SOURCE, "utf8").split("\n");
const bookAt = (line) => {
  const m = CENTRED.exec(line);
  return m ? BY_NAME.get(norm(m[1])) ?? null : null;
};

// ---- pass one: which style does each book use? ---------------------------
const usesVerses = new Set();
{
  let cur = null;
  for (const line of lines) {
    const nr = bookAt(line);
    if (nr) cur = nr;
    else if (cur && VERSES.test(line)) usesVerses.add(cur);
  }
}

// ---- pass two: parse ------------------------------------------------------
const books = new Map(); // nr -> Map(chapter -> { sections[], outline[], prose })

let bookNr = null;
let chapter = null;
let section = null;
let body = [];
let outline = [];
let pendingTitle = null;
/** everything read in this chapter before its first section began */
let prose = [];
let producedHere = 0;

const chapterOf = (nr, ch) => {
  const chapters = books.get(nr) ?? new Map();
  const entry = chapters.get(ch) ?? { sections: [], outline: [], prose: "" };
  chapters.set(ch, entry);
  books.set(nr, chapters);
  return entry;
};

const flush = () => {
  if (section && bookNr !== null && section.chapter !== null) {
    const text = body.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      chapterOf(bookNr, section.chapter).sections.push({
        from: section.from,
        to: section.to,
        text,
      });
      producedHere++;
    }
  }
  section = null;
  body = [];
};

/**
 * Close the chapter being read.
 *
 * A chapter that produced no sections is not an empty chapter — it is one
 * Henry wrote straight through, and everything gathered as "outline" is
 * actually the commentary. The title is what stands before the dashes he
 * opens the body with.
 */
const closeChapter = () => {
  flush();
  if (bookNr !== null && chapter !== null) {
    const entry = chapterOf(bookNr, chapter);
    const gathered = [...prose, pendingTitle].filter(Boolean).join(" ");
    entry.outline = outline.slice();
    entry.prose = gathered;
    if (producedHere === 0 && gathered) {
      const cut = gathered.search(/\s*--/);
      const title = cut > 0 ? gathered.slice(0, cut).trim() : "";
      const text = (cut > 0 ? gathered.slice(cut) : gathered)
        .replace(/^\s*--\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
      // no `to`: the section runs to the end of the chapter
      if (text) entry.sections.push({ from: 1, ...(title ? { title } : {}), text });
    }
  }
  outline = [];
  pendingTitle = null;
  prose = [];
  producedHere = 0;
};

/*
 * A section before any chapter marker belongs to chapter 1.
 *
 * 2 Kings and 2 Chronicles print no "Chapter 1" line at all — the book
 * heading runs straight into the outline — so their opening chapter was being
 * parsed with no chapter to file it under and dropped on the floor. Those two
 * were the whole of the difference between 1187 chapters and 1189.
 */
const ensureChapter = () => {
  if (chapter === null) chapter = 1;
};

for (const line of lines) {
  if (RULE.test(line)) continue;

  const nr = bookAt(line);
  if (nr) {
    closeChapter();
    bookNr = nr;
    chapter = null;
    continue;
  }
  if (bookNr === null) continue;

  const chapterHit = CHAPTER.exec(line);
  if (chapterHit) {
    closeChapter();
    chapter = Number(chapterHit[1]);
    continue;
  }

  if (usesVerses.has(bookNr)) {
    const versesHit = VERSES.exec(line);
    if (versesHit) {
      flush();
      ensureChapter();
      const span = spanOf(versesHit[1]);
      section = span ? { ...span, chapter } : null;
      continue;
    }
  } else {
    const inlineHit = INLINE.exec(line);
    if (inlineHit) {
      flush();
      section = {
        chapter: Number(inlineHit[1]),
        from: Number(inlineHit[2]),
        to: inlineHit[3] ? Number(inlineHit[3]) : Number(inlineHit[2]),
      };
      // the reference is the marker, not part of what Henry wrote
      // on the untrimmed line: INLINE is anchored to the three-space indent
      body = [line.replace(INLINE, "$4").trim()];
      continue;
    }
  }

  const text = line.trim();
  if (!text) continue;

  if (section) {
    body.push(text);
    continue;
  }
  if (text === "Chapter Outline") {
    ensureChapter();
    continue;
  }
  /*
   * 2 Chronicles opens the same way but without even an outline: the book
   * heading, a title, and the dashes Henry starts a straight-through chapter
   * with. Across all sixty-six books that is the only place a "--" opener
   * appears before a chapter marker, so it is a safe thing to read as the
   * start of chapter 1 rather than as part of the book's introduction.
   */
  if (chapter === null && text.startsWith("--")) ensureChapter();
  if (chapter === null) continue;

  // outside a section: the outline, or a whole-chapter commentary
  const rangeHit = usesVerses.has(bookNr) ? OUTLINE_RANGE.exec(line) : null;
  if (rangeHit) {
    const span = spanOf(rangeHit[1]);
    if (span && pendingTitle) outline.push({ ...span, title: pendingTitle });
    if (pendingTitle) prose.push(pendingTitle);
    pendingTitle = null;
    continue;
  }
  pendingTitle = pendingTitle ? `${pendingTitle} ${text}` : text;
}
closeChapter();

// ---- name the sections ----------------------------------------------------
/** Titles for a prophet-style chapter, pulled out of its run-together outline. */
function titlesFromProse(text) {
  // Split on the references rather than trying to match around them: a title
  // ends in a full stop as often as not, and any pattern that tries to say
  // "everything up to the bracket, but not punctuation" gets that wrong.
  const re = /\(\s*[1-3]?\s?[A-Za-z]{1,6}\.?\s*\d+:(\d+)(?:-(\d+))?\s*\)/g;
  const out = [];
  let cursor = 0;
  for (const m of text.matchAll(re)) {
    const title = text.slice(cursor, m.index).replace(/\s+/g, " ").trim();
    cursor = m.index + m[0].length;
    /*
     * Only if it reads as a title.
     *
     * The prophets' outlines are not always a list. Isaiah 53's is one
     * sentence with the references dropped into the middle of it — "The
     * person. (53:1-3) sufferings. (53:4-9) humiliation, and exaltation of
     * Christ, are minutely described..." — so splitting on the references
     * yields fragments rather than names. A fragment at the head of a panel
     * reads as a fault in the app; no title reads as no title. Isaiah 1's
     * outline is a proper list and survives this untouched.
     */
    const looksLikeTitle = /^[A-Z]/.test(title) && title.split(/\s+/).length > 1;
    if (looksLikeTitle) {
      out.push({ from: Number(m[1]), to: Number(m[2] ?? m[1]), title });
    }
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
let sections = 0;
let titled = 0;
let chapterCount = 0;
let bytes = 0;
const short = [];

for (const book of BOOKS) {
  const chapters = books.get(book.nr) ?? new Map();
  const out = {};
  for (const [ch, entry] of [...chapters].sort((a, b) => a[0] - b[0])) {
    if (entry.sections.length === 0) continue;
    chapterCount++;
    const titles = entry.outline.length
      ? entry.outline
      : titlesFromProse(entry.prose);
    const ordered = [...entry.sections].sort((a, b) => a.from - b.from);
    /*
     * Close the gaps between one section and the next.
     *
     * The printed ranges and the outline do not always agree, and where they
     * differ the outline is right: John 3 is headed "Verses 1-8" while its own
     * outline says (1-21), and the commentary under it runs all the way
     * through "God so loved the world" — so verses 9 to 21, John 3:16 among
     * them, had commentary sitting right there and no way to reach it.
     *
     * Rather than trusting either label, each section is stretched to meet the
     * one after it, and the last runs to the end of the chapter. Where the
     * printed ranges are already contiguous this changes nothing; where they
     * are not, it is the difference between a verse having commentary and
     * appearing to have none.
     */
    ordered.forEach((s, i) => {
      const next = ordered[i + 1];
      if (next) s.to = next.from - 1;
      else delete s.to;
    });
    // and the first runs from the top of the chapter, so no verse in a
    // chapter that has commentary can be left pointing at nothing
    if (ordered.length > 0) ordered[0].from = 1;
    out[ch] = ordered.map((s) => {
      sections++;
      if (s.title) {
        titled++;
        return s;
      }
      const hit =
        titles.find((t) => t.from === s.from && t.to === s.to) ??
        titles.find((t) => t.from === s.from);
      if (hit) titled++;
      return {
        from: s.from,
        ...(s.to !== undefined ? { to: s.to } : {}),
        ...(hit ? { title: hit.title } : {}),
        text: s.text,
      };
    });
  }
  const have = Object.keys(out).length;
  if (have !== book.chapters) short.push(`${book.en} ${have}/${book.chapters}`);
  const json = JSON.stringify(out);
  bytes += json.length;
  writeFileSync(path.join(OUT, `${book.nr}.json`), json);
}

console.log(`chapters : ${chapterCount} of 1189`);
console.log(`sections : ${sections}`);
console.log(`titled   : ${titled} (${Math.round((titled / sections) * 100)}%)`);
console.log(`size     : ${(bytes / 1048576).toFixed(1)} MB across 66 files`);
if (short.length) console.log(`SHORT    : ${short.join(", ")}`);
