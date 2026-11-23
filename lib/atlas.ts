// The atlas: what the Maps tab can open, read from /maps/atlas.json
// (scripts/build-atlas.mjs writes it; components/Atlas.tsx lists it and
// components/AtlasMap.tsx draws from it).

import { load } from "@/lib/mapData";

/** A journey whole, on the window that holds all of it. */
export interface AtlasJourney {
  id: string;
  /** the base window it is drawn on, and the era whose names go with it */
  base: string;
  era: string;
  /** the road and a margin: [x, y, w, h] in the window's units */
  focus: [number, number, number, number];
  legs: { p: [number, number][]; sea?: 1 }[];
  /** one for each dot; `n` its visit numbers, "4·8" where it is passed twice */
  stops: { x: number; y: number; n: string }[];
  /** the visits in order: the place, the chapter that tells of it, its dot */
  visits: { name: string; id?: string; at: [number, number]; stop: number }[];
  /** every chapter whose own map carries this journey: [book, chapter] */
  chapters: [number, number][];
}

export interface Atlas {
  v: number;
  /** the base windows, tightest first; `where` indexes into this */
  windows: string[];
  journeys: AtlasJourney[];
  eras: { id: string; base: string }[];
  /** the chapters that have a map, by book number */
  books: Record<string, number[]>;
  /** for each place id, the tightest window that holds it */
  where: Record<string, number>;
}

/**
 * The atlas, or null where it cannot be had.
 *
 * Checked like every map file (see checkedBase in components/ChapterMap): the
 * service worker serves /maps/ cache-first, so this code can meet an older
 * copy of the file, or a phone that has never fetched it and has no signal.
 * Anything that is not the shape below is no atlas, and the page says so
 * rather than throwing over a missing list.
 */
export function loadAtlas(): Promise<Atlas | null> {
  return load<Atlas | null>("/maps/atlas.json", null).then((a) =>
    a &&
    Array.isArray(a.windows) &&
    Array.isArray(a.journeys) &&
    Array.isArray(a.eras) &&
    a.books &&
    typeof a.books === "object" &&
    a.where &&
    typeof a.where === "object"
      ? a
      : null
  );
}

/** What a map on the Maps tab is of. */
export type MapTarget =
  | { kind: "chapter"; book: number; chapter: number }
  | { kind: "journey"; id: string }
  /** an era, opened at a step of its story (the timeline's "on the map") */
  | { kind: "era"; id: string; step?: number }
  | { kind: "place"; id: string };

/** The address a map opens at, so that Back closes it and a link can name it. */
export function mapHref(target: MapTarget): string {
  switch (target.kind) {
    case "chapter":
      return `/maps?b=${target.book}&c=${target.chapter}`;
    case "journey":
      return `/maps?j=${encodeURIComponent(target.id)}`;
    case "era":
      return `/maps?era=${encodeURIComponent(target.id)}${
        target.step !== undefined ? `&s=${target.step}` : ""
      }`;
    case "place":
      return `/maps?p=${encodeURIComponent(target.id)}`;
  }
}

/** …and the map an address names, or none. */
export function mapTargetOf(params: URLSearchParams): MapTarget | null {
  const j = params.get("j");
  if (j) return { kind: "journey", id: j };
  const era = params.get("era");
  if (era) {
    const step = Number(params.get("s"));
    return Number.isInteger(step) && step >= 0 && params.has("s")
      ? { kind: "era", id: era, step }
      : { kind: "era", id: era };
  }
  const p = params.get("p");
  if (p) return { kind: "place", id: p };
  const book = Number(params.get("b"));
  const chapter = Number(params.get("c"));
  if (Number.isInteger(book) && book >= 1 && book <= 66 && Number.isInteger(chapter) && chapter >= 1) {
    return { kind: "chapter", book, chapter };
  }
  return null;
}
