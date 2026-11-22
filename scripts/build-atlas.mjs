// The atlas: an index of the maps, for the Maps tab (components/Atlas.tsx).
//
// The chapter maps answer "where did this chapter happen", and are filed by
// chapter. The Maps tab asks the questions the other way round — which
// journeys are there, where is Bethel, what did Canaan look like under the
// judges, which chapters have a map at all — and none of those can be
// answered without opening all sixty-one book files. So this reads them once,
// here, and writes the answers down.
//
// It reads only what scripts/build-maps.mjs has already written to
// public/maps/, and the journeys' own list (scripts/map-journeys.mjs). It
// needs neither Natural Earth nor OpenBible's data, so it can be run anywhere
// the repository is. Run it after build-maps.mjs; output committed.
//
//   node scripts/build-atlas.mjs
//
// Writes public/maps/atlas.json:
//
//   windows   the six base windows, tightest first
//   journeys  each journey whole: every leg and stop, on the tightest window
//             that holds all of it, with its visits named in order and, where
//             the gazetteer has the place, the id its card is filed under
//   eras      each era and the window it is drawn on
//   books     the chapters that have a map, by book
//   where     for every place, the tightest window that holds it
//
// A journey has to be drawn again rather than borrowed from a chapter. Every
// chapter of a journey carries the legs told so far, and the last carries all
// of them — but on the window that suits that chapter: Genesis 22 is drawn on
// the Levant, and Abraham set out from Ur, most of three windows to the east.
// The points are stored unclipped, in that chapter's window's own units, so
// they are taken back to longitude and latitude and set down again on a
// window wide enough for the whole road.

import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { JOURNEYS } from "./map-journeys.mjs";

const MAPS = path.join(process.cwd(), "public", "maps");
const read = (file) => JSON.parse(readFileSync(path.join(MAPS, file), "utf8"));

/** Tightest first: a place or a journey takes the first that holds it. */
const WINDOWS = ["levant", "asia-minor", "egypt-sinai", "near-east", "mediterranean", "world"];

/**
 * The window each era is drawn on: the one its title describes, which is not
 * always the one most of its chapters use. "The world of the patriarchs" runs
 * from Ur to Egypt though half of Genesis happens in Canaan, and "the seven
 * churches of Asia" are in Asia Minor whatever else Revelation names.
 */
const ERA_WINDOW = {
  patriarchs: "near-east",
  exodus: "egypt-sinai",
  conquest: "levant",
  kingdom: "levant",
  divided: "levant",
  exile: "near-east",
  return: "near-east",
  gospels: "levant",
  apostles: "mediterranean",
  churches: "asia-minor",
};

const bases = Object.fromEntries(WINDOWS.map((id) => [id, read(`base/${id}.json`)]));
const eras = read("eras.json");
const places = read("places.json");

// ---- the projection, both ways (scripts/build-maps.mjs, projector) ----------

function projection(base) {
  const [w, s, , n] = base.bounds;
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const scale = base.width / ((base.bounds[2] - w) * kx);
  return {
    to: (lon, lat) => [(lon - w) * kx * scale, (n - lat) * scale],
    from: (x, y) => [w + x / (kx * scale), n - y / scale],
  };
}
const round = (n) => Number(n.toFixed(1));

// ---- the chapters ------------------------------------------------------------

/** chapters with a map, by book; and every chapter that carries each journey */
const books = {};
const carrying = {};
for (let book = 1; book <= 66; book++) {
  if (!existsSync(path.join(MAPS, `${book}.json`))) continue;
  const file = read(`${book}.json`);
  const chapters = [];
  for (const key of Object.keys(file).map(Number).sort((a, b) => a - b)) {
    const row = file[key];
    if (!Array.isArray(row.places) || row.places.length === 0) continue;
    chapters.push(key);
    if (row.route) (carrying[row.route.j] ??= []).push({ book, chapter: key, row });
  }
  if (chapters.length) books[book] = chapters;
}

// ---- the journeys ------------------------------------------------------------

/** "Antioch 1" is the dataset's way of telling two towns apart, not a name. */
const plain = (name) => String(name).replace(/ \d+$/, "");
/** "the Jordan" and "Jordan" are one name said two ways */
const key = (name) => plain(name).toLowerCase().replace(/^the /, "");

const world = projection(bases.world);
const worldSites = bases.world.sites;

/**
 * The gazetteer's entry for a stop: the place of that name nearest to where
 * the stop is drawn. By name first and distance second, because the nearest
 * entry of all is often the region the town stands in — Beersheba's is the
 * Negeb — and by distance at all because there are two Antiochs.
 */
function siteFor(name, lon, lat) {
  const [x, y] = world.to(lon, lat);
  let best = null;
  let bestD = 3; // world units: about a quarter of a degree
  for (const site of worldSites) {
    if (key(site[0]) !== key(name)) continue;
    const d = Math.hypot(site[1] - x, site[2] - y);
    if (d < bestD) {
      best = site;
      bestD = d;
    }
  }
  return best;
}

