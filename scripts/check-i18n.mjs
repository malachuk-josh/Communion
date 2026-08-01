// Every string the app can say, it must be able to say in both languages.
//
// The type system very nearly catches this on its own — MessageKey is
// `keyof en`, so a key that only Spanish has is invisible and a key only
// English has is a type error at the call site. Two gaps let real bugs
// through anyway:
//
//   1. A key present in `en` and missing from `es` falls back to English at
//      runtime. Nothing fails; a Spanish reader simply meets an English
//      sentence in the middle of their app, which is the kind of thing nobody
//      reports and everybody notices.
//
//   2. `t(\`about.${key}\` as MessageKey)` — the tour builds its keys from a
//      list. The cast is load-bearing and it switches the checker off
//      completely, so a slide added without its strings renders the key
//      itself: the reader sees "about.tourReaderDesc" where a sentence goes.
//
// Run by `npm run check:i18n`, and by the build.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE = readFileSync(join(ROOT, "lib/i18n.tsx"), "utf8");

const problems = [];

/**
 * The keys of one dictionary, read from the source rather than by importing
 * it — lib/i18n.tsx is a client module with JSX in it, and this script should
 * not need a bundler to answer a question about a list of strings.
 */
function keysOf(lang) {
  const start = SOURCE.indexOf(`\n  ${lang}: {`);
  if (start === -1) throw new Error(`no ${lang} dictionary in lib/i18n.tsx`);
  const end = SOURCE.indexOf("\n  },", start);
  if (end === -1) throw new Error(`${lang} dictionary is not closed`);
  const body = SOURCE.slice(start, end);
  const keys = new Set();
  for (const m of body.matchAll(/^\s{4}"([^"]+)":/gm)) keys.add(m[1]);
  return keys;
}

const en = keysOf("en");
const es = keysOf("es");

for (const key of en) {
  if (!es.has(key)) problems.push(`missing from es: ${key}`);
}
for (const key of es) {
  if (!en.has(key)) problems.push(`in es but not en (unreachable): ${key}`);
}

// --- keys built at the call site, where the cast turns the checker off ------

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/**
 * The tour is the one place that composes keys, and it composes them from a
 * list right there in the file. Reading that list back is exact — no guessing
 * about what a template might expand to.
 */
const strip = readFileSync(join(ROOT, "components/TourStrip.tsx"), "utf8");
for (const m of strip.matchAll(/key:\s*"(\w+)"/g)) {
  for (const suffix of ["", "Desc"]) {
    const key = `about.${m[1]}${suffix}`;
    if (!en.has(key)) problems.push(`tour slide has no string: ${key}`);
  }
}

/*
 * The same trap, one file over, and it caught a real one.
 *
 * A plan card is drawn with t(`plan.${plan.id}`) — another computed key behind
 * another cast — so a plan added to the catalogue without its two strings
 * renders its own id at the reader: a card titled "plan.cominghome21" above a
 * line reading "plan.cominghome21.desc". That shipped, because this file knew
 * about the tour's composed keys and not the catalogue's.
 *
 * Read from the id declarations in lib/plans.ts, so a plan cannot be added
 * anywhere but the PLANS list and slip past.
 */
const catalogue = readFileSync(join(ROOT, "lib/plans.ts"), "utf8");
for (const m of catalogue.matchAll(/^\s*id:\s*"([\w-]+)",/gm)) {
  for (const suffix of ["", ".desc"]) {
    const key = `plan.${m[1]}${suffix}`;
    if (!en.has(key)) problems.push(`plan has no string: ${key}`);
  }
}

// Plain literal keys everywhere else. These are type-checked already, but the
// check costs nothing and catches a key deleted from the dictionary while a
// call site still asks for it through a cast.
for (const file of walk(join(ROOT, "app")).concat(
  walk(join(ROOT, "components")),
  walk(join(ROOT, "lib"))
)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bt\(\s*"([\w.]+)"/g)) {
    if (!en.has(m[1])) {
      problems.push(`${file.replace(ROOT, "")}: t("${m[1]}") has no string`);
    }
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`i18n ok — ${en.size} keys, en and es in step`);
