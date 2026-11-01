// A novel in parts, as Sion is set, read back for scripts/build-book.mjs:
//
//   - The cover, a title page and the contents come first, and are passed
//     over; the cover is rendered whole, as every edition's is.
//   - A chapter opens under small brown capitals: the part it begins, where
//     it begins one ("PART ONE: THE HUNTER"), and "Chapter One:", or
//     "Interlude:" or "Coda:" — then its title, large.
//   - The text is ragged on the right, so a paragraph shows itself by its
//     first line, set in. The first paragraph after a title or a picture is
//     not, and starts a paragraph all the same.
//   - Letters and records — "Dear Stephen, …" at the head of a chapter, the
//     tallies in the Interlude — are set in a little from the margin, in
//     italic, and kept as quotations.
//   - An epigraph — an in-world document at a chapter's head, a catechism
//     card or a routing slip — is set in further and a size down: a line
//     saying what the document is, a size smaller again, then the document,
//     in italic. Each is kept as its own paragraph.
//   - The pictures stand in the text, as many to a page as the page has, and
//     are kept where they stand.
//   - Every page carries the chapter's name at its head and the author or
//     title with the folio at its foot; neither is the book.

const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

/** "Twenty-One" to 21. */
function fromWords(s) {
  return s
    .toLowerCase()
    .split("-")
    .reduce((n, w) => n + (WORDS[w] ?? NaN), 0);
}

const SMALL = new Set(["a", "an", "and", "the", "of", "in", "on", "to", "for", "at", "by"]);

/** "PART ONE: THE HUNTER" as the contents set it: "Part One: The Hunter". */
function titleCase(s) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i, all) => (i > 0 && SMALL.has(w) && !all[i - 1].endsWith(":") ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** The small capitals over a chapter's title. */
const isLabel = (l) => /SegoeUI/.test(l.font.family) && l.font.size === 13;
const isTitle = (l) => /Constantia/.test(l.font.family) && l.font.size >= 30 && l.font.size < 60;
const isBody = (l) => /Constantia/.test(l.font.family) && l.font.size === 17;
/** An epigraph's line saying what it is, and the epigraph itself. */
const isSource = (l) => /Constantia/.test(l.font.family) && l.font.size === 15;
const isEpigraph = (l) => /Constantia/.test(l.font.family) && l.font.size === 16;
/** An epigraph's lines 21 or 22 apart. */
const EPIGRAPH_GAP = 26;

/** Where the text begins, where a paragraph's first line is set in to, and a quotation's margin. */
const QUOTE_LEFT = 80;
const INDENT_LEFT = 87;
/** Lines 23 to 27 apart; a letter's lines 24 or 25. */
const QUOTE_GAP = 28;

/** Whether a book is set this way: its chapters are numbered in words. */
export const isNovel = (pages) =>
  pages.some((p) => p.lines.some((l) => isLabel(l) && /^(<b>)?Chapter [A-Z][a-z]+(-[A-Z][a-z]+)?:/.test(l.html.trim())));

export function readNovel({ pages, pagePictures }) {
  const parts = [];
  let part = null;
  /** the paragraph being added to */
  let open = null;
  /** the last line read, on whichever page */
  let previous = null;
  let group = null;
  let pendingLabel = null;

  for (const page of pages) {
    const text = page.lines.map((l) => l.html.replace(/<[^>]+>/g, "").trim());
    // the cover, the title page, the contents
    if (page.number === 1 || text.includes("CONTENTS") || page.lines.some((l) => l.font.size > 60)) continue;

    const items = [
      // the running head and the foot are the chapter's name and the folio
      ...page.lines.filter((l) => !/SegoeUI/.test(l.font.family) || l.font.size !== 11).map((line) => ({ top: line.top, line })),
      ...(pagePictures[page.number] ?? []).map((pic) => ({ top: pic.top, pic })),
    ].sort((a, b) => a.top - b.top);

    for (const { line: l, pic } of items) {
      if (pic) {
        if (part) part.blocks.push({ kind: "img", ref: `${page.number}:${pic.index}` });
        open = null;
        previous = null;
        continue;
      }
      const html = l.html.trim();
      const words = html.replace(/<[^>]+>/g, "").trim();

      if (isLabel(l)) {
        const partLabel = words.match(/^PART [A-Z-]+:.*$/);
        if (partLabel) {
          group = titleCase(words);
          continue;
        }
        const chapter = words.match(/^Chapter ([A-Za-z-]+):$/);
        if (chapter) pendingLabel = `Chapter ${fromWords(chapter[1])}`;
        else if (/^[A-Z][a-z]+:$/.test(words)) pendingLabel = words.slice(0, -1); // Interlude, Coda
        continue;
      }
      if (isTitle(l)) {
        const n = pendingLabel?.match(/\d+/)?.[0];
        part = {
          id: n ? String(n).padStart(2, "0") : (pendingLabel ?? words).toLowerCase(),
          ...(pendingLabel ? { label: pendingLabel } : {}),
          title: words,
          ...(group ? { group } : {}),
          blocks: [],
        };
        parts.push(part);
        pendingLabel = null;
        open = null;
        previous = null;
        continue;
      }
      if (part && (isSource(l) || isEpigraph(l))) {
        const style = isSource(l) ? "source" : "epigraph";
        const samePage = previous && previous.page === page.number;
        const joins = previous?.style === style && (!samePage || l.top - previous.top < EPIGRAPH_GAP);
        if (open && joins) open.text += " " + html;
        else {
          open = { kind: "p", text: html, style };
          part.blocks.push(open);
        }
        previous = { page: page.number, top: l.top, quote: false, style };
        continue;
      }
      if (!isBody(l) || !part) continue;

      const samePage = previous && previous.page === page.number;
      const gap = samePage ? l.top - previous.top : null;
      const quote = Math.abs(l.left - QUOTE_LEFT) <= 2;
      let joins;
      if (quote) {
        // a letter's lines run on into one another; a new one stands apart
        joins = previous?.quote && (!samePage || gap < QUOTE_GAP);
      } else {
        // set in, a new paragraph; at the margin, the one before carries on
        joins = previous && !previous.quote && !previous.style && l.left < INDENT_LEFT - 2;
      }
      if (open && joins) {
        open.text += " " + html;
      } else {
        open = { kind: "p", text: html, ...(quote ? { style: "quote" } : {}) };
        part.blocks.push(open);
      }
      previous = { page: page.number, top: l.top, quote };
    }
  }

  return { parts, bookPart: null };
}
