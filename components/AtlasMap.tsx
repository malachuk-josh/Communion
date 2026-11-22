"use client";

// A map opened from the Maps tab, full screen: a chapter's, a journey whole,
// an era, or a place.
//
// It is the same map the Context pop-up opens (components/ChapterMap) — the
// same viewer, the same drawing, the same place cards — handed something
// other than "the chapter being read". All four kinds come down to what that
// viewer already takes: a base window, a crop to open at, the places to mark
// and perhaps a journey; this gathers those for whichever was asked for.
//
// Over the page and out on the body, as the Context pop-up's is: the viewer
// is fixed, and nothing fixed survives inside a pane that slides or a card
// made of glass.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  MapViewer,
  checkedBase,
  regionsOf,
  useMapNow,
  viewOf,
  type Base,
  type ChapterMapData,
  type EraLayer,
  type Eras,
  type MapRegion,
  type View,
} from "@/components/ChapterMap";
import Icon from "@/components/Icon";
import PlaceCard, { type Places, type TappedPlace } from "@/components/PlaceCard";
import VersePop, { PassageWords, usePassage } from "@/components/VersePop";
import { loadAtlas, mapHref, type AtlasJourney, type MapTarget } from "@/lib/atlas";
import { BOOKS } from "@/lib/bible";
import type { BookRef } from "@/lib/bookshelf";
import { ERA_REFS, JOURNEY_REFS, type MapRef } from "@/lib/mapRefs";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { loadEraStory, stepWays, type EraStory } from "@/lib/eraStory";
import { load } from "@/lib/mapData";
import { readLocal, writeLocal } from "@/lib/storage";

/** Everything a map needs, gathered: null where some of it could not be had. */
interface Gathered {
  base: Base;
  data: ChapterMapData;
  /** the journey, where the map is of one, for its list of stops */
  journey?: AtlasJourney;
  /** the place, where the map is of one: its card opens with the map */
  place?: TappedPlace;
}

const baseFile = (id: string) =>
  load<Base | null>(`/maps/base/${id}.json`, null).then(checkedBase);

async function gather(target: MapTarget): Promise<Gathered | null> {
  // a chapter's map is the row the Context pop-up reads, as it stands
  if (target.kind === "chapter") {
    const book = await load<Record<string, ChapterMapData>>(`/maps/${target.book}.json`, {});
    const row = book?.[String(target.chapter)];
    if (!row || !Array.isArray(row.places) || row.places.length === 0) return null;
    const base = await baseFile(row.base);
    return base ? { base, data: row } : null;
  }

  const atlas = await loadAtlas();
  if (!atlas) return null;

  if (target.kind === "journey") {
    const journey = atlas.journeys.find((j) => j.id === target.id);
    if (!journey || !Array.isArray(journey.legs) || !Array.isArray(journey.stops)) return null;
    const base = await baseFile(journey.base);
    if (!base) return null;
    return {
      base,
      journey,
      data: {
        base: journey.base,
        era: journey.era,
        focus: journey.focus,
        places: [],
        // The whole road, all of it bold. On a chapter's map the legs told
        // before are faded so that the chapter's own stand out; here there
        // is no chapter, and the journey is the subject.
        route: {
          j: journey.id,
          legs: journey.legs.map((l) => ({ p: l.p, s: 1, ...(l.sea ? { sea: 1 as const } : {}) })),
          stops: journey.stops.map((s) => ({ x: s.x, y: s.y, n: s.n, s: 1 })),
        },
      },
    };
  }

  if (target.kind === "era") {
    const era = atlas.eras.find((e) => e.id === target.id);
    if (!era) return null;
    const base = await baseFile(era.base);
    if (!base) return null;
    return {
      base,
      data: { base: era.base, era: era.id, focus: [0, 0, base.width, base.height], places: [] },
    };
  }

  // A place: on the tightest window that holds it, which the atlas knows, at
  // the spot that window's own gazetteer puts it. The card's file is asked
  // for too — it says which entry a doubled name really is, and what kind of
  // place it is to draw — but a map can be drawn without it.
  const places = await load<Places | null>("/maps/places.json", null);
  const id = places?.same?.[target.id] ?? target.id;
  const at = atlas.where[id] ?? atlas.where[target.id];
  const windowId = atlas.windows[at] ?? atlas.windows[atlas.windows.length - 1];
  if (!windowId) return null;
  const base = await baseFile(windowId);
  const site =
    base?.sites.find((s) => s[5] === id) ?? base?.sites.find((s) => s[5] === target.id);
  if (!base || !site) return null;
  const record = places?.places?.[id];
  const name = record?.[0] ?? site[0];
  // a quarter of the window about the place, kept inside the window
  const w = base.width / 4;
  const h = Math.min(w, base.height);
  const x = Math.min(Math.max(0, site[1] - w / 2), base.width - w);
  const y = Math.min(Math.max(0, site[2] - h / 2), base.height - h);
  return {
    base,
    place: { id, n: name },
    data: {
      base: windowId,
      era: "",
      focus: [x, y, w, h],
      places: [{ n: name, x: site[1], y: site[2], t: record?.[1] ?? "settlement", id }],
    },
  };
}

