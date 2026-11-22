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
  type Eras,
} from "@/components/ChapterMap";
import Icon from "@/components/Icon";
import PlaceCard, { type Places, type TappedPlace } from "@/components/PlaceCard";
import { loadAtlas, type AtlasJourney, type MapTarget } from "@/lib/atlas";
import { BOOKS } from "@/lib/bible";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { load } from "@/lib/mapData";

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

  const key = JSON.stringify(target);
  useEffect(() => {
    let live = true;
    setGot(undefined);
    setCard(null);
    setStopsOpen(false);
    Promise.all([gather(target), load<Eras>("/maps/eras.json", {})])
      .then(([g, e]) => {
        if (!live) return;
        setEras(e && typeof e === "object" ? e : {});
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
  const regions = useMemo(
    () => (got ? regionsOf(got.base, got.data, eras, lang) : []),
    [got, eras, lang]
  );
  const focus = useMemo(() => (got ? viewOf(got.data, got.base) : null), [got]);

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

  const { data, journey } = got;
  let title: string;
  let subtitle: string | undefined;
  let actions: React.ReactNode = null;
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
  } else if (target.kind === "era") {
    title = t(`map.era.${target.id}` as MessageKey);
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
