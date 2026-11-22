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
import {
  loadEraStory,
  loadJourneyStory,
  stepWays,
  type EraStory,
  type JourneyStory,
} from "@/lib/eraStory";
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
  // an era's story or a journey's, and where in it the reader is
  const [story, setStory] = useState<EraStory | null>(null);
  const [jstory, setJstory] = useState<JourneyStory | null>(null);
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
    setJstory(null);
    setMode({ k: "home" });
    setTrip(0);
    setPlaying(false);
    Promise.all([
      gather(target),
      load<Eras>("/maps/eras.json", {}),
      // an era's story, or a journey's, comes with its map; without it the
      // map is as it was
      target.kind === "era" ? loadEraStory(target.id) : Promise.resolve(null),
      target.kind === "journey" ? loadJourneyStory(target.id) : Promise.resolve(null),
    ])
      .then(([g, e, st, js]) => {
        if (!live) return;
        setEras(e && typeof e === "object" ? e : {});
        setStory(st);
        // one step for every stop the atlas draws, or none: a story from an
        // older build that counts the stops differently would play the wrong legs
        setJstory(js && g?.journey && js.stops.length === g.journey.visits.length ? js : null);
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

  /*
   * A journey's map, told the same way: its era's realms, a passage's places
   * lit, and, played, a stop at a time — the road so far drawn bold, the leg
   * to this stop drawn on as the reader watches, the road ahead faint, the
   * stops reached numbered bright; the map gliding to each, above the card.
   */
  const jview = useMemo(() => {
    if (target.kind !== "journey" || !got?.data.route || !jstory) return null;
    const route = got.data.route;
    const at = mode.k === "step" ? mode.i : -1;
    const stop = at >= 0 ? jstory.stops[at] : undefined;
    const places =
      mode.k === "passage" ? (jstory.passages[mode.i] ?? []) : stop ? [stop] : [];
    // the leg that reaches this stop; the first stop is where it all begins
    const leg = at > 0 ? route.legs[at - 1] : undefined;
    const ways = leg ? [{ p: leg.p, ...(leg.sea ? { sea: 1 as const } : {}) }] : [];
    const key = `${modeKey(mode)}#${trip}`;
    const layer: EraLayer = {
      realms: jstory.lands.filter((l) => jstory.show.includes(l.id)),
      trails: [],
      ways,
      key,
      lit: places.length > 0,
      tone: "wj",
    };
    /** a stop badge's visits, from its numbers: "1·15", "11–13" */
    const visits = (n: string) =>
      n.split("·").flatMap((part) => {
        const [a, b] = part.split("–").map(Number);
        return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a];
      });
    const told =
      at < 0
        ? route
        : {
            ...route,
            legs: route.legs.map((l, i) => ({ ...l, s: (i < at - 1 ? 1 : 0) as 0 | 1 })),
            stops: route.stops.map((st) => ({
              ...st,
              s: (visits(st.n).some((v) => v <= at + 1) ? 1 : 0) as 0 | 1,
            })),
          };
    let frame: { focus: View; above: boolean; key: string } | null = null;
    if (mode.k !== "home") {
      const points: [number, number][] = [
        ...places.map((p): [number, number] => [p.x, p.y]),
        ...ways.flatMap((w) => w.p),
      ];
      frame = { focus: frameOf(points, got.base), above: true, key };
    } else if (trip > 0) {
      frame = { focus: viewOf(got.data, got.base), above: true, key };
    }
    return { layer, places, frame, route: told };
  }, [target.kind, got, jstory, mode, trip]);

  /** what the map is telling now: an era's story or a journey's */
  const told = era ?? jview;
  const keep = era ? story?.keep : jview ? jstory?.keep : undefined;

  const data = useMemo(
    () =>
      got
        ? jview
          ? { ...got.data, places: jview.places, route: jview.route }
          : era
            ? { ...got.data, places: era.places }
            : got.data
        : null,
    [got, era, jview]
  );

  const regions = useMemo((): MapRegion[] => {
    if (!got || !data) return [];
    const own = regionsOf(got.base, data, eras, lang);
    if (!told || !keep || told.layer.realms.length === 0) return own;
    // the realms name themselves; of the era's own names only those kept
    const named = (r: { en: string; es: string }) => (lang === "es" ? r.es : r.en).toLowerCase();
    const kept = own.filter((r) => keep.includes(r.en));
    const realms = told.layer.realms
      .filter((r) => r.en && r.es && Number.isFinite(r.x) && Number.isFinite(r.y))
      .map((r) => ({ en: r.en!, es: r.es!, x: r.x!, y: r.y! }))
      .filter((r) => !told.places.some((p) => p.n.toLowerCase() === named(r)));
    return [...kept, ...realms];
  }, [got, data, eras, lang, told, keep]);
  const focus = useMemo(() => (got ? viewOf(got.data, got.base) : null), [got]);

  // Playing, the story moves on by itself: long enough at each step to read
  // the words and watch the way drawn, and it stops at the end. A journey's
  // stop is a verse, read in the card, and a leg drawn: a steady pace.
  const steps = story?.steps.length ?? jstory?.stops.length ?? 0;
  useEffect(() => {
    if (!playing || mode.k !== "step" || !steps) return;
    const step = story?.steps[mode.i];
    const ms = step ? Math.max(6000, 2000 + (lang === "es" ? step.es : step.en).length * 40) : 7000;
    const timer = window.setTimeout(() => {
      if (mode.i + 1 < steps) {
        setMode({ k: "step", i: mode.i + 1 });
        setTrip((n) => n + 1);
      } else setPlaying(false);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [playing, mode, story, steps, lang]);

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
      const stops = jstory?.stops ?? [];
      about = (
        <StoryCard
          icon="runner"
          heading={t("maps.aboutJourney")}
          words={t(`map.journeyAbout.${target.id}` as MessageKey)}
          playLabel={t("maps.playJourney")}
          refs={refs}
          lights={!!jstory}
          approx={!!jstory && jstory.lands.length > 0}
          steps={stops.length}
          mode={mode}
          go={go}
          playing={playing}
          setPlaying={setPlaying}
          step={(i) => {
            const stop = stops[i];
            const ref = lang === "es" && stop.refEs ? stop.refEs : stop.ref;
            return (
              <>
                <p className="map-step-place">
                  <Icon name="pin" /> {stop.n}
                </p>
                <EraPassage
                  verse={{ text: "", b: ref[0], c: ref[1], v: ref[2] }}
                  heading={false}
                />
              </>
            );
          }}
        />
      );
    }
  } else if (target.kind === "era") {
    title = t(`map.era.${target.id}` as MessageKey);
    const era = target.id;
    about = (
      <StoryCard
        icon="hourglass"
        heading={t("maps.about")}
        words={t(`map.eraAbout.${era}` as MessageKey)}
        playLabel={t("maps.play")}
        refs={ERA_REFS[era] ?? []}
        lights={!!story}
        approx={!!story && story.lands.length > 0}
        journeys={story?.journeys.map((j) => j.id)}
        onOpenJourney={(id) => router.push(mapHref({ kind: "journey", id }))}
        steps={story?.steps.length ?? 0}
        stepDate={(i) => story?.steps[i]?.date?.[lang === "es" ? 1 : 0]}
        mode={mode}
        go={go}
        playing={playing}
        setPlaying={setPlaying}
        step={(i, openVerse) => {
          const step = story!.steps[i];
          const ref = step.ref as MapRef;
          return (
            <>
              <p key={i} className="map-step-words">
                {lang === "es" ? step.es : step.en}
              </p>
              <div className="map-about-refs">
                <button type="button" className="chip" onClick={() => openVerse(ref)}>
                  <Icon name="book" /> {refLabel(ref, lang)}
                </button>
              </div>
            </>
          );
        }}
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
          layer={told?.layer ?? null}
          onTrail={era ? (id) => go({ k: "journey", id }) : undefined}
          frame={told?.frame ?? null}
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

/** A passage's name: "1 Kings 4:25", "Reyes 4:25–26". */
function refLabel([b, c, v, last]: MapRef, lang: string): string {
  return `${BOOKS[b - 1]?.[lang === "es" ? "es" : "en"] ?? ""} ${c}:${v}${last ? `–${last}` : ""}`;
}

/**
 * The card over the foot of an era's map or a journey's: what it is, and the
 * ways in.
 *
 *   home      the words about it; Play; the passages, each lighting where it
 *             happened; for an era, its journeys, each lit on the map and a
 *             tap from opening whole
 *   passage   the passage's words in place, while its places are lit
 *   journey   (an era's) one journey lit, its words, and the way to open it
 *   step      the story a step at a time, by itself or by hand — an era's
 *             with its year where it has one, a journey's stop by stop
 *
 * Without a story (a file that did not arrive) the passages open over the
 * map as they did before, and there is nothing to play. Folded, it pauses;
 * one choice to fold it holds for every map. Escape comes back here before
 * it closes the map.
 */
function StoryCard({
  icon,
  heading,
  words,
  playLabel,
  refs,
  lights,
  approx,
  journeys,
  onOpenJourney,
  steps,
  stepDate,
  step,
  mode,
  go,
  playing,
  setPlaying,
}: {
  icon: "hourglass" | "runner";
  heading: string;
  words: string;
  playLabel: string;
  refs: MapRef[];
  /** the story arrived: passages light the map, and there is a story to play */
  lights: boolean;
  /** realms are shaded, and the card says they are approximate */
  approx: boolean;
  journeys?: string[];
  onOpenJourney?: (id: string) => void;
  steps: number;
  stepDate?: (i: number) => string | undefined;
  /** step i's words, with a way to open a passage over the map */
  step: (i: number, openVerse: (ref: MapRef) => void) => React.ReactNode;
  mode: EraMode;
  go: (m: EraMode) => void;
  playing: boolean;
  setPlaying: (on: boolean) => void;
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

  const asVerse = (ref: MapRef): BookRef => {
    const [b, c, v, last] = ref;
    return { text: refLabel(ref, lang), b, c, v, ...(last ? { ve: last } : {}) };
  };
  const openVerse = (ref: MapRef) => {
    setPlaying(false);
    setVerse(asVerse(ref));
  };

  // Escape goes back to the card's own opening before it closes the map:
  // heard on the way down, and kept from the map while there is somewhere to
  // go back to (a verse open over it answers Escape itself)
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
        {onOpenJourney && (
          <button
            type="button"
            className="btn btn-primary map-about-go"
            onClick={() => onOpenJourney(mode.id)}
          >
            <Icon name="runner" /> {t("maps.openJourney")}
          </button>
        )}
      </>
    );
  } else if (mode.k === "step" && mode.i < steps) {
    const last = mode.i === steps - 1;
    const date = stepDate?.(mode.i);
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
            {t("maps.step", { n: String(mode.i + 1), total: String(steps) })}
            {date && <span className="map-step-date">{date}</span>}
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
        <div className={`map-step-dots${steps > 12 ? " many" : ""}`} aria-hidden>
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} className={i === mode.i ? "on" : i < mode.i ? "past" : ""} />
          ))}
        </div>
        {step(mode.i, openVerse)}
      </>
    );
  } else {
    body = (
      <>
        {/* first, where a card that has to scroll still shows it */}
        {lights && steps > 0 && (
          <button
            type="button"
            className="btn btn-primary map-about-go map-about-play"
            onClick={() => {
              go({ k: "step", i: 0 });
              setPlaying(true);
            }}
          >
            <Icon name="play" /> {playLabel}
          </button>
        )}
        <p>{words}</p>
        {refs.length > 0 && (
          <>
            <p className="map-about-label">{t("maps.passages")}</p>
            <div className="map-about-refs">
              {refs.map((ref, i) => (
                <button
                  key={refLabel(ref, lang)}
                  type="button"
                  className="chip"
                  // without the story the map has nowhere to light, so the
                  // passage opens over the map as it did before
                  onClick={() => (lights ? go({ k: "passage", i }) : setVerse(asVerse(ref)))}
                >
                  {refLabel(ref, lang)}
                </button>
              ))}
            </div>
          </>
        )}
        {journeys && journeys.length > 0 && (
          <>
            <p className="map-about-label">{t("maps.journeys")}</p>
            <div className="map-about-refs">
              {journeys.map((id) => (
                <button key={id} type="button" className="chip" onClick={() => go({ k: "journey", id })}>
                  <Icon name="runner" /> {t(`map.journey.${id}` as MessageKey)}
                </button>
              ))}
            </div>
          </>
        )}
        {approx && <p className="map-about-note">{t("maps.approx")}</p>}
      </>
    );
  }

  return (
    <div className={`map-about glass${open ? " open" : ""}`}>
      <button type="button" className="map-about-head" aria-expanded={open} onClick={toggle}>
        <Icon name={icon} />
        <span>{heading}</span>
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
function EraPassage({ verse: given, heading = true }: { verse: BookRef; heading?: boolean }) {
  const { t } = useI18n();
  // one passage is one fetch, however often the card above is drawn again
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const verse = useMemo(() => given, [given.b, given.c, given.v, given.ve]);
  const { text, missing, label, translation } = usePassage(verse);
  return (
    <>
      {heading ? (
        <h3 className="map-about-title">
          {label} <span className="bk-pop-tr">{translation}</span>
        </h3>
      ) : (
        // under a stop's name, the reference is the small print
        <p className="map-step-ref">
          {label} <span className="bk-pop-tr">{translation}</span>
        </p>
      )}
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
