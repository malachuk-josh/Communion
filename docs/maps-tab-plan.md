# Maps tab: action plan

A hand-off plan for adding a dedicated **Maps** tab to Communion's nav bar.
It is written for an engineer (or model) who has not seen this codebase. Read
all of it before starting: sections 2 and 7 hold the facts and traps that are
expensive to rediscover.

## 1. What is being built, and the decisions already made

Readers asked for maps as a destination of their own. Today a map only appears
inside The Word's study mode, in a chapter's Context pop-up.

The owner has decided:

| Decision | Choice |
|---|---|
| What the tab opens on | An **atlas home**: a page listing what there is to open. Tapping an entry opens its map full screen. |
| Position in the bottom bar | **Home · Journal · Maps · The Word**. The Word stays at the far right. |
| First version includes | All four: **Journeys**, **Place search**, **Maps by era**, **Browse by book and chapter**. |
| Who can open it | **Everyone**, signed in or not. Maps also stay in the Context pop-up as they are. |

Not decided, and not to be built without asking: a tour slide for Maps, a
single free-roaming world map, new journeys, or any change to the map
drawing itself.

## 2. What already exists

Nearly all the data and drawing code is in the app already. This task is
mostly a new page, an index file, and careful reuse.

### Code

| File | What it is |
|---|---|
| `components/ChapterMap.tsx` (1,946 lines) | The whole map feature. `MapArt` draws the SVG map. `MapViewer` is the full-screen, pinch-and-drag view (root class `.map-full`). `ChapterMap` (the default export) is the small map in the Context pop-up, which loads the data, opens `MapViewer` in a portal and shows `PlaceCard`. Only `ChapterMap` is exported today. |
| `components/PlaceCard.tsx` | The card for a tapped place: what it was, the modern site, how sure that is, and every chapter that names it. Props include `bookNr`, `chapter`, `onGoToVerse`, `onGoToRef`. |
| `lib/mapData.ts` | `load(url, fallback)`: fetches a map file once and shares it. A failed fetch is forgotten so it is retried. **Use this for every map file.** |
| `components/Reader.tsx` (about line 4090) | The only caller of `ChapterMap`, inside the Context pop-up. |
| `components/Nav.tsx` | The header (`<nav className="nav">`, with `.nav-links` shown from 640px up) and the bottom bar (`<nav className="bottom-nav glass">`, three `Link`s). Also `TAB_ORDER`, the swipe-between-tabs gesture and its guard list, and the scroll-to-top on route change. |
| `lib/menuItems.ts` | `HOME_TABS`, `JOURNAL_TABS` and `TABS_AT`, which tells the swipe which pages have tabs of their own. |
| `lib/stickyTab.ts` | `useStickyTab(page, fallback, valid)`: a remembered tab that also registers with the swipe. Used by `components/Journal.tsx` and `components/Discover.tsx`. |
| `components/BookNav.tsx` | The Word's navigator. Its testament, book and chapter-grid classes (`.bn-testament`, `.bn-book`, `.bn-ch-row`, `.bn-ch`) are the look to match in the Chapters tab. |
| `components/PictureGallery.tsx`, `app/pictures/page.tsx` | The closest model for a standalone page driven by query parameters, including "Read the passage" links into The Word. |
| `scripts/build-maps.mjs`, `scripts/map-journeys.mjs`, `scripts/build-relief.mjs` | Build the map data from Natural Earth and OpenBible.info. The raw sources (about 185 MB) are **not** in the repo. **Do not re-run `build-maps.mjs`**; nothing in this plan needs it. |
| `public/sw.js` | Service worker. `DATA_PATHS` includes `"/maps/"` (cache-first data). `SHELL_ROUTES` lists pages guaranteed offline. |
| `scripts/build-offline-manifest.mjs` | Lists every `.json` in `public/maps/` for the offline download. A new file there is picked up automatically. |

### Data in `public/maps/` (1.9 MB)

- **`<book>.json`** for 61 of the 66 books (none for 57, 59, 62, 63, 64).
  Keyed by chapter number: `{ base, era, focus: [x,y,w,h], places: [{n,x,y,v,t,id}], more?, route? }`.
  **852 chapters** have a map; **100** of them carry a `route`.
