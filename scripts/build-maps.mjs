// Historical maps for the context panel: where each chapter happened.
//
// Two public sources, joined:
//
//   Natural Earth (public domain) — coastlines, lakes and rivers. Clipped to
//   a handful of windows, simplified, and written out as SVG paths.
//
//   OpenBible.info's Bible Geocoding data (CC BY 4.0) — 1,342 named places,
//   each carrying the list of verses that mention it. Inverting that list is
//   the whole trick: it turns "where is Bethel" into "what places does this
//   chapter name", which is the question a reader actually has.
//
// Drawn rather than scanned. A plate from a 1911 atlas is three to ten
// megabytes, is fixed at one zoom, speaks one language, and cannot know what
// chapter you are reading. The whole of this is under a megabyte, is crisp at
// any size, takes the app's own colours in all three themes, and lights up the
// places named in the passage in front of you.
//
// Neither source is vendored — they are 15 MB and 170 MB of raw material for
// 350 KB of output, the same arrangement the commentary and the devotional
// have. Fetch them when the sources change:
//
//   github.com/nvkelso/natural-earth-vector  →  geojson/
//     ne_50m_land, ne_50m_lakes, ne_50m_rivers_lake_centerlines,
//     ne_10m_lakes, ne_10m_rivers_lake_centerlines,
//     ne_10m_geography_regions_polys
//   github.com/openbibleinfo/Bible-Geocoding-Data  →  data/
//     ancient.jsonl, modern.jsonl
//
// Usage:
//   node scripts/build-maps.mjs <natural-earth-geojson-dir> <openbible-data-dir>
//
// Writes public/maps/: a base map for each window, the eras, a file of
// chapter maps for each book, and places.json for the place cards. Run when
// the sources change; output committed.
//
// Since the place cards it also reads, from Natural Earth's geojson/,
// ne_10m_admin_0_map_subunits, to say which country a site is in today.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { JOURNEYS } from "./map-journeys.mjs";

const [NE_DIR, OB_DIR] = process.argv.slice(2);
if (!NE_DIR || !OB_DIR) {
  console.error(
    "usage: node scripts/build-maps.mjs <natural-earth-geojson-dir> <openbible-data-dir>"
  );
  process.exit(1);
}

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "maps");

// ---------------------------------------------------------------------------
// Windows: the pieces of the world the Bible happens in.
//
// Geometry only. What a window is CALLED, and the regions named on it, belong
// to the era rather than to the coastline — the same rectangle is Canaan under
// Abraham, Israel and Judah under the kings, and Galilee and Judea under Rome.
// Kept apart so one set of coastlines serves every age.
//
// Ordered small to large. A chapter takes the tightest window that holds it,
// so the map is always as close in as the passage allows.
// ---------------------------------------------------------------------------

const WINDOWS = [
  {
    id: "levant",
    bounds: [33.6, 29.3, 36.9, 33.9],
    /*
     * How hard to simplify, in degrees.
     *
     * Set by what the map is asked to survive rather than by what it opens at:
     * these three can be pinched into in the full-screen viewer, and at three
     * or four times the opening zoom a coastline thinned to 400m reads as a
     * row of straight cuts. 0.001° is about a hundred metres, which is finer
     * than Natural Earth itself resolves — so the limit becomes the source,
     * which is the right place for it — and it costs a few kilobytes.
     */
    tolerance: 0.001,
    rivers: "10m",
  },
  {
    id: "asia-minor",
    bounds: [25.4, 36.2, 31.6, 40.6],
    tolerance: 0.002,
    rivers: "10m",
  },
  {
    id: "egypt-sinai",
    bounds: [29.4, 26.8, 36.6, 32.6],
    tolerance: 0.003,
    rivers: "10m",
  },
  {
    id: "near-east",
    bounds: [25, 23.5, 50.5, 42.5],
    tolerance: 0.03,
    rivers: "50m",
  },
  {
    id: "mediterranean",
    bounds: [8, 26.5, 50.5, 45.5],
    tolerance: 0.04,
    rivers: "50m",
  },
  {
    id: "world",
    bounds: [-12, 4, 80, 50],
    tolerance: 0.09,
    rivers: "50m",
  },
];

// ---------------------------------------------------------------------------
// Eras: what the land was called, and when.
//
// The label a reader needs over the Jordan valley depends on the century, not
// on the river. These carry the map's title and the region names written
// across it; the coordinates are the middle of where the name belongs, not of
// any settlement.
// ---------------------------------------------------------------------------

