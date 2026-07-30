// Writes public/offline-manifest.json: what each offline tier contains and
// how big it is, read from what is actually on disk so the download screen
// can never promise a file that isn't there or misreport a size.
//
// Runs from `npm run prebuild`.

import { createHash } from "crypto";
import { readdirSync, statSync, writeFileSync, existsSync } from "fs";
import path from "path";

const PUBLIC = path.join(process.cwd(), "public");

/** Every file in public/<dir>, as URLs, with a total byte count. */
function listDir(dir, filter = () => true) {
  const full = path.join(PUBLIC, dir);
  if (!existsSync(full)) return { urls: [], bytes: 0 };
  let bytes = 0;
  const urls = readdirSync(full)
    .filter((f) => f.endsWith(".json") && filter(f))
    .sort()
    .map((f) => {
      bytes += statSync(path.join(full, f)).size;
      return `/${dir}/${f}`;
    });
  return { urls, bytes };
}

function merge(...parts) {
  return {
    urls: parts.flatMap((p) => p.urls),
    bytes: parts.reduce((s, p) => s + p.bytes, 0),
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
  listDir("redletter")
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

const tiers = {
  reading,
  study,
  ...Object.fromEntries(
    Object.entries(translations).map(([id, t]) => [`translation:${id}`, t])
  ),
};

// Every file's path and size. This moves only when the datasets themselves
// change, which is what the service worker keys its data cache on — code
// deploys must not cost anyone a re-download.
const dataStamp = createHash("sha256")
  .update(
    Object.values(tiers)
      .flatMap((t) => t.urls)
      .sort()
      .join("|") + Object.values(tiers).map((t) => t.bytes).join("|")
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
