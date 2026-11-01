// Hills and valleys for the chapter maps: a shaded relief for each of the
// six base windows, laid under the coastlines (components/ChapterMap.tsx).
//
// "Went up to Jerusalem", "down to Jericho", "up into a mountain": the Bible
// is written by people who walked it, and the ground's rise and fall is half
// of what its directions say. The flat map could not show that the hill
// country stands a kilometre over the Jordan, or that the Jordan runs below
// the sea.
//
// The heights are AWS's open Terrain Tiles (registry.opendata.aws/terrain-
// tiles), which for these lands are drawn from SRTM, GMTED2010 and ETOPO1,
// all three public domain. They are read at a zoom suited to each window,
// projected the way build-maps.mjs projects the coast, and shaded as if lit
// from the north-west. The result is one greyscale picture per window where
// level ground is a middle grey: the map blends it over its own colours, so
// it darkens the slopes in shadow and lightens the ones facing the light in
// every theme, and leaves level ground — and the sea — untouched. The sea is
// masked out by the land drawn in public/maps/base, so the seabed's own
// relief never shows, while the Dead Sea's shores, far below sea level, do.
//
//   node scripts/build-relief.mjs <tile-cache-dir>
//
// Needs curl on the PATH for tiles not yet in the cache. Writes
// public/maps/relief/<window>.webp; run after build-maps.mjs when a window
// changes; output committed.

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "fs";
import path from "path";
import sharp from "sharp";

const [CACHE] = process.argv.slice(2);
if (!CACHE) {
  console.error("usage: node scripts/build-relief.mjs <tile-cache-dir>");
  process.exit(1);
}
const ROOT = process.cwd();
const BASE = path.join(ROOT, "public", "maps", "base");
const OUT = path.join(ROOT, "public", "maps", "relief");
mkdirSync(OUT, { recursive: true });

/*
 * For each window: the tile zoom to read the heights at, how many pixels
 * across to draw it, and how much to exaggerate the heights. A window of the
 * whole known world spans a hundred times the Levant's ground in the same
 * thousand units, and its mountains would be invisible at their true
 * steepness; the Levant's are not, and are left nearer the truth.
 */
const SETTINGS = {
  levant: { zoom: 10, width: 1800, exaggerate: 1.6 },
  "asia-minor": { zoom: 9, width: 1600, exaggerate: 2.2 },
  "egypt-sinai": { zoom: 9, width: 1600, exaggerate: 2.2 },
  "near-east": { zoom: 7, width: 1600, exaggerate: 4.5 },
  mediterranean: { zoom: 7, width: 1600, exaggerate: 6 },
  world: { zoom: 5, width: 1600, exaggerate: 10 },
};

// ---- the tiles ----------------------------------------------------------------

const TILE = 256;
const tiles = new Map();

function tilePath(z, x, y) {
  return path.join(CACHE, String(z), String(x), `${y}.png`);
}

function fetchTile(z, x, y) {
  const file = tilePath(z, x, y);
  if (existsSync(file) && statSync(file).size > 0) return file;
  mkdirSync(path.dirname(file), { recursive: true });
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      execFileSync("curl", ["-sSf", "--max-time", "60", "-o", file, url]);
      return file;
    } catch {
      // a dropped connection: try again
    }
  }
  throw new Error(`could not fetch ${url}`);
}

async function loadTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!tiles.has(key)) {
    const { data } = await sharp(fetchTile(z, x, y))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    tiles.set(key, data);
  }
  return tiles.get(key);
}

/** Terrarium: metres = R × 256 + G + B / 256 − 32768. */
const metres = (d, i) => d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;

/** Where a longitude and latitude fall, in Web Mercator pixels at zoom z. */
function mercator(z, lon, lat) {
  const n = 2 ** z * TILE;
  const rad = (lat * Math.PI) / 180;
  return [
    ((lon + 180) / 360) * n,
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  ];
}

// ---- one window ---------------------------------------------------------------

