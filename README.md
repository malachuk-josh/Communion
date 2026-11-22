# Communion

> *"In the beginning was the Word, and the Word was with God, and the Word was God."* — John 1:1 (KJV)

**Communion** is a Bible app for reading and studying the Word on your own: Scripture set like a book, the Hebrew and Greek a tap away, and a journal that keeps what you find.

## Core Features

### 📖 The Word
- Multiple translations, defaulting to the **King James Version (KJV)**
- Public-domain-first translation set (KJV; Reina-Valera 1909 for Spanish)
- Full UI language toggle — **English and Spanish**
- Text size, boldness and typeface, and three themes: Illuminated, Parchment and grey

### 🔎 Study mode
- The Hebrew and Greek behind each word, with Strong's, Brown-Driver-Briggs and Abbott-Smith
- A concordance, cross-references, maps in context, and translations compared verse by verse
- Matthew Henry on every chapter, and Spurgeon's Treasury of David on the Psalms

### 🗺️ Maps
- An atlas of its own in the nav bar: 22 journeys drawn whole, from Abraham's to Paul's voyage to Rome
- Every named place searched and shown on the map, ten eras, and a map for any chapter that names somewhere
- Each era told on its map: the realms of the age shaded, its journeys drawn faint, its passages lighting where they happened, and "Play this era" stepping through its story with the ways travelled drawn on (written in `scripts/era-story.mjs`; `node scripts/build-era-story.mjs` checks every place and verse and writes `public/maps/era-story.json`)

### ✨ AI (Claude, by Anthropic), turned on per reader
- Ask about a verse, from Compare
- Ask the scholars, from Commentary: seven teachers of the church, answered in their manner
- Illuminated Search: find verses by describing them

### 📓 Journal and Home
- Bookmarks, notes and collections; reading plans with reminders, including plans through the commentaries
- A wall of verses and a private prayer list
- Offline downloads of Scripture and the study tools

## Tech Stack (target)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) on Vercel |
| Auth | Clerk |
| Data | Upstash Redis (via Vercel integration) |
| i18n | English + Spanish (UI), multi-translation Scripture |
| First deliverable | Self-contained Claude Artifact (MVP), then migrated here |

## Data Credits

- Scripture text: public-domain translations served via [getBible](https://getbible.net) (KJV, Reina Valera 1909)
- Cross-references (Study Mode): [OpenBible.info](https://www.openbible.info/labs/cross-references/) cross-reference dataset, CC-BY, keyed to KJV versification

## Project Status

🚧 **Pre-MVP.** A Claude Cowork session is producing the initial artifact MVP (reader + glass UI + language/translation toggles + auth/storage stubs). This repo holds the spec and will receive the production build-out.

See [`docs/SPEC.md`](docs/SPEC.md) for the full product and architecture specification.