- **`base/<window>.json`**: six windows, each 1,000 units wide:
  `levant`, `asia-minor`, `egypt-sinai`, `near-east`, `mediterranean`, `world`
  (tightest first; this is the order in `build-maps.mjs`). Each has `bounds`
  `[west, south, east, north]`, `width`, `height`, coastlines, and `sites`:
  `[name, x, y, weight, kind, id]` for every named place in the window.
  `world.json` holds all 1,267 places.
- **`places.json`** (125 KB): `countries`, `places` (1,267 entries keyed by id:
  `[name, kind, modern site, confidence, country index, "book.chapter.verse …", verse count, alternates?]`)
  and `same` (66 duplicate ids pointing at the better-known entry).
  It has **no coordinates**; those come from a base window's `sites`.
- **`eras.json`**: ten eras, each with region labels as longitude and latitude:
  `patriarchs, exodus, conquest, kingdom, divided, exile, return, gospels, apostles, churches`.
- **`modern/<window>.json`** and **`relief/<window>.webp`**: today's borders and the shaded relief, already handled inside `ChapterMap.tsx`.

### Journeys

`scripts/map-journeys.mjs` exports `JOURNEYS`: 22 journeys, each `{ id, start, steps: [{ to, at: [book, chapter], via?, sea? }] }`.
In the chapter files a `route` is `{ j, legs: [{ p: [[x,y]…], s: 0|1, sea? }], stops: [{ x, y, n, s }] }`,
where `s: 1` means "told in this chapter" (drawn bold) and a stop's `n` is its
visit number, or several joined with `·` ("4·8") for a place passed twice.

Three facts checked against the data, which the plan relies on:

1. **Visit numbers match `JOURNEYS` exactly.** For all 22 journeys the highest
   visit number equals `1 + steps.length`. So visit 1 is `start` and visit
   `k` is `steps[k-2].to`. Strip the dataset's trailing number for display
   ("Antioch 1" becomes "Antioch", "Bethel 1" becomes "Bethel").
2. **The last chapter of a journey holds every leg, but often on a window too
   small for the whole journey.** Genesis 22 draws Abraham's journey on
   `levant`, and Ur lies 2,900 units outside it. Route points are stored
   unclipped in that chapter's window units, so they can be converted.
3. **Matching a stop to the nearest gazetteer site does not work** (19 of 194
   stops have no site within range in their window, and 25 match a different
   name such as a surrounding region). Name stops from `JOURNEYS`, not by
   distance.

All 22 journey titles and all 10 era titles already have English and Spanish
strings (`map.journey.<id>`, `map.era.<id>` in `lib/i18n.tsx`).

### The projection

`ChapterMap.tsx` has `project(bounds, width)`. With `[w, s, e, n] = bounds`,
`kx = cos(((s + n) / 2) · π / 180)` and `scale = width / ((e − w) · kx)`:

- forward: `x = (lon − w) · kx · scale`, `y = (n − lat) · scale`
- inverse: `lon = w + x / (kx · scale)`, `lat = n − y / scale`

## 3. Design

### Route and URLs

One route, `/maps`, with query parameters, as `/pictures` and `/bookshelf` do:

| URL | Shows |
|---|---|
| `/maps` | The atlas home, on its remembered tab |
| `/maps?j=<journey id>` | That journey, full screen |
| `/maps?era=<era id>` | That era's map, full screen |
| `/maps?p=<place id>` | The map centred on that place, with its card open |
| `/maps?b=<book>&c=<chapter>` | That chapter's map, full screen |

Opening a map is a `router.push` (with `scroll: false`), so the browser's
back button and Android's back gesture close it. The viewer's own close
button goes back if the map was opened from the atlas, and replaces the URL
with `/maps` if the page was entered by a deep link.

### The atlas home

Four tabs, in a row styled like the Journal's, remembered with `useStickyTab("maps", "journeys", MAP_TABS)`:

1. **Journeys** (default). The 22 journeys in `JOURNEYS` order. Each row: the
   title, and under it the span it covers and the number of stops
   ("Genesis 11–22 · 13 stops").
2. **Places**. A search field, and under it:
   - with nothing typed, the 30 most-named places (by verse count);
   - while typing, up to 50 matches. Match without regard to case or accents;
     names that start with the query first, then by verse count. Skip ids
     that appear as keys in `same`. Each row: name, kind, and the modern site
     and country, so the two Antiochs can be told apart.