const ERAS = {
  patriarchs: {
    regions: [
      { en: "Canaan", es: "Canaán", ll: [35.2, 31.9] },
      { en: "Egypt", es: "Egipto", ll: [31.2, 28.5] },
      { en: "Mesopotamia", es: "Mesopotamia", ll: [42.5, 35.5] },
      { en: "Arabia", es: "Arabia", ll: [42, 27] },
      { en: "The Great Sea", es: "El Mar Grande", ll: [32.5, 33.5], water: true },
    ],
  },
  exodus: {
    regions: [
      { en: "Egypt", es: "Egipto", ll: [30.9, 28.8] },
      { en: "Goshen", es: "Gosén", ll: [31.9, 30.7] },
      { en: "The Wilderness of Sinai", es: "El desierto de Sinaí", ll: [33.8, 29.3] },
      { en: "Midian", es: "Madián", ll: [35.6, 28.4] },
      { en: "Edom", es: "Edom", ll: [35.5, 30.4] },
      { en: "The Red Sea", es: "El Mar Rojo", ll: [34.4, 27.6], water: true },
    ],
  },
  conquest: {
    regions: [
      { en: "Galilee", es: "Galilea", ll: [35.4, 32.9] },
      { en: "Ephraim", es: "Efraín", ll: [35.25, 32.15] },
      { en: "Judah", es: "Judá", ll: [35.0, 31.4] },
      { en: "Philistia", es: "Filistea", ll: [34.6, 31.5] },
      { en: "Gilead", es: "Galaad", ll: [35.85, 32.2] },
      { en: "Moab", es: "Moab", ll: [35.75, 31.3] },
      { en: "The Great Sea", es: "El Mar Grande", ll: [34.2, 32.6], water: true },
      { en: "The Salt Sea", es: "El Mar Salado", ll: [35.5, 31.5], water: true },
    ],
  },
  kingdom: {
    regions: [
      { en: "Israel", es: "Israel", ll: [35.3, 32.4] },
      { en: "Judah", es: "Judá", ll: [35.0, 31.4] },
      { en: "Philistia", es: "Filistea", ll: [34.6, 31.5] },
      { en: "Ammon", es: "Amón", ll: [35.95, 31.95] },
      { en: "Moab", es: "Moab", ll: [35.75, 31.3] },
      { en: "Edom", es: "Edom", ll: [35.3, 30.2] },
      { en: "The Great Sea", es: "El Mar Grande", ll: [34.2, 32.6], water: true },
    ],
  },
  divided: {
    regions: [
      { en: "Israel", es: "Israel", ll: [35.35, 32.5] },
      { en: "Judah", es: "Judá", ll: [35.0, 31.4] },
      { en: "Philistia", es: "Filistea", ll: [34.6, 31.5] },
      { en: "Aram", es: "Aram", ll: [36.4, 33.4] },
      { en: "Moab", es: "Moab", ll: [35.75, 31.3] },
      { en: "Edom", es: "Edom", ll: [35.3, 30.2] },
      { en: "The Great Sea", es: "El Mar Grande", ll: [34.2, 32.6], water: true },
    ],
  },
  exile: {
    regions: [
      { en: "Assyria", es: "Asiria", ll: [42.5, 36.5] },
      { en: "Babylonia", es: "Babilonia", ll: [44.5, 32.3] },
      { en: "Media", es: "Media", ll: [48.5, 35.5] },
      { en: "Judah", es: "Judá", ll: [35.1, 31.5] },
      { en: "Egypt", es: "Egipto", ll: [31, 27.5] },
      { en: "The Great Sea", es: "El Mar Grande", ll: [31, 34.5], water: true },
    ],
  },
  return: {
    regions: [
      { en: "The Persian Empire", es: "El Imperio Persa", ll: [45, 33.5] },
      { en: "Judah", es: "Judá", ll: [35.1, 31.5] },
      { en: "Egypt", es: "Egipto", ll: [31, 27.5] },
      { en: "Asia Minor", es: "Asia Menor", ll: [32, 39] },
      { en: "The Great Sea", es: "El Mar Grande", ll: [29, 34.5], water: true },
    ],
  },
  gospels: {
    regions: [
      { en: "Galilee", es: "Galilea", ll: [35.35, 32.85] },
      { en: "Samaria", es: "Samaria", ll: [35.2, 32.25] },
      { en: "Judea", es: "Judea", ll: [35.0, 31.55] },
      { en: "Perea", es: "Perea", ll: [35.75, 31.95] },
      { en: "Decapolis", es: "Decápolis", ll: [36.05, 32.5] },
      { en: "Idumea", es: "Idumea", ll: [34.95, 31.0] },
      { en: "The Great Sea", es: "El Mar Grande", ll: [34.2, 32.6], water: true },
      { en: "The Sea of Galilee", es: "El Mar de Galilea", ll: [35.75, 32.83], water: true },
      { en: "The Dead Sea", es: "El Mar Muerto", ll: [35.55, 31.4], water: true },
    ],
  },
  apostles: {
    regions: [
      { en: "Italy", es: "Italia", ll: [13, 42.5] },
      { en: "Macedonia", es: "Macedonia", ll: [22.5, 41] },
      { en: "Achaia", es: "Acaya", ll: [22.5, 38] },
      { en: "Asia", es: "Asia", ll: [28.5, 38.6] },
      { en: "Galatia", es: "Galacia", ll: [33, 39.4] },
      { en: "Syria", es: "Siria", ll: [37.5, 35.2] },
      { en: "Judea", es: "Judea", ll: [35.2, 31.5] },
      { en: "Egypt", es: "Egipto", ll: [30.5, 28] },
      { en: "The Great Sea", es: "El Mar Grande", ll: [19, 34], water: true },
    ],
  },
  churches: {
    regions: [
      { en: "Asia", es: "Asia", ll: [28.6, 38.6] },
      { en: "Mysia", es: "Misia", ll: [27.6, 39.6] },
      { en: "Lydia", es: "Lidia", ll: [28.4, 38.3] },
      { en: "Phrygia", es: "Frigia", ll: [30.4, 38.4] },
      { en: "The Aegean Sea", es: "El Mar Egeo", ll: [26.2, 38.4], water: true },
    ],
  },
};

