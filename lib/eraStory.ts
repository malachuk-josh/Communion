// The era maps' story (public/maps/era-story.json, written by
// scripts/build-era-story.mjs from scripts/era-story.mjs): for each era, the
// realms of the age, its journeys, where the passages on its card happened,
// and the steps of "Play this era" — all in the units of the window that era
// is drawn on, ready to draw.
//
// Fetched once and held (lib/mapData), and looked over before it is used:
// the maps' files are served from the offline cache first, and a copy left
// from an older build must make a plainer map, never a broken one.

import type { Place, Realm, Way } from "@/components/ChapterMap";
import { load } from "@/lib/mapData";

/** A way travelled at a step: its own points, or legs a..b of a journey. */
export type StepWay = Way | { j: string; a: number; b: number };

export interface EraStep {
  /** [English, Spanish], where the step has a year */
  date?: [string, string];
  en: string;
  es: string;
  ref: [number, number, number, number?];
  places: Place[];
  go?: StepWay[];
  /** the realms at this step, where they differ from the era's own */
  lands?: string[];
  /** the realms this step is about */
  glow?: string[];
}

export interface EraStory {
  lands: Realm[];
  show: string[];
  keep: string[];
  journeys: { id: string; legs: Way[] }[];
  /** one list of places for each passage on the era's card, in its order */
  passages: Place[][];
  steps: EraStep[];
}

const isList = (v: unknown): v is unknown[] => Array.isArray(v);
const isPoint = (v: unknown) =>
  isList(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
const isWay = (v: unknown): v is Way =>
  !!v && typeof v === "object" && isList((v as Way).p) && (v as Way).p.every(isPoint);
const isPlace = (v: unknown): v is Place =>
  !!v &&
  typeof v === "object" &&
  typeof (v as Place).n === "string" &&
  Number.isFinite((v as Place).x) &&
  Number.isFinite((v as Place).y);

/** One era's story, or null where the file is missing, old or damaged. */
function checked(raw: unknown): EraStory | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<EraStory>;
  if (!isList(e.lands) || !isList(e.steps) || !isList(e.journeys) || !isList(e.passages)) {
    return null;
  }
  return {
    lands: e.lands.filter(
      (l): l is Realm => !!l && typeof l.d === "string" && typeof l.id === "string"
    ),
    show: isList(e.show) ? e.show.filter((s): s is string => typeof s === "string") : [],
    keep: isList(e.keep) ? e.keep.filter((s): s is string => typeof s === "string") : [],
    journeys: e.journeys
      .filter((j) => !!j && typeof j.id === "string" && isList(j.legs))
      .map((j) => ({ id: j.id, legs: j.legs.filter(isWay) })),
    passages: e.passages.map((list) => (isList(list) ? list.filter(isPlace) : [])),
    steps: e.steps.filter(
      (s): s is EraStep =>
        !!s &&
        typeof s.en === "string" &&
        typeof s.es === "string" &&
        isList(s.ref) &&
        s.ref.length >= 3 &&
        s.ref.slice(0, 3).every(Number.isFinite) &&
        isList(s.places)
    ).map((s) => ({ ...s, places: s.places.filter(isPlace) })),
  };
}

/** The story of one era, fetched with all the others the first time. */
export async function loadEraStory(era: string): Promise<EraStory | null> {
  const file = await load<{ v?: number; eras?: Record<string, unknown> } | null>(
    "/maps/era-story.json",
    null
  );
  if (!file || file.v !== 1 || !file.eras || typeof file.eras !== "object") return null;
  return checked(file.eras[era]);
}

/** A step's ways as points, the journeys' legs among them taken from the era's. */
export function stepWays(story: EraStory, step: EraStep): Way[] {
  const out: Way[] = [];
  for (const g of step.go ?? []) {
    if ("j" in g) {
      const legs = story.journeys.find((j) => j.id === g.j)?.legs ?? [];
      out.push(...legs.slice(g.a, g.b + 1));
    } else if (isWay(g)) {
      out.push(g);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// A journey's story (public/maps/journey-story.json, from the same script):
// its era's realms on the journey's own window, where its passages happened,
// and one stop at a time — the place, where the drawn road reaches it, and
// the verse that names it there (a Spanish one besides where the Reina-Valera
// numbers that verse apart).

export interface JourneyStop extends Place {
  ref: [number, number, number];
  refEs?: [number, number, number];
}

export interface JourneyStory {
  lands: Realm[];
  show: string[];
  keep: string[];
  passages: Place[][];
  stops: JourneyStop[];
}

const isRef = (r: unknown): r is [number, number, number] =>
  isList(r) && r.length >= 3 && r.slice(0, 3).every(Number.isFinite);

/** One journey's story, or null where the file is missing, old or damaged. */
export async function loadJourneyStory(id: string): Promise<JourneyStory | null> {
  const file = await load<{ v?: number; journeys?: Record<string, unknown> } | null>(
    "/maps/journey-story.json",
    null
  );
  if (!file || file.v !== 1 || !file.journeys || typeof file.journeys !== "object") return null;
  const raw = file.journeys[id] as Partial<JourneyStory> | undefined;
  if (!raw || !isList(raw.lands) || !isList(raw.stops) || !isList(raw.passages)) return null;
  const stops = raw.stops.filter(
    (s): s is JourneyStop => isPlace(s) && isRef((s as JourneyStop).ref)
  );
  // a stop lost from the middle would put every later one at the wrong leg
  if (stops.length !== raw.stops.length) return null;
  return {
    lands: raw.lands.filter(
      (l): l is Realm => !!l && typeof l.d === "string" && typeof l.id === "string"
    ),
    show: isList(raw.show) ? raw.show.filter((s): s is string => typeof s === "string") : [],
    keep: isList(raw.keep) ? raw.keep.filter((s): s is string => typeof s === "string") : [],
    passages: raw.passages.map((list) => (isList(list) ? list.filter(isPlace) : [])),
    stops: stops.map((s) => (isRef(s.refEs) ? s : { ...s, refEs: undefined })),
  };
}