async function relief(base) {
  const set = SETTINGS[base.id];
  if (!set) throw new Error(`no relief settings for window ${base.id}`);
  const [w, s, e, n] = base.bounds;
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const scale = base.width / ((e - w) * kx); // map units per degree of latitude
  const W = set.width;
  const H = Math.round((W * base.height) / base.width);
  const unitsPerPx = base.width / W;

  // every tile the window touches, fetched before any is read
  const [x0, y0] = mercator(set.zoom, w, n);
  const [x1, y1] = mercator(set.zoom, e, s);
  for (let ty = Math.floor(y0 / TILE) - 1; ty <= Math.floor(y1 / TILE) + 1; ty++) {
    for (let tx = Math.floor(x0 / TILE) - 1; tx <= Math.floor(x1 / TILE) + 1; tx++) {
      await loadTile(set.zoom, tx, ty);
    }
  }

  const height = (lon, lat) => {
    // bilinear between the four nearest height samples
    const [mx, my] = mercator(set.zoom, lon, lat);
    const fx = mx - 0.5;
    const fy = my - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const at = (px, py) => {
      const d = tiles.get(`${set.zoom}/${Math.floor(px / TILE)}/${Math.floor(py / TILE)}`);
      const lx = ((px % TILE) + TILE) % TILE;
      const ly = ((py % TILE) + TILE) % TILE;
      return metres(d, (ly * TILE + lx) * 3);
    };
    const tx = fx - ix;
    const ty = fy - iy;
    return (
      at(ix, iy) * (1 - tx) * (1 - ty) +
      at(ix + 1, iy) * tx * (1 - ty) +
      at(ix, iy + 1) * (1 - tx) * ty +
      at(ix + 1, iy + 1) * tx * ty
    );
  };

  // the heights under each output pixel, with a pixel's border for the slopes
  const lonOf = (px) => w + ((px + 0.5) * unitsPerPx) / (kx * scale);
  const latOf = (py) => n - ((py + 0.5) * unitsPerPx) / scale;
  const GW = W + 2;
  const grid = new Float32Array(GW * (H + 2));
  for (let py = -1; py <= H; py++) {
    const lat = latOf(py);
    for (let px = -1; px <= W; px++) {
      grid[(py + 1) * GW + (px + 1)] = height(lonOf(px), lat);
    }
  }

  // Horn's slope and aspect, lit from the north-west at 45°
  const zenith = (45 * Math.PI) / 180;
  const azimuth = ((360 - 315 + 90) * Math.PI) / 180;
  const flat = Math.cos(zenith);
  const out = Buffer.alloc(W * H);
  for (let py = 0; py < H; py++) {
    const lat = latOf(py);
    const cellX = ((unitsPerPx / (kx * scale)) * 111320 * Math.cos((lat * Math.PI) / 180)) || 1;
    const cellY = (unitsPerPx / scale) * 110540;
    for (let px = 0; px < W; px++) {
      const g = (dx, dy) => grid[(py + 1 + dy) * GW + (px + 1 + dx)];
      const a = g(-1, -1);
      const b = g(0, -1);
      const c = g(1, -1);
      const d = g(-1, 0);
      const f = g(1, 0);
      const gg = g(-1, 1);
      const h = g(0, 1);
      const i = g(1, 1);
      const dzdx = ((c + 2 * f + i) - (a + 2 * d + gg)) / (8 * cellX);
      const dzdy = ((gg + 2 * h + i) - (a + 2 * b + c)) / (8 * cellY);
      const slope = Math.atan(set.exaggerate * Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const shade =
        Math.cos(zenith) * Math.cos(slope) +
        Math.sin(zenith) * Math.sin(slope) * Math.cos(azimuth - aspect);
      // level ground is the middle grey, which the blend leaves alone
      out[py * W + px] = Math.max(0, Math.min(255, Math.round(128 + (shade - flat) * 190)));
    }
  }

  // only the land: the seabed's relief is not the map's, and lakes lie level
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${base.width} ${base.height}">
<rect width="100%" height="100%" fill="#000"/>
${base.land.map((d) => `<path d="${d}" fill="#fff"/>`).join("")}
${base.lakes.map((d) => `<path d="${d}" fill="#000"/>`).join("")}
</svg>`;
  const mask = await sharp(Buffer.from(svg)).resize(W, H).greyscale().raw().toBuffer();
  for (let k = 0; k < out.length; k++) {
    const m = mask[k] / 255;
    out[k] = Math.round(128 + (out[k] - 128) * m);
  }

  const file = path.join(OUT, `${base.id}.webp`);
  const info = await sharp(out, { raw: { width: W, height: H, channels: 1 } })
    .webp({ quality: 62, effort: 6 })
    .toFile(file);
  return { id: base.id, W, H, bytes: info.size };
}

let total = 0;
for (const id of Object.keys(SETTINGS)) {
  const base = JSON.parse(readFileSync(path.join(BASE, `${id}.json`), "utf8"));
  const r = await relief(base);
  total += r.bytes;
  console.log(`${r.id.padEnd(14)} ${r.W}×${r.H}  ${(r.bytes / 1024).toFixed(0)} KB`);
}
console.log(`relief    : ${(total / 1024).toFixed(0)} KB in all, ${tiles.size} tiles read`);