/**
 * Which age a chapter belongs to.
 *
 * By book, and by chapter where a book spans two: Genesis turns at chapter 12,
 * where the story stops being the world's and becomes Abraham's, and Exodus
 * turns at the Red Sea.
 */
const ERA_BY_BOOK = {
  Gen: () => "patriarchs",
  Exod: () => "exodus",
  Lev: () => "exodus",
  Num: () => "exodus",
  Deut: () => "exodus",
  Josh: () => "conquest",
  Judg: () => "conquest",
  Ruth: () => "conquest",
  "1Sam": () => "kingdom",
  "2Sam": () => "kingdom",
  "1Kgs": (c) => (c <= 11 ? "kingdom" : "divided"),
  "2Kgs": () => "divided",
  "1Chr": () => "kingdom",
  "2Chr": (c) => (c <= 9 ? "kingdom" : "divided"),
  Ezra: () => "return",
  Neh: () => "return",
  Esth: () => "return",
  Job: () => "patriarchs",
  Ps: () => "kingdom",
  Prov: () => "kingdom",
  Eccl: () => "kingdom",
  Song: () => "kingdom",
  Isa: () => "divided",
  Jer: () => "exile",
  Lam: () => "exile",
  Ezek: () => "exile",
  Dan: () => "exile",
  Hos: () => "divided",
  Joel: () => "divided",
  Amos: () => "divided",
  Obad: () => "divided",
  Jonah: () => "divided",
  Mic: () => "divided",
  Nah: () => "divided",
  Hab: () => "divided",
  Zeph: () => "divided",
  Hag: () => "return",
  Zech: () => "return",
  Mal: () => "return",
  Matt: () => "gospels",
  Mark: () => "gospels",
  Luke: () => "gospels",
  John: () => "gospels",
  Acts: () => "apostles",
  Rev: () => "churches",
};
// everything else — the letters — is the apostles' world
const DEFAULT_ERA = "apostles";

/** OSIS book code → the app's book number. */
const OSIS_ORDER = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam",
  "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job", "Ps", "Prov",
  "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos",
  "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal", "Matt",
  "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil",
  "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas",
  "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
];
const BOOK_NR = new Map(OSIS_ORDER.map((id, i) => [id, i + 1]));

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Equirectangular, with x stretched at the window's middle latitude.
 *  Regional maps at these latitudes need no more, and it keeps the shapes
 *  honest without Mercator's habit of inflating the north. */
function projector([w, s, e, n], width = 1000) {
  const midRad = (((s + n) / 2) * Math.PI) / 180;
  const kx = Math.cos(midRad);
  const spanX = (e - w) * kx;
  const spanY = n - s;
  const scale = width / spanX;
  const height = Math.round(spanY * scale);
  return {
    width,
    height,
    to: (lon, lat) => [
      Number(((lon - w) * kx * scale).toFixed(1)),
      Number(((n - lat) * scale).toFixed(1)),
    ],
  };
}

/** Douglas–Peucker. The 1:50m coastline carries far more points than a phone
 *  can show; dropping the ones that fall on a line nobody can see is most of
 *  why these files are kilobytes. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let far = sqTol;
    const [x1, y1] = points[first];
    const [x2, y2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x1 + t * dx - px;
      const ey = y1 + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > far) {
        far = d;
        index = i;
      }
    }
    if (index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Sutherland–Hodgman against the window. The clip region is a rectangle and
 *  so convex, which is the one case this algorithm is exactly right for. */
function clipRing(ring, [w, s, e, n]) {
  const edges = [
    { keep: (p) => p[0] >= w, cut: (a, b) => cutX(a, b, w) },
    { keep: (p) => p[0] <= e, cut: (a, b) => cutX(a, b, e) },
    { keep: (p) => p[1] >= s, cut: (a, b) => cutY(a, b, s) },
    { keep: (p) => p[1] <= n, cut: (a, b) => cutY(a, b, n) },
  ];
  let out = ring;
  for (const edge of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = edge.keep(cur);
      const prevIn = edge.keep(prev);
      if (curIn) {
        if (!prevIn) out.push(edge.cut(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(edge.cut(prev, cur));
      }
    }
    if (out.length === 0) return [];
  }
  return out;
}

const cutX = (a, b, x) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
const cutY = (a, b, y) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];

