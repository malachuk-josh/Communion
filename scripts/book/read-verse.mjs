// The Engraved Edition's layout — a long poem in Books — read back for
// scripts/build-book.mjs. The Fall is set this way:
//
//   - The front matter is prose: the note on the edition, then the poet's own
//     preface under a title.
//   - A Book opens on a page of its own: its title, an engraving, and the
//     poet's prose Argument in italic beneath. The engraving heads the part,
//     as a chapter's picture does.
//   - The verse is set a line at a time, every line whole: no line of the
//     poem is ever broken over two. A paragraph of verse starts after a wider
//     gap — 40 points where the lines are 25 apart.
//   - Engravings stand between paragraphs of verse, and are kept where they
//     stand, in the text.
//   - Each Book ends with its notes under their own title: a note begins with
//     its word or phrase in bold and the line it is on, and may carry on over
//     a page.
//
// A paragraph that begins at the top of a page has no gap to show it, so the
// page before says what it can. One that ends with room for another line
// left at its foot was ended there on purpose. One that is full says
// nothing, and the line itself decides: across the whole poem, a line that
// opens a speech starts a new paragraph six times in seven, and a line that
// does not almost never does.

import { isTitle } from "./layout.mjs";

const BOOK = /^Book ([IVXLC]+)$/;

/** Whether a book is set this way: its parts are Books, by number. */
export const isVerse = (pages) => pages.some((p) => p.lines.some((l) => isTitle(l) && BOOK.test(l.html.trim())));

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function fromRoman(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    n += v < (ROMAN[s[i + 1]] ?? 0) ? -v : v;
  }
  return n;
}

/** The verse's size; the Arguments and notes are set a little smaller, the front matter between. */
const VERSE_SIZE = 20;
/** Lines 25 points apart, paragraphs 40: anything from here up is a new paragraph. */
const PARAGRAPH_GAP = 38;
/** A page whose last line sits higher than this had room for one more. */
const ROOM_FOR_ANOTHER = 960;
/** A justified line of prose reaches the right margin; a paragraph's last line stops short of it. */
const FULL_RIGHT = 686;

const opensSpeech = (html) => /^(<[ib]>)*["“'‘]/.test(html.trim());

export function readVerse({ pages, pictures }) {
  const parts = [];
  let part = null;
  /** the paragraph or verse block being added to */
  let open = null;
  /** the last line read, on whichever page */
  let previous = null;
  let inNotes = false;

  const startPart = (fields) => {
    part = { ...fields, blocks: [] };
    parts.push(part);
    open = null;
    previous = null;
    inNotes = false;
  };

  const addProse = (html, style, joins) => {
    if (open && open.kind === "p" && joins) {
      open.text += " " + html;
    } else {
      open = { kind: "p", text: html, ...(style ? { style } : {}) };
      part.blocks.push(open);
    }
  };

  const addVerse = (html, newParagraph) => {
    if (!(open && open.kind === "v")) {
      open = { kind: "v", stanzas: [[]] };
      part.blocks.push(open);
    } else if (newParagraph) {
      open.stanzas.push([]);
    }
    open.stanzas[open.stanzas.length - 1].push(html);
  };

  for (const page of pages) {
    if (page.number === 1) continue; // the cover, rendered whole
    const pic = pictures[page.number];
    const opensBook = page.lines.some((l) => isTitle(l) && BOOK.test(l.html.trim()));
    // the page's lines and, where it stands among them, its engraving
    const items = [
      ...page.lines.map((line) => ({ top: line.top, line })),
      ...(pic && !opensBook ? [{ top: pic.top, pic }] : []),
    ].sort((a, b) => a.top - b.top);

    for (const { line: l, pic: inText } of items) {
      if (inText) {
        part.blocks.push({ kind: "img", ref: page.number });
        open = null;
        previous = null;
        continue;
      }
      const html = l.html.trim();
      if (isTitle(l)) {
        const book = html.match(BOOK);
        if (book) {
          startPart({
            id: String(fromRoman(book[1])).padStart(2, "0"),
            title: html,
            ...(pic ? { picture: page.number } : {}),
          });
        } else if (/^Notes on /.test(html) && part) {
          part.blocks.push({ kind: "section", text: html });
          open = null;
          previous = null;
          inNotes = true;
        } else {
          // the poet's preface, or anything else ahead of the Books
          const id = html
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .replace(/^(a|an|the)-/, "");
          startPart({ id, title: html });
        }
        continue;
      }
      if (!part) {
        // the note on this edition, ahead of everything
        startPart({ id: "note", title: "A Note on This Edition" });
      }
      const samePage = previous && previous.page === page.number;
      const gap = samePage ? l.top - previous.top : null;

      if (l.font.size === VERSE_SIZE) {
        let newParagraph = false;
        if (samePage) newParagraph = gap >= PARAGRAPH_GAP;
        else if (previous?.verse) newParagraph = previous.top <= ROOM_FOR_ANOTHER || opensSpeech(html);
        addVerse(html, newParagraph);
      } else if (inNotes) {
        // a note begins with its word or phrase in bold
        addProse(html, "note", !/^<b>/.test(html));
      } else {
        // the Argument, at the head of a Book before its verse; or the front matter
        const style = /^\d+$/.test(part.id) && !part.blocks.some((b) => b.kind === "v") ? "argument" : undefined;
        const joins = previous && !previous.verse && (samePage ? gap < 30 : previous.right >= FULL_RIGHT);
        addProse(html, style, !!joins);
      }
      previous = { page: page.number, top: l.top, right: l.right, verse: l.font.size === VERSE_SIZE };
    }
  }

  return { parts, bookPart: null };
}
