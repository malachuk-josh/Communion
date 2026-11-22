// The era maps' story, drawn: public/maps/era-story.json, for the Maps tab's
// era maps (components/AtlasMap.tsx).
//
// scripts/era-story.mjs says it in longitude and latitude and by place name;
// this sets it down on the window each era is drawn on (public/maps/atlas.json
// says which), in that window's own units, so the app only has to draw it:
//
//   lands     each realm's outline as a path, and where its name is written
//   show      the realms the map opens with
//   keep      the era's own region names still written alongside them
//   journeys  the era's journeys, taken from their own windows onto this one
//   passages  for each passage on the era's card (lib/mapRefs.ts), the places
//             it names: those the chapter's map puts at those verses, and any
//             scripts/era-story.mjs adds
//   steps     "Play this era": caption, verse, places, ways travelled, realms
//
// Everything is checked on the way: a place the window does not have, a name
// it has twice and was not told which, a journey or a realm that does not
// exist, a verse that one of the two Bibles does not number alike — any of
// them stops the build rather than drawing a map that is quietly wrong.
//
//   node scripts/build-era-story.mjs
//
// Reads lib/mapRefs.ts as it is: Node 22.18 and later read TypeScript.
// Output committed.

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { ERA_REFS } from "../lib/mapRefs.ts";
import { KEEP, LANDS, PASSAGE_PLACES, SHOW, STORY } from "./era-story.mjs";

const ROOT = process.cwd();
const MAPS = path.join(ROOT, "public", "maps");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const atlas = read(path.join(MAPS, "atlas.json"));
const eras = read(path.join(MAPS, "eras.json"));

const problems = [];
const fail = (msg) => problems.push(msg);

// ---- the windows --------------------------------------------------------

const bases = new Map();
function base(id) {
  if (!bases.has(id)) bases.set(id, read(path.join(MAPS, "base", `${id}.json`)));
  return bases.get(id);
}

/** components/ChapterMap's projection, both ways. */
function projection(b) {
  const [w, s, e, n] = b.bounds;
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const scale = b.width / ((e - w) * kx);
  return {
    to: ([lon, lat]) => [(lon - w) * kx * scale, (n - lat) * scale],
    from: ([x, y]) => [x / (kx * scale) + w, n - y / scale],
  };
}

const r1 = (v) => Math.round(v * 10) / 10;
const pt = ([x, y]) => [r1(x), r1(y)];
const inside = (b, [x, y], pad = 0) => x >= -pad && y >= -pad && x <= b.width + pad && y <= b.height + pad;

const KIND = ["region", "settlement", "mountain"];

/** A place by name ("Bethel", "Bethel#a64f355") on a window. */
function place(b, spec, where) {
  const [name, id] = spec.split("#");
  const hits = b.sites.filter((s) => (id ? s[5] === id : s[0].toLowerCase() === name.toLowerCase()));
  if (hits.length === 0) {
    fail(`${where}: no "${spec}" on the ${b.id} map`);
    return null;
  }
  if (hits.length > 1) {
    fail(`${where}: "${spec}" is on the ${b.id} map ${hits.length} times — say which: ${hits.map((h) => `${h[0]}#${h[5]}`).join(", ")}`);
    return null;
  }
  const [n, x, y, , mark, sid] = hits[0];
  return { n, x: r1(x), y: r1(y), t: KIND[mark] ?? "settlement", ...(sid ? { id: sid } : {}) };
}

/** A point on the way: a place's name, or [lon, lat]. */
function waypoint(b, spec, where) {
  if (Array.isArray(spec)) return projection(b).to(spec);
  const p = place(b, spec, where);
  return p ? [p.x, p.y] : null;
}

/**
 * A way through its points, drawn as a road would be rather than a ruler:
 * through three or more on a smooth curve, and between two on a gentle bow,
 * so that an arrow out and an arrow back do not lie on top of each other.
 */
function smooth(points) {
  if (points.length < 2) return points;
  if (points.length === 2) {
    const [[ax, ay], [bx, by]] = points;
    const len = Math.hypot(bx - ax, by - ay);
    const cx = (ax + bx) / 2 - ((by - ay) / (len || 1)) * len * 0.14;
    const cy = (ay + by) / 2 + ((bx - ax) / (len || 1)) * len * 0.14;
    const out = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      out.push([
        (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t ** 2 * bx,
        (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t ** 2 * by,
      ]);
    }
    return out;
  }
  // Catmull–Rom through every point
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((d) =>
        0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)
      ));
    }
  }
  return out;
}

