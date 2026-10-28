// Turns a book's typeset PDF into what the Bookshelf reads: one JSON file per
// part (the note, the Apology, each chapter, the Conclusion, the appendix),
// a book.json with the contents, and the illustrations at a size a phone
// wants.
//
//   node scripts/build-book.mjs <book.pdf> [slug]
//
// Needs poppler's pdftohtml, pdfimages and pdftoppm on the PATH, and sharp,
// which Next.js already brings with it. Run by hand when the book changes;
// what it writes is committed, like the other datasets under public/.
//
// The PDF is the source rather than the Google Doc it began as because the
// PDF is the edition: its chapter breaks, its verse, its italics and where
// each picture sits are all decided there. pdftohtml's XML gives every line
// with its position, font and <i>/<b>, and the rest is reading the layout
// back the way a person would:
//
//   - A chapter starts at a small gold "Chapter N:" over a large title.
//   - Prose is justified, so a paragraph's last line is the one that stops
//     short of the column's right edge. Beside an illustration the column is
//     narrower, and "full" is measured against that narrower edge.
//   - Verse is set in from the left margin, a line at a time, and a larger
//     gap between lines starts a new stanza.
//   - The drop cap is a letter of its own, in a box; it is joined back onto
//     the word it begins.
//
// Nothing is reworded. Straight quotes become curly ones, which is the one
// change to the characters: the PDF's font drew them straight, and the
// reader's font draws them properly.

import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import sharp from "sharp";

const [pdf, slug = "from-this-world"] = process.argv.slice(2);
if (!pdf) {
  console.error("usage: node scripts/build-book.mjs <book.pdf> [slug]");
  process.exit(1);
}

const OUT = path.join(process.cwd(), "public", "books", slug);
const WORK = path.join(tmpdir(), `book-${slug}-${process.pid}`);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---- the layout, as positioned lines -------------------------------------

execFileSync("pdftohtml", ["-xml", "-i", "-q", "-nodrm", pdf, path.join(WORK, "text")]);
// a second pass with the images in, for nothing but where each picture sits
execFileSync("pdftohtml", ["-xml", "-q", "-nodrm", pdf, path.join(WORK, "boxes")]);
const xml = readFileSync(path.join(WORK, "text.xml"), "utf8");
const boxXml = readFileSync(path.join(WORK, "boxes.xml"), "utf8");

