// A book written as a Google Doc, read from the Doc's own HTML export (File ›
// Download › Web page, or /export?format=zip), for scripts/build-book.mjs.
// The Divine Comedy comes this way. Its structure is in the markup, so
// nothing here has to be read back from where things sit on a page:
//
//   - The title, the byline ("Dante Alighieri · translated by …"), the cover
//     picture and a note on the copy come first, before any heading.
//   - A Heading 2 is a part of the work — Inferno, Purgatorio, Paradiso —
//     and the picture under it is that part's title page.
//   - A Heading 3 is a canto, "Canto I: The Dark Forest. The Hill of …": its
//     number, then the summary, which heads the canto in italic as Milton's
//     Arguments do. The picture straight under it heads the canto; any later
//     one stands in the verse where it stands in the Doc.
//   - A paragraph is a tercet, its lines broken with line breaks. One set
//     wholly in italic is a translator's note, kept as it is set.
//
// Each picture's alt text, its title in the Doc, is kept as its description.

import { readFileSync, readdirSync } from "fs";
import path from "path";

const ENTITIES = {
  nbsp: " ",
  middot: "·",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  ccedil: "ç",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&(\w+);/g, (whole, name) => ENTITIES[name] ?? whole);

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function fromRoman(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    n += v < (ROMAN[s[i + 1]] ?? 0) ? -v : v;
  }
  return n;
}

const slugOf = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Whether `dir` holds a Google Doc's HTML export. */
export const isDoc = (dir) => readdirSync(dir).some((f) => f.endsWith(".html"));

export function readDoc(dir) {
  const html = readFileSync(
    path.join(dir, readdirSync(dir).find((f) => f.endsWith(".html"))),
    "utf8"
  );

  // the Doc marks italic and bold with classes of its own making
  const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const classesWith = (rule) =>
    new Set([...css.matchAll(new RegExp(`\\.(c\\d+)\\{[^}]*${rule}[^}]*\\}`, "g"))].map((m) => m[1]));
  const italic = classesWith("font-style:italic");
  const bold = classesWith("font-weight:700");

  /** A run of the Doc's spans as the inline text the Bookshelf keeps: <i>, <b>. */
  const inline = (fragment) =>
    decode(
      fragment
        .replace(/<span class="([^"]*)">([\s\S]*?)<\/span>/g, (_, cls, text) => {
          const names = cls.split(/\s+/);
          let out = text;
          if (names.some((c) => italic.has(c))) out = `<i>${out}</i>`;
          if (names.some((c) => bold.has(c))) out = `<b>${out}</b>`;
          return out;
        })
        .replace(/<(?!\/?[ib]>)[^>]+>/g, "")
    ).replace(/\s+/g, " ");

  const body = html.slice(html.indexOf("<body"));
  const parts = [];
  let part = null;
  /** the verse block being added to */
  let open = null;
  let group = null;
  let cover = null;
  const front = [];

  for (const m of body.matchAll(/<(h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const [, tag, inner] = m;
    const text = inline(inner).trim();
    // a heading's own words, whatever the Doc set them in
    const heading = text.replace(/<[^>]+>/g, "");
    const pictures = [...inner.matchAll(/<img\b[^>]*\balt="([^"]*)"[^>]*\bsrc="([^"]+)"/g)].map((p) => ({
      file: path.join(dir, p[2]),
      alt: decode(p[1]),
    }));

    if (tag === "h2") {
      group = heading;
      part = { id: slugOf(heading), title: heading, group, blocks: [] };
      parts.push(part);
      open = null;
      continue;
    }
    if (tag === "h3") {
      const canto = heading.match(/^Canto ([IVXLC]+):\s*(.*)$/);
      if (!canto) throw new Error(`a heading that is not a canto: ${heading}`);
      part = {
        id: `${slugOf(group)}-${String(fromRoman(canto[1])).padStart(2, "0")}`,
        title: `Canto ${canto[1]}`,
        group,
        blocks: canto[2] ? [{ kind: "p", text: canto[2], style: "argument" }] : [],
      };
      parts.push(part);
      open = null;
      continue;
    }

    for (const pic of pictures) {
      if (!part) {
        cover ??= pic.file; // the first picture, ahead of everything, is the cover
      } else if (!part.picture && !part.blocks.some((b) => b.kind === "v")) {
        // straight under the heading: it heads the part
        part.picture = pic.file;
        part.pictureAlt = pic.alt;
      } else {
        part.blocks.push({ kind: "img", ref: pic.file, alt: pic.alt });
        open = null;
      }
    }
    if (!text) continue;
    if (!part) {
      front.push(text);
      continue;
    }

    // a tercet, a line at a time; one wholly in italic is a note on it
    const lines = inner
      .split(/<br[^>]*>/)
      .map(inline)
      .map((l) => l.trim())
      .filter(Boolean);
    const note = lines.every((l) => /^<i>.*<\/i>$/.test(l));
    if (!(open && open.kind === "v") || note) {
      open = { kind: "v", stanzas: [] };
      part.blocks.push(open);
    }
    open.stanzas.push(lines);
    if (note) open = null;
  }

  // ahead of the first part: the title, the byline, and the note on the copy
  const [title, byline, ...note] = front;
  parts.unshift({
    id: "note",
    title: "A Note on This Edition",
    blocks: note.map((p) => ({ kind: "p", text: p })),
  });

  return {
    parts,
    bookPart: null,
    title: title?.replace(/<[^>]+>/g, ""),
    author: byline?.replace(/<[^>]+>/g, "").split(" · ")[0].trim(),
    coverFile: cover,
    pictureFile: (file) => file,
  };
}