/** A journey's legs, from its own window onto this one. */
function journeyLegs(b, id, from, to, where) {
  const j = atlas.journeys.find((x) => x.id === id);
  if (!j) {
    fail(`${where}: no journey "${id}"`);
    return [];
  }
  const own = projection(base(j.base));
  const here = projection(b);
  const first = from ?? 0;
  const last = to ?? j.legs.length - 1;
  if (first < 0 || last >= j.legs.length || first > last) {
    fail(`${where}: journey "${id}" has legs 0–${j.legs.length - 1}, not ${first}–${last}`);
    return [];
  }
  return j.legs.slice(first, last + 1).map((leg) => ({
    p: leg.p.map((q) => pt(here.to(own.from(q)))),
    ...(leg.sea ? { sea: 1 } : {}),
  }));
}

/**
 * The ways travelled at a step: lists of points, drawn here; or legs of one
 * of the era's own journeys, which the map already has, named rather than
 * copied — { j, a, b }, legs a to b.
 */
function ways(b, go, journeys, where) {
  const out = [];
  for (const g of go ?? []) {
    if (g && !Array.isArray(g) && g.j) {
      const j = journeys.find((x) => x.id === g.j);
      if (!j) {
        fail(`${where}: journey "${g.j}" is not one of this era's`);
        continue;
      }
      const a = g.from ?? 0;
      const z = g.to ?? j.legs.length - 1;
      if (a < 0 || z >= j.legs.length || a > z) fail(`${where}: journey "${g.j}" has legs 0–${j.legs.length - 1}, not ${a}–${z}`);
      out.push({ j: g.j, a, b: z });
      continue;
    }
    const list = Array.isArray(g) ? g : g.p;
    const points = list.map((s) => waypoint(b, s, where)).filter(Boolean);
    if (points.length !== list.length) continue;
    out.push({ p: smooth(points).map(pt), ...(g.sea ? { sea: 1 } : {}) });
  }
  return out;
}

// ---- the two Bibles -----------------------------------------------------

/**
 * Passages in a chapter the two Bibles number differently, read side by side
 * and found to be the same words: the difference is at the other end of the
 * chapter (1 Samuel 23 ends a verse early; Acts 19 joins its last two).
 */
const READ_ALIKE = new Set(["9.23.14", "44.20.31"]);

const bibles = { kjv: new Map(), valera: new Map() };
function verses(tr, b, c) {
  if (!bibles[tr].has(b)) bibles[tr].set(b, read(path.join(ROOT, "public", "bible", tr, `${b}.json`)));
  return bibles[tr].get(b)[String(c)] ?? null;
}
/** The passage in both, or a complaint; the King James words, to read over. */
function checkRef(ref, where) {
  const [b, c, v, last] = ref;
  const want = [];
  for (let n = v; n <= (last ?? v); n++) want.push(n);
  let words = "";
  for (const tr of ["kjv", "valera"]) {
    const ch = verses(tr, b, c);
    if (!ch) {
      fail(`${where}: ${tr} has no chapter ${b} ${c}`);
      continue;
    }
    const have = new Map(ch.map(([n, t]) => [n, t]));
    const missing = want.filter((n) => !have.has(n));
    if (missing.length) fail(`${where}: ${tr} ${b} ${c} has no verse ${missing.join(", ")}`);
    if (tr === "kjv") words = want.map((n) => have.get(n)).join(" ");
  }
  // Where the two count a chapter's verses differently — here or in the
  // chapter before, whose last verses may have become this one's first —
  // the same numbers may not be the same words: the Reina-Valera follows the
  // Hebrew numbering in places (1 Samuel 24, Numbers 13). Choose another, or,
  // having read the two side by side, list it in READ_ALIKE.
  if (READ_ALIKE.has(`${b}.${c}.${v}`)) return words;
  for (const ch of [c - 1, c]) {
    if (ch < 1) continue;
    const k = verses("kjv", b, ch);
    const r = verses("valera", b, ch);
    if (k && r && k.length !== r.length) {
      fail(`${where}: ${b} ${ch} has ${k.length} verses in the KJV and ${r.length} in the Reina-Valera — they may not be the same words`);
    }
  }
  return words;
}

// ---- each era -------------------------------------------------------------

