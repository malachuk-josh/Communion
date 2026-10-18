"use client";

// Where the chapter happened.
//
// Not a picture of the Holy Land dropped into a panel. The places drawn are
// the places THIS chapter names, and tapping one goes to the verse that names
// it — which is only possible because OpenBible.info publishes, for every
// place in the Bible, the list of verses it appears in.
//
// Drawn as SVG from two public sources rather than shipped as a scan: see
// scripts/build-maps.mjs for why. What that buys here is that the map takes
// the app's own colours, so it is legible in all three themes; that it costs
// a few kilobytes rather than a few megabytes; and that it can be zoomed into
// without ever going soft, because there is nothing to go soft — every line
// is redrawn at whatever size it is asked for.

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { useI18n, type MessageKey } from "@/lib/i18n";

interface Place {
  /** the name as the reader knows it */
  n: string;
  x: number;
  y: number;
  /** the first verse in this chapter that names it */
  v: number;
  /** settlement, region, river, mountain … */
  t: string;
}

interface ChapterMapData {
  base: string;
  era: string;
  /** the part of the base window this chapter is in: [x, y, w, h] */
  focus: [number, number, number, number];
  places: Place[];
  /** named in the chapter but left off, because the map would not hold them */
  more?: number;
}

interface Base {
  id: string;
  bounds: [number, number, number, number];
  width: number;
  height: number;
  land: string[];
  lakes: string[];
  rivers: string[];
  /** every named place: [name, x, y, weight, 0 area / 1 town / 2 peak] */
  sites: [string, number, number, number, number][];
  /** the kinds of ground: deserts, ranges, deltas, plains */
  terrain: {
    n: string;
    es: string;
    k: "desert" | "range" | "ground";
    d: string[];
    x: number;
    y: number;
  }[];
}

interface Region {
  en: string;
  es: string;
  ll: [number, number];
  water?: boolean;
}

type Eras = Record<string, { regions: Region[] }>;

/** [x, y, width, height] in the base window's own units. */
type View = [number, number, number, number];

/*
 * One fetch per file, shared by every chapter that wants it.
 *
 * A reader moves through a book a chapter at a time and the whole book's
 * places are one file; the six base maps and the era labels are the same for
 * everybody. Held, so only the first chapter of a book costs anything.
 *
 * Only what arrived is held. This used to keep the failures too: a request
 * that died once — a dropped signal, or the phone suspending the app halfway
 * through it — was remembered as "there is no map", and every Context opened
 * afterwards was handed that same answer until the app was restarted. One
 * lost request for the Levant took the maps out of 452 chapters at once, and
 * a home screen app can go days without restarting, so to the reader the
 * feature had simply been removed. A failure is forgotten now, and the next
 * time the panel opens it asks again.
 */
const held = new Map<string, Promise<unknown>>();
function load<T>(url: string, fallback: T): Promise<T> {
  let hit = held.get(url) as Promise<T> | undefined;
  if (!hit) {
    const asked: Promise<T> = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res.json() as Promise<T>;
    });
    asked.catch(() => {
      if (held.get(url) === asked) held.delete(url);
    });
    held.set(url, asked);
    hit = asked;
  }
  return hit.catch(() => fallback);
}

/** The same projection the build script used, so a region label lands where
 *  the coastline it belongs to was drawn. */
function project(bounds: [number, number, number, number], width: number) {
  const [w, s, e, n] = bounds;
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const scale = width / ((e - w) * kx);
  return (lon: number, lat: number): [number, number] => [
    (lon - w) * kx * scale,
    (n - lat) * scale,
  ];
}

/**
 * The crop a chapter opens at, or the whole window if the file predates it.
 *
 * Four numbers or nothing: everything downstream destructures this, and a
 * missing one would land as NaN in a viewBox, which draws a blank rather than
 * throwing — the worst of both.
 */
function viewOf(data: ChapterMapData, base: Base): View {
  const f = data.focus;
  return Array.isArray(f) && f.length === 4 && f.every(Number.isFinite)
    ? (f as View)
    : [0, 0, base.width, base.height];
}

/*
 * What mark a place takes: nothing, a town's dot, or a peak.
 *
 * Carmel and Tabor and Gilboa and Sinai are the shape of the ground the story
 * happens on, and a dot says a town stood there — which is not what any of
 * them were. scripts/build-maps decides the same thing for the gazetteer, and
 * ships the answer rather than the type.
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
const markFor = (type: string): 0 | 1 | 2 =>
  PEAKS.includes(type) ? 2 : AREAS.includes(type) ? 0 : 1;

/** The peak glyph, sitting on the ground with its summit on the point. */
const peakPath = (x: number, y: number, px: number) =>
  `M${(x - px * 4.4).toFixed(1)} ${(y + px * 2.6).toFixed(1)}L${x.toFixed(1)} ${(
    y - px * 3.2
  ).toFixed(1)}L${(x + px * 4.4).toFixed(1)} ${(y + px * 2.6).toFixed(1)}Z`;

// ---------------------------------------------------------------------------
// The drawing
// ---------------------------------------------------------------------------

/** [left, top, right, bottom], in the map's own units. */
type Box = [number, number, number, number];

const hits = (a: Box, b: Box) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** How much of two boxes is the same ground — the cost of a crowded spot. */
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/*
 * Everything already written, filed by where it is.
 *
 * Every name tests itself against the names placed before it, and at full
 * screen that is a thousand-odd places in the gazetteer against a few hundred
 * names, on every frame of a pinch. Filed under the squares of a coarse grid,
 * a test only looks at what is near it — the difference between a pass that
 * fits comfortably inside a frame on a slower Android phone and one that
 * does not.
 */
