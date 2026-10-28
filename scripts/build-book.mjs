// Turns a book's typeset PDF into what the Bookshelf reads: one JSON file per
// part (the front matter, each chapter or Book, the back matter), a book.json
// with the contents, and the illustrations at a size a phone wants.
//
//   node scripts/build-book.mjs <book.pdf> [slug]
//
// Needs poppler's pdftohtml, pdfimages and pdftoppm on the PATH, and sharp,
// which Next.js already brings with it. Run by hand when the book changes;
// what it writes is committed, like the other datasets under public/.
//
// The PDF is the source rather than the Google Doc it began as because the
// PDF is the edition: its chapter breaks, its verse, its italics and where
// each picture sits are all decided there. The layout is read back the way a
// person would read it (scripts/book/layout.mjs), by one of two readers:
//
//   book/read-prose.mjs  the Parchment Edition: prose chapters, each with a
//                        drop cap and a painting, verse among them
//   book/read-verse.mjs  the Engraved Edition: a poem in Books, each with its
//                        Argument, engravings in the text, and notes
//
// and written out by book/write.mjs.

import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { readLayout } from "./book/layout.mjs";
import { isProse, readProse } from "./book/read-prose.mjs";
import { isVerse, readVerse } from "./book/read-verse.mjs";
import { writeBook } from "./book/write.mjs";

const [pdf, slug = "from-this-world"] = process.argv.slice(2);
if (!pdf) {
  console.error("usage: node scripts/build-book.mjs <book.pdf> [slug]");
  process.exit(1);
}

const OUT = path.join(process.cwd(), "public", "books", slug);
const WORK = path.join(tmpdir(), `book-${slug}-${process.pid}`);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const layout = readLayout(pdf, WORK);
const reader = isProse(layout.pages) ? readProse : isVerse(layout.pages) ? readVerse : null;
if (!reader) {
  console.error(`${pdf}: neither "Chapter N:" chapters nor "Book I" Books; which edition is this?`);
  process.exit(1);
}
const { parts, bookPart } = reader(layout);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const contents = await writeBook({ pdf, slug, out: OUT, work: WORK, parts, bookPart });

rmSync(WORK, { recursive: true, force: true });

const total = contents.reduce((n, c) => n + c.words, 0);
console.log(`${slug}: ${contents.length} parts, ${total.toLocaleString()} words`);
for (const c of contents) console.log(`  ${c.id.padEnd(11)} ${String(c.words).padStart(6)}  ${c.label ? c.label + " · " : ""}${c.title}`);