const out = { v: 1, eras: {} };
const reading = [];
for (const era of Object.keys(eras)) {
  const windowId = atlas.eras.find((e) => e.id === era)?.base;
  if (!windowId) {
    fail(`${era}: atlas.json has no window for it`);
    continue;
  }
  const b = base(windowId);
  const proj = projection(b);
  const where = (what) => `${era} ${what}`;

  // the realms
  const lands = [];
  const ids = new Set();
  for (const land of LANDS[era] ?? []) {
    if (ids.has(land.id)) fail(where(`realm "${land.id}" twice`));
    ids.add(land.id);
    if (!(land.tone >= 0 && land.tone <= 7)) fail(where(`realm "${land.id}" tone ${land.tone}`));
    if ((land.en && !land.es) || (!land.en && land.es)) fail(where(`realm "${land.id}" needs a name in both languages`));
    const d = land.ll.map((q, i) => `${i ? "L" : "M"}${pt(proj.to(q)).join(" ")}`).join("") + "Z";
    const label = land.at ? pt(proj.to(land.at)) : null;
    if (label && !inside(b, label)) fail(where(`realm "${land.id}" has its name off the map`));
    lands.push({
      id: land.id,
      tone: land.tone,
      ...(land.sub ? { sub: 1 } : {}),
      d,
      ...(land.en && label ? { en: land.en, es: land.es, x: label[0], y: label[1] } : {}),
    });
  }
  const realm = (id, what) => {
    if (!ids.has(id)) fail(where(`${what}: no realm "${id}"`));
  };
  for (const id of SHOW[era] ?? []) realm(id, "shown");
  for (const name of KEEP[era] ?? []) {
    if (!eras[era].regions.some((r) => r.en === name)) fail(where(`keeps "${name}", which eras.json does not name`));
  }

  // the era's journeys, faint under everything until one is chosen
  const journeys = atlas.journeys
    .filter((j) => j.era === era)
    .map((j) => ({ id: j.id, legs: journeyLegs(b, j.id, undefined, undefined, where(`journey ${j.id}`)) }));

  // the card's passages, and where each happened
  const passages = (ERA_REFS[era] ?? []).map(([bk, c, v, last]) => {
    const key = `${bk}.${c}.${v}`;
    checkRef([bk, c, v, last], where(`passage ${key}`));
    const found = [];
    const add = (p) => {
      if (!p || !inside(b, [p.x, p.y])) return;
      if (found.some((f) => (f.id && f.id === p.id) || f.n === p.n)) return;
      found.push(p);
    };
    let book = null;
    try {
      book = read(path.join(MAPS, `${bk}.json`));
    } catch {
      // a book with no maps at all: only the places written in by hand
    }
    const row = book?.[String(c)];
    if (row?.places) {
      const own = projection(base(row.base));
      for (const p of row.places) {
        if (!(p.v >= v && p.v <= (last ?? v))) continue;
        const site = p.id ? b.sites.find((s) => s[5] === p.id) : null;
        if (site) add({ n: site[0], x: r1(site[1]), y: r1(site[2]), t: KIND[site[4]] ?? p.t, id: site[5] });
        else {
          const [x, y] = pt(proj.to(own.from([p.x, p.y])));
          add({ n: p.n, x, y, t: p.t, ...(p.id ? { id: p.id } : {}) });
        }
      }
    }
    for (const spec of PASSAGE_PLACES[key] ?? []) add(place(b, spec, where(`passage ${key}`)));
    if (found.length === 0) fail(where(`passage ${key} lights nothing`));
    return found;
  });
  for (const key of Object.keys(PASSAGE_PLACES)) {
    const known = Object.values(ERA_REFS).some((refs) => refs.some(([bk, c, v]) => `${bk}.${c}.${v}` === key));
    if (!known) fail(`PASSAGE_PLACES "${key}" is no passage on any era's card`);
  }

  // the story
  const steps = (STORY[era] ?? []).map((s, i) => {
    const at = where(`step ${i + 1}`);
    if (!s.en || !s.es) fail(`${at}: needs a caption in both languages`);
    if (s.date && !(Array.isArray(s.date) && s.date.length === 2)) fail(`${at}: date is [en, es]`);
    const words = checkRef(s.ref, at);
    reading.push(`${at} ${s.ref.join(".")}: ${words.slice(0, 160)}`);
    for (const id of s.lands ?? []) realm(id, `step ${i + 1} lands`);
    for (const id of s.glow ?? []) realm(id, `step ${i + 1} glow`);
    const places = s.places.map((spec) => place(b, spec, at)).filter(Boolean);
    return {
      ...(s.date ? { date: s.date } : {}),
      en: s.en,
      es: s.es,
      ref: s.ref,
      places,
      ...(s.go ? { go: ways(b, s.go, journeys, at) } : {}),
      ...(s.lands ? { lands: s.lands } : {}),
      ...(s.glow ? { glow: s.glow } : {}),
    };
  });
  if (steps.length < 4) fail(where(`has ${steps.length} steps`));

  out.eras[era] = {
    lands,
    show: SHOW[era] ?? [],
    keep: KEEP[era] ?? [],
    journeys,
    passages,
    steps,
  };
}

if (process.argv.includes("--read")) console.log(reading.join("\n"));
if (problems.length) {
  console.error(`era-story: ${problems.length} problem${problems.length > 1 ? "s" : ""}\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
const file = path.join(MAPS, "era-story.json");
writeFileSync(file, JSON.stringify(out));
const size = (JSON.stringify(out).length / 1024).toFixed(1);
const counts = Object.entries(out.eras).map(([e, d]) => `${e} ${d.steps.length}/${d.lands.length}/${d.journeys.length}`).join(", ");
console.log(`era-story.json ${size} KB — steps/realms/journeys: ${counts}`);
