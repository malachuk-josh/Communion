// What the readers found, written out for the Bookshelf, for
// scripts/build-book.mjs: one JSON file per part, the pictures at a size a
// phone wants, the cover, and book.json with the contents.
//
// Nothing is reworded. Straight quotes become curly ones, which is the one
// change to the characters: the PDF's font drew them straight, and the
// reader's font draws them properly.

import { execFileSync } from "child_process";
import { readdirSync, writeFileSync } from "fs";
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

const words = (s) => s.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;

// ---- writing it ------------------------------------------------------------

/**
 * `parts` as the readers build them: an id, a title, perhaps a label and the
 * page of the picture that heads it, and blocks of kind "p" (with `drop` or a
 * `style`), "v" (stanzas of lines), "table", "img" (a picture in the text, by
 * its page) and "section" (a heading inside the part, such as its notes').
 */
export async function writeBook({ pdf, slug, out, work, parts, bookPart }) {
  execFileSync("pdfimages", ["-j", "-p", pdf, path.join(work, "img")]);
  const extracted = readdirSync(work).filter((f) => /^img-\d+-\d+\.(jpg|ppm|png)$/.test(f));

  async function picture(pageNumber, name) {
    // the page's picture is its largest image that is not the parchment behind it
    const candidates = await Promise.all(
      extracted
        .filter((f) => Number(f.split("-")[1]) === pageNumber)
        .map(async (f) => ({ f, meta: await sharp(path.join(work, f)).metadata() }))
    );
    const pick = candidates
      .filter(({ meta }) => !(meta.width === 1008 && meta.height === 1440))
      .sort((a, b) => b.meta.width * b.meta.height - a.meta.width * a.meta.height)[0];
    if (!pick) return null;
    const file = `${name}.webp`;
    const info = await sharp(path.join(work, pick.f))
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 74 })
      .toFile(path.join(out, file));
    return { src: file, w: info.width, h: info.height };
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
        const img = await picture(b.page, `ch${p.id}-${++inText}`);
        if (img) blocks.push({ img });
      } else if (b.kind === "section") {
        blocks.push({ section: curl(b.text) });
      } else {
        blocks.push({ table: { head: b.head.map(tidy), rows: b.rows.map((r) => r.map(tidy)) } });
      }
    }
    const image = p.picturePage ? await picture(p.picturePage, `ch${p.id}`) : null;
    writeFileSync(
      path.join(out, `${p.id}.json`),
      JSON.stringify({
        id: p.id,
        ...(p.label ? { label: p.label } : {}),
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
    contents.push({ id: p.id, ...(p.label ? { label: p.label } : {}), title: curl(p.title), words: count });
  }

  // the cover is the whole first page — the picture with its lettering on it
  execFileSync("pdftoppm", ["-r", "150", "-png", "-f", "1", "-l", "1", "-singlefile", pdf, path.join(work, "cover")]);
  const cover = await sharp(path.join(work, "cover.png"))
    .resize({ width: 720 })
    .webp({ quality: 78 })
    .toFile(path.join(out, "cover.webp"));

  const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
  const meta = (key) => (info.match(new RegExp(`^${key}:\\s+(.*)$`, "m")) || [])[1]?.trim();

  writeFileSync(
    path.join(out, "book.json"),
    JSON.stringify({
      slug,
      title: meta("Title")?.replace(/ — .*$/, "") ?? slug,
      author: meta("Author") ?? "",
      ...(bookPart ? { part: bookPart } : {}),
      cover: { src: "cover.webp", w: cover.width, h: cover.height },
      contents,
    })
  );
  return contents;
}
