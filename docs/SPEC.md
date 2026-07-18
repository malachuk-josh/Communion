# Communion — Product & Architecture Specification

Status: living document. Last updated 2026-07-18.

---

## 1. Vision

A Bible app that is both a **reader** and a **gathering place**. Scripture first,
then fellowship: users form small groups called **Churches**, invite believers
they know, and schedule co-worship sessions on a shared calendar.

The founding verse of the social layer is **Matthew 18:20 (KJV)**:

> "For where two or three are gathered together in my name, there am I in the
> midst of them."

This verse is displayed prominently:
- On the **Create a Church** screen
- On every **Church home page** (subtitle under the Church name)

---

## 2. Feature Set

### 2.1 Bible Reader (MVP — arriving from Cowork artifact)
- Book / chapter / verse navigation
- **Translations**: default **KJV**; additional public-domain translations
  (ASV, WEB English; **Reina-Valera 1909** Spanish). Licensed translations
  (NIV, ESV…) deferred — they require API licensing agreements.
- **UI language toggle**: English ⇄ Spanish. Note: UI language and Scripture
  translation are *independent* settings (a Spanish speaker may read KJV; an
  English speaker may read RV1909).
- Glassmorphism UI, responsive mobile + desktop.

### 2.2 Churches (social network layer)
- A **Church** is a small group: name, optional description, founder, members.
- Any signed-in user can create a Church.
- **Membership**: founder + invited members. Roles: `founder`, `member`
  (moderation roles can come later).
- Church home page shows: name, Matthew 18:20, member list, upcoming sessions.

#### Invitations
Two delivery paths, one mechanism — a **tokenized invite link**:
1. **Email** — user enters an email address; we send the invite link
   (Resend or similar transactional email provider on Vercel).
2. **Facebook Messenger** — we open Messenger's share flow with the invite link:
   - Mobile: `fb-messenger://share?link=<inviteUrl>` (falls back to web)
   - Web: Facebook Send Dialog (`https://www.facebook.com/dialog/send?app_id=…&link=<inviteUrl>&redirect_uri=…`) — requires a Facebook App ID
   - Universal fallback: **Copy link** + native share sheet (`navigator.share`)

Invite token rules:
- Random, unguessable token; stored in Redis **with TTL** (default 7 days)
- Scoped to one Church; records who invited
- Redeeming requires sign-in (Clerk); redemption joins the user and burns or
  decrements the token (single-use for email invites; multi-use with cap for
  shared links — founder's choice)

### 2.3 Co-Worship Calendar
Each Church has a shared calendar where members schedule sessions.

**Pre-built session types** (templates with localized names, default
descriptions, suggested durations, and an icon/color):

| Key | English | Spanish | Default duration |
|---|---|---|---|
| `bible_study` | Bible Study | Estudio Bíblico | 60 min |
| `prayer` | Prayer | Oración | 30 min |
| `communion` | Communion | Santa Cena | 45 min |
| `praise_worship` | Praise & Worship | Alabanza y Adoración | 60 min |
| `custom` | Custom | Personalizado | user-set |

Session fields: type, title (prefilled from template, editable), date/time
(store UTC, render in member's timezone), duration, optional passage reference
(deep-links into the reader — e.g. a Bible Study on John 3), optional meeting
link (Zoom/Meet/etc.), creator, RSVPs (`going` / `maybe` / `no`).

Views: month grid + upcoming-list (mobile-first). Reminders via email
(later: push).

### 2.4 Accounts
- **Clerk** for authentication (user's existing Clerk account).
- Artifact MVP ships auth *stubs*; real Clerk wiring happens in this repo.
- Profile: display name, avatar (from Clerk), preferred UI language, preferred
  translation, timezone.

---

## 3. Architecture

### 3.1 Stack
- **Next.js (App Router)** deployed on **Vercel**
- **Clerk** — auth middleware + user management
- **Upstash Redis** (via Vercel marketplace integration) — primary data store
- **Transactional email** (Resend or Brevo) for invites/reminders
- Scripture text: bundled public-domain JSON (KJV et al.) served statically /
  edge-cached; no external Bible API dependency for MVP

### 3.2 Upstash Redis data model

```
user:{clerkUserId}                 HASH  { displayName, lang, translation, tz }
user:{clerkUserId}:churches        SET   churchIds

church:{churchId}                  HASH  { name, description, founderId, createdAt }
church:{churchId}:members          HASH  { userId → role }        # founder|member

invite:{token}                     HASH  { churchId, invitedBy, kind, maxUses, uses, createdAt }
                                   TTL   7 days (kind: email|link)

church:{churchId}:events           ZSET  score = startsAtEpoch, member = eventId
event:{eventId}                    HASH  { churchId, type, title, startsAt, durationMin,
                                           passageRef?, meetingUrl?, createdBy, createdAt }
event:{eventId}:rsvps              HASH  { userId → going|maybe|no }
```

Notes:
- IDs: nanoid/ulid. All timestamps UTC epoch millis.
- `ZRANGEBYSCORE church:{id}:events now +∞` → upcoming sessions, cheap.
- Membership checks are O(1) hash lookups; every Church API route verifies the
  Clerk user is a member before reading/writing.

### 3.3 API surface (App Router route handlers)

```
POST   /api/churches                    create church
GET    /api/churches/:id                church + members + upcoming events
POST   /api/churches/:id/invites        create invite (kind: email|link)
POST   /api/invites/:token/redeem       join church (auth required)
POST   /api/churches/:id/events         create session
PATCH  /api/events/:id                  edit session
POST   /api/events/:id/rsvp             set RSVP
DELETE /api/events/:id                  cancel session (creator/founder)
```

### 3.4 Migration path from the Cowork artifact
1. Artifact lands (single-file HTML/React, everything inlined, auth/storage stubbed).
2. Scaffold Next.js here; port the artifact's components/screens into `app/` +
   `components/` preserving the glass UI.
3. Replace stubs: Clerk middleware + providers; Upstash client in route handlers.
4. Build the social layer (§2.2–2.3) — this is net-new beyond the artifact.
5. Deploy to Vercel; wire Clerk + Upstash env vars via integrations.

---

## 4. Non-goals (for now)
- Licensed translations (NIV/ESV) — needs licensing
- Public/discoverable Churches or a global feed — Churches are invite-only small groups
- In-app video calls — we link out to the group's meeting URL
- Native mobile apps — responsive web first (PWA-ready)

## 5. Open questions
- Email provider choice (Resend vs Brevo — Brevo MCP is already connected to the workspace)
- Facebook App ID (needed for the web Send Dialog; mobile deep link + copy-link work without it)
- Invite link policy defaults: single-use vs capped multi-use
- Reminder timing defaults (24h + 1h before?)