3. **Eras**. The ten eras in `eras.json` order, by their existing titles.
4. **Chapters**. Old and New Testament, then books, then a chapter grid,
   using BookNav's classes. Only chapters with a map are buttons; the rest
   are dimmed and not tappable. The five books with no maps are dimmed too.
   At the top, when the chapter being read in The Word has a map, one row:
   "Where you are reading: John 3" (from `localStorage["communion.reading"]`,
   which holds `{ translation, bookNr, chapter, verse }`).

### What each map shows

Every map is the existing `MapViewer`, fed a `ChapterMapData`-shaped object:

| Opened from | `base` | `era` | `focus` | `places` | `route` | Title in the viewer's bar |
|---|---|---|---|---|---|---|
| Chapter | the chapter row, unchanged | | | | | "Genesis 12" |
| Journey | from `atlas.json` | from `atlas.json` | from `atlas.json` | `[]` | every leg and stop with `s: 1` | the journey's title |
| Era | from `atlas.json` | the era | the whole window | `[]` | none | the era's title |
| Place | the tightest window holding it | none | a box a quarter of the window wide, centred on the place and kept inside the window | that one place | none | the place's name |

Extra controls in the viewer's bar, beside the existing ones:

- **Chapter map:** "Read Genesis 12", which goes to `/?b=1&c=12`.
- **Journey map:** "Stops", which opens a list of the visits in order
  (number, name, and the chapter that tells of it). Tapping a visit's chapter
  goes to The Word at that chapter. Tapping its name opens the place's card
  when the stop has an id.

Place cards work everywhere as they do now. Choosing a chapter in a card
goes to The Word at that verse: `router.push("/?b=…&c=…&v=…")`.

## 4. Ground rules for this repository

- **Branch:** `claude/bible-app-mvp-review-jfh5vv`. It is the default branch,
  and **every push deploys to production** (communion-mu.vercel.app). Verify
  locally before pushing. Never force-push.
- **Never test against production.** Test a local production build:
  `npx next build`, then `npx next start -p 3100`.
- **Dependencies:** if `node_modules` is missing, run `npm ci`.
- **Environment:** the app runs with no real keys. A `.env.local` with
  throwaway values is enough (`GUEST_SECRET=anything`, `NEXT_PUBLIC_ESV=1`).
  With no Clerk key, sign-in is not required anywhere, so study mode and its
  Context pop-up can be opened in tests. `.env.local` is gitignored; delete it
  before committing anyway. Real secrets live only in Vercel.
- **Before a build:** `npm run build` runs `prebuild`, but `npx next build`
  does not. Run `node scripts/build-offline-manifest.mjs && node scripts/check-i18n.mjs`
  yourself. Commit `public/offline-manifest.json` only when its hashes really
  changed (they will, once `atlas.json` exists).
- **Translations:** every user-facing string goes in `lib/i18n.tsx` in both
  English and Spanish. `scripts/check-i18n.mjs` fails the build if the two
  differ in keys.
- **Style:** no Prettier. Match the file you are in. Comments explain why, in
  plain sentences. No mention of any AI model in code or commits.
- **Browser tests:** Playwright is installed globally (`require("playwright")`,
  `chromium.launch()` with no options). There is no committed test suite;
  write throwaway scripts outside the repo and report what they showed.
- **Stopping the server:** stop the process you started. Do not use
  `pkill -f "next start"`.
- **Scope:** build what is in this plan. Ask before adding anything else.

## 5. Steps

Do them in order. Steps 1 to 3 change nothing a reader can see, and each can
be verified on its own.

### Step 1. Build the atlas index: `scripts/build-atlas.mjs` → `public/maps/atlas.json`

A new script that reads only **committed** files (`public/maps/*.json`,
`public/maps/base/*.json`, `public/maps/eras.json`) and imports `JOURNEYS`
from `scripts/map-journeys.mjs`. It needs no raw sources and no network.

Write:

