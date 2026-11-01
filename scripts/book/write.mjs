// What the readers found, written out for the Bookshelf, for
// scripts/build-book.mjs: one JSON file per part, the pictures at a size a
// phone wants, the cover, and book.json with the contents. Where the
// pictures and the cover come from — a PDF's pages, a document's image files
// — is the source's business (pdfAssets in layout.mjs, readDoc in
// read-doc.mjs); here a picture is whatever `pictureFile` finds for it.
//
// Nothing is reworded. Straight quotes become curly ones, which is the one
// change to the characters: the PDF's font drew them straight, and the
// reader's font draws them properly.

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import sharp from "sharp";

// ---- the characters ---------------------------------------------------------

/** Straight quotes to curly, by what is either side of them. */
export function curl(s) {
  return s
    // speech broken off — "he is—" — closes after its dash
    .replace(/([—–])"(?=\s|$|<)/g, "$1”")
    .replace(/(^|[\s([{—–-]|<[ib]>)"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{—–-]|<[ib]>)'(?=(tis|twas|em|cause)\b)/gi, "$1’")
    .replace(/(^|[\s([{—–-]|<[ib]>)'/g, "$1‘")
    .replace(/'/g, "’");
}

const tidy = (s) => curl(s.replace(/<\/i> <i>/g, " ").replace(/<\/b> <b>/g, " ").replace(/\s+/g, " ").trim());

/** the widest a full-size picture is kept; the editions' are well within it */
const FULL_WIDTH = 2400;

const words = (s) => s.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;

// ---- writing it ------------------------------------------------------------

/**
 * `parts` as the readers build them: an id, a title, perhaps a label or a
 * group (the canticle a canto is in) and the picture that heads it, with its
 * description; and blocks of kind "p" (with `drop` or a `style`), "v"
 * (stanzas of lines), "table", "img" (a picture in the text) and "section" (a
 * heading inside the part, such as its notes').
 *
 * A picture is named by `ref` — a page, a file — and `pictureFile` says where
 * its image is. `coverFile` is the cover, already the whole of it, and
 * `coverFullFile`, where there is one, the same at the size it was made.
 *
 * Every picture is written twice: at a phone's width, which is what the page
 * shows and what a book downloaded for offline keeps; and, in full/, as large
 * as the edition has it, for the picture viewer to fetch when a reader zooms
 * in. full/ is online only — the offline download and the service worker
 * both leave it alone — since it is several times the size of the rest.
 */
export async function writeBook({ slug, out, parts, bookPart, title, author, coverFile, coverFullFile, pictureFile }) {
  mkdirSync(path.join(out, "full"), { recursive: true });

  /**
   * The picture as large as it was made, for looking at closely; nothing
   * where that is not much larger than the one already on the page.
   */
  async function fullSize(from, name, shown, quality) {
    const { width } = await sharp(from).metadata();
    if (!width || width < shown * 1.2) return null;
    const file = `full/${name}.webp`;
    await sharp(from)
      .resize({ width: Math.min(width, FULL_WIDTH) })
      .webp({ quality })
      .toFile(path.join(out, file));
    return file;
  }

  async function picture(ref, name, alt) {
    const from = await pictureFile(ref);
    if (!from) return null;
    const file = `${name}.webp`;
    const info = await sharp(from)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 74 })
      .toFile(path.join(out, file));
    const full = await fullSize(from, name, info.width, 84);
    return {
      src: file,
      w: info.width,
      h: info.height,
      ...(alt ? { alt: curl(alt) } : {}),
      ...(full ? { full } : {}),
    };
  }

  const contents = [];
  for (const p of parts) {
    let inText = 1; // the part's own picture is the first; those in its text follow
    const blocks = [];
    for (const b of p.blocks) {
      if (b.kind === "p") {
        const text = tidy(b.text);
        // a line in bold capitals on its own — "OBJECTION 1.", "ANSWER.", the
        // author's name under his verse — is a small heading, set as the PDF
        // sets it: bold, at the margin
        const head = text.match(/^<b>([^<]+)<\/b>$/);
        if (head && head[1] === head[1].toUpperCase()) blocks.push({ h: head[1] });
        else blocks.push({ p: text, ...(b.drop ? { drop: true } : {}), ...(b.style ? { style: b.style } : {}) });
      } else if (b.kind === "v") {
        blocks.push({ v: b.stanzas.map((st) => st.map(tidy)) });
      } else if (b.kind === "img") {
        const img = await picture(b.ref, `ch${p.id}-${++inText}`, b.alt);
        if (img) blocks.push({ img });
      } else if (b.kind === "section") {
        blocks.push({ section: curl(b.text) });
      } else {
        blocks.push({ table: { head: b.head.map(tidy), rows: b.rows.map((r) => r.map(tidy)) } });
      }
    }
    const image = p.picture ? await picture(p.picture, `ch${p.id}`, p.pictureAlt) : null;
    writeFileSync(
      path.join(out, `${p.id}.json`),
      JSON.stringify({
        id: p.id,
        ...(p.label ? { label: p.label } : {}),
        ...(p.group ? { group: p.group } : {}),
        title: curl(p.title),
        ...(image ? { image } : {}),
        blocks,
      })
    );
    const count = blocks.reduce(
      (n, b) =>
        n +
        (b.p ? words(b.p) : b.v ? b.v.flat().reduce((m, line) => m + words(line), 0) : 0),
      0
    );
    contents.push({
      id: p.id,
      ...(p.label ? { label: p.label } : {}),
      ...(p.group ? { group: p.group } : {}),
      title: curl(p.title),
      words: count,
    });
  }

  const cover = await sharp(coverFile)
    .resize({ width: 720 })
    .webp({ quality: 78 })
    .toFile(path.join(out, "cover.webp"));
  // and as large as the edition has it, for the viewer: the shelf and the
  // book's page keep the small one
  const fullCover = await fullSize(coverFullFile ?? coverFile, "cover", cover.width, 88);

  writeFileSync(
    path.join(out, "book.json"),
    JSON.stringify({
      slug,
      title: title ?? slug,
      author: author ?? "",
      ...(bookPart ? { part: bookPart } : {}),
      cover: {
        src: "cover.webp",
        w: cover.width,
        h: cover.height,
        ...(fullCover ? { full: fullCover } : {}),
      },
      contents,
    })
  );
  return contents;
}