function boxIndex(cell: number) {
  const cells = new Map<number, Box[]>();
  const key = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
  const span = (b: Box) => [
    Math.floor(b[0] / cell),
    Math.floor(b[1] / cell),
    Math.floor(b[2] / cell),
    Math.floor(b[3] / cell),
  ];
  return {
    add(b: Box) {
      const [x0, y0, x1, y1] = span(b);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const list = cells.get(key(cx, cy));
          if (list) list.push(b);
          else cells.set(key(cx, cy), [b]);
        }
      }
    },
    /** nothing filed here touches b */
    clear(b: Box) {
      const [x0, y0, x1, y1] = span(b);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          for (const t of cells.get(key(cx, cy)) ?? []) if (hits(b, t)) return false;
        }
      }
      return true;
    },
    /** how much of b is already covered, not counting `own` */
    covered(b: Box, own?: Box) {
      const [x0, y0, x1, y1] = span(b);
      const seen = new Set<Box>();
      let sum = 0;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          for (const t of cells.get(key(cx, cy)) ?? []) {
            if (t === own || seen.has(t)) continue;
            seen.add(t);
            sum += overlap(b, t);
          }
        }
      }
      return sum;
    },
  };
}

/**
 * The type each kind of name is set in, as globals.css sets it, in CSS
 * pixels before the map's own scale is applied. Written out here because the
 * placing has to know how big a name is before it is drawn; change a size in
 * the stylesheet and change it here.
 */
const FACES = {
  name: { size: 15, italic: false, serif: true, track: 0, upper: false, halo: 1.5 },
  area: { size: 15, italic: true, serif: true, track: 0, upper: false, halo: 1.5 },
  region: { size: 12, italic: false, serif: false, track: 0.14, upper: true, halo: 0 },
  water: { size: 13, italic: true, serif: true, track: 0.06, upper: false, halo: 0 },
  ground: { size: 10, italic: false, serif: false, track: 0.18, upper: true, halo: 0 },
  range: { size: 12, italic: true, serif: true, track: 0.06, upper: false, halo: 0 },
  site: { size: 11.5, italic: false, serif: true, track: 0, upper: false, halo: 1.25 },
} as const;
type Face = (typeof FACES)[keyof typeof FACES];

/*
 * How wide a name comes out, in CSS pixels.
 *
 * Measured rather than guessed. The old tests treated a name as a point, or as
 * eighty pixels whatever it said — and "Lycaonia" was written straight over
 * "Cilicia", because the test measured from where the word starts and Cilicia
 * sat under where it ends. A canvas set in the map's own type, on the
 * device's own fonts, says how wide the word really is.
 */