```jsonc
{
  "v": 1,
  // tightest first; "where" and nothing else indexes into this
  "windows": ["levant", "asia-minor", "egypt-sinai", "near-east", "mediterranean", "world"],
  "journeys": [{
    "id": "abraham",
    "base": "near-east",            // the tightest window holding every stop and leg point
    "era": "patriarchs",            // the era of the chapter the route was read from
    "focus": [x, y, w, h],          // the route's bounding box, padded 8%, kept inside the window
    "legs": [{ "p": [[x, y]], "sea": 1 }],   // in "base" units; "sea" only where the source has it
    "stops": [{ "x": 0, "y": 0, "n": "4·8", "id": "a…" }],   // one per dot; "id" where known
    "visits": [{ "name": "Ur", "at": [1, 11], "stop": 0 }],  // in order; "stop" indexes "stops"
    "chapters": [[1, 11], [1, 12]]  // every chapter whose map carries this journey
  }],
  "eras": [{ "id": "patriarchs", "base": "near-east" }],
  "books": { "1": [2, 3, 4, 8] },   // chapters that have a map, per book
  "where": { "<place id>": 0 }      // each place's tightest window, as an index into "windows"
}
```

How to compute it:

- **Journey geometry.** Among the chapters carrying the journey, take the one
  with the most legs (on a tie, the last). Convert its legs and stops to
  longitude and latitude with the inverse projection of that chapter's
  window, choose the first window in `windows` whose `bounds` contain every
  point, and project into it. Round to one decimal place, as the existing
  files do.
- **Visits.** `[start, ...steps.map(s => s.to)]`, with the trailing number
  stripped for display. `at` is the step's `at`; for the start, the journey's
  first chapter. A visit's stop is the one whose `n` (split on `·`) contains
  its number. **Assert** for every journey that the highest visit number
  equals `1 + steps.length`, and stop with an error if not.
- **Stop ids.** In `world.json` (which has every place), look among the sites
  within about 2 units of the stop for one whose name equals the visit's name,
  ignoring case and a leading "the ". Leave `id` out when there is none. Log
  how many stops got an id.
- **Eras.** Hard-code the window for each, in `eras.json` order:
  patriarchs `near-east`, exodus `egypt-sinai`, conquest `levant`, kingdom
  `levant`, divided `levant`, exile `near-east`, return `near-east`, gospels
  `levant`, apostles `mediterranean`, churches `asia-minor`.
- **Books.** For each `<book>.json`, the chapters whose row has at least one place.
- **Where.** For each id in `places.json`, the first window in `windows`
  whose `sites` include it.

Make the output deterministic (fixed key order, sorted lists) so a second
run produces no diff. Add a line to the header comment of `build-maps.mjs`
saying to run `build-atlas.mjs` after it.

**Done when:** the script runs twice with no diff; it reports 22 journeys, 10
eras, 61 books, 852 chapters and 1,267 places; every journey's stops fall
inside its window (`0 ≤ x ≤ width`, `0 ≤ y ≤ height`); the file is under
about 80 KB.

### Step 2. Open `ChapterMap.tsx` for reuse, changing nothing a reader sees

Do **not** rewrite or restructure `MapArt` or `MapViewer`. Make the smallest
changes that let a second caller use them:

- Export `MapViewer` and the types it needs (`Base`, `ChapterMapData`,
  `Modern`, `Eras`, `View`), plus `viewOf` and `project`.
- Move three pieces of `ChapterMap` into exported functions, and have
  `ChapterMap` call them, so both callers share one copy:
  - the base-file check (the block that defaults `lakes`, `rivers`, `sites`
    and `terrain` to empty arrays and rejects a file with no `land`);
  - the `regions` calculation (the `useMemo` that turns an era's labels into
    positions and drops the crowded ones);
  - the then-and-now state: the `now` flag, `toggleNow`, and the loading of
    `modern/<window>.json`.
- Give `MapViewer` three optional props: `title` and `subtitle` (replacing the
  era and journey lines in `.map-full-title` when given), and `actions`
  (extra buttons rendered in `.map-full-tools`). Render the era line only
  when `data.era` is set. Let the reset button's label be overridden; it
  reads "Back to the chapter" today.
- Allow a place with no verse: a place map has no chapter. Read
  `PlaceCard.tsx` first to see how `place.v`, `bookNr` and `chapter` are used,
  and make "not in a chapter" a supported state (for example `bookNr = 0`)
  without changing what the Context pop-up shows.

