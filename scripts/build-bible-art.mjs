// Writes the illustrated Bible: one picture for a scene, tied to the verse
// the scene begins on, for the reader to show in the text and for the
// gallery in Discover to gather into its stories.
//
//   node scripts/build-bible-art.mjs <masters dir>
//
// Reads the library's manifest from scripts/art/bible-manifest.json (a copy
// of the producer's manifest.json) and a master for each picture from
// <masters dir>/<ID>.webp (or .png, .jpg). Writes:
//
//   public/art/bible/<ID>-<hash>.webp       for the page, 960 wide
//   public/art/bible/full/<ID>-<hash>.webp  for zooming into, online only
//   public/art/bible.json                   what each is, where it begins,
//                                           and the stories it belongs to
//
// As with the study pictures (scripts/build-study-art.mjs), the hash in the
// name is the picture's own, and scripts/art/holds.json keeps out whatever
// the accuracy audit has an open "fix" or "redo" on, or has not yet seen.

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const ART = path.join(ROOT, "scripts", "art");
const OUT = path.join(ROOT, "public", "art", "bible");
const INDEX = path.join(ROOT, "public", "art", "bible.json");

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error("usage: node scripts/build-bible-art.mjs <masters dir>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(path.join(ART, "bible-manifest.json"), "utf8"));
const holds = JSON.parse(readFileSync(path.join(ART, "holds.json"), "utf8")).held ?? {};

const BOOKS = [...readFileSync(path.join(ROOT, "lib", "bible.ts"), "utf8").matchAll(
  /\{ nr: (\d+), en: "([^"]+)"/g
)].map(([, nr, en]) => ({ nr: Number(nr), en }));
const bookNr = (name) => {
  const b = BOOKS.find((b) => b.en === name);
  if (!b) throw new Error(`unknown book: ${name}`);
  return b.nr;
};

const hash8 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);
const clean = (s) => (s ?? "").replace(/\s+/g, " ").replace(/'(?=[a-z])/g, "’").trim();

function masterFor(id) {
  for (const ext of ["webp", "png", "jpg"]) {
    const file = path.join(src, `${id}.${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "full"), { recursive: true });

const items = {};
const chapters = {};
const stories = {};
const skipped = [];

for (const a of manifest.assets) {
  if (holds[a.id]) { skipped.push(`${a.id} (held: ${holds[a.id]})`); continue; }
  const file = masterFor(a.id);
  if (!file) { skipped.push(`${a.id} (no master file)`); continue; }
  const buf = readFileSync(file);
  const name = `${a.id}-${hash8(buf)}.webp`;
  const meta = await sharp(buf).metadata();
  await sharp(buf).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(OUT, name));
  await sharp(buf).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(OUT, "full", name));

  const p = a.passage;
  const b = bookNr(a.book_name);
  items[a.id] = {
    title: clean(a.title),
    ref: clean(a.reference),
    b,
    c: p.chapter_start,
    v: p.verse_start,
    kind: a.depiction_kind,
    alt: clean(a.alt_text || a.title),
    note: clean(a.depiction_note),
    src: `/art/bible/${name}`,
    full: `/art/bible/full/${name}`,
    w: meta.width,
    h: meta.height,
  };
  // the reader shows a picture where its scene begins
  (chapters[`${b}:${p.chapter_start}`] ??= []).push([a.id, p.verse_start]);
  // and the gallery gathers it into its stories, in their own order
  for (const theme of a.themes ?? []) {
    (stories[theme] ??= []).push({
      id: a.id,
      section: a.theme_sections?.[theme] ?? "",
      n: a.theme_sequence?.[theme] ?? a.sequence,
    });
  }
}

for (const list of Object.values(chapters)) list.sort((x, y) => x[1] - y[1]);

// Stories in the order the Bible tells them: by where their first picture is.
const first = (theme) =>
  Math.min(...stories[theme].map((s) => items[s.id].b * 1e6 + items[s.id].c * 1e3 + items[s.id].v));
const storyList = Object.keys(stories)
  .sort((x, y) => first(x) - first(y))
  .map((theme) => {
    const list = stories[theme].sort((x, y) => x.n - y.n);
    // a story told in one run has no sections worth a heading
    const sections = new Set(list.map((s) => s.section));
    const named = sections.size > 1;
    return {
      id: theme,
      cover: list[0].id,
      parts: list.map((s) => (named ? [s.id, s.section] : [s.id])),
    };
  });

writeFileSync(
  INDEX,
  JSON.stringify({
    note: "AI-generated illustrations, made to follow the King James text; artistic interpretations, not historical records.",
    items,
    chapters,
    stories: storyList,
  })
);

const size = (dir) => readdirSync(dir).reduce((n, f) => (f === "full" ? n : n + readFileSync(path.join(dir, f)).length), 0);
console.log(
  `${Object.keys(items).length} written, ${Object.keys(chapters).length} chapters, ${storyList.length} stories, ` +
  `${(size(OUT) / 1e6).toFixed(1)} MB for the page + ${(size(path.join(OUT, "full")) / 1e6).toFixed(1)} MB full`
);
if (skipped.length) console.log(`left out (${skipped.length}):\n  ` + skipped.join("\n  "));