let ruler: CanvasRenderingContext2D | null | undefined;
let families: { serif: string; sans: string } | null = null;
const widths = new Map<string, number>();
function widthOf(text: string, face: Face): number {
  const shown = face.upper ? text.toUpperCase() : text;
  const key = `${face.size}${face.italic}${face.serif}${face.track}|${shown}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  if (ruler === undefined) {
    ruler =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  }
  let w: number;
  if (ruler) {
    if (!families) {
      const root = getComputedStyle(document.documentElement);
      families = {
        serif: root.getPropertyValue("--serif").trim() || "serif",
        sans: root.getPropertyValue("--sans").trim() || "sans-serif",
      };
    }
    ruler.font = `${face.italic ? "italic " : ""}${face.size}px ${
      face.serif ? families.serif : families.sans
    }`;
    w = ruler.measureText(shown).width;
  } else {
    // no canvas to measure with: a generous average, which errs towards room
    w = shown.length * face.size * 0.6;
  }
  // letter-spacing, which the canvas does not apply
  w += shown.length * face.track * face.size;
  widths.set(key, w);
  return w;
}

/** The ground a name covers: anchored at x, sitting on the baseline at y. */
function textBox(
  x: number,
  y: number,
  w: number,
  face: Face,
  anchor: "start" | "middle" | "end",
  px: number
): Box {
  // the halo the name is drawn with, and a hair of air beyond it
  const pad = (face.halo + 1) * px;
  const width = w * px;
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  const ascent = face.size * (face.upper ? 0.72 : 0.78) * px;
  const descent = face.size * (face.upper ? 0.04 : 0.24) * px;
  return [left - pad, y - ascent - pad, left + width + pad, y + descent + pad];
}

/** Where a chapter's place may write its name, in pixels from its dot. */
interface Spot {
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
  /** far enough from the dot to need a hairline back to it */
  lead: boolean;
}

/**
 * Every spot a name may take, best first: beside the dot on the side with
 * more room, then the other side; centred just above and below; above and
 * below to either side; and only then further off along a hairline, a line
 * at a time, down and up, either side.
 *
 * A region the chapter names is different. It has no dot, so a hairline from
 * it points at nothing — or, worse, at whatever town happens to sit on its
 * anchor: Pisidia's line ended on Antioch's dot and read as Pisidia pointing
 * at Antioch. So a region is written across its own ground, or a line or two
 * off it, and never sent further on a line.
 */
function spotsFor(area: boolean, first: 1 | -1): Spot[] {
  const beside = (side: 1 | -1, dy: number, lead: boolean): Spot => ({
    dx: side * 5,
    dy,
    anchor: side > 0 ? "start" : "end",
    lead,
  });
  const sides: (1 | -1)[] = [first, first > 0 ? -1 : 1];
  if (area) {
    // a region the chapter names is written across its own ground: centred,
    // then a line or two up or down, and a little to either side — nearest
    // first, and never far enough to need a line back
    const near: Spot[] = [];
    for (const dy of [4.5, -10.5, 19.5, -25.5, 34.5]) {
      for (const dx of [0, -24, 24, -48, 48]) {
        near.push({ dx, dy, anchor: "middle", lead: false });
      }
    }
    return near.sort(
      (a, b) => a.dx ** 2 + (a.dy - 4.5) ** 2 - (b.dx ** 2 + (b.dy - 4.5) ** 2)
    );
  }
  const out: Spot[] = [];
  for (const side of sides) out.push(beside(side, 4.5, false));
  out.push({ dx: 0, dy: -8, anchor: "middle", lead: false });
  out.push({ dx: 0, dy: 18, anchor: "middle", lead: false });
  for (const side of sides) out.push(beside(side, -6, false), beside(side, 16, false));
  for (let k = 2; k <= 9; k++) {
    for (const side of sides) {
      out.push(beside(side, 4.5 + 15 * k, true), beside(side, 4.5 - 15 * k, true));
    }
  }
  return out;
}

/**
 * The map itself, at whatever part of the window it is asked for.
 *
 * Everything about how it looks is a function of `view`, not of the chapter's
 * own crop — which is what lets the full-screen viewer hand it a live viewBox
 * during a pinch and have the type stay the same size on the glass, the pins
 * stay the same size under the thumb, and names that were stacked because they
 * overlapped come apart again as the ground between them opens up.
 */
function MapArt({
  base,
  data,
  regions,
  view,
  onPlace,
  label,
  spacing,
  crowd,
  avoid,
  glance = false,
}: {
  base: Base;
  data: ChapterMapData;
  regions: { en: string; es: string; water?: boolean; x: number; y: number }[];
  view: View;
  onPlace: (verse: number) => void;
  label: string;
  /** how far apart names must stand on the glass, in pixels */
  spacing: number;
  /** and how many of them there may be at once */
  crowd: number;
  /** something drawn over the map that no name may be written under */
  avoid?: React.RefObject<HTMLElement | null>;
  /**
   * The small map in the panel, read at a glance. A region the chapter names
   * is left out of it when there is no room near its ground; full screen
   * always writes it, crowded if it must be, and a pinch makes the room.
   */
  glance?: boolean;
}) {
  const { lang } = useI18n();
  const [vx, vy, vw, vh] = view;
  const svgRef = useRef<SVGSVGElement>(null);

  /*
   * How many of the map's own units go into one pixel on the glass.
   *
   * Everything drawn here — type, dots, the thread from a moved name, the
   * space names must keep from each other — wants to be a size a thumb and an
   * eye understand, and those are measured in pixels. But an SVG can only be
   * told sizes in the units of its viewBox, and this viewBox changes with
   * every pinch.
   *
   * This was a fraction of the view width before, which held type still during
   * a zoom but tied it to how wide the map was drawn: the same label came out
   * at six pixels in a card on a phone and at twenty-six across a desktop.
   * Measuring the element instead makes fourteen pixels fourteen pixels
   * everywhere, which is the only definition of the right size there is.
   */
  const [wide, setWide] = useState(0);
  /**
   * Where the thing drawn over the map sits — the panel's zoom button — in
   * CSS pixels from the map's top-left corner, with the map's own size to
   * convert it by. Null for the full-screen viewer, which has nothing on top.
   */
  const [cover, setCover] = useState<{
    l: number;
    t: number;
    r: number;
    b: number;
    w: number;
    h: number;
  } | null>(null);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const s = el.getBoundingClientRect();
      setWide(s.width);
      const on = avoid?.current?.getBoundingClientRect();
      setCover(
        on
          ? {
              l: on.left - s.left,
              t: on.top - s.top,
              r: on.right - s.left,
              b: on.bottom - s.top,
              w: s.width,
              h: s.height,
            }
          : null
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [avoid]);
  /** one CSS pixel, in map units */
  const px = vw / (wide || 1000);

  /*
   * Where every name on the map is written, decided in one pass.
   *
   * Four kinds of name share this map — the chapter's own places, the era's
   * regions, the kinds of ground, and the gazetteer's countryside — and they
   * used to be placed by four rules that could not see each other. A region
   * was only checked against the edge of the frame, so "Lycaonia" went down
   * on top of "Cilicia". A chapter name that collided was pushed down a line,
   * and down again, with nothing to stop it at the bottom: Perga and Attalia
   * went out through the foot of Acts 14's frame and left their hairlines
   * pointing at nothing, and the zoom button sat on whatever was in its
   * corner. Across the forty most crowded chapters that came to 137 names
   * written over names, 185 cut off by the frame and 143 lines leaving it.
   *
   * Now every name is a measured box that must sit wholly inside the frame,
   * clear of the button, and each kind is placed in order of what matters
   * against everything placed before it. The chapter's towns come first and
   * are never dropped: beside the dot, then above and below, then further
   * off along a hairline — and if a cluster is truly too dense, the spot that
   * covers least, still inside the frame. The regions the chapter names come
   * next, written over their own ground — in the small panel, left for the
   * full-screen map when there is no room there; full screen, always. The
   * era's regions may move a line or two to find room, and the ground and
   * the countryside are left out where they do not fit, which is what they
   * were always for.
   *
   * The dots never move. The map stays true; only the writing makes room.
   */
  const layout = useMemo(() => {
    const frame: Box = [vx, vy, vx + vw, vy + vh];
    const sees = (x: number, y: number) =>
      x >= frame[0] && x <= frame[2] && y >= frame[1] && y <= frame[3];
    // the button, from the element's pixels into the map's units: the map is
    // drawn whole and centred inside its element
    let button: Box | null = null;
    if (cover && cover.w > 0 && cover.h > 0) {
      const k = Math.min(cover.w / vw, cover.h / vh);
      const ox = (cover.w - vw * k) / 2;
      const oy = (cover.h - vh * k) / 2;
      const air = 4;
      button = [
        vx + (cover.l - air - ox) / k,
        vy + (cover.t - air - oy) / k,
        vx + (cover.r + air - ox) / k,
        vy + (cover.b + air - oy) / k,
      ];
    }
    /*
     * Wholly inside the frame, a little way in from its edge, and never under
     * the button. These are walls, not crowding: a name crowded by another is
     * still half legible, and one under the button or past the edge is not
     * there at all.
     */
    const edge = px * 3;
    const fits = (b: Box) =>
      b[0] >= frame[0] + edge &&
      b[1] >= frame[1] + edge &&
      b[2] <= frame[2] - edge &&
      b[3] <= frame[3] - edge &&
      !(button && hits(b, button));

    /** everything already on the map that a new name must not cover */
    const taken = boxIndex(px * 48);
    const clear = (b: Box) => taken.clear(b);
    const covered = (b: Box, own?: Box) => taken.covered(b, own);

    // The chapter's own dots first: marks on the map that no name may cover.
    // A place outside the frame is left out, rather than drawn as half a name
    // at the edge — full screen, it is there as soon as the map is moved.
    const shown = data.places.filter((p) => sees(p.x, p.y));
    const dotOf = new Map<Place, Box>();
    for (const p of shown) {
      if (markFor(p.t) === 0) continue;
      const r = px * 4;
      const box: Box = [p.x - r, p.y - r, p.x + r, p.y + r];
      dotOf.set(p, box);
      taken.add(box);
    }

    /*
     * Towns first, then the regions the chapter names: a dot needs the room
     * beside it, and a region can be written anywhere over its own ground.
     *
     * A town is never left out. In the few clusters too dense for any free
     * spot — Nehemiah's gates, all within a few hundred yards of each other —
     * it takes the spot that covers least, still inside the frame. A region
     * with no free room near it is left out of the small map instead: written
     * over a town it hides the town, sent away on a line it points at the
     * wrong thing, and the full-screen map, four times the size, has room for
     * it.
     */
    const isArea = (p: Place) => (markFor(p.t) === 0 ? 1 : 0);
    const laid: (Place & {
      lx: number;
      ly: number;
      anchor: Spot["anchor"];
      lead: boolean;
    })[] = [];
    for (const p of [...shown].sort(
      (a, b) => isArea(a) - isArea(b) || a.y - b.y || a.x - b.x
    )) {
      const area = isArea(p) === 1;
      const face = area ? FACES.area : FACES.name;
      const w = widthOf(p.n, face);
      const spots = spotsFor(area, p.x < vx + vw * 0.62 ? 1 : -1);
      const own = dotOf.get(p);
      let pick = spots[0];
      let pickBox: Box | null = null;
      let least = Infinity;
      for (const spot of spots) {
        const box = textBox(p.x + spot.dx * px, p.y + spot.dy * px, w, face, spot.anchor, px);
        if (!fits(box)) continue;
        const cost = covered(box, own);
        if (cost < least) {
          least = cost;
          pick = spot;
          pickBox = box;
        }
        if (cost === 0) break;
      }
      if (area && least > 0 && glance) continue;
      // nowhere inside the frame at all: a name wider than the map
      if (!pickBox) {
        pickBox = textBox(p.x + pick.dx * px, p.y + pick.dy * px, w, face, pick.anchor, px);
      }
      taken.add(pickBox);
      laid.push({
        ...p,
        lx: p.x + pick.dx * px,
        ly: p.y + pick.dy * px,
        anchor: pick.anchor,
        lead: pick.lead,
      });
    }

    // The era's regions, centred on their country, a line or two off it if
    // that is what it takes; left out if no line is free.
    const named: { key: string; text: string; x: number; y: number; water?: boolean }[] = [];
    for (const r of regions) {
      const face = r.water ? FACES.water : FACES.region;
      const text = lang === "es" ? r.es : r.en;
      const w = widthOf(text, face);
      for (const dy of [0, -14, 14, -28, 28]) {
        const y = r.y + dy * px;
        const box = textBox(r.x, y, w, face, "middle", px);
        if (!fits(box) || !clear(box)) continue;
        taken.add(box);
        named.push({ key: r.en, text, x: r.x, y, water: r.water });
        break;
      }
    }

    // The kinds of ground, faintest of all, and a hundred pixels apart: they
    // are the paper the chapter is printed on.
    const grounds: { key: string; text: string; x: number; y: number; range: boolean }[] = [];
    for (const t of base.terrain) {
      if (grounds.some((g) => Math.hypot(g.x - t.x, g.y - t.y) < px * 100)) continue;
      const range = t.k === "range";
      const face = range ? FACES.range : FACES.ground;
      const text = lang === "es" ? t.es : t.n;
      const w = widthOf(text, face);
      for (const dy of [0, -12, 12]) {
        const y = t.y + dy * px;
        const box = textBox(t.x, y, w, face, "middle", px);
        if (!fits(box) || !clear(box)) continue;
        taken.add(box);
        grounds.push({ key: `${t.n}|${t.x}|${t.y}`, text, x: t.x, y, range });
        break;
      }
    }

    /*
     * The country between the pins.
     *
     * A chapter names four places on average, and four dots on an empty coast
     * is what you get when you zoom into them. Those four are four of 1,333,
     * and the rest were there the whole time — so the window's gazetteer is
     * offered, most-named first, and as many taken as will stand apart at the
     * size the map is drawn. How far apart is `spacing`, measured between
     * points, which is what makes the countryside arrive as a reader pinches
     * in; whether a name actually fits is the boxes, which is what keeps it
     * off everything already written. Nothing here is tappable: these are not
     * what the chapter is about.
     */
    const gap = (px * spacing) ** 2;
    const already = new Set([
      ...data.places.map((p) => p.n.toLowerCase()),
      ...regions.map((r) => (lang === "es" ? r.es : r.en).toLowerCase()),
    ]);
    // the same filing for the density test, in squares one gap wide, so a
    // site only measures itself against the squares around it
    const reach = Math.max(px * spacing, 1e-9);
    const pointCells = new Map<number, [number, number][]>();
    const pointKey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
    const file = (x: number, y: number) => {
      const k = pointKey(Math.floor(x / reach), Math.floor(y / reach));
      const list = pointCells.get(k);
      if (list) list.push([x, y]);
      else pointCells.set(k, [[x, y]]);
    };
    const crowded = (x: number, y: number) => {
      const cx = Math.floor(x / reach);
      const cy = Math.floor(y / reach);
      for (let i = cx - 1; i <= cx + 1; i++) {
        for (let j = cy - 1; j <= cy + 1; j++) {
          for (const [qx, qy] of pointCells.get(pointKey(i, j)) ?? []) {
            if ((qx - x) ** 2 + (qy - y) ** 2 < gap) return true;
          }
        }
      }
      return false;
    };
    for (const p of laid) {
      file(p.x, p.y);
      file(p.lx, p.ly);
    }
    for (const r of named) file(r.x, r.y);
    for (const g of grounds) file(g.x, g.y);
    const sites: { n: string; x: number; y: number; mark: number; side: 1 | -1 }[] = [];
    for (const [n, x, y, , mark] of base.sites) {
      if (sites.length >= crowd) break;
      if (!sees(x, y)) continue;
      if (already.has(n.toLowerCase())) continue;
      if (crowded(x, y)) continue;
      const dot: Box = [x - px * 3, y - px * 3, x + px * 3, y + px * 3];
      if (mark && !clear(dot)) continue;
      const w = widthOf(n, FACES.site);
      const first: 1 | -1 = x < vx + vw * 0.72 ? 1 : -1;
      let side: 1 | -1 | null = null;
      let box: Box | null = null;
      for (const s of [first, first > 0 ? -1 : 1] as (1 | -1)[]) {
        const b = textBox(x + s * 4.5 * px, y + 3.6 * px, w, FACES.site, s > 0 ? "start" : "end", px);
        if (fits(b) && clear(b)) {
          side = s;
          box = b;
          break;
        }
      }
      if (!box || !side) continue;
      if (mark) taken.add(dot);
      taken.add(box);
      file(x, y);
      sites.push({ n, x, y, mark, side });
    }

    return { laid, named, grounds, sites };
  }, [data.places, regions, base.terrain, base.sites, lang, vx, vy, vw, vh, px, spacing, crowd, cover, glance]);

  return (
    <svg
      ref={svgRef}
      viewBox={view.join(" ")}
      className="mp-svg"
      role="img"
      aria-label={label}
      /* one pixel, published to the stylesheet: sizes in there are written as
         calc(var(--mp-u) * 14px) and come out fourteen pixels tall */
      style={{ "--mp-u": px } as React.CSSProperties}
    >
      {/* the sea is the ground; the land is drawn on top of it */}
      <rect x={vx} y={vy} width={vw} height={vh} className="mp-sea" />
      {base.land.map((d, i) => (
        <path key={`l${i}`} d={d} className="mp-land" />
      ))}
      {/* what KIND of land: the Negev, the mountains of Lebanon, the delta.
          Over the coast and under everything written on it, faint enough to be
          the paper rather than the subject. */}
      {base.terrain.map((t) =>
        t.d.map((d, i) => (
          <path key={`t${t.n}${i}`} d={d} className={`mp-ground mp-${t.k}`} />
        ))
      )}
      {base.rivers.map((d, i) => (
        <path key={`r${i}`} d={d} className="mp-river" />
      ))}
      {base.lakes.map((d, i) => (
        <path key={`w${i}`} d={d} className="mp-lake" />
      ))}

      {/* the kinds of ground, named faintest of all and only where they fit */}
      {layout.grounds.map((g) => (
        <text
          key={`g${g.key}`}
          x={g.x}
          y={g.y}
          className={`mp-ground-name${g.range ? " mp-range-name" : ""}`}
          textAnchor="middle"
        >
          {g.text}
        </text>
      ))}

      {/* under everything the chapter itself names, and under the era's
          regions: this is the ground, not the subject */}
      {layout.sites.map((p) => (
        <g key={`n${p.n}`} className="mp-site" aria-hidden>
          {p.mark === 1 && <circle cx={p.x} cy={p.y} r={px * 1.5} />}
          {p.mark === 2 && (
            <path d={peakPath(p.x, p.y, px * 0.82)} className="mp-peak" />
          )}
          <text
            x={p.x + px * 4.5 * p.side}
            y={p.y + px * 3.6}
            textAnchor={p.side > 0 ? "start" : "end"}
          >
            {p.n}
          </text>
        </g>
      ))}

      {layout.named.map((r) => (
        <text
          key={r.key}
          x={r.x}
          y={r.y}
          className={`mp-region${r.water ? " mp-water" : ""}`}
          textAnchor="middle"
        >
          {r.text}
        </text>
      ))}

      {layout.laid.map((p) => {
        const mark = markFor(p.t);
        const side = p.anchor === "end" ? -1 : 1;
        return (
          <g
            key={p.n}
            className={`mp-pin${mark === 0 ? " mp-area" : ""}`}
            onClick={(e) => {
              // the map behind opens full screen; a place goes to its verse
              e.stopPropagation();
              onPlace(p.v);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onPlace(p.v);
            }}
          >
            {/* a fat invisible target: these are small marks and this is a
                phone. The dot is five pixels across and the thumb is not. */}
            <circle cx={p.x} cy={p.y} r={px * 15} className="mp-hit" />
            {/* the hairline back to the dot, for a name that had to be moved
                off it to be read at all */}
            {p.lead && (
              <line
                x1={p.x}
                y1={p.y}
                x2={p.lx - side * px}
                y2={p.ly - px * 3.5}
                className="mp-leader"
              />
            )}
            {mark === 1 && (
              <circle cx={p.x} cy={p.y} r={px * 2.7} className="mp-dot" />
            )}
            {mark === 2 && (
              <path d={peakPath(p.x, p.y, px)} className="mp-dot" />
            )}
            <text
              x={p.lx}
              y={p.ly}
              textAnchor={p.anchor}
              className="mp-name"
            >
              {p.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Full screen
// ---------------------------------------------------------------------------

const dist = (t: TouchList) =>
  Math.hypot(
    t[0].clientX - t[1].clientX,
    t[0].clientY - t[1].clientY
  );
const mid = (t: TouchList) => ({
  x: (t[0].clientX + t[1].clientX) / 2,
  y: (t[0].clientY + t[1].clientY) / 2,
});

/**
 * The map with the screen to itself, and two fingers to move it with.
 *
 * The app turns the browser's own pinch off everywhere — maximumScale 1, and
 * WebKit's gesture events swallowed — because magnifying the page is never
 * what a reader means by it. So the gesture is answered here instead, and
 * answered better: it moves the viewBox rather than the page, which means the
 * coastline is redrawn at the new scale instead of being blown up, and the
 * names stay the size they were.
 *
 * Panning is bounded by the base window rather than by the chapter's crop, so
 * a reader who zooms out of Bethlehem can wander up to Galilee and down to the
 * Negev — the whole map is there, and only the opening view was ever narrowed.
 */
function MapViewer({
  base,
  data,
  focus,
  regions,
  onPlace,
  onClose,
}: {
  base: Base;
  data: ChapterMapData;
  /** already checked for four numbers — see viewOf */
  focus: View;
  regions: { en: string; es: string; water?: boolean; x: number; y: number }[];
  onPlace: (verse: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);

  /*
   * How far in the reader may go.
   *
   * Not as far as the fingers will allow: Natural Earth resolves to a few
   * hundred metres and there is nothing under that to show, so past about a
   * sixteenth of the window a pinch buys nothing but a wider grey. The line is
   * drawn where the data stops rather than where the gesture does.
   */
  const MAX_ZOOM = 16;
  /** the smallest and largest the view may be, in window units */
  const limits = useRef({ min: base.width / MAX_ZOOM, max: base.width });

  /**
   * Open on the chapter's own crop, widened to the shape of the screen.
   *
   * Letterboxing is what happens when a viewBox and its element disagree about
   * their proportions, and it would put grey bars down the sides of a map that
   * has a sea to show there instead. Matching them on the way in means every
   * later zoom keeps them matched.
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const [fx, fy, fw, fh] = focus;
    let w = fw;
    let h = fh;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    limits.current = {
      min: base.width / MAX_ZOOM,
      max: Math.max(base.width, base.height * aspect),
    };
    setView(
      clamp([fx - (w - fw) / 2, fy - (h - fh) / 2, w, h], base, limits.current)
    );
    // opening measurement only — the view is the reader's from here on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, focus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /*
   * The gesture, in touch events rather than pointer events, to match the
   * reader's pinch — and because the two-finger case needs the whole touch
   * list at once rather than a set of pointers assembled by hand.
   */
  const gesture = useRef<{
    d: number;
    view: View;
    mid: { x: number; y: number };
    rect: DOMRect;
  } | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; rect: DOMRect } | null>(
    null
  );
  /** a finger that travelled is panning, and must not also count as a tap */
  const travelled = useRef(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !view) return;

    const onStart = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      travelled.current = 0;
      if (e.touches.length === 2) {
        drag.current = null;
        gesture.current = {
          d: dist(e.touches),
          view: viewRef.current,
          mid: mid(e.touches),
          rect,
        };
      } else if (e.touches.length === 1) {
        gesture.current = null;
        drag.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          view: viewRef.current,
          rect,
        };
      }
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (g && e.touches.length === 2) {
        e.preventDefault();
        const scale = dist(e.touches) / Math.max(1, g.d);
        const [ox, oy, ow, oh] = g.view;
        const { min, max } = limits.current;
        const w = Math.min(max, Math.max(min, ow / scale));
        const h = (w * oh) / ow;
        // the ground under the middle of the pinch is the ground that stays
        // there, so the map grows out of the point being held rather than out
        // of its own corner
        const ux = ox + ((g.mid.x - g.rect.left) / g.rect.width) * ow;
        const uy = oy + ((g.mid.y - g.rect.top) / g.rect.height) * oh;
        const now = mid(e.touches);
        travelled.current += Math.abs(scale - 1) * 100;
        setView(
          clamp(
            [
              ux - ((now.x - g.rect.left) / g.rect.width) * w,
              uy - ((now.y - g.rect.top) / g.rect.height) * h,
              w,
              h,
            ],
            base,
            limits.current
          )
        );
        return;
      }
      const d = drag.current;
      if (d && e.touches.length === 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - d.x;
        const dy = e.touches[0].clientY - d.y;
        travelled.current = Math.max(travelled.current, Math.hypot(dx, dy));
        const [ox, oy, ow, oh] = d.view;
        setView(
          clamp(
            [
              ox - (dx / d.rect.width) * ow,
              oy - (dy / d.rect.height) * oh,
              ow,
              oh,
            ],
            base,
            limits.current
          )
        );
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        gesture.current = null;
        drag.current = null;
      } else if (e.touches.length === 1) {
        // a pinch that lost a finger becomes a drag from where that one is
        gesture.current = null;
        drag.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          view: viewRef.current,
          rect: el.getBoundingClientRect(),
        };
      }
    };

    // WebKit's own pinch is a separate gesture stack from touch events, and
    // preventDefault on touchmove does not reach it — see the reader's pinch.
    const stopGesture = (ev: Event) => ev.preventDefault();

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    el.addEventListener("gesturestart", stopGesture);
    el.addEventListener("gesturechange", stopGesture);
    el.addEventListener("gestureend", stopGesture);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("gesturestart", stopGesture);
      el.removeEventListener("gesturechange", stopGesture);
      el.removeEventListener("gestureend", stopGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, view !== null]);

  /** the live view, readable from inside a handler that was built earlier */
  const viewRef = useRef<View>(focus);
  if (view) viewRef.current = view;

  /** A step of zoom about the middle, for a mouse and for a keyboard. */
  const step = (factor: number) => {
    const v = viewRef.current;
    const { min, max } = limits.current;
    const w = Math.min(max, Math.max(min, v[2] * factor));
    const h = (w * v[3]) / v[2];
    setView(
      clamp([v[0] + (v[2] - w) / 2, v[1] + (v[3] - h) / 2, w, h], base, limits.current)
    );
  };

  const reset = () => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const [fx, fy, fw, fh] = focus;
    let w = fw;
    let h = fh;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    setView(
      clamp([fx - (w - fw) / 2, fy - (h - fh) / 2, w, h], base, limits.current)
    );
  };

  return (
    <div className="map-full">
      <div className="map-full-bar">
        <p className="mp-era">{t(`map.era.${data.era}` as MessageKey)}</p>
        <div className="map-full-tools">
          <button
            type="button"
            className="lex-close"
            onClick={() => step(1 / 0.6)}
            aria-label={t("map.zoomOut")}
          >
            −
          </button>
          <button
            type="button"
            className="lex-close"
            onClick={() => step(0.6)}
            aria-label={t("map.zoomIn")}
          >
            +
          </button>
          <button
            type="button"
            className="lex-close"
            onClick={reset}
            aria-label={t("map.reset")}
          >
            <Icon name="globe" />
          </button>
          <button
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("search.close")}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="map-full-stage" ref={boxRef}>
        {view && (
          <MapArt
            base={base}
            data={data}
            regions={regions}
            view={view}
            label={t("reader.ctxWhere")}
            /* the gap names keep from each other on the glass, in pixels */
            spacing={22}
            crowd={150}
            onPlace={(verse) => {
              // a finger that panned is not a finger that tapped
              if (travelled.current > 10) return;
              onPlace(verse);
            }}
          />
        )}
      </div>
      <p className="map-full-note">{t("map.pinchHint")}</p>
    </div>
  );
}

/** Keep a view inside the map it is a view of. */
function clamp(
  [x, y, w, h]: View,
  base: Base,
  limits: { min: number; max: number }
): View {
  const width = Math.min(limits.max, Math.max(limits.min, w));
  const height = (h * width) / w;
  // Wider than the map itself means there is nothing left to choose: centre
  // it, and let the sea run out to the edges of the screen.
  const nx =
    width >= base.width
      ? (base.width - width) / 2
      : Math.min(Math.max(x, 0), base.width - width);
  const ny =
    height >= base.height
      ? (base.height - height) / 2
      : Math.min(Math.max(y, 0), base.height - height);
  return [nx, ny, width, height];
}

// ---------------------------------------------------------------------------

export default function ChapterMap({
  bookNr,
  chapter,
  onGoToVerse,
}: {
  bookNr: number;
  chapter: number;
  /** take the reader to the verse this place is named in */
  onGoToVerse: (verse: number) => void;
}) {
  const { lang, t } = useI18n();
  const [data, setData] = useState<ChapterMapData | null | undefined>(undefined);
  const [base, setBase] = useState<Base | null>(null);
  const [eras, setEras] = useState<Eras>({});
  const [full, setFull] = useState(false);
  /** the zoom button in the panel's corner, which names keep clear of */
  const expandRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /*
   * What comes back over the wire is checked, not trusted.
   *
   * This app's service worker serves its datasets cache-first and on purpose,
   * so new code meeting an older copy of a file is a normal state here rather
   * than an exotic one: a reader who had opened a map before the gazetteer
   * shipped had base maps in that cache with no `sites` in them, and the loop
   * over it threw and took the whole reader down with it — Acts crashed while
   * Genesis was fine, because only some of the six windows had been cached.
   *
   * So anything missing degrades to nothing rather than to an exception. A map
   * without its gazetteer is a map with fewer names on it, which is what the
   * reader had yesterday, and the next time the worker turns the cache over it
   * fills in silently.
   */
  useEffect(() => {
    let cancelled = false;
    load<Record<string, ChapterMapData>>(`/maps/${bookNr}.json`, {}).then(
      (book) => {
        if (cancelled) return;
        const row = book?.[String(chapter)];
        setData(
          row && Array.isArray(row.places) && row.places.length > 0 ? row : null
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [bookNr, chapter]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    Promise.all([
      load<Base | null>(`/maps/base/${data.base}.json`, null),
      load<Eras>("/maps/eras.json", {}),
    ]).then(([b, e]) => {
      if (cancelled) return;
      // the coastline is the one part a map cannot do without
      setBase(
        b && Array.isArray(b.land) && b.width > 0 && b.height > 0
          ? {
              ...b,
              lakes: Array.isArray(b.lakes) ? b.lakes : [],
              rivers: Array.isArray(b.rivers) ? b.rivers : [],
              sites: Array.isArray(b.sites) ? b.sites : [],
              terrain: Array.isArray(b.terrain) ? b.terrain : [],
            }
          : null
      );
      setEras(e && typeof e === "object" ? e : {});
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const regions = useMemo(() => {
    if (!base || !data) return [];
    const to = project(base.bounds, base.width);
    const [w, s, e, n] = base.bounds;
    const [fx, fy, fw, fh] = viewOf(data, base);
    const kept: { en: string; es: string; water?: boolean; x: number; y: number }[] =
      [];
    for (const r of eras[data.era]?.regions ?? []) {
      const [lon, lat] = r.ll;
      // a name for a country off the edge of this window is a name nobody can
      // place, so it is left off rather than pinned to the border
      if (lon < w || lon > e || lat < s || lat > n) continue;
      const [x, y] = to(lon, lat);
      // and nothing far outside the crop this chapter opens at — with a
      // margin, because the full-screen view can be panned past it
      if (
        x < fx - fw ||
        x > fx + fw * 2 ||
        y < fy - fh ||
        y > fy + fh * 2
      ) {
        continue;
      }
      /*
       * A region name gives way to the chapter's own places, always.
       *
       * Twice over: by name, because Matthew 2 names Judea and Galilee itself
       * and the era would have written both again a few pixels away; and by
       * position, because a country's name printed across a town's is two
       * words in one place and neither of them readable.
       */
      const label = lang === "es" ? r.es : r.en;
      if (data.places.some((p) => p.n.toLowerCase() === label.toLowerCase())) {
        continue;
      }
      if (data.places.some((p) => Math.hypot(p.x - x, p.y - y) < fw * 0.16)) {
        continue;
      }
      /*
       * And no two names on top of each other.
       *
       * An era's regions are written for the window that era usually gets.
       * Jonah reaches Tarshish, so his chapter is drawn on the whole known
       * world — where Israel, Judah, Philistia, Moab and Edom all land inside
       * a thumbnail of the Levant and print as one smudge. These are
       * decoration, not the chapter's content, so the crowded ones are simply
       * dropped; the places the chapter names are never dropped this way.
       */
      if (kept.some((k) => Math.hypot(k.x - x, k.y - y) < fw * 0.16)) continue;
      kept.push({ ...r, x, y });
    }
    return kept;
  }, [base, data, eras, lang]);

  /*
   * Nothing at all until there is something to draw — not a heading over a
   * space, and not a skeleton either.
   *
   * A little over a third of chapters name nowhere: the Psalms mostly, the
   * Proverbs, the doctrinal stretches of the letters. This owns its whole
   * section rather than sitting inside one, so on those chapters the panel
   * simply opens with the setting, as it always did.
   */
  if (data === undefined || data === null || !base) return null;

  const focus = viewOf(data, base);

  return (
    <div className="ctx-section ctx-map">
      <h3>
        <Icon name="globe" /> {t("reader.ctxWhere")}
      </h3>
      <p className="mp-era">{t(`map.era.${data.era}` as MessageKey)}</p>
      {/* The whole map opens it, not a corner of it: at this size the map is
          an illustration, and an illustration you can enlarge should enlarge
          when you touch it. The places keep their own tap — they stop the
          click before it gets here. */}
      <div
        className="mp-frame"
        role="button"
        tabIndex={0}
        aria-label={t("map.expand")}
        onClick={() => setFull(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setFull(true);
        }}
      >
        <MapArt
          base={base}
          data={data}
          regions={regions}
          view={focus}
          label={t("reader.ctxWhere")}
          /* Far wider apart in the panel than in the viewer, and far fewer.
             The same map is a third of the width in a card, and a countryside
             that reads full screen reads there as a crowd the chapter's own
             places are lost in — which is the one thing the panel is for. */
          spacing={36}
          crowd={34}
          avoid={expandRef}
          glance
          onPlace={onGoToVerse}
        />
        <span className="mp-expand" aria-hidden ref={expandRef}>
          <Icon name="search" />
        </span>
      </div>
      <p className="mp-note">
        {data.more
          ? `${t("map.tapAPlace")} · ${t("map.andMore", { n: String(data.more) })}`
          : t("map.tapAPlace")}
      </p>
      <p className="mp-credit">{t("map.credit")}</p>

      {/* Out to the body: the context panel is a .glass card, and a
          backdrop-filter makes its element the containing block for anything
          fixed inside it — so rendered where it is written, a full-screen map
          would be a small box inside a modal. */}
      {full &&
        mounted &&
        createPortal(
          <MapViewer
            base={base}
            data={data}
            focus={focus}
            regions={regions}
            onClose={() => setFull(false)}
            onPlace={(verse) => {
              setFull(false);
              onGoToVerse(verse);
            }}
          />,
          document.body
        )}
    </div>
  );
}