**Done when:** in a local build, with study mode on, the Context pop-up's map
for Acts 16, Genesis 12 and Psalm 23 (which has no map) looks and behaves as
before: the small map, the full-screen view, pinch and drag, the then-and-now
toggle, a place's card, and "go to verse" from the card. Take before-and-after
screenshots of the small map and the full-screen map and compare them.

### Step 3. The atlas map wrapper: `components/AtlasMap.tsx`

One component that the page hands a description of what to show (chapter,
journey, era or place) and that:

- loads what it needs with `load()` (`atlas.json`, the base window, `eras.json`,
  the chapter file, `places.json` as required) and validates it with the
  shared check from step 2;
- builds the `ChapterMapData`-shaped object from the table in section 3;
- renders `MapViewer` in a portal on `document.body`, with the title, the
  extra actions, the then-and-now toggle, and `PlaceCard` for a tapped place;
- for a place map, opens that place's card at once;
- shows a short "This map could not be loaded" state with a close button if a
  file is missing or malformed. It must never throw.

**Done when:** each of the four URL forms in section 3, typed into the address
bar on a page that renders only `AtlasMap`, opens the right map.

### Step 4. The page: `app/maps/page.tsx` and `components/Atlas.tsx`

- `app/maps/page.tsx`: a `Suspense` around `<Atlas />`, as `app/pictures/page.tsx` does.
- `components/Atlas.tsx`: the four tabs from section 3, reading
  `useSearchParams()` to decide whether a map is open.
- Add `MAP_TABS = ["journeys", "places", "eras", "chapters"]` to
  `lib/menuItems.ts` and `"/maps": { page: "maps", tabs: MAP_TABS }` to `TABS_AT`.
- Lists come from `atlas.json` and `places.json` through `load()`. Show a
  skeleton while they load, and a plain "Maps need a connection the first
  time" message if they fail.
- The journey "Stops" list is a `.glass.modal` in a portal, like `PlaceCard`.
- Reuse existing classes for rows, section headings and the tab row before
  writing new CSS. New CSS goes in `app/globals.css` next to the map styles,
  and must read correctly in all three themes.

**Done when:** every tab lists what section 3 says; every row opens its map;
back closes the map and returns to the same tab and scroll position; a deep
link opens the map over the atlas.

### Step 5. The nav bar: `components/Nav.tsx`, `app/globals.css`, `components/Icon.tsx`

- Add `const isMaps = pathname.startsWith("/maps")`.
- Bottom bar: a fourth `Link` to `/maps`, **third in the row**. Header
  `.nav-links`: the same link in the same position.
- Icon: add a `compass` icon to `components/Icon.tsx` in that file's own
  style. Do not use `globe` (Home has it) or `pin` (Context has it).
- Swipe: `TAB_ORDER = ["/discover", "/menu/journal", "/maps", "/"]`.
- Swipe guard: add `.map-full` to the selector list in the swipe's `onStart`
  (`".modal-overlay, .lex-sheet, .side-panel, .conc-panel, .welcome"`), so
  dragging a full-screen map never changes tab.
- `public/sw.js`: add `"/maps"` to `SHELL_ROUTES`.
- **Make four tabs fit narrow phones.** The bar is about 196px wide with three
  tabs and will be about 254px with four. In The Word and in a Bookshelf
  chapter, a 44px chapter arrow sits 10px from each edge, which leaves
  `screen width − 108px` for the bar: 285px at 393 wide, 267px at 375, 252px
  at 360, 212px at 320. So at 360 and below the bar would touch or cover the
  arrows. Add a narrow-screen rule (for example at `max-width: 380px`) that
  tightens `.bottom-nav` padding and `.bottom-nav a` min-width and padding,
  and at 340px and below shrinks the arrows as well. Spanish labels are wider
  ("La Palabra"), so measure in both languages.

**Done when:** the tab shows and highlights on `/maps` and on a map URL; the
swipe moves Home → Journal → Maps → The Word and back, passing through each
page's own tabs; and at 320, 360, 375, 393 and 412px wide, in English and
Spanish, the bar and both chapter arrows do not overlap in The Word.

### Step 6. Words and docs

- `lib/i18n.tsx`, English and Spanish: the nav label ("Maps" / "Mapas"), the
  four tab names ("Journeys", "Places", "Eras", "Chapters" / "Viajes",
  "Lugares", "Épocas", "Capítulos"), the search placeholder, "Often named",
  "No place by that name", "{n} stops", "Stops", "Read {ref}", "Where you are
  reading: {ref}", the generic reset label, and the two failure messages.
