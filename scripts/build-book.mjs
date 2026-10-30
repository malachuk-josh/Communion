// Turns a book into what the Bookshelf reads: one JSON file per part (the
// front matter, each chapter, Book or canto, the back matter), a book.json
// with the contents, and the illustrations at a size a phone wants.
//
//   node scripts/build-book.mjs <book.pdf> [slug]
//   node scripts/build-book.mjs <doc.zip> [slug]   a Google Doc, downloaded
//                                                  as a web page (zipped)
//
// Needs poppler's pdftohtml, pdfimages and pdftoppm on the PATH, and sharp,
// which Next.js already brings with it. Run by hand when the book changes;
// what it writes is committed, like the other datasets under public/.
//
// Where there is one, the PDF is the source rather than the Google Doc it
// began as, because the PDF is the edition: its chapter breaks, its verse, its italics and where
// each picture sits are all decided there. The layout is read back the way a
// person would read it (scripts/book/layout.mjs), by one of two readers:
//
//   book/read-prose.mjs  the Parchment Edition: prose chapters, each with a
//                        drop cap and a painting, verse among them
//   book/read-verse.mjs  the Engraved Edition: a poem in Books, each with its
//                        Argument, engravings in the text, and notes
//
// A book that comes as a Google Doc is read from the Doc's HTML instead, by
// book/read-doc.mjs: its headings and line breaks already say what a PDF's
// layout has to be read for.
//
// Either way it is written out by book/write.mjs.

import { execFileSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { pdfAssets, readLayout } from "./book/layout.mjs";
import { isDoc, readDoc } from "./book/read-doc.mjs";
import { isProse, readProse } from "./book/read-prose.mjs";
import { isVerse, readVerse } from "./book/read-verse.mjs";
import { writeBook } from "./book/write.mjs";

const [source, slug = "from-this-world"] = process.argv.slice(2);
if (!source) {
  console.error("usage: node scripts/build-book.mjs <book.pdf | doc.zip> [slug]");
  process.exit(1);
}

const OUT = path.join(process.cwd(), "public", "books", slug);
const WORK = path.join(tmpdir(), `book-${slug}-${process.pid}`);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

let book;
if (source.endsWith(".zip")) {
  const unpacked = path.join(WORK, "doc");
  execFileSync("unzip", ["-q", "-o", source, "-d", unpacked]);
  if (!isDoc(unpacked)) {
    console.error(`${source}: no web page in it; download the Doc as File › Download › Web page`);
    process.exit(1);
  }
  book = readDoc(unpacked);
} else {
  const layout = readLayout(source, WORK);
  const reader = isProse(layout.pages) ? readProse : isVerse(layout.pages) ? readVerse : null;
  if (!reader) {
    console.error(`${source}: neither "Chapter N:" chapters nor "Book I" Books; which edition is this?`);
    process.exit(1);
  }
  book = { ...reader(layout), ...(await pdfAssets(source, WORK)) };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const contents = await writeBook({ slug, out: OUT, ...book });

rmSync(WORK, { recursive: true, force: true });

const total = contents.reduce((n, c) => n + c.words, 0);
console.log(`${slug}: ${contents.length} parts, ${total.toLocaleString()} words`);
for (const c of contents) console.log(`  ${c.id.padEnd(11)} ${String(c.words).padStart(6)}  ${c.label ? c.label + " · " : ""}${c.title}`);
