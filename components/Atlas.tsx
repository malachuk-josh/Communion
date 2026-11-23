"use client";

// The Maps tab: the atlas, as a place to go rather than a thing a chapter
// happens to have.
//
// The maps were only ever reachable from a chapter's Context pop-up, which
// answers "where did this happen" and nothing else. Readers asked the other
// questions: which journeys are there, where is Bethel, what did the land
// look like under the kings, when did it happen. Four tabs, one for each way
// in —
//
//   Journeys   the twenty-two drawn on the chapter maps, each whole
//   Places     every named place, searched, each on the map with its card
//   Eras       the ten ages, each on the window its title describes
//   Timeline   the whole Bible on one line, from Creation to Patmos
//              (components/Timeline)
//
// — and each row opens its map full screen (components/AtlasMap), at an
// address of its own (/maps?j=paul2), so that Back closes it and a link can
// name it. The lists come from /maps/atlas.json (scripts/build-atlas.mjs).

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AtlasMap from "@/components/AtlasMap";
import Icon, { type IconName } from "@/components/Icon";
import { AREA, bare, placeKindKey, type Places } from "@/components/PlaceCard";
import {
  loadAtlas,
  mapHref,
  mapTargetOf,
  type Atlas as AtlasData,
  type MapTarget,
} from "@/lib/atlas";
import Timeline from "@/components/Timeline";
import { BOOKS, LAST_OT_BOOK } from "@/lib/bible";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { load } from "@/lib/mapData";
import { MAP_TABS } from "@/lib/menuItems";
import { useStickyTab } from "@/lib/stickyTab";

type MapTab = (typeof MAP_TABS)[number];

const TABS: { id: MapTab; icon: IconName; key: MessageKey }[] = [
  { id: "journeys", icon: "runner", key: "maps.tab.journeys" },
  { id: "places", icon: "pin", key: "maps.tab.places" },
  { id: "eras", icon: "hourglass", key: "maps.tab.eras" },
  { id: "timeline", icon: "timeline", key: "maps.tab.timeline" },
];

export type Open = (target: MapTarget) => void;

export default function Atlas() {
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useStickyTab<MapTab>("maps", "journeys", MAP_TABS);
  /** undefined while it is on its way, null where it could not be had */
  const [atlas, setAtlas] = useState<AtlasData | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    loadAtlas().then((a) => {
      if (live) setAtlas(a);
    });
    return () => {
      live = false;
    };
  }, []);

  // the map the address names, if it names one
  const query = params.toString();
  const target = useMemo(() => mapTargetOf(new URLSearchParams(query)), [query]);

  /*
   * A map opens at its own address, and closes by going back to the one
   * before it — so the phone's Back does what the ✕ does, and the list is
   * where it was left, scrolled as it was.
   *
   * Unless there is no "before": a map arrived at by a link, or by coming
   * back from The Word, was not opened from this list, and going back from
   * it would leave the tab altogether. That one is closed by putting the
   * list's address in its place.
   */
  const openedHere = useRef(false);
  const open: Open = (next) => {
    openedHere.current = true;
    router.push(mapHref(next), { scroll: false });
  };
  const close = () => {
    if (openedHere.current) {
      openedHere.current = false;
      router.back();
    } else {
      router.replace("/maps", { scroll: false });
    }
  };

  return (
    <div>
      <h1 className="page-title">{t("maps.title")}</h1>
      <p className="subtitle">{t("maps.subtitle")}</p>

      {/* the Journal's switch, and Home's: one segment for each way in */}
      <div className="lang-toggle discover-tabs jr-tabs atlas-tabs" role="group">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={tab === entry.id ? "active" : ""}
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            <Icon name={entry.icon} />
            <span>{t(entry.key)}</span>
          </button>
        ))}
      </div>

      {/* everything under the tab row, which is what moves when a swipe
          changes the tab (components/Nav) */}
      <div className="tab-pane">
        {atlas === undefined && <div className="skeleton atlas-wait" aria-hidden />}
        {atlas === null && (
          <div className="glass card jr-empty">
            <p>{t("maps.failed")}</p>
          </div>
        )}
        {atlas && tab === "journeys" && <Journeys atlas={atlas} open={open} />}
        {atlas && tab === "places" && <PlaceSearch open={open} />}
        {atlas && tab === "eras" && <Eras atlas={atlas} open={open} />}
        {atlas && tab === "timeline" && <Timeline atlas={atlas} open={open} />}
      </div>

      {target && <AtlasMap target={target} onClose={close} />}
    </div>
  );
}

