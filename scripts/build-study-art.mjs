// Writes the study pictures for the reader's Context panel: the Tabernacle and
// Temple reconstructions and diagrams, and the daily-life pictures of the
// Bible world, each tied to the chapters it illustrates.
//
//   node scripts/build-study-art.mjs <masters dir>
//
// Reads the libraries' manifests from scripts/art/ (copies of the producer's
// architecture-manifest.json and world-manifest.json) and the master files
// from <masters dir>: <ID>.png (or .webp, .jpg, .svg) for each picture and
// diagrams/<name>.svg for each diagram. Writes:
//
//   public/art/study/<ID>-<hash>.webp       for the page, 960 wide
//   public/art/study/full/<ID>-<hash>.webp  for zooming into, online only
//   public/art/study/<name>-<hash>.svg      the diagrams, one copy
//   public/art/study.json                   what each is and where it belongs
//
// The hash in each file name is the picture's own, so a replaced picture is a
// new address and a phone that cached the old one is never shown it again.
//
// Only what the audits have passed is written. scripts/art/holds.json names
// the pictures with an open "fix" or "redo"; they stay out until a corrected
// version is audited and its entry removed. A picture the libraries mark as
// anything other than "included", and the maps (the reader has its own),
// stay out too.

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const ART = path.join(ROOT, "scripts", "art");
const OUT = path.join(ROOT, "public", "art", "study");
const INDEX = path.join(ROOT, "public", "art", "study.json");

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error("usage: node scripts/build-study-art.mjs <masters dir>");
  process.exit(1);
}

const arch = JSON.parse(readFileSync(path.join(ART, "architecture-manifest.json"), "utf8"));
const world = JSON.parse(readFileSync(path.join(ART, "world-manifest.json"), "utf8"));
const holds = JSON.parse(readFileSync(path.join(ART, "holds.json"), "utf8")).held ?? {};

// ---- references to chapters -------------------------------------------------

const BOOKS = [...readFileSync(path.join(ROOT, "lib", "bible.ts"), "utf8").matchAll(
  /\{ nr: (\d+), en: "([^"]+)"/g
)].map(([, nr, en]) => ({ nr: Number(nr), en }));
const bookNr = (name) => {
  const b = BOOKS.find((b) => b.en === name) ?? BOOKS.find((b) => b.en === name.replace(/^Psalm$/, "Psalms"));
  if (!b) throw new Error(`unknown book: ${name}`);
  return b.nr;
};

/**
 * "Exodus 26:1-37" → ["2:26"]; "Exodus 25:10-27:21" → ["2:25", "2:26", "2:27"];
 * "Ruth 3" → ["8:3"]. Every chapter a reference touches, as "book:chapter".
 */
function chaptersOf(ref) {
  const m = ref.trim().match(/^(.+?) (\d+)(:\d+)?(?:[-–](\d+)(:\d+)?)?$/);
  if (!m) throw new Error(`unreadable reference: ${ref}`);
  const nr = bookNr(m[1]);
  const from = Number(m[2]);
  // After a dash: "26:1-37" is verses, "25:10-27:21" and "25-27" are chapters.
  const to = m[4] && (m[5] || !m[3]) ? Number(m[4]) : from;
  const out = [];
  for (let c = from; c <= to; c++) out.push(`${nr}:${c}`);
  return out;
}

// ---- the files ----------------------------------------------------------------

const hash8 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);

