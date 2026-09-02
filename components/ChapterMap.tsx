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
// the app's own colours, so it is legible in all three themes, and that it
// costs a few kilobytes rather than a few megabytes.

import React, { useEffect, useMemo, useState } from "react";
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
}

interface Region {
  en: string;
  es: string;
  ll: [number, number];
  water?: boolean;
}

type Eras = Record<string, { regions: Region[] }>;

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

/** A place with a dot, or a name written across country. */
const isSite = (type: string) =>
  !["region", "natural area", "body of water", "river", "valley", "special"].includes(
    type
  );

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

  useEffect(() => {
    let cancelled = false;
    load<Record<string, ChapterMapData>>(`/maps/${bookNr}.json`, {}).then(
      (book) => {
        if (cancelled) return;
        setData(book[String(chapter)] ?? null);
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
      setBase(b);
      setEras(e);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const regions = useMemo(() => {
    if (!base || !data) return [];
    const to = project(base.bounds, base.width);
    const [w, s, e, n] = base.bounds;
    const [fx, fy, fw, fh] = data.focus;
    const kept: { en: string; es: string; water?: boolean; x: number; y: number }[] =
      [];
    for (const r of eras[data.era]?.regions ?? []) {
      const [lon, lat] = r.ll;
      // a name for a country off the edge of this window is a name nobody can
      // place, so it is left off rather than pinned to the border
      if (lon < w || lon > e || lat < s || lat > n) continue;
      const [x, y] = to(lon, lat);
      // and nothing outside the crop this chapter is drawn at
      if (x < fx || x > fx + fw || y < fy || y > fy + fh) continue;
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
   * that becomes readable.
   */
  const laid = (() => {
    const [fx, , fw] = data.focus;
    const lineH = fw * 0.03;
    const drop = fw * 0.0042;
    const placed: { x: number; y: number; right: boolean }[] = [];
    return [...data.places]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((p) => {
        const right = p.x < fx + fw * 0.62;
        let ly = p.y + drop;
        for (let guard = 0; guard < 14; guard++) {
          const clash = placed.some(
            (q) =>
              q.right === right &&
              Math.abs(q.y - ly) < lineH &&
              Math.abs(q.x - p.x) < fw * 0.3
          );
          if (!clash) break;
          ly += lineH;
        }
        placed.push({ x: p.x, y: ly, right });
        return { ...p, ly, right, moved: ly - (p.y + drop) > 1 };
      });
  })();

  return (
    <div className="ctx-section ctx-map">
      <h3>
        <Icon name="globe" /> {t("reader.ctxWhere")}
      </h3>
      <p className="mp-era">{t(`map.era.${data.era}` as MessageKey)}</p>
      <div className="mp-frame">
        <svg
          viewBox={data.focus.join(" ")}
          className="mp-svg"
          role="img"
          aria-label={t("reader.ctxWhere")}
          /* Every chapter is drawn at its own zoom, so a size fixed in the
             map's own units would be a hairline on one map and a slab on the
             next. Type and strokes are scaled by this instead, which keeps
             them the same on the glass wherever the crop lands. */
          style={
            { "--mp-u": data.focus[2] / 1000 } as React.CSSProperties
          }
        >
          {/* the sea is the ground; the land is drawn on top of it */}
          <rect
            x={data.focus[0]}
            y={data.focus[1]}
            width={data.focus[2]}
            height={data.focus[3]}
            className="mp-sea"
          />
          {base.land.map((d, i) => (
            <path key={`l${i}`} d={d} className="mp-land" />
          ))}
          {base.rivers.map((d, i) => (
            <path key={`r${i}`} d={d} className="mp-river" />
          ))}
          {base.lakes.map((d, i) => (
            <path key={`w${i}`} d={d} className="mp-lake" />
          ))}

          {regions.map((r) => (
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
            const site = isSite(p.t);
            return (
              <g
                key={p.n}
                className={`mp-pin${site ? "" : " mp-area"}`}
                onClick={() => onGoToVerse(p.v)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onGoToVerse(p.v);
                }}
              >
                {/* a fat invisible target: these are small marks and this is
                    a phone. The dot is 4 units across and the thumb is not. */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={data.focus[2] * 0.028}
                  className="mp-hit"
                />
                {/* the hairline back to the dot, for a name that had to be
                    moved off it to be read at all */}
                {p.moved && (
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={p.x + data.focus[2] * (right ? 0.008 : -0.008)}
                    y2={p.ly - data.focus[2] * 0.003}
                    className="mp-leader"
                  />
                )}
                {site && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={data.focus[2] * 0.0048}
                    className="mp-dot"
                  />
                )}
                <text
                  x={p.x + data.focus[2] * (right ? 0.009 : -0.009)}
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
      </div>
      <p className="mp-note">
        {data.more
          ? `${t("map.tapAPlace")} · ${t("map.andMore", { n: String(data.more) })}`
          : t("map.tapAPlace")}
      </p>
      <p className="mp-credit">{t("map.credit")}</p>
    </div>
  );
}
