# Communion

> *"For where two or three are gathered together in my name, there am I in the midst of them."* — Matthew 18:20 (KJV)

**Communion** is a Bible app with a social heart: read Scripture in multiple translations and languages, then gather with other believers in **Churches** — small groups that schedule and share co-worship sessions together.

## Core Features

### 📖 Bible Reader
- Multiple translations, defaulting to the **King James Version (KJV)**
- Public-domain-first translation set (KJV, ASV, WEB; Reina-Valera 1909 for Spanish)
- Full UI language toggle — **English and Spanish** at launch
- Mobile and desktop responsive, glassmorphism ("sleek glass polish") UI

### ⛪ Churches (Social)
- Any user can found a Church — a small group of believers gathered in His name (Matthew 18:20 is displayed at Church creation and on every Church home page)
- Invite others by **email** or by sharing an invite link to **Facebook Messenger**
- Invite links are tokenized, expiring, and single-church scoped

### 📅 Co-Worship Calendar
- Each Church has a shared calendar for scheduling worship sessions together
- **Pre-built session types**: Bible Study, Prayer, Communion, Praise & Worship
- RSVP and reminders for members

## Tech Stack (target)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) on Vercel |
| Auth | Clerk |
| Data | Upstash Redis (via Vercel integration) |
| i18n | English + Spanish (UI), multi-translation Scripture |
| First deliverable | Self-contained Claude Artifact (MVP), then migrated here |

## Project Status

🚧 **Pre-MVP.** A Claude Cowork session is producing the initial artifact MVP (reader + glass UI + language/translation toggles + auth/storage stubs). This repo holds the spec and will receive the production build-out.

See [`docs/SPEC.md`](docs/SPEC.md) for the full product and architecture specification.