function masterFor(id) {
  for (const ext of ["png", "webp", "jpg", "svg"]) {
    const file = path.join(src, `${id}.${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "full"), { recursive: true });

/** Writes one picture's two sizes, or a vector drawing once; returns its addresses. */
async function writePicture(id, file) {
  const buf = readFileSync(file);
  const h = hash8(buf);
  if (file.endsWith(".svg")) {
    const name = `${id}-${h}.svg`;
    writeFileSync(path.join(OUT, name), buf);
    const meta = await sharp(buf).metadata();
    return { src: `/art/study/${name}`, full: `/art/study/${name}`, w: meta.width, h: meta.height };
  }
  const name = `${id}-${h}.webp`;
  const img = sharp(buf);
  const meta = await img.metadata();
  await sharp(buf).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(OUT, name));
  await sharp(buf).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(OUT, "full", name));
  return { src: `/art/study/${name}`, full: `/art/study/full/${name}`, w: meta.width, h: meta.height };
}

const clean = (s) => (s ?? "").replace(/\s+/g, " ").replace(/'(?=[a-z])/g, "’").trim();
const sourcesOf = (a) =>
  (a.sources ?? [])
    .filter((s) => s.url)
    .map((s) => ({ t: clean(s.title), u: s.url }));

const items = [];
const chapters = {};
const place = (key, id) => {
  (chapters[key] ??= []);
  if (!chapters[key].includes(id)) chapters[key].push(id);
};
const skipped = [];

for (const [set, manifest] of [["architecture", arch], ["world", world]]) {
  for (const a of manifest.assets) {
    if (a.kind === "cartographic_study") continue;
    if (a.status !== "included") { skipped.push(`${a.id} (status ${a.status})`); continue; }
    if (holds[a.id]) { skipped.push(`${a.id} (held: ${holds[a.id]})`); continue; }
    const file = masterFor(a.id);
    if (!file) { skipped.push(`${a.id} (no master file)`); continue; }
    const pic = await writePicture(a.id, file);
    const refs = a.kjv_passages ?? [];
    items.push({
      id: a.id,
      set,
      type: file.endsWith(".svg") ? "drawing" : "picture",
      title: clean(a.title),
      refs,
      period: clean(a.period),
      note: clean(a.required_display_note),
      alt: clean(a.alt_text || a.title),
      sources: sourcesOf(a),
      ...pic,
    });
    for (const ref of refs) for (const key of chaptersOf(ref)) place(key, a.id);
  }
}

// A diagram belongs where its own sources put it. One drawn from Middot or
// Josephus rather than a chapter of the Bible goes wherever the pictures that
// cite it do, held pictures included: a plan is no less right for a picture
// of the same building being redrawn.
const diagramChapters = {};
for (const a of arch.assets) {
  for (const d of a.diagrams ?? []) {
    for (const ref of a.kjv_passages ?? []) for (const key of chaptersOf(ref)) {
      // a picture of Herod's Temple may cite Exodus for where the lampstand
      // stands, but a plan of Herod's Temple does not belong in Exodus
      if (a.group === "Herodian Temple" && Number(key.split(":")[0]) <= 39) continue;
      (diagramChapters[d] ??= new Set()).add(key);
    }
  }
}
for (const d of arch.diagrams ?? []) {
  const name = path.basename(d.path, ".svg");
  if (holds[d.id]) { skipped.push(`${d.id} (held: ${holds[d.id]})`); continue; }
  const file = path.join(src, "diagrams", `${name}.svg`);
  if (!existsSync(file)) { skipped.push(`${d.id} (no master file)`); continue; }
  const pic = await writePicture(name, file);
  // where the diagram's own sources put it: "Exodus 26 KJV" is Exodus 26
  const own = (d.sources ?? [])
    .map((x) => (x.title ?? "").match(/^(.+) (\d+) KJV$/))
    .filter(Boolean)
    .flatMap(([, book, ch]) => chaptersOf(`${book} ${ch}`));
  items.push({
    id: d.id,
    set: "architecture",
    type: "diagram",
    title: clean(d.title),
    refs: [],
    period: "",
    note: clean(d.note),
    alt: clean(d.title),
    sources: sourcesOf(d),
    ...pic,
  });
  // and, for one whose sources are not the Bible (Middot, Josephus), the
  // chapters of the pictures that cite it
  for (const key of own.length ? own : [...(diagramChapters[name] ?? [])]) place(key, d.id);
}

// within a chapter: pictures in the libraries' own order, then the drawings
const order = new Map(items.map((it, i) => [it.id, (it.type === "diagram" ? 1000 : 0) + i]));
for (const key of Object.keys(chapters)) chapters[key].sort((a, b) => order.get(a) - order.get(b));

writeFileSync(
  INDEX,
  JSON.stringify({
    // what a reader is told every one of these is
    note: "Study reconstructions: AI-generated from the sources listed, not recovered originals.",
    items: Object.fromEntries(items.map(({ id, ...rest }) => [id, rest])),
    chapters: Object.fromEntries(
      Object.entries(chapters).sort(([a], [b]) => {
        const [ab, ac] = a.split(":").map(Number);
        const [bb, bc] = b.split(":").map(Number);
        return ab - bb || ac - bc;
      })
    ),
  })
);

const bytes = (dir) => readdirSync(dir).reduce((n, f) => {
  const p = path.join(dir, f);
  return n + (f === "full" ? 0 : readFileSync(p).length);
}, 0);
console.log(
  `${items.length} written (${items.filter((i) => i.type === "diagram").length} diagrams), ` +
  `${Object.keys(chapters).length} chapters, ` +
  `${(bytes(OUT) / 1e6).toFixed(1)} MB for the page + ${(bytes(path.join(OUT, "full")) / 1e6).toFixed(1)} MB full`
);
if (skipped.length) console.log("left out:\n  " + skipped.join("\n  "));
