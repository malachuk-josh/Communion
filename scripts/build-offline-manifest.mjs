// Writes public/offline-manifest.json: what each offline tier contains and
// how big it is, read from what is actually on disk so the download screen
// can never promise a file that isn't there or misreport a size.
//
// Runs from `npm run prebuild`.

import { createHash } from "crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "fs";
import path from "path";

const PUBLIC = path.join(process.cwd(), "public");

/**
 * What a file says, in sixteen hex characters.
 *
 * The service worker hashes what it holds the same way, so the two can be
 * compared file by file: a phone keeps every file whose hash still matches
 * and replaces only the ones that changed. Sixty-four bits, because the only
 * comparison ever made is one file against its own earlier self.
 */
function hashOf(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
}

/**
 * Every file in public/<dir>, as URLs, with a total byte count and each
 * file's hash. The hashes are a list in the same order as the URLs rather than
 * a map keyed by them, which would spell out all 800 paths a second time.
 */
function listDir(dir, filter = () => true) {
  const full = path.join(PUBLIC, dir);
  if (!existsSync(full)) return { urls: [], bytes: 0, hashes: [] };
  let bytes = 0;
  const hashes = [];
  const urls = readdirSync(full)
    .filter((f) => f.endsWith(".json") && filter(f))
    .sort()
    .map((f) => {
      const file = path.join(full, f);
      bytes += statSync(file).size;
      hashes.push(hashOf(file));
      return `/${dir}/${f}`;
    });
  return { urls, bytes, hashes };
}

function merge(...parts) {
  return {
    urls: parts.flatMap((p) => p.urls),
    bytes: parts.reduce((s, p) => s + p.bytes, 0),
    hashes: parts.flatMap((p) => p.hashes),
  };
}

const reading = merge(
  listDir("bible/kjv"),
  listDir("headings"),
  listDir("paragraphs"),
  listDir("context"),
  listDir("xref"),
  // where Christ speaks — nine books and 33 KB, and it belongs with reading
  // rather than study: it is a printing convention, not an apparatus
  listDir("redletter"),
  // the chapter maps, base windows and all: a third of a megabyte for the
  // whole Bible, which is small enough that carving it into a tier of its own
  // would cost the reader more thought than the download costs bytes
  listDir("maps"),
  listDir("maps/base")
);

const translations = {
  valera: listDir("bible/valera"),
};

const study = merge(
  listDir("bible/lxx"),
  listDir("strongs"),
  // what lets a translation nobody has tagged be read word by word
  listDir("gloss"),
  listDir("lexicon"),
  listDir("concordance"),
  listDir("absmith"),
  listDir("bdb")
);

/*
 * Matthew Henry, on his own.
 *
 * Not folded into the study tier, because it is not the same kind of thing:
 * everything in there tells you what a word is, and this tells you what a
 * man thought a passage meant. Somebody may well want the lexicon and not
 * the commentary, or the commentary and none of the Greek. Five megabytes is
 * also enough to be worth its own yes.
 */
const commentary = merge(
  listDir("commentary"),
  // Spurgeon rides with Henry rather than in a tier of his own: the panel
  // shows the two of them together, and half a panel is a worse thing to
  // download than a slightly larger one.
  listDir("treasury"),
  // and Morning and Evening with them, for the same reason: it is one more
  // year of Spurgeon's prose, and the plan that uses it is walked a day at a
  // time in exactly the places a reader has no signal.
  listDir("devotional")
);

const tiers = {
  reading,
  study,
  commentary,
  ...Object.fromEntries(
    Object.entries(translations).map(([id, t]) => [`translation:${id}`, t])
  ),
};

// Every file's path and contents. This moves only when the datasets
// themselves change — code deploys must not cost anyone a re-download — and
// it moves for ANY change to them, which the old stamp of paths and sizes did
// not: a corrected file that came out the same length was invisible to it.
// The service worker reads it as "something here changed", and the hashes
// above tell it what.
const dataStamp = createHash("sha256")
  .update(
    Object.values(tiers)
      .flatMap((t) => t.urls.map((url, i) => `${url}=${t.hashes[i]}`))
      .sort()
      .join("|")
  )
  .digest("hex")
  .slice(0, 12);

const manifest = {
  // full timestamp: the service worker uses this to tell builds apart
  built: new Date().toISOString(),
  dataStamp,
  tiers,
};

writeFileSync(
  path.join(PUBLIC, "offline-manifest.json"),
  JSON.stringify(manifest)
);

const mb = (b) => (b / 1048576).toFixed(1);
console.log("offline manifest:");
for (const [name, tier] of Object.entries(manifest.tiers)) {
  console.log(`  ${name.padEnd(20)} ${String(tier.urls.length).padStart(4)} files  ${mb(tier.bytes).padStart(6)} MB`);
}
const total = Object.values(manifest.tiers).reduce((s, t) => s + t.bytes, 0);
console.log(`  ${"TOTAL".padEnd(20)} ${String(Object.values(manifest.tiers).reduce((s,t)=>s+t.urls.length,0)).padStart(4)} files  ${mb(total).padStart(6)} MB`);