/**
 * Where an era's map is: its own opening, a passage on its card lit, one of
 * its journeys chosen, or a step of its story.
 */
type EraMode =
  | { k: "home" }
  | { k: "passage"; i: number }
  | { k: "journey"; id: string }
  | { k: "step"; i: number };

const modeKey = (m: EraMode) =>
  m.k === "home" ? "home" : m.k === "passage" ? `p${m.i}` : m.k === "journey" ? `j${m.id}` : `s${m.i}`;

/**
 * The crop that holds some points, with room round them: never tighter than
 * a quarter or so of the window, so one town is shown in its country rather than
 * alone on a blank, and only what is on this window counts — a way that runs
 * off its edge (to Egypt, from the Levant) is framed where it leaves.
 */
function frameOf(points: [number, number][], base: Base): View {
  const on = points.filter(
    ([x, y]) => x >= 0 && y >= 0 && x <= base.width && y <= base.height
  );
  if (on.length === 0) return [0, 0, base.width, base.height];
  const xs = on.map((q) => q[0]);
  const ys = on.map((q) => q[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const least = base.width / 4.5;
  const w = Math.max(least, (x1 - x0) * 1.35);
  const h = Math.max(least * 0.75, (y1 - y0) * 1.35);
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
}

export default function AtlasMap({
  target,
  onClose,
}: {
  target: MapTarget;
  onClose: () => void;
}) {
  const { lang, t } = useI18n();
  const router = useRouter();
  /** undefined while it is being gathered, null where it could not be */
  const [got, setGot] = useState<Gathered | null | undefined>(undefined);
  const [eras, setEras] = useState<Eras>({});
  const [card, setCard] = useState<TappedPlace | null>(null);
  const [stopsOpen, setStopsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // an era's story, and where in it the reader is
  const [story, setStory] = useState<EraStory | null>(null);
  const [mode, setMode] = useState<EraMode>({ k: "home" });
  /** how many times the map has been sent somewhere, so each is a new trip */
  const [trip, setTrip] = useState(0);
  const [playing, setPlaying] = useState(false);
  const go = (m: EraMode) => {
    setMode(m);
    setTrip((n) => n + 1);
    if (m.k !== "step") setPlaying(false);
  };

  const key = JSON.stringify(target);
  useEffect(() => {
    let live = true;
    setGot(undefined);
    setCard(null);
    setStopsOpen(false);
    setStory(null);
    setMode({ k: "home" });
    setTrip(0);
    setPlaying(false);
    Promise.all([
      gather(target),
      load<Eras>("/maps/eras.json", {}),
      // an era's story comes with its map; without it the map is as it was
      target.kind === "era" ? loadEraStory(target.id) : Promise.resolve(null),
    ])
      .then(([g, e, st]) => {
        if (!live) return;
        setEras(e && typeof e === "object" ? e : {});
        setStory(st);
        setGot(g);
        // a place asked for by name is asked about: its card opens with it
        if (g?.place) setCard(g.place);
      })
      .catch(() => {
        if (live) setGot(null);
      });
    return () => {
      live = false;
    };
    // `key` is the target, said in a way an effect can compare
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const { now, toggleNow, modern } = useMapNow(got?.base ?? null);

  /*
   * An era's map, as the story has it at this moment: the realms of the age
   * (or of this step), its journeys faint or one of them chosen, the places
   * a passage or a step names, lit, and the way anyone went, drawn on. And
   * where to look — the map glides there, above the card — or, back at the
   * era's own opening, the whole of it again.
   */
  const era = useMemo(() => {
    if (target.kind !== "era" || !got || !story) return null;
    const step = mode.k === "step" ? story.steps[mode.i] : undefined;
    const shown = step?.lands ?? story.show;
    const realms = story.lands.filter((l) => shown.includes(l.id));
    const places =
      mode.k === "passage" ? (story.passages[mode.i] ?? []) : step ? step.places : [];
    const ways = step ? stepWays(story, step) : [];
    const trail = mode.k === "journey" ? mode.id : null;
    const key = `${modeKey(mode)}#${trip}`;
    const layer: EraLayer = {
      realms,
      glow: step?.glow,
      // on the era's own opening, faint, to be noticed and chosen; one chosen,
      // bold. While a passage or the story is told, they would only be lines
      // across what it is about.
      trails: mode.k === "home" || mode.k === "journey" ? story.journeys : [],
      trail,
      ways,
      key,
      lit: places.length > 0,
    };
    let frame: { focus: View; above: boolean; key: string } | null = null;
    if (mode.k !== "home") {
      // A step's places are what it shows. The realms it lights are framed
      // only when it names no place: a kingdom and its tributaries together
      // run the length of the Levant, and a phone above its card is wide and
      // short — framing them all would lose the places themselves.
      const glowing = places.length
        ? []
        : story.lands.filter(
            (l) => step?.glow?.includes(l.id) && Number.isFinite(l.x) && Number.isFinite(l.y)
          );
      const points: [number, number][] = [
        ...places.map((p): [number, number] => [p.x, p.y]),
        ...glowing.map((l): [number, number] => [l.x!, l.y!]),
        ...ways.flatMap((w) => w.p),
        ...(story.journeys.find((j) => j.id === trail)?.legs.flatMap((l) => l.p) ?? []),
      ];
      frame = { focus: frameOf(points, got.base), above: true, key };
    } else if (trip > 0) {
      frame = { focus: viewOf(got.data, got.base), above: false, key };
    }
    return { layer, places, frame };
  }, [target.kind, got, story, mode, trip]);

  const data = useMemo(
    () => (got ? (era ? { ...got.data, places: era.places } : got.data) : null),
    [got, era]
  );

  const regions = useMemo((): MapRegion[] => {
    if (!got || !data) return [];
    const own = regionsOf(got.base, data, eras, lang);
    if (!era || !story || era.layer.realms.length === 0) return own;
    // the realms name themselves; of the era's own names only those kept
    const named = (r: { en: string; es: string }) => (lang === "es" ? r.es : r.en).toLowerCase();
    const kept = own.filter((r) => story.keep.includes(r.en));
    const realms = era.layer.realms
      .filter((r) => r.en && r.es && Number.isFinite(r.x) && Number.isFinite(r.y))
      .map((r) => ({ en: r.en!, es: r.es!, x: r.x!, y: r.y! }))
      .filter((r) => !era.places.some((p) => p.n.toLowerCase() === named(r)));
    return [...kept, ...realms];
  }, [got, data, eras, lang, era, story]);
  const focus = useMemo(() => (got ? viewOf(got.data, got.base) : null), [got]);

  // Playing, the story moves on by itself: long enough at each step to read
  // the words and watch the way drawn, and it stops at the end.
  useEffect(() => {
    if (!playing || mode.k !== "step" || !story) return;
    const step = story.steps[mode.i];
    if (!step) return;
    const words = (lang === "es" ? step.es : step.en).length;
    const ms = Math.max(6000, 2000 + words * 40);
    const timer = window.setTimeout(() => {
      if (mode.i + 1 < story.steps.length) {
        setMode({ k: "step", i: mode.i + 1 });
        setTrip((n) => n + 1);
      } else setPlaying(false);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [playing, mode, story, lang]);

  // while there is no viewer to hear it, Escape still closes
  useEffect(() => {
    if (got) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [got, onClose]);

  if (!mounted) return null;

  const bookName = (nr: number) => BOOKS[nr - 1]?.[lang === "es" ? "es" : "en"] ?? "";
  const read = (b: number, c: number, v?: number) =>
    router.push(v ? `/?b=${b}&c=${c}&v=${v}` : `/?b=${b}&c=${c}`);

  if (!got || !focus) {
    return createPortal(
      <div className="map-full" role="dialog" aria-modal="true" aria-label={t("maps.title")}>
        <div className="map-full-bar">
          <div className="map-full-title">
            <p className="mp-era">{got === undefined ? t("common.loading") : t("maps.title")}</p>
          </div>
          <div className="map-full-tools">
            <button type="button" className="lex-close" onClick={onClose} aria-label={t("common.close")}>
              ✕
            </button>
          </div>
        </div>
        <div className="map-full-stage atlas-map-wait">
          {got === null && <p>{t("maps.mapFailed")}</p>}
        </div>
      </div>,
      document.body
    );
  }

  const { journey } = got;
  if (!data) return null;
  let title: string;
  let subtitle: string | undefined;
  let actions: React.ReactNode = null;
  let about: React.ReactNode = null;
  if (target.kind === "chapter") {
    const ref = `${bookName(target.book)} ${target.chapter}`;
    title = ref;
    subtitle = data.route
      ? t(`map.journey.${data.route.j}` as MessageKey)
      : t(`map.era.${data.era}` as MessageKey);
    actions = (
      <button type="button" className="chip" onClick={() => read(target.book, target.chapter)}>
        <Icon name="book" /> {t("maps.read", { ref })}
      </button>
    );
  } else if (target.kind === "journey") {
    title = t(`map.journey.${target.id}` as MessageKey);
    subtitle = t(`map.era.${data.era}` as MessageKey);
    if (journey) {
      actions = (
        <button type="button" className="chip" onClick={() => setStopsOpen(true)}>
          <Icon name="runner" /> {t("maps.stops", { n: String(journey.visits.length) })}
        </button>
      );
    }
    // the words and the passages come together: a journey added to the
    // atlas without them opens as it did before there were any
    const refs = JOURNEY_REFS[target.id];
    if (refs) {
      about = (
        <MapAbout
          icon="runner"
          heading={t("maps.aboutJourney")}
          words={t(`map.journeyAbout.${target.id}` as MessageKey)}
          refs={refs}
        />
      );
    }
  } else if (target.kind === "era") {
    title = t(`map.era.${target.id}` as MessageKey);
    about = (
      <EraCard
        era={target.id}
        story={story}
        mode={mode}
        go={go}
        playing={playing}
        setPlaying={setPlaying}
        onOpenJourney={(id) => router.push(mapHref({ kind: "journey", id }))}
      />
    );
  } else {
    title = got.place?.n ?? "";
  }

  return (
    <>
      {createPortal(
        <MapViewer
          key={key}
          base={got.base}
          data={data}
          focus={focus}
          regions={regions}
          onClose={onClose}
          onPlace={setCard}
          modern={modern}
          now={now}
          onNow={toggleNow}
          title={title}
          subtitle={subtitle}
          resetLabel={t("maps.reset")}
          actions={actions}
          about={about}
          // a journey is to be seen whole, above its words; an era's map is
          // the ground they are read over
          fitAbove={target.kind === "journey"}
          layer={era?.layer ?? null}
          onTrail={era ? (id) => go({ k: "journey", id }) : undefined}
          frame={era?.frame ?? null}
        />,
        document.body
      )}
      {stopsOpen && journey && (
        <JourneyStops
          journey={journey}
          title={title}
          covered={card !== null}
          onClose={() => setStopsOpen(false)}
          onPlace={setCard}
          onRead={(b, c) => read(b, c)}
        />
      )}
      {card && (
        <PlaceCard
          place={card}
          // no chapter but a chapter's map: every reference is "somewhere else"
          bookNr={target.kind === "chapter" ? target.book : 0}
          chapter={target.kind === "chapter" ? target.chapter : 0}
          onClose={() => setCard(null)}
          onGoToVerse={(verse) => {
            if (target.kind === "chapter") read(target.book, target.chapter, verse);
          }}
          onGoToRef={([b, c, v]) => read(b, c, v)}
        />
      )}
    </>
  );
}

/**
 * A journey's stops, in the order it makes them: the number each has on the
 * map, the place, and the chapter that tells of it. The place opens its card;
 * the chapter opens The Word there.
 */
function JourneyStops({
  journey,
  title,
  covered,
  onClose,
  onPlace,
  onRead,
}: {
  journey: AtlasJourney;
  title: string;
  /** a place's card is open over this, and Escape is the card's to answer */
  covered: boolean;
  onClose: () => void;
  onPlace: (place: TappedPlace) => void;
  onRead: (book: number, chapter: number) => void;
}) {
  const { lang, t } = useI18n();

  // Escape closes the list, not the map under it: heard first, on the way
  // down, and kept from going further (as a place's card does)
  useEffect(() => {
    if (covered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [covered, onClose]);

  return createPortal(
    <div className="modal-overlay over-panel" onClick={onClose}>
      <div
        className="glass modal place-card atlas-stops"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-stops-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="place-head">
          <h2 id="atlas-stops-title">
            <Icon name="runner" /> {title}
          </h2>
          <button type="button" className="lex-close" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>
        <ol className="atlas-visits">
          {journey.visits.map((visit, i) => (
            <li key={i}>
              <span className="atlas-visit-n" aria-hidden>
                {i + 1}
              </span>
              {visit.id ? (
                <button
                  type="button"
                  className="link-btn atlas-visit-name"
                  onClick={() => onPlace({ id: visit.id, n: visit.name })}
                >
                  {visit.name}
                </button>
              ) : (
                <span className="atlas-visit-name">{visit.name}</span>
              )}
              <button
                type="button"
                className="chip atlas-visit-at"
                onClick={() => onRead(visit.at[0], visit.at[1])}
              >
                {BOOKS[visit.at[0] - 1]?.[lang === "es" ? "es" : "en"]} {visit.at[1]}
              </button>
            </li>
          ))}
        </ol>
        <p className="atlas-stops-note">{t("maps.routeNote")}</p>
      </div>
    </div>,
    document.body
  );
}

/** Whether a reader last left the card open: open until they fold it. */
const ABOUT_KEY = "communion.mapAbout";

/**
 * What a map is of, over its foot: an age, or a journey. A few sentences,
 * and the passages that tell it, each opening its verses over the map.
 *
 * Open when the map opens, because that is what it is for; folded to its
 * heading with a tap, for a reader who wants the whole map, and left folded
 * the next time they open one until they unfold it again. Asked for before
 * the first paint (the map is only ever drawn in the browser), so a journey's
 * map is fitted round the card as the reader will see it.
 */
function MapAbout({
  icon,
  heading,
  words,
  refs,
}: {
  icon: "hourglass" | "runner";
  heading: string;
  words: string;
  refs: MapRef[];
}) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(() => readLocal(ABOUT_KEY) !== "0");
  const [verse, setVerse] = useState<BookRef | null>(null);
  const toggle = () =>
    setOpen((was) => {
      writeLocal(ABOUT_KEY, was ? "0" : "1");
      return !was;
    });

  const label = ([b, c, v, last]: MapRef) =>
    `${BOOKS[b - 1]?.[lang === "es" ? "es" : "en"] ?? ""} ${c}:${v}${last ? `–${last}` : ""}`;

  return (
    <div className={`map-about glass${open ? " open" : ""}`}>
      <button type="button" className="map-about-head" aria-expanded={open} onClick={toggle}>
        <Icon name={icon} />
        <span>{heading}</span>
        <span className={`bn-caret${open ? " open" : ""}`} aria-hidden>
          ⌄
        </span>
      </button>
      {open && (
        <div className="map-about-body">
          <p>{words}</p>
          {refs.length > 0 && (
            <div className="map-about-refs">
              {refs.map((ref) => {
                const [b, c, v, last] = ref;
                const text = label(ref);
                return (
                  <button
                    key={text}
                    type="button"
                    className="chip"
                    onClick={() => setVerse({ text, b, c, v, ...(last ? { ve: last } : {}) })}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {verse && <VersePop verse={verse} over onClose={() => setVerse(null)} />}
    </div>
  );
}

/**
 * An era's card, over the foot of its map: what the age was, and the ways in.
 *
 *   home      the words about the era; "Play this era"; the passages, each
 *             lighting where it happened; the era's journeys, each lit on
 *             the map and a tap from opening whole
 *   passage   the passage's words in place, while its places are lit
 *   journey   one journey lit, its words, and the way to open it
 *   step      the story a step at a time, by itself or by hand, each with
 *             its year where it has one, and its verse a tap away
 *
 * Folded like the journeys' card — one choice for both — and folding pauses
 * the story. Escape comes back here before it closes the map.
 */
function EraCard({
  era,
  story,
  mode,
  go,
  playing,
  setPlaying,
  onOpenJourney,
}: {
  era: string;
  story: EraStory | null;
  mode: EraMode;
  go: (m: EraMode) => void;
  playing: boolean;
  setPlaying: (on: boolean) => void;
  onOpenJourney: (id: string) => void;
}) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(() => readLocal(ABOUT_KEY) !== "0");
  const [verse, setVerse] = useState<BookRef | null>(null);
  const toggle = () =>
    setOpen((was) => {
      writeLocal(ABOUT_KEY, was ? "0" : "1");
      if (was) setPlaying(false);
      return !was;
    });

  const refs = ERA_REFS[era] ?? [];
  const label = ([b, c, v, last]: MapRef) =>
    `${BOOKS[b - 1]?.[lang === "es" ? "es" : "en"] ?? ""} ${c}:${v}${last ? `–${last}` : ""}`;
  const asVerse = (ref: MapRef): BookRef => {
    const [b, c, v, last] = ref;
    return { text: label(ref), b, c, v, ...(last ? { ve: last } : {}) };
  };

  // Escape goes back to the era's own card before it closes the map: heard
  // on the way down, and kept from the map while there is somewhere to go back
  // to (a verse open over it answers Escape itself)
  useEffect(() => {
    if (mode.k === "home" || verse) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      go({ k: "home" });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mode, verse, go]);

  const back = (
    <button type="button" className="map-about-back" onClick={() => go({ k: "home" })}>
      <Icon name="prev" /> {t("maps.back")}
    </button>
  );

  let body: React.ReactNode;
  if (mode.k === "passage" && refs[mode.i]) {
    body = (
      <>
        {back}
        <EraPassage key={mode.i} verse={asVerse(refs[mode.i])} />
      </>
    );
  } else if (mode.k === "journey") {
    body = (
      <>
        {back}
        <h3 className="map-about-title">
          <Icon name="runner" /> {t(`map.journey.${mode.id}` as MessageKey)}
        </h3>
        <p>{t(`map.journeyAbout.${mode.id}` as MessageKey)}</p>
        <button
          type="button"
          className="btn btn-primary map-about-go"
          onClick={() => onOpenJourney(mode.id)}
        >
          <Icon name="runner" /> {t("maps.openJourney")}
        </button>
      </>
    );
  } else if (mode.k === "step" && story?.steps[mode.i]) {
    const step = story.steps[mode.i];
    const total = story.steps.length;
    const last = mode.i === total - 1;
    const ref = step.ref as MapRef;
    body = (
      <>
        <div className="map-step-bar">
          <button
            type="button"
            className="lex-close"
            onClick={() => go({ k: "home" })}
            aria-label={t("maps.back")}
          >
            <Icon name="back" />
          </button>
          <span className="map-step-count">
            {t("maps.step", { n: String(mode.i + 1), total: String(total) })}
            {step.date && <span className="map-step-date">{step.date[lang === "es" ? 1 : 0]}</span>}
          </span>
          <div className="map-step-tools">
            <button
              type="button"
              className="lex-close"
              disabled={mode.i === 0}
              onClick={() => go({ k: "step", i: mode.i - 1 })}
              aria-label={t("maps.prev")}
            >
              <Icon name="prev" />
            </button>
            {last && !playing ? (
              <button
                type="button"
                className="lex-close"
                onClick={() => {
                  go({ k: "step", i: 0 });
                  setPlaying(true);
                }}
                aria-label={t("maps.again")}
                title={t("maps.again")}
              >
                <Icon name="play" />
              </button>
            ) : (
              <button
                type="button"
                className="lex-close"
                onClick={() => setPlaying(!playing)}
                aria-label={playing ? t("maps.pause") : t("maps.resume")}
              >
                <Icon name={playing ? "pause" : "play"} />
              </button>
            )}
            <button
              type="button"
              className="lex-close"
              disabled={last}
              onClick={() => go({ k: "step", i: mode.i + 1 })}
              aria-label={t("maps.next")}
            >
              <Icon name="next" />
            </button>
          </div>
        </div>
        <div className="map-step-dots" aria-hidden>
          {story.steps.map((_, i) => (
            <span key={i} className={i === mode.i ? "on" : i < mode.i ? "past" : ""} />
          ))}
        </div>
        <p key={mode.i} className="map-step-words">
          {lang === "es" ? step.es : step.en}
        </p>
        <div className="map-about-refs">
          <button
            type="button"
            className="chip"
            onClick={() => {
              setPlaying(false);
              setVerse(asVerse(ref));
            }}
          >
            <Icon name="book" /> {label(ref)}
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p>{t(`map.eraAbout.${era}` as MessageKey)}</p>
        {story && story.steps.length > 0 && (
          <button
            type="button"
            className="btn btn-primary map-about-go"
            onClick={() => {
              go({ k: "step", i: 0 });
              setPlaying(true);
            }}
          >
            <Icon name="play" /> {t("maps.play")}
          </button>
        )}
        {refs.length > 0 && (
          <>
            <p className="map-about-label">{t("maps.passages")}</p>
            <div className="map-about-refs">
              {refs.map((ref, i) => (
                <button
                  key={label(ref)}
                  type="button"
                  className="chip"
                  // without the story the map has nowhere to light, so the
                  // passage opens over the map as it did before
                  onClick={() => (story ? go({ k: "passage", i }) : setVerse(asVerse(ref)))}
                >
                  {label(ref)}
                </button>
              ))}
            </div>
          </>
        )}
        {story && story.journeys.length > 0 && (
          <>
            <p className="map-about-label">{t("maps.journeys")}</p>
            <div className="map-about-refs">
              {story.journeys.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className="chip"
                  onClick={() => go({ k: "journey", id: j.id })}
                >
                  <Icon name="runner" /> {t(`map.journey.${j.id}` as MessageKey)}
                </button>
              ))}
            </div>
          </>
        )}
        {story && story.lands.length > 0 && <p className="map-about-note">{t("maps.approx")}</p>}
      </>
    );
  }

  return (
    <div className={`map-about glass${open ? " open" : ""}`}>
      <button type="button" className="map-about-head" aria-expanded={open} onClick={toggle}>
        <Icon name="hourglass" />
        <span>{t("maps.about")}</span>
        <span className={`bn-caret${open ? " open" : ""}`} aria-hidden>
          ⌄
        </span>
      </button>
      {/* keyed by where the reader is, so each opens at its top rather than
          wherever the last was scrolled to */}
      {open && (
        <div className="map-about-body" key={modeKey(mode)}>
          {body}
        </div>
      )}
      {verse && <VersePop verse={verse} over onClose={() => setVerse(null)} />}
    </div>
  );
}

/** A passage's words in the card, and the way into The Word for the chapter round it. */
function EraPassage({ verse: given }: { verse: BookRef }) {
  const { t } = useI18n();
  // one passage is one fetch, however often the card above is drawn again
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const verse = useMemo(() => given, [given.b, given.c, given.v, given.ve]);
  const { text, missing, label, translation } = usePassage(verse);
  return (
    <>
      <h3 className="map-about-title">
        {label} <span className="bk-pop-tr">{translation}</span>
      </h3>
      {missing ? (
        <p className="cal-hint">{t("shelf.verseOffline")}</p>
      ) : text ? (
        <p>
          <PassageWords text={text} />
        </p>
      ) : (
        <div className="skeleton bk-pop-wait" />
      )}
      <Link
        className="map-about-link"
        href={`/?b=${verse.b}&c=${verse.c}${verse.v ? `&v=${verse.v}` : ""}`}
      >
        <Icon name="book" /> {t("shelf.openInWord")}
      </Link>
    </>
  );
}