/** A line kept only where it runs inside the window, as one or more runs. */
function clipLine(line, [w, s, e, n]) {
  const inside = (p) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n;
  const runs = [];
  let run = [];
  for (const p of line) {
    if (inside(p)) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

const toPath = (points, project) =>
  points
    .map((p, i) => `${i ? "L" : "M"}${project.to(p[0], p[1]).join(" ")}`)
    .join("");

function readGeo(file) {
  const full = path.join(NE_DIR, file);
  if (!existsSync(full)) {
    console.error(`missing Natural Earth file: ${full}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(full, "utf8")).features;
}

/** Every ring in a feature, whatever shape it claims to be. */
function ringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function linesOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

const land = readGeo("ne_50m_land.geojson");
const lakes50 = readGeo("ne_50m_lakes.geojson");
const lakes10 = readGeo("ne_10m_lakes.geojson");
const rivers50 = readGeo("ne_50m_rivers_lake_centerlines.geojson");
const rivers10 = readGeo("ne_10m_rivers_lake_centerlines.geojson");

/*
 * The shape of the ground itself.
 *
 * Coastlines and rivers say where the water is; this says what the land is —
 * the Negev and the Syrian Desert, the mountains of Lebanon, the Nile delta,
 * Mesopotamia. A reader who has just been told Elijah went up Carmel is owed
 * some sense that Carmel is a ridge and the Negev is not the same country as
 * Galilee, and a coastline alone cannot tell them.
 *
 * Only the classes that are a KIND of ground. Islands and peninsulas are named
 * on the coastline already, and a continent's name across a map of Judah is
 * not scale — it is noise. MIN_LABEL is Natural Earth's own judgement of how
 * far out a name is worth reading, and 3.5 is about where continents stop.
 */
const TERRAIN = new Set([
  "Desert",
  "Range/mtn",
  "Plateau",
  "Plain",
  "Delta",
  "Basin",
  "Valley",
  "Lowland",
  "Foothills",
  "Geoarea",
]);
const terrain = readGeo("ne_10m_geography_regions_polys.geojson").filter(
  (f) =>
    TERRAIN.has(f.properties?.FEATURECLA) &&
    (f.properties?.MIN_LABEL ?? 99) >= 3.5
);

function buildWindow(win) {
  const project = projector(win.bounds, 1000);
  const [w, s, e, n] = win.bounds;
  const overlaps = (bbox) =>
    !bbox || (bbox[0] <= e && bbox[2] >= w && bbox[1] <= n && bbox[3] >= s);

  const shapes = (features, tol) => {
    const out = [];
    for (const f of features) {
      if (!overlaps(f.bbox)) continue;
      for (const ring of ringsOf(f.geometry)) {
        const clipped = clipRing(ring, win.bounds);
        if (clipped.length < 3) continue;
        const thin = simplify(clipped, tol);
        if (thin.length < 3) continue;
        out.push(toPath(thin, project) + "Z");
      }
    }
    return out;
  };

  const strokes = (features, tol) => {
    const out = [];
    for (const f of features) {
      for (const line of linesOf(f.geometry)) {
        for (const run of clipLine(line, win.bounds)) {
          const thin = simplify(run, tol);
          if (thin.length < 2) continue;
          out.push(toPath(thin, project));
        }
      }
    }
    return out;
  };

  /*
   * A stretch of country, with somewhere to write its name.
   *
   * The anchor is the middle of the part that is IN the window, not the middle
   * of the whole thing — the Sahara's centre is two thousand miles from a map
   * of Egypt, and a label pinned there would never be seen.
   */
  const grounds = () => {
    const out = [];
    for (const f of terrain) {
      if (!overlaps(f.bbox)) continue;
      const paths = [];
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const ring of ringsOf(f.geometry)) {
        const clipped = clipRing(ring, win.bounds);
        if (clipped.length < 3) continue;
        const thin = simplify(clipped, win.tolerance * 4);
        if (thin.length < 3) continue;
        paths.push(toPath(thin, project) + "Z");
        for (const [lon, lat] of thin) {
          const [x, y] = project.to(lon, lat);
          sx += x;
          sy += y;
          n++;
        }
      }
      if (!paths.length || !n) continue;
      out.push({
        n: f.properties.NAME,
        es: f.properties.NAME_ES || f.properties.NAME,
        // Range/mtn and Desert are drawn differently; the rest are one wash
        k:
          f.properties.FEATURECLA === "Range/mtn"
            ? "range"
            : f.properties.FEATURECLA === "Desert"
              ? "desert"
              : "ground",
        d: paths,
        x: Math.round(sx / n),
        y: Math.round(sy / n),
      });
    }
    // biggest first, so a small district paints over the region holding it
    return out.sort((a, b) => b.d.join("").length - a.d.join("").length);
  };

  return {
    id: win.id,
    bounds: win.bounds,
    width: project.width,
    height: project.height,
    terrain: grounds(),
    land: shapes(land, win.tolerance),
    lakes: shapes(win.rivers === "10m" ? lakes10 : lakes50, win.tolerance),
    rivers: strokes(
      win.rivers === "10m" ? rivers10 : rivers50,
      win.tolerance * 1.5
    ),
    // filled in below, once the places have been read
    sites: [],
  };
}

// ---------------------------------------------------------------------------
// The places, and the chapters that name them
// ---------------------------------------------------------------------------

const lines = (file) =>
  readFileSync(path.join(OB_DIR, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

/** modern id → the point it sits at. lonlat is "lon,lat" as one string. */
const points = new Map();
for (const m of lines("modern.jsonl")) {
  const ll = m.lonlat;
  if (typeof ll !== "string" || !ll.includes(",")) continue;
  const [lon, lat] = ll.split(",").map(Number);
  if (Number.isFinite(lon) && Number.isFinite(lat)) {
    points.set(m.id, [lon, lat]);
  }
}

/**
 * "Bethel 1" is Bethel. The trailing number tells two places of the same name
 * apart in the dataset and means nothing to a reader; where two of them are
 * on one map, they are told apart by where they sit, and by the place card.
 */
const label = (place) => {
  const bare = place.friendly_id.replace(/ \d+$/, "");
  return place.preceding_article ? `${place.preceding_article} ${bare}` : bare;
};

/*
 * Which country a place is in today, for its card.
 *
 * Natural Earth's map subunits, so that a site in Iraqi Kurdistan is in Iraq
 * and one in the UN's buffer zone is in Syria. Left off for Israel, the West
 * Bank and Gaza: Jerusalem alone sits across the line between them, and a
 * card is no place to settle that. There, the modern site's own name says
 * where it is.
 */
const subunits = readGeo("ne_10m_admin_0_map_subunits.geojson");
const UNNAMED = new Set(["Israel", "Palestine"]);
const countryEs = new Map(
  subunits
    .filter((f) => f.properties.SUBUNIT === f.properties.ADMIN)
    .map((f) => [f.properties.ADMIN, f.properties.NAME_ES || f.properties.ADMIN])
);
function insideRing(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}
const countryShapes = subunits.map((f) => ({
  admin: f.properties.ADMIN,
  bbox: f.bbox,
  polygons: polygonsOf(f.geometry),
}));
function countryAt(ll) {
  for (const c of countryShapes) {
    const b = c.bbox;
    if (b && (ll[0] < b[0] || ll[0] > b[2] || ll[1] < b[1] || ll[1] > b[3])) continue;
    for (const [outer, ...holes] of c.polygons) {
      if (insideRing(outer, ll) && !holes.some((h) => insideRing(h, ll))) {
        return UNNAMED.has(c.admin) ? null : c.admin;
      }
    }
  }
  return null;
}

/*
 * Two entries with one name are one place on the map only when they are the
 * same spot.
 *
 * The dataset numbers places that share a name — Antioch 1 in Syria, Antioch
 * 2 in Pisidia; four Apheks — and these maps used to file every place under
 * its name, so a chapter naming both Antiochs drew one of them: Acts 13 lost
 * the Antioch Paul preached in. Now a place is filed under its own id, and
 * only same-named entries within a few miles of each other — the dataset's
 * alternative readings of one site — are taken as one.
 */
const SAME_SPOT = 0.2; // degrees, about twenty kilometres
const sameSpot = (a, b) =>
  a.name === b.name && Math.hypot(a.ll[0] - b.ll[0], a.ll[1] - b.ll[1]) < SAME_SPOT;

const chapters = new Map(); // "40:2" → Map(id → place)
/** every located place, by id, for the windows' gazetteers and the cards */
const allPlaces = new Map();
let resolved = 0;
let unplaced = 0;

for (const a of lines("ancient.jsonl")) {
  // the modern sites it has been identified with, best attested first; the
  // first is where it is drawn (the sort is stable, so of two equally attested
  // the dataset's own first stays first)
  const sites = Object.entries(a.modern_associations ?? {})
    // a site scholarship has marked unlikely scores below nothing: not drawn
    .filter(([id, assoc]) => points.has(id) && (assoc.score ?? 0) >= 0)
    .sort((x, y) => (y[1].score ?? 0) - (x[1].score ?? 0));
  if (!sites.length) {
    unplaced++;
    continue;
  }
  resolved++;
  const [bestId, best] = sites[0];
  const verses = [];
  for (const v of a.verses ?? []) {
    const [book, chapter, verse] = String(v.osis ?? "").split(".");
    const nr = BOOK_NR.get(book);
    if (!nr || !chapter) continue;
    verses.push({ nr, chapter: Number(chapter), verse: Number(verse) || 1, osis: book });
  }
  const place = {
    id: a.id,
    // the dataset's own name for it, "Antioch 2", which the journeys use
    fid: a.friendly_id,
    name: label(a),
    ll: points.get(bestId),
    type: (a.types ?? ["settlement"])[0],
    // How often the whole Bible names it, as a stand-in for how much it
    // matters. Joshua 15 names 163 places in one breath — every village on
    // Judah's border — and a map with 163 labels on it is a map of nothing.
    // Ranking by this keeps Hebron and Beersheba and drops the hamlets.
    weight: (a.verses ?? []).length,
    // for the card: what the site is called now, how sure scholarship is of
    // it (out of 1000, OpenBible's own measure), and the next best guesses
    modern: best.name ?? "",
    score: best.score ?? 0,
    others: sites
      .slice(1)
      .filter(([, s]) => (s.score ?? 0) >= 100)
      .slice(0, 2)
      .map(([, s]) => s.name)
      .filter(Boolean),
    verses,
  };
  // A place is a place whether or not the chapter in front of the reader
  // happens to name it — this is what fills the country between the pins.
  allPlaces.set(place.id, place);
  for (const v of verses) {
    const key = `${v.nr}:${v.chapter}`;
    if (!chapters.has(key)) chapters.set(key, new Map());
    const held = chapters.get(key);
    // the verse is kept so tapping a pin can land on the line that names it
    if (!held.has(place.id) || held.get(place.id).v > v.verse) {
      held.set(place.id, { ...place, v: v.verse, osis: v.osis });
    }
  }
}

/** One of each place, the better known of any two that are the same spot. */
function oneEach(places) {
  const kept = [];
  for (const p of [...places].sort((a, b) => b.weight - a.weight)) {
    const twin = kept.find((k) => sameSpot(k, p));
    if (!twin) kept.push({ ...p });
    // named earlier in the chapter under its other entry: that verse is first
    else if (p.v !== undefined && p.v < twin.v) twin.v = p.v;
  }
  return kept;
}
const gazette = oneEach(allPlaces.values());

// ---------------------------------------------------------------------------
// Journeys: see scripts/map-journeys.mjs
// ---------------------------------------------------------------------------

const byFid = new Map([...allPlaces.values()].map((p) => [p.fid, p]));
const where = (ref, journey) => {
  if (Array.isArray(ref)) return ref;
  const p = byFid.get(ref);
  if (!p) {
    console.error(`journey ${journey}: no located place called "${ref}"`);
    process.exit(1);
  }
  return p.ll;
};
const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
const sameChapter = (a, b) => a[0] === b[0] && a[1] === b[1];

/**
 * Each journey as legs — the points it is drawn through, the chapter that
 * tells of it, by sea or not, and the number of the stop it ends at — and the
 * chapters it is drawn on.
 */
const journeys = JOURNEYS.map((j) => {
  let from = where(j.start, j.id);
  const legs = j.steps.map((step, i) => {
    const to = where(step.to, j.id);
    const leg = {
      pts: [from, ...(step.via ?? []).map((v) => where(v, j.id)), to],
      at: step.at,
      sea: !!step.sea,
      stop: i + 2, // the start is 1
    };
    from = to;
    return leg;
  });
  return { id: j.id, start: where(j.start, j.id), legs, whole: j.whole ?? [] };
});

/** The journey a chapter shows, and which of its legs are this chapter's. */
function journeyFor(bookNr, chapter) {
  const here = [bookNr, chapter];
  for (const j of journeys) {
    const whole = j.whole.some((c) => sameChapter(c, here));
    const own = j.legs.filter((l) => sameChapter(l.at, here));
    if (!whole && !own.length) continue;
    return {
      j,
      shown: whole ? j.legs : j.legs.filter((l) => sameChapter(l.at, here) || before(l.at, here)),
      now: (l) => whole || sameChapter(l.at, here),
    };
  }
  return null;
}

/*
 * Every named place in the Bible, whether or not this chapter names it.
 *
 * A chapter names four places on average, and a map of four dots on an empty
 * coast is what you get when you zoom into it — the land between them is where
 * the map stops having anything to say. But those four are four of 1,333, and
 * the other 1,329 were there the whole time: Shiloh and Gibeon and Michmash do
 * not stop existing because this chapter is about Bethel.
 *
 * So each window carries the lot, quietly, and the reader is shown as many as
 * the space can hold — a handful at a glance, the whole countryside once they
 * have pinched into it. Kept as arrays rather than objects because there are
 * five thousand of them across the six windows and the key names would cost
 * more than the values.
 *
 * [name, x, y, how often the Bible names it, what mark it takes (0 a name
 *  written across country, 1 a town's dot, 2 a peak), and its id]
 */
function gazetteer(win) {
  const project = projector(win.bounds, 1000);
  const [w, s, e, n] = win.bounds;
  const out = [];
  for (const place of gazette) {
    const [lon, lat] = place.ll;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    const [x, y] = project.to(lon, lat);
    out.push([
      place.name,
      Math.round(x),
      Math.round(y),
      place.weight,
      markFor(place.type),
      // which place it is, for its card, and so a chapter's own pin is not
      // written a second time — by id, since a name may be two places
      place.id,
    ]);
  }
  // most-named first, so the drawing can stop wherever it runs out of room
  return out.sort((a, b) => b[3] - a[3]);
}

/*
 * What mark a place takes — and matches the client, which decides the same
 * thing for the chapter's own places from their type.
 *
 * A peak is drawn as a peak. Carmel and Tabor and Gilboa and Sinai are the
 * shape of the ground the story happens on, and a dot says a town stood there,
 * which is not what any of them were.
 */
const PEAKS = ["mountain", "mountain range", "hill", "promontory", "cliff"];
const AREAS = [
  "region",
  "natural area",
  "body of water",
  "river",
  "valley",
  "special",
];
const markFor = (type) =>
  PEAKS.includes(type) ? 2 : AREAS.includes(type) ? 0 : 1;

/** The tightest window that holds enough of a chapter to be worth drawing. */
const built = WINDOWS.map(buildWindow);
for (const win of built) {
  win.sites = gazetteer(WINDOWS.find((w) => w.id === win.id));
}
const holds = (win, [lon, lat]) => {
  const [w, s, e, n] = win.bounds;
  return lon >= w && lon <= e && lat >= s && lat <= n;
};

function chooseWindow(places, mustHold = []) {
  let fallback = null;
  for (const win of built) {
    // a journey's legs in this chapter are drawn whole or not at all
    if (!mustHold.every((p) => holds(win, p.ll))) continue;
    const inside = places.filter((p) => holds(win, p.ll)).length;
    // Every window is a compromise with the one place that sits outside it —
    // Tarshish on a map of Judah, Rome on a map of Galilee. Four fifths in
    // view is a map of the chapter; less than that is a map of somewhere else.
    if (inside === places.length) return { win, dropped: 0 };
    if (inside / places.length >= 0.8) return { win, dropped: places.length - inside };
    if (!fallback || inside > fallback.inside) fallback = { win, inside };
  }
  return fallback
    ? { win: fallback.win, dropped: places.length - fallback.inside }
    : null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

mkdirSync(path.join(OUT, "base"), { recursive: true });
let baseBytes = 0;
for (const win of built) {
  const json = JSON.stringify(win);
  baseBytes += json.length;
  writeFileSync(path.join(OUT, "base", `${win.id}.json`), json);
}

// the eras, once, for every book to point at
const erasJson = JSON.stringify(ERAS);
writeFileSync(path.join(OUT, "eras.json"), erasJson);

/*
 * The place cards: what a place was, where it is now, and everywhere else the
 * Bible names it.
 *
 * One file for every place, fetched the first time a card is opened. Each is
 * [name, kind, the modern site, how sure scholarship is of it out of 1000,
 *  its country (an index into `countries`, or -1), the chapters that name it
 *  as "book.chapter.verse" at the first verse in each, in the Bible's order,
 *  how many verses name it, and the next best sites, where the first is
 *  uncertain].
 *
 * Two entries that are one spot share a card: `same` sends the lesser to the
 * better known, whose card carries the verses of both.
 */
const countries = [];
const countryOf = new Map();
const cards = {};
const same = {};
for (const kept of gazette) {
  const twins = [...allPlaces.values()].filter((p) => p.id !== kept.id && sameSpot(p, kept));
  for (const t of twins) same[t.id] = kept.id;
  const firsts = new Map();
  let count = 0;
  for (const p of [kept, ...twins]) {
    for (const v of p.verses) {
      count++;
      const key = v.nr * 1000 + v.chapter;
      if (!firsts.has(key) || firsts.get(key) > v.verse) firsts.set(key, v.verse);
    }
  }
  const refs = [...firsts]
    .sort((a, b) => a[0] - b[0])
    .map(([key, verse]) => `${Math.floor(key / 1000)}.${key % 1000}.${verse}`)
    .join(" ");
  const country = countryAt(kept.ll);
  let ci = -1;
  if (country) {
    if (!countryOf.has(country)) {
      countryOf.set(country, countries.length);
      countries.push([country, countryEs.get(country) ?? country]);
    }
    ci = countryOf.get(country);
  }
  cards[kept.id] = [
    kept.name,
    kept.type,
    kept.modern,
    kept.score,
    ci,
    refs,
    count,
    ...(kept.score < 500 && kept.others.length ? [kept.others] : []),
  ];
}
const cardsJson = JSON.stringify({ countries, places: cards, same });
writeFileSync(path.join(OUT, "places.json"), cardsJson);

/** As many as a phone can label without the map becoming a list. */
const MAX_PINS = 16;

/**
 * The part of the window this chapter is actually in.
 *
 * Six windows cannot each be the right size for four hundred chapters. Drawn
 * whole, the map of the Holy Land gives Bethlehem and Nazareth two inches in
 * the middle and three inches of empty Negev underneath — a map of the region
 * rather than of the chapter. So every chapter carries its own viewBox: the
 * places it names, with enough country around them to say where that is.
 *
 * Padded generously and floored at a quarter of the window, because a chapter
 * naming one town should still open on a map of somewhere, not a magnified
 * dot. Returned in the window's own pixels, so the same base file serves every
 * crop of it.
 */
function focusOn(pins, width, height) {
  const xs = pins.map((p) => p.x);
  const ys = pins.map((p) => p.y);
  // room for the names, which are set beside the dots and not on them
  const longest = Math.max(...pins.map((p) => p.n.length));
  const padX = Math.max((Math.max(...xs) - Math.min(...xs)) * 0.3, longest * 9 + 30);
  const padY = Math.max((Math.max(...ys) - Math.min(...ys)) * 0.3, height * 0.05);

  let x0 = Math.min(...xs) - padX;
  let x1 = Math.max(...xs) + padX;
  let y0 = Math.min(...ys) - padY;
  let y1 = Math.max(...ys) + padY;

  const grow = (a, b, want, limit) => {
    const have = b - a;
    if (have >= want) return [a, b];
    const half = (want - have) / 2;
    return [Math.max(0, a - half), Math.min(limit, b + half)];
  };

  [x0, x1] = grow(x0, x1, width * 0.26, width);
  [y0, y1] = grow(y0, y1, height * 0.2, height);

  // Neither a letterbox nor a chimney: a shape a panel can hold either way.
  const ratio = (x1 - x0) / (y1 - y0);
  if (ratio > 1.7) [y0, y1] = grow(y0, y1, (x1 - x0) / 1.7, height);
  else if (ratio < 0.62) [x0, x1] = grow(x0, x1, (y1 - y0) * 0.62, width);

  // slid back inside the window rather than cropped, so nothing is lost
  const fit = (a, b, limit) => {
    const span = Math.min(b - a, limit);
    let lo = a;
    if (lo < 0) lo = 0;
    if (lo + span > limit) lo = limit - span;
    return [Math.round(lo), Math.round(span)];
  };
  const [fx, fw] = fit(x0, x1, width);
  const [fy, fh] = fit(y0, y1, height);
  return [fx, fy, fw, fh];
}

const byBook = new Map();
let crowded = 0;
let mapped = 0;
let skipped = 0;
const windowUse = new Map();

for (const [key, held] of chapters) {
  const [bookNr, chapter] = key.split(":").map(Number);
  const places = oneEach(held.values());
  const journey = journeyFor(bookNr, chapter);
  // This chapter's part of the journey has to fit on the map as well as its
  // places. The earlier part, faded, may run off its edge — back to Ur from
  // Moriah — rather than pull a chapter about one hill out to the whole Near
  // East, where the coast is drawn coarser and the country is emptier.
  const routePts = journey
    ? journey.shown.filter(journey.now).flatMap((l) => l.pts).map((ll) => ({ ll }))
    : [];
  const chosen = chooseWindow(places, routePts);
  if (!chosen) {
    skipped++;
    continue;
  }
  const { win } = chosen;
  const project = projector(win.bounds, 1000);
  const osis = places[0].osis;
  const eraOf = ERA_BY_BOOK[osis];
  const era = (eraOf ? eraOf(chapter) : DEFAULT_ERA) ?? DEFAULT_ERA;

  const inFrame = places.filter((p) => holds(win, p.ll));
  const drawn = [...inFrame]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_PINS)
    .map((p) => {
      const [x, y] = project.to(p.ll[0], p.ll[1]);
      return { n: p.name, x, y, v: p.v, t: p.type, id: p.id, w: p.weight };
    })
    // north to south, so labels are laid out in a stable order; and of two
    // drawn at one spot — Bethel and Luz, the same hill under two names — the
    // better known last, so it is the one on top under a thumb
    .sort((a, b) => a.y - b.y || a.x - b.x || a.w - b.w)
    .map(({ w, ...pin }) => pin);
  if (drawn.length === 0) {
    skipped++;
    continue;
  }

  /*
   * The journey, in the window's own units: each leg as the points it is
   * drawn through, bold (1) if this chapter tells of it and faded (0) if an
   * earlier one did; and the stops, numbered in order, with the numbers of a
   * place passed through twice — Lystra, going and coming back — on one mark.
   */
  let route;
  const opening = [...drawn];
  if (journey) {
    const at = (ll) => project.to(ll[0], ll[1]);
    const legs = journey.shown.map((l) => ({
      p: l.pts.map(at),
      s: journey.now(l) ? 1 : 0,
      ...(l.sea ? { sea: 1 } : {}),
    }));
    const marks = [];
    const mark = (ll, n, s) => {
      const [x, y] = at(ll);
      const there = marks.find((m) => Math.hypot(m.x - x, m.y - y) < 1.5);
      if (there) {
        there.n.push(n);
        there.s = Math.max(there.s, s);
      } else marks.push({ x, y, n: [n], s });
    };
    const first = journey.shown[0];
    mark(journey.j.start, 1, first && journey.now(first) ? 1 : 0);
    for (const l of journey.shown) mark(l.pts[l.pts.length - 1], l.stop, journey.now(l) ? 1 : 0);
    route = {
      j: journey.j.id,
      legs,
      stops: marks.map((m) => ({ x: m.x, y: m.y, n: m.n.join("·"), s: m.s })),
    };
    // the map opens on this chapter's part of it, as well as on its places
    for (const l of legs) {
      if (!l.s) continue;
      for (const [x, y] of l.p) opening.push({ n: "", x, y });
    }
  }

  if (!byBook.has(bookNr)) byBook.set(bookNr, {});
  byBook.get(bookNr)[chapter] = {
    base: win.id,
    era,
    focus: focusOn(opening, project.width, project.height),
    places: drawn,
    ...(route ? { route } : {}),
    // said out loud in the panel when the chapter names more than fit
    ...(inFrame.length > drawn.length ? { more: inFrame.length - drawn.length } : {}),
  };
  crowded += inFrame.length > drawn.length ? 1 : 0;
  mapped++;
  windowUse.set(win.id, (windowUse.get(win.id) ?? 0) + 1);
}

let bookBytes = 0;
for (const [nr, data] of byBook) {
  const json = JSON.stringify(data);
  bookBytes += json.length;
  writeFileSync(path.join(OUT, `${nr}.json`), json);
}

const kb = (n) => (n / 1024).toFixed(0);
console.log(`windows   : ${built.length}`);
for (const win of built) {
  console.log(
    `  ${win.id.padEnd(14)} ${String(win.land.length).padStart(4)} land  ` +
      `${String(win.lakes.length).padStart(3)} lakes  ` +
      `${String(win.rivers.length).padStart(4)} rivers  ` +
      `${win.width}×${win.height}`
  );
}
console.log(`eras      : ${Object.keys(ERAS).length}`);
console.log(`places    : ${resolved} placed, ${unplaced} without a location`);
console.log(`chapters  : ${mapped} mapped, ${skipped} with nothing to draw`);
console.log(`crowded   : ${crowded} naming more than ${MAX_PINS} places in frame`);
for (const [id, n] of [...windowUse].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id.padEnd(14)} ${String(n).padStart(4)} chapters`);
}
console.log(`books     : ${byBook.size} files`);
const routed = [...byBook.values()].flatMap((b) => Object.values(b)).filter((c) => c.route);
console.log(`journeys  : ${journeys.length}, drawn on ${routed.length} chapters`);
console.log(
  `cards     : ${Object.keys(cards).length} places, ${Object.keys(same).length} twins, ` +
    `${countries.length} countries, ${kb(cardsJson.length)} KB`
);
console.log(
  `size      : ${kb(baseBytes)} KB base + ${kb(erasJson.length)} KB eras + ` +
    `${kb(bookBytes)} KB chapters = ${kb(baseBytes + erasJson.length + bookBytes)} KB`
);
