// The Parchment Edition's layout, read back the way a person would, for
// scripts/build-book.mjs: prose chapters with a drop cap and one picture each,
// verse set in among them, and an appendix table.
//
//   - A chapter starts at a small gold "Chapter N:" over a large title.
//   - Prose is justified, so a paragraph's last line is the one that stops
//     short of the column's right edge. Beside an illustration the column is
//     narrower, and "full" is measured against that narrower edge.
//   - Verse is set in from the left margin, a line at a time, and a larger
//     gap between lines starts a new stanza.
//   - The drop cap is a letter of its own, in a box; it is joined back onto
//     the word it begins.

import { isTitle, mostCommon } from "./layout.mjs";

/** Whether a book is set this way: its chapters carry "Chapter N:" labels. */
export const isProse = (pages) => pages.some((p) => p.lines.some(isChapterLabel));

const isChapterLabel = (l) => /^Chapter \d+:$/.test(l.html.trim());

export function readProse({ pages, pictures }) {
  /**
   * Every word the book uses, to tell a drop cap that begins a word — "I" and
   * "n my travels" — from one that is a word — "I" and "told you before".
   * The layout cannot: both set the rest of the line in the same place.
   */
  const vocabulary = new Set(
    pages.flatMap((p) =>
      p.lines.flatMap((l) => l.html.replace(/<[^>]+>/g, "").toLowerCase().match(/[a-z]+/g) ?? [])
    )
  );

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
  let bookPart = null; // "Part One", where the book is a part of a larger one
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
        const letter = drop.html.trim();
        const rest = first.html.trim();
        const word = (letter + (rest.match(/^[A-Za-z]+/)?.[0] ?? "")).toLowerCase();
        // A, I and O are words of their own; the rest of the line joins on to
        // them only where that makes a word the book uses
        const apart = /^[AIO]$/.test(letter) && !vocabulary.has(word);
        first.html = letter + (apart ? " " : "") + rest;
        first.drop = true;
        // the lines set in beside the letter are ragged, not justified, so
        // their length says nothing; they always run on into the next
        for (const l of page.lines) {
          if (l.left === first.left && l.top >= first.top && l.top < drop.top + 60) l.besideDrop = true;
        }
      }
      page.lines.splice(page.lines.indexOf(drop), 1);
    }

    // the appendix's table is laid out in columns, and read as one — on its
    // own page, and on any page after it that carries on with no title of its
    // own
    if (page.lines.some((l) => isTitle(l) && /^Appendix/.test(l.html))) {
      readAppendix(page);
      previous = null;
      continue;
    }
    if (part?.id === "appendix" && !page.lines.some(isTitle)) {
      readAppendix(page, true);
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
        // a part's own title page — "Part One", "Part Two" — heads the chapters
        // in the contents rather than being a page of its own
        if (/^Part \w+$/.test(title)) {
          bookPart = title;
          part = null;
          previous = null;
          continue;
        }
        const n = pendingLabel ? Number(pendingLabel.replace(/\D/g, "")) : null;
        startPart({
          id: n ? String(n).padStart(2, "0") : title === "The Conclusion" ? "conclusion" : frontId(title),
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

  /**
   * The id of a piece ahead of the chapters. The first is "apology", as
   * Bunyan's Apology was in the first book, and the ids are in readers' saved
   * places and links, so that stays; any more — The Siege of Mansoul has two
   * poems before it begins — are named for their titles.
   */
  function frontId(title) {
    if (!parts.some((p) => p.id === "apology")) return "apology";
    return title
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .replace(/^(a|an|the)-/, "");
  }

  function readAppendix(page, carriesOn = false) {
    if (!carriesOn) {
      const title = page.lines.find(isTitle).html.trim();
      startPart({ id: "appendix", title });
    }
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
          // a name broken at one of its own hyphens closes up again
          .replace(/(\w)- (?=\w)/g, "$1-")
          .replace(/<\/i> <i>/g, " ")
      );
    });
    const table = carriesOn && part.blocks.findLast((b) => b.kind === "table");
    if (!table) {
      part.blocks.push({ kind: "table", head: rows[0], rows: rows.slice(1) });
      return;
    }
    // a table carried over a page repeats its header there; it is one table
    const repeated = rows[0]?.join("|") === table.head.join("|");
    table.rows.push(...(repeated ? rows.slice(1) : rows));
  }

  return { parts, bookPart };
}
