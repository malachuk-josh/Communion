// A typeset PDF read back as positioned lines, for scripts/build-book.mjs.
//
// pdftohtml's XML gives every line with its position, font and <i>/<b>; a
// second pass with the images in says where each picture sits. The readers
// (read-prose.mjs, read-verse.mjs) turn these into parts and blocks.

import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * Every page's lines, top to bottom, without the page number; and the
 * illustration on each page that has one, as its box in the same units.
 */
export function readLayout(pdf, work) {
  execFileSync("pdftohtml", ["-xml", "-i", "-q", "-nodrm", pdf, path.join(work, "text")]);
  // a second pass with the images in, for nothing but where each picture sits
  execFileSync("pdftohtml", ["-xml", "-q", "-nodrm", pdf, path.join(work, "boxes")]);
  const xml = readFileSync(path.join(work, "text.xml"), "utf8");
  const boxXml = readFileSync(path.join(work, "boxes.xml"), "utf8");

  const fonts = {};
  for (const m of xml.matchAll(/<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"\/>/g)) {
    fonts[m[1]] = { size: +m[2], family: m[3], color: m[4] };
  }

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

  const pictures = {};
  for (const chunk of boxXml.split(/<page number="/).slice(1)) {
    const number = parseInt(chunk, 10);
    for (const m of chunk.matchAll(/<image top="(\d+)" left="(\d+)" width="(\d+)" height="(\d+)"/g)) {
      const [top, left, width, height] = m.slice(1).map(Number);
      // the parchment behind every page of a Parchment Edition fills it; the
      // pictures sit inside
      if (width >= 700) continue;
      pictures[number] = { top, bottom: top + height, left };
    }
  }

  return { pages, pictures };
}

export function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** A title set in the display face: a chapter's, a Book's, the appendix's. */
export const isTitle = (l) => /BaskOldFace/.test(l.font.family) && l.font.size >= 30 && l.font.size < 50;