- `README.md`: one line for Maps under Core Features.

### Step 7. Verify, then commit and push

Run the checks in section 6. Then commit in three parts, so each can be
reverted alone:

1. `scripts/build-atlas.mjs`, `public/maps/atlas.json`, `public/offline-manifest.json`
2. the `ChapterMap.tsx` and `PlaceCard.tsx` changes from step 2
3. the page, `AtlasMap`, the nav bar, translations and README

Push, wait for the Vercel deployment of the last commit to reach READY, and
report what was checked.

## 6. Verification checklist

On a local production build, with Playwright, on at least an iPhone 15, an
iPhone SE (320px) and a Pixel 7; in the dark, Parchment and grey themes; in
English and Spanish.

- [ ] `npx tsc --noEmit -p .` and `node scripts/check-i18n.mjs` pass.
- [ ] No page errors on `/maps`, on each of the four tabs, or with a map open.
- [ ] **Journeys:** all 22 open. Spot-check Abraham (Ur and Egypt both on
      screen), the exodus, Paul's third journey (Philippi and Corinth on
      screen) and the voyage to Rome. Every leg is bold. "Stops" lists the
      visits in order with the right chapters.
- [ ] **Places:** "jeru" finds Jerusalem first; "antioch" lists both, told
      apart by their modern sites; a search with no match says so. A result
      opens its map with the card open, and a chapter in the card opens The
      Word at that verse.
- [ ] **Eras:** all ten open on a sensible window with their region names.
- [ ] **Chapters:** a chapter with a map opens it, and "Read …" opens The Word
      there. Psalm 23 and the five map-less books cannot be tapped. "Where
      you are reading" appears after reading a chapter that has a map.
- [ ] **Back:** the browser's back button closes an open map and returns to
      the same tab.
- [ ] **The Context pop-up map is unchanged** (the step 2 screenshots).
- [ ] **The Word keeps its place:** read to Psalm 119:95, open Maps, return;
      the same verse is at the top.
- [ ] **Bar and arrows** do not overlap at the five widths in step 5.
- [ ] **Signed out:** `/maps` works with no account.
- [ ] **Offline:** with the service worker active and the network cut, `/maps`
      and a map opened earlier still load.

## 7. Traps in this codebase

- **Glass traps fixed children.** Anything with the `.glass` class has a
  backdrop filter, which makes it the containing block for `position: fixed`
  descendants. Full-screen overlays and modals must be portalled to
  `document.body`, as `MapViewer` and `PlaceCard` already are.
- **The document does not scroll.** A single element, `#app-scroll`, does.
  Use the helpers in `lib/scroller.ts` (`scrollToY`, `jumpToTop`), never
  `window.scrollTo`.
- **Old data meets new code.** The service worker serves `/maps/` cache-first,
  so a phone can run new code against yesterday's files, or have no
  `atlas.json` yet. Check the shape of everything fetched and fall back to
  "nothing to show". A missing field once crashed the whole reader.
- **Hydration.** Do not read `localStorage` while rendering. Read it in an
  effect, as `useStickyTab` does.
- **Do not move the bottom bar with a transform.** It is deliberately
  centred with margins and given `translateZ(0)`; iOS misplaces a fixed
  element whose transform moves it.
- **`/maps` the page and `/maps/` the data are different paths** to the
  service worker (`DATA_PATHS` matches `"/maps/"` with the trailing slash).
  Do not add a route under `/maps/…`.
- **The search field and the keyboard.** The swipe already ignores gestures
  that start in an input, and `lib/viewport.tsx` puts the page back after the
  iOS keyboard closes. Use `type="search"` and leave both alone.
- **The grey theme greys images on purpose,** including the relief shading.
- **Place names are English only** in the data. The Spanish interface
  translates the labels around them, not the names.

## 8. Out of scope

- Re-running `build-maps.mjs`, or changing coastlines, places or journeys.
- Changing how `MapArt` draws or labels a map.
- A tour slide, onboarding or announcement for Maps.
- Putting GPT's map images (the "World" library in Drive) into the app.
- Any sign-in gate, usage limit or account feature for Maps.