/** A row of the atlas: what it opens, a line about it, and the way in. */
function Row({
  title,
  sub,
  aside,
  onClick,
}: {
  title: string;
  sub?: string | null;
  aside?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="glass card atlas-row" onClick={onClick}>
      <span className="atlas-row-main">
        <span className="atlas-row-title">{title}</span>
        {sub && <span className="atlas-row-sub">{sub}</span>}
      </span>
      {aside ?? (
        <span className="atlas-row-go" aria-hidden>
          ›
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------

function Journeys({ atlas, open }: { atlas: AtlasData; open: Open }) {
  const { lang, t } = useI18n();
  const book = (nr: number) => BOOKS[nr - 1]?.[lang === "es" ? "es" : "en"] ?? "";

  /** "Genesis 11–22", or "2 Kings 24 – Jeremiah 52" where it runs across books */
  const span = (chapters: [number, number][]): string => {
    if (!chapters.length) return "";
    const [b1, c1] = chapters[0];
    const [b2, c2] = chapters[chapters.length - 1];
    if (b1 !== b2) return `${book(b1)} ${c1} – ${book(b2)} ${c2}`;
    return c1 === c2 ? `${book(b1)} ${c1}` : `${book(b1)} ${c1}–${c2}`;
  };

  // in the Bible's order already; set under the testament each begins in
  const groups = [
    { key: "reader.oldTestament" as MessageKey, rows: atlas.journeys.filter((j) => (j.chapters[0]?.[0] ?? 1) <= LAST_OT_BOOK) },
    { key: "reader.newTestament" as MessageKey, rows: atlas.journeys.filter((j) => (j.chapters[0]?.[0] ?? 1) > LAST_OT_BOOK) },
  ];

  return (
    <>
      {groups.map(
        (group) =>
          group.rows.length > 0 && (
            <section key={group.key} className="atlas-group">
              <div className="section-head">
                <h2>{t(group.key)}</h2>
              </div>
              <div className="atlas-list">
                {group.rows.map((j) => (
                  <Row
                    key={j.id}
                    title={t(`map.journey.${j.id}` as MessageKey)}
                    sub={`${span(j.chapters)} · ${t("maps.stops", { n: String(j.visits.length) })}`}
                    onClick={() => open({ kind: "journey", id: j.id })}
                  />
                ))}
              </div>
            </section>
          )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

/** Without accents or capitals, and "the Jordan" filed under J. */
const fold = (s: string) =>
  bare(s.normalize("NFD").replace(/[̀-ͯ]/g, ""));

/** How many to show: of the best known with nothing typed, and of what matches. */
const OFTEN = 30;
const MATCHES = 50;

function PlaceSearch({ open }: { open: Open }) {
  const { lang, t } = useI18n();
  const [places, setPlaces] = useState<Places | null | undefined>(undefined);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let live = true;
    load<Places | null>("/maps/places.json", null).then((d) => {
      if (live) setPlaces(d && typeof d === "object" && d.places ? d : null);
    });
    return () => {
      live = false;
    };
  }, []);

  /** every place once, the most named first */
  const all = useMemo(() => {
    if (!places) return [];
    const same = places.same ?? {};
    return Object.entries(places.places)
      // an entry that is the same spot as a better-known one is that one
      .filter(([id, record]) => !same[id] && Array.isArray(record))
      .map(([id, [name, type, modern, , country, , verses]]) => ({
        id,
        name,
        type,
        modern,
        country,
        verses,
        key: fold(name),
        modernKey: fold(modern ?? ""),
      }))
      .sort((a, b) => b.verses - a.verses || a.name.localeCompare(b.name));
  }, [places]);

  const q = fold(typed.trim());
  const shown = useMemo(() => {
    if (!q) return all.slice(0, OFTEN);
    // the name beginning with what was typed, then holding it; each the most
    // named first, which `all` already is
    const starts = all.filter((p) => p.key.startsWith(q));
    const holds = all.filter((p) => !p.key.startsWith(q) && p.key.includes(q));
    const byName = [...starts, ...holds];
    if (byName.length) return byName.slice(0, MATCHES);
    // Only where no name answers is the modern site tried, so that "Jebel
    // Musa" finds Sinai. Tried alongside the names it drowns them: forty
    // gates and pools are "in Jerusalem" today, and "jeru" listed them all.
    return all.filter((p) => p.modernKey.includes(q)).slice(0, MATCHES);
  }, [all, q]);

  /** where it is now, in a few words: what tells two Antiochs apart */
  const today = (p: (typeof all)[number]): string | null => {
    const named = p.country >= 0 ? places?.countries[p.country] : undefined;
    // "Egypt · Egypt" says nothing: a land still called what it was is left bare
    const country =
      named && bare(named[0]) !== bare(p.name) ? named[lang === "es" ? 1 : 0] : undefined;
    if (AREA.has(p.type)) return country ?? null;
    if (p.modern && bare(p.modern) !== bare(p.name)) return country ? `${p.modern}, ${country}` : p.modern;
    return country ?? null;
  };

  return (
    <>
      <form
        className="glass search-bar atlas-search"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <Icon name="search" />
        <input
          type="search"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("maps.search")}
          aria-label={t("maps.search")}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </form>

      {places === undefined && <div className="skeleton atlas-wait" aria-hidden />}
      {places === null && (
        <div className="glass card jr-empty">
          <p>{t("maps.failed")}</p>
        </div>
      )}
      {places && (
        <>
          {!q && (
            <div className="section-head">
              <h2>{t("maps.often")}</h2>
            </div>
          )}
          {q && shown.length === 0 && <p className="atlas-none">{t("maps.noPlace")}</p>}
          <div className="atlas-list">
            {shown.map((p) => {
              const where = today(p);
              const kind = t(placeKindKey(p.type));
              return (
                <Row
                  key={p.id}
                  title={p.name}
                  sub={where ? `${kind} · ${where}` : kind}
                  aside={
                    <span
                      className="atlas-count"
                      title={p.verses === 1 ? t("place.namedOnce") : t("place.namedIn", { n: String(p.verses) })}
                    >
                      {p.verses}
                    </span>
                  }
                  onClick={() => open({ kind: "place", id: p.id })}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Eras
// ---------------------------------------------------------------------------

type EraNames = Record<string, { regions: { en: string; es: string; water?: boolean }[] }>;

function Eras({ atlas, open }: { atlas: AtlasData; open: Open }) {
  const { lang, t } = useI18n();
  const [names, setNames] = useState<EraNames>({});

  useEffect(() => {
    let live = true;
    load<EraNames>("/maps/eras.json", {}).then((e) => {
      if (live) setNames(e && typeof e === "object" ? e : {});
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="atlas-list atlas-list-first">
      {atlas.eras.map((era) => {
        // the lands that age's map names, as a line about it; the seas left out
        const lands = (names[era.id]?.regions ?? [])
          .filter((r) => !r.water)
          .slice(0, 5)
          .map((r) => (lang === "es" ? r.es : r.en));
        return (
          <Row
            key={era.id}
            title={t(`map.era.${era.id}` as MessageKey)}
            sub={lands.length ? lands.join(" · ") : null}
            onClick={() => open({ kind: "era", id: era.id })}
          />
        );
      })}
    </div>
  );
}