const fonts = {};
for (const m of xml.matchAll(/<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"\/>/g)) {
  fonts[m[1]] = { size: +m[2], family: m[3], color: m[4] };
}

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Every page's lines, top to bottom, without the page number. */
const pages = xml
  .split(/<page number="/)
  .slice(1)
  .map((chunk) => {
    const number = parseInt(chunk, 10);
    const lines = [...chunk.matchAll(/<text top="(\d+)" left="(\d+)" width="(\d+)" height="(\d+)" font="(\d+)">(.*?)<\/text>/g)]
      .map((m) => ({
        top: +m[1],
        left: +m[2],
        right: +m[2] + +m[3],
        font: fonts[m[5]],
        html: decode(m[6]),
      }))
      // the folio, in the footer
      .filter((l) => !(l.top > 1000 && /^\d+$/.test(l.html.trim())))
      .sort((a, b) => a.top - b.top || a.left - b.left);
    return { number, lines };
  });

/** The illustration on each page that has one: its box, in the same units. */
const pictures = {};
for (const chunk of boxXml.split(/<page number="/).slice(1)) {
  const number = parseInt(chunk, 10);
  for (const m of chunk.matchAll(/<image top="(\d+)" left="(\d+)" width="(\d+)" height="(\d+)"/g)) {
    const [top, left, width, height] = m.slice(1).map(Number);
    // the parchment behind every page fills it; the pictures sit inside
    if (width >= 700) continue;
    pictures[number] = { top, bottom: top + height, left };
  }
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

const isTitle = (l) => /BaskOldFace/.test(l.font.family) && l.font.size >= 30 && l.font.size < 50;
const isChapterLabel = (l) => /^Chapter \d+:$/.test(l.html.trim());
const isDropCap = (l) => /BaskOldFace/.test(l.font.family) && l.font.size > 45 && l.html.trim().length === 1;

// ---- reading it back -------------------------------------------------------

const PROSE_LEFT = 65;
const VERSE_LEFT = 87;
const FULL_RIGHT = 692;

const parts = [];
let part = null;
/** the paragraph or stanza being added to */
let open = null;

const startPart = (fields) => {
  part = { ...fields, blocks: [] };
  parts.push(part);
  open = null;
};

const addLine = (html, kind, joinsPrevious, newStanza) => {
  if (kind === "p") {
    if (open && open.kind === "p" && joinsPrevious) {
      open.text += " " + html;
    } else {
      open = { kind: "p", text: html };
      part.blocks.push(open);
    }
  } else {
    if (!(open && open.kind === "v")) {
      open = { kind: "v", stanzas: [[]] };
      part.blocks.push(open);
    } else if (newStanza) {
      open.stanzas.push([]);
    }
    open.stanzas[open.stanzas.length - 1].push(html);
  }
};

let previous = null; // the last body line, on whichever page
let pendingLabel = null;

for (const page of pages) {
  if (page.number === 1) continue; // the cover, rendered whole below
  const pic = pictures[page.number];
  // beside the picture the column stops short of it; how far is measured, not
  // assumed, from the widest line in that band
  const band = pic
    ? page.lines.filter((l) => l.top >= pic.top - 30 && l.top <= pic.bottom && l.right < pic.left)
    : [];
  // the right edge most of them reach — a justified line reaches it exactly
  const bandRight = mostCommon(band.map((l) => l.right));
  const inBand = (l) => band.includes(l);
  // Justified lines reach the edge exactly, to the point: 2,222 of them are
  // 627 wide and the nearest after that is 626. So the test is to within a
  // point, and a last line that stops even a few short ends its paragraph.
  const full = (l) =>
    l.besideDrop || (inBand(l) ? l.right >= bandRight - 1 : l.right >= FULL_RIGHT - 1);

  // The drop cap sits a little below the top of the line it starts, so in
  // reading order it would come after it. It is joined to the first line
  // beside it here, and that line opens the chapter's first paragraph.
  const drop = page.lines.find(isDropCap);
  if (drop) {
    const first = page.lines
      .filter((l) => l !== drop && l.left > drop.left + 20 && Math.abs(l.top - drop.top) < 30)
      .sort((a, b) => a.top - b.top)[0];
    if (first) {
      first.html = drop.html.trim() + first.html.trim();
      first.drop = true;
      // the lines set in beside the letter are ragged, not justified, so
      // their length says nothing; they always run on into the next
      for (const l of page.lines) {
        if (l.left === first.left && l.top >= first.top && l.top < drop.top + 60) l.besideDrop = true;
      }
    }
    page.lines.splice(page.lines.indexOf(drop), 1);
  }

  // the appendix's table is laid out in columns, and read as one
  if (page.lines.some((l) => isTitle(l) && /^Appendix/.test(l.html))) {
    readAppendix(page);
    previous = null;
    continue;
  }

  for (const l of page.lines) {
    if (isChapterLabel(l)) {
      pendingLabel = l.html.trim().replace(/:$/, "");
      continue;
    }
    if (isTitle(l)) {
      const title = l.html.trim();
      if (part && part.blocks.length === 0 && part.title && previous === null) {
        part.title += " " + title; // a title long enough to wrap
        continue;
      }
      if (title === "Part One") {
        part = null;
        previous = null;
        continue;
      }
      const n = pendingLabel ? Number(pendingLabel.replace(/\D/g, "")) : null;
      startPart({
        id: n ? String(n).padStart(2, "0") : title === "The Conclusion" ? "conclusion" : "apology",
        ...(pendingLabel ? { label: pendingLabel } : {}),
        title,
        ...(pic ? { picturePage: page.number } : {}),
      });
      pendingLabel = null;
      previous = null;
      continue;
    }
    if (!part) {
      // the note on this edition, ahead of everything
      startPart({ id: "note", title: "A Note on This Edition" });
    }
    let html = l.html.trim();
    const verse = l.left >= VERSE_LEFT - 2 && l.left <= VERSE_LEFT + 4;
    if (l.drop) {
      addLine(html, "p", false);
      part.blocks[part.blocks.length - 1].drop = true;
      previous = { ...l, page: page.number, full: full(l), inBand: inBand(l), verse };
      continue;
    }
    const samePage = previous && previous.page === page.number;
    const gap = samePage ? l.top - previous.top : null;
    if (verse) {
      const newStanza = samePage ? gap > 28 : false;
      addLine(html, "v", false, newStanza);
    } else {
      let joins = false;
      if (previous && !previous.verse && previous.full) {
        // a full line runs on — unless a paragraph's gap follows it on the
        // same page, which is how a last line that happens to fill the measure
        // shows itself. The drop under a picture is not that gap.
        const underPicture = previous.inBand && !inBand(l);
        joins = !samePage || underPicture || gap < 30;
      }
      addLine(html, "p", joins);
    }
    previous = { ...l, page: page.number, full: full(l), inBand: inBand(l), verse };
  }
}

function readAppendix(page) {
  const title = page.lines.find(isTitle).html.trim();
  startPart({ id: "appendix", title });
  const body = page.lines.filter((l) => !isTitle(l));
  // the lead-in, at the prose margin, above the table
  const lead = body.filter((l) => l.left === PROSE_LEFT);
  for (const l of lead) addLine(l.html.trim(), "p", part.blocks.length > 0);
  const cells = body.filter((l) => l.left !== PROSE_LEFT);
  const columns = [...new Set(cells.map((l) => l.left))].sort((a, b) => a - b);
  // a row begins wherever the first column begins a new entry
  const rowTops = cells
    .filter((l) => l.left === columns[0])
    .map((l) => l.top)
    .filter((t, i, all) => i === 0 || t - all[i - 1] > 22);
  const rows = rowTops.map((top, i) => {
    const end = rowTops[i + 1] ?? Infinity;
    return columns.map((left) =>
      cells
        .filter((l) => l.left === left && l.top >= top && l.top < end)
        .map((l) => l.html.trim())
        .join(" ")
        .replace(/<\/i> <i>/g, " ")
    );
  });
  part.blocks.push({ kind: "table", head: rows[0], rows: rows.slice(1) });
}

// ---- the characters ---------------------------------------------------------

/** Straight quotes to curly, by what is either side of them. */
function curl(s) {
  return s
    // speech broken off — "he is—" — closes after its dash
    .replace(/([—–])"(?=\s|$|<)/g, "$1\u201D")
    .replace(/(^|[\s([{—–-]|<[ib]>)"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{—–-]|<[ib]>)'(?=(tis|twas|em|cause)\b)/gi, "$1’")
    .replace(/(^|[\s([{—–-]|<[ib]>)'/g, "$1‘")
    .replace(/'/g, "’");
}

const tidy = (s) => curl(s.replace(/<\/i> <i>/g, " ").replace(/<\/b> <b>/g, " ").replace(/\s+/g, " ").trim());

const words = (s) => s.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;

// ---- writing it ------------------------------------------------------------

execFileSync("pdfimages", ["-j", "-p", pdf, path.join(WORK, "img")]);
const extracted = readdirSync(WORK).filter((f) => /^img-\d+-\d+\.(jpg|ppm|png)$/.test(f));

async function picture(pageNumber, name) {
  // the page's picture is its largest image that is not the parchment behind it
  const candidates = await Promise.all(
    extracted
      .filter((f) => Number(f.split("-")[1]) === pageNumber)
      .map(async (f) => ({ f, meta: await sharp(path.join(WORK, f)).metadata() }))
  );
  const pick = candidates
    .filter(({ meta }) => !(meta.width === 1008 && meta.height === 1440))
    .sort((a, b) => b.meta.width * b.meta.height - a.meta.width * a.meta.height)[0];
  if (!pick) return null;
  const file = `${name}.webp`;
  const info = await sharp(path.join(WORK, pick.f))
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 74 })
    .toFile(path.join(OUT, file));
  return { src: file, w: info.width, h: info.height };
}

const contents = [];
for (const p of parts) {
  const blocks = p.blocks.map((b) => {
    if (b.kind === "p") {
      const text = tidy(b.text);
      // a line in bold capitals on its own — the author's name under his
      // Apology — is a signature, set to the right
      const sig = text.match(/^<b>([^<]+)<\/b>$/);
      if (sig && sig[1] === sig[1].toUpperCase()) return { sig: sig[1] };
      return { p: text, ...(b.drop ? { drop: true } : {}) };
    }
    if (b.kind === "v") return { v: b.stanzas.map((st) => st.map(tidy)) };
    return { table: { head: b.head.map(tidy), rows: b.rows.map((r) => r.map(tidy)) } };
  });
  const image = p.picturePage ? await picture(p.picturePage, `ch${p.id}`) : null;
  const out = {
    id: p.id,
    ...(p.label ? { label: p.label } : {}),
    title: curl(p.title),
    ...(image ? { image } : {}),
    blocks,
  };
  writeFileSync(path.join(OUT, `${p.id}.json`), JSON.stringify(out));
  const count = blocks.reduce(
    (n, b) =>
      n +
      (b.p ? words(b.p) : b.v ? b.v.flat().reduce((m, line) => m + words(line), 0) : 0),
    0
  );
  contents.push({ id: p.id, ...(p.label ? { label: p.label } : {}), title: curl(p.title), words: count });
}

// the cover is the whole first page — the painting with its lettering on it
execFileSync("pdftoppm", ["-r", "150", "-png", "-f", "1", "-l", "1", "-singlefile", pdf, path.join(WORK, "cover")]);
const cover = await sharp(path.join(WORK, "cover.png"))
  .resize({ width: 720 })
  .webp({ quality: 78 })
  .toFile(path.join(OUT, "cover.webp"));

const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
const meta = (key) => (info.match(new RegExp(`^${key}:\\s+(.*)$`, "m")) || [])[1]?.trim();

writeFileSync(
  path.join(OUT, "book.json"),
  JSON.stringify({
    slug,
    title: meta("Title")?.replace(/ — .*$/, "") ?? slug,
    author: meta("Author") ?? "",
    cover: { src: "cover.webp", w: cover.width, h: cover.height },
    contents,
  })
);

rmSync(WORK, { recursive: true, force: true });

const total = contents.reduce((n, c) => n + c.words, 0);
console.log(`${slug}: ${contents.length} parts, ${total.toLocaleString()} words`);
for (const c of contents) console.log(`  ${c.id.padEnd(11)} ${String(c.words).padStart(6)}  ${c.label ? c.label + " · " : ""}${c.title}`);