let named = 0;
let visitsInAll = 0;
const journeys = JOURNEYS.map((journey) => {
  const told = carrying[journey.id];
  if (!told?.length) throw new Error(`${journey.id}: no chapter carries this journey`);

  // the chapter with every leg: the most of them, and the last of those
  let fullest = told[0];
  for (const t of told) {
    if (t.row.route.legs.length >= fullest.row.route.legs.length) fullest = t;
  }
  const route = fullest.row.route;
  const from = projection(bases[fullest.row.base]).from;

  // out of that chapter's window, into longitude and latitude
  const legs = route.legs.map((leg) => ({ ll: leg.p.map(([x, y]) => from(x, y)), sea: leg.sea }));
  const stops = route.stops.map((stop) => ({ ll: from(stop.x, stop.y), n: stop.n }));
  const all = [...legs.flatMap((l) => l.ll), ...stops.map((s) => s.ll)];

  // and onto the tightest window that holds the whole of it
  const id = WINDOWS.find((w) => {
    const [west, south, east, north] = bases[w].bounds;
    return all.every(([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north);
  });
  if (!id) throw new Error(`${journey.id}: no window holds it`);
  const base = bases[id];
  const to = projection(base).to;

  // the visits, in the order the journey makes them: where it starts, then
  // each step's end. The stops on the map are numbered by the same count.
  const visitNames = [journey.start, ...journey.steps.map((s) => s.to)];
  const highest = Math.max(...stops.flatMap((s) => s.n.split("·").map(Number)));
  if (highest !== visitNames.length) {
    throw new Error(
      `${journey.id}: the map numbers ${highest} visits and the journey lists ${visitNames.length}`
    );
  }

  const outStops = stops.map((stop) => {
    const [x, y] = to(...stop.ll);
    if (x < 0 || x > base.width || y < 0 || y > base.height) {
      throw new Error(`${journey.id}: stop ${stop.n} falls outside ${id}`);
    }
    return { x: round(x), y: round(y), n: stop.n };
  });

  // Each visit is looked up by its own name, not its stop's: one dot can be
  // three visits (Gilead, Mahanaim and Penuel are a day's walk apart, and at
  // this scale the map draws them as one), and each is its own place.
  const visits = visitNames.map((name, i) => {
    const stop = stops.findIndex((s) => s.n.split("·").map(Number).includes(i + 1));
    if (stop === -1) throw new Error(`${journey.id}: visit ${i + 1} has no stop`);
    const site = siteFor(name, ...stops[stop].ll);
    visitsInAll++;
    if (site) named++;
    return {
      name: site ? site[0] : plain(name),
      ...(site?.[5] ? { id: site[5] } : {}),
      // the chapter that tells of arriving; of setting out, for the first
      at: i === 0 ? journey.steps[0].at : journey.steps[i - 1].at,
      stop,
    };
  });

  const outLegs = legs.map((leg) => ({
    p: leg.ll.map(([lon, lat]) => to(lon, lat).map(round)),
    ...(leg.sea ? { sea: 1 } : {}),
  }));

  // the crop it opens at: the road and a margin, inside the window
  const xs = [...outLegs.flatMap((l) => l.p.map((p) => p[0])), ...outStops.map((s) => s.x)];
  const ys = [...outLegs.flatMap((l) => l.p.map((p) => p[1])), ...outStops.map((s) => s.y)];
  const least = base.width / 10;
  let w = Math.max(least, (Math.max(...xs) - Math.min(...xs)) * 1.24);
  let h = Math.max(least, (Math.max(...ys) - Math.min(...ys)) * 1.24);
  w = Math.min(w, base.width);
  h = Math.min(h, base.height);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const x = Math.min(Math.max(0, cx - w / 2), base.width - w);
  const y = Math.min(Math.max(0, cy - h / 2), base.height - h);

  return {
    id: journey.id,
    base: id,
    era: fullest.row.era,
    focus: [x, y, w, h].map(round),
    legs: outLegs,
    stops: outStops,
    visits,
    chapters: told.map((t) => [t.book, t.chapter]),
  };
});

// ---- the eras ----------------------------------------------------------------

const eraList = Object.keys(eras).map((id) => {
  if (!ERA_WINDOW[id]) throw new Error(`no window chosen for the era "${id}"`);
  return { id, base: ERA_WINDOW[id] };
});

// ---- where each place is -----------------------------------------------------

const inWindow = WINDOWS.map((id) => new Set(bases[id].sites.map((s) => s[5]).filter(Boolean)));
const where = {};
for (const id of Object.keys(places.places).sort()) {
  const at = inWindow.findIndex((set) => set.has(id));
  if (at === -1) throw new Error(`place ${id} (${places.places[id][0]}) is on no window`);
  where[id] = at;
}

// ---- written -----------------------------------------------------------------

const atlas = { v: 1, windows: WINDOWS, journeys, eras: eraList, books, where };
const out = path.join(MAPS, "atlas.json");
writeFileSync(out, JSON.stringify(atlas));

const chapters = Object.values(books).reduce((n, list) => n + list.length, 0);
console.log(
  `${journeys.length} journeys (${named} of ${visitsInAll} visits with a card), ${eraList.length} eras, ` +
    `${Object.keys(books).length} books, ${chapters} chapters, ${Object.keys(where).length} places`
);
for (const j of journeys) {
  console.log(
    `  ${j.id.padEnd(13)} ${j.base.padEnd(13)} ${String(j.visits.length).padStart(2)} visits  ` +
      j.visits.slice(0, 5).map((v) => v.name).join(" → ")
  );
}
console.log(`${(readFileSync(out).length / 1024).toFixed(1)} KB  ${path.relative(process.cwd(), out)}`);
