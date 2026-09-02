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
 */
const held = new Map<string, Promise<unknown>>();
function load<T>(url: string, fallback: T): Promise<T> {
  if (!held.has(url)) {
    held.set(
      url,
      fetch(url)
        .then((res) => (res.ok ? res.json() : fallback))
        .catch(() => fallback)
    );
  }
  return held.get(url) as Promise<T>;
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
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => setWide(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /** one CSS pixel, in map units */
  const px = vw / (wide || 1000);

  /*
   * Where each name is written.
   *
   * Genesis 12 walks from Haran to Egypt, so its map is fifteen hundred
   * kilometres wide — and four of the places it names, Shechem and Moreh and
   * Bethel and Ai, sit within thirty of each other. Printed at their dots they
   * are one illegible smudge.
   *
   * So a name that would land on one already written is pushed down a line,
   * and a hairline goes back to the dot it belongs to. The dots never move:
   * the map stays true, and the list of names beside the cluster is the thing
   * that becomes readable. Zoom in far enough and the stacking undoes itself,
   * because the crowding it answers is gone.
   */
  const laid = useMemo(() => {
    const lineH = px * 15;
    const drop = px * 4.5;
    const placed: { x: number; y: number; right: boolean }[] = [];
    return [...data.places]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((p) => {
        const right = p.x < vx + vw * 0.62;
        let ly = p.y + drop;
        for (let guard = 0; guard < 14; guard++) {
          const clash = placed.some(
            (q) =>
              q.right === right &&
              Math.abs(q.y - ly) < lineH &&
              Math.abs(q.x - p.x) < px * 110
          );
          if (!clash) break;
          ly += lineH;
        }
        placed.push({ x: p.x, y: ly, right });
        return { ...p, ly, right, moved: ly - (p.y + drop) > 1 };
      });
  }, [data.places, vx, vw, px]);

  /*
   * The country between the pins.
   *
   * A chapter names four places on average, and four dots on an empty coast is
   * what you get when you zoom into them — the ground in between is where the
   * map runs out of things to say. But those four are four of 1,333, and the
   * rest were there the whole time: Shiloh and Gibeon and Michmash do not stop
   * existing because this chapter is about Bethel.
   *
   * So the window's whole gazetteer is offered, most-named first, and as many
   * are taken as will stand apart at the size the map is currently drawn. The
   * spacing is a fraction of the view, so this manages itself: at a glance a
   * few of the great cities, and once a reader has pinched in, the whole
   * countryside arriving as the room for it appears.
   *
   * The chapter's own places are seeded into the reckoning first and never
   * dropped. Nothing here is tappable — these are not what the chapter is
   * about, and a name that answers a touch by doing nothing is worse than one
   * that plainly does not.
   */
  /*
   * Which stretches of ground get named.
   *
   * Their anchors are the middle of whatever part of them is in the window, so
   * a name can land anywhere — including across a town's. These give way to
   * everything: they are the paper the chapter is printed on, and a reader who
   * cannot read "Negev Desert" has lost less than one who cannot read
   * "Beersheba".
   */
  const grounds = useMemo(() => {
    const kept: Base["terrain"] = [];
    for (const t of base.terrain) {
      const half = (lang === "es" ? t.es : t.n).length * 4 * px;
      if (t.x - half < vx || t.x + half > vx + vw) continue;
      if (t.y < vy + px * 16 || t.y > vy + vh - px * 10) continue;
      if (kept.some((k) => Math.hypot(k.x - t.x, k.y - t.y) < px * 100)) continue;
      if (
        data.places.some(
          (q) => Math.abs(q.x - t.x) < px * 80 && Math.abs(q.y - t.y) < px * 18
        )
      ) {
        continue;
      }
      kept.push(t);
    }
    return kept;
  }, [base.terrain, data.places, lang, vx, vy, vw, vh, px]);

  const near = useMemo(() => {
    // squared, and compared squared: this runs the length of the gazetteer
    // against everything kept so far, on every frame of a pinch, and
    // Math.hypot is careful about overflow in a way nothing here needs
    const gap = (px * spacing) ** 2;
    /*
     * Inside the frame, not merely near it.
     *
     * A name is written beside its dot, so a dot admitted from just outside
     * the edge takes its name off the edge with it, and the frame clips it —
     * "Joppa" arriving as "oppa". A little pop-in while panning is the better
     * of the two.
     */
    const margin = 0;
    /*
     * Seeded with where the chapter's names were actually WRITTEN, not only
     * where their dots are.
     *
     * Four of them get pushed down a line to be read at all, and a name pushed
     * down lands somewhere its dot is not — so seeding with dots alone let a
     * background name settle on top of a moved one. Both go in: the dot is a
     * mark on the map, and the label is a claim on the space beside it.
     */
    const taken = laid.flatMap((p) => [
      { x: p.x, y: p.y },
      { x: p.x, y: p.ly },
    ]);
    // and the era's own names, which are written across the map before any of
    // these and must not be written over
    for (const r of regions) taken.push({ x: r.x, y: r.y });
    for (const t of grounds) taken.push({ x: t.x, y: t.y });
    const out: { n: string; x: number; y: number; mark: number }[] = [];
    /*
     * Nothing that is already written on this map.
     *
     * The chapter's own places, obviously — but the era's regions too, which
     * are drawn from the same world: the gazetteer has "the Great Sea" and
     * "the Sea of Galilee" as places, and the era writes both across the water
     * they name, so without this they print twice, a few pixels apart, in two
     * different styles.
     */
    const named = new Set([
      ...data.places.map((p) => p.n.toLowerCase()),
      ...regions.map((r) => (lang === "es" ? r.es : r.en).toLowerCase()),
    ]);
    for (const [n, x, y, , site] of base.sites) {
      if (out.length >= crowd) break;
      if (x < vx - margin || x > vx + vw + margin) continue;
      if (y < vy - margin || y > vy + vh + margin) continue;
      if (named.has(n.toLowerCase())) continue;
      let clear = true;
      for (const q of taken) {
        const dx = q.x - x;
        const dy = q.y - y;
        /*
         * Two tests, because a name is not a dot.
         *
         * The round one keeps the map from filling up — it is what `spacing`
         * sets, and what makes the density answer the zoom. But a name is
         * eighty pixels wide and twelve tall, so two dots comfortably apart on
         * that test can still have their names meet in the middle: Magdal and
         * Senna, a screen apart on the ground, printed as "Magdalsenna".
         * The second test is the shape of the writing itself.
         */
        if (dx * dx + dy * dy < gap) {
          clear = false;
          break;
        }
        if (Math.abs(dx) < px * 66 && Math.abs(dy) < px * 12) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      taken.push({ x, y });
      out.push({ n, x, y, mark: site });
    }
    return out;
  }, [base.sites, laid, data.places, regions, grounds, lang, vx, vy, vw, vh, px, spacing, crowd]);

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
      {grounds.map((t) => (
        <text
          key={`g${t.n}`}
          x={t.x}
          y={t.y}
          className={`mp-ground-name${t.k === "range" ? " mp-range-name" : ""}`}
          textAnchor="middle"
        >
          {lang === "es" ? t.es : t.n}
        </text>
      ))}

      {/* under everything the chapter itself names, and under the era's
          regions: this is the ground, not the subject */}
      {near.map((p) => {
        // written back towards the middle near the right edge, or the frame
        // clips it: the same turn the chapter's own names take
        const right = p.x < vx + vw * 0.72;
        return (
          <g key={`n${p.n}`} className="mp-site" aria-hidden>
            {p.mark === 1 && <circle cx={p.x} cy={p.y} r={px * 1.5} />}
            {p.mark === 2 && (
              <path d={peakPath(p.x, p.y, px * 0.82)} className="mp-peak" />
            )}
            <text
              x={p.x + px * (right ? 4.5 : -4.5)}
              y={p.y + px * 3.6}
              textAnchor={right ? "start" : "end"}
            >
              {p.n}
            </text>
          </g>
        );
      })}

      {/* A country's name is centred on the middle of the country, so unlike
          everything else here it needs room on BOTH sides of its anchor — and
          "The Great Sea" is anchored near the left edge of the Holy Land's
          window, where half of it fell off the frame. Measured against the
          live view rather than the chapter's opening crop, so zooming in also
          stops drawing the ones that have gone off the screen. */}
      {regions
        .filter((r) => {
          const half = (lang === "es" ? r.es : r.en).length * 4.2 * px;
          return (
            r.x - half > vx &&
            r.x + half < vx + vw &&
            r.y > vy + px * 10 &&
            r.y < vy + vh - px * 6
          );
        })
        .map((r) => (
          <text
            key={r.en}
            x={r.x}
            y={r.y}
            className={`mp-region${r.water ? " mp-water" : ""}`}
            textAnchor="middle"
          >
            {lang === "es" ? r.es : r.en}
          </text>
        ))}

      {laid.map((p) => {
        const { right } = p;
        const mark = markFor(p.t);
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
            {p.moved && (
              <line
                x1={p.x}
                y1={p.y}
                x2={p.x + px * (right ? 4 : -4)}
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
              x={p.x + px * (right ? 5 : -5)}
              y={p.ly}
              textAnchor={right ? "start" : "end"}
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
          onPlace={onGoToVerse}
        />
        <span className="mp-expand" aria-hidden>
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
