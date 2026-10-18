// Communion service worker: push notifications, and offline reading.
//
// Three caches, three strategies:
//   shell  — the app itself (HTML, JS, CSS). Network-first so a deploy is
//            picked up, cache as the fallback so it opens with no signal.
//   data   — scripture and the study datasets. Immutable once published, so
//            cache-first: a hit never touches the network.
//   api    — read-only GETs worth showing stale. Network-first, cache behind.
//
// Anything not matched here is left entirely alone: writes, auth, push.

const VERSION = "v1";
const SHELL = `communion-shell-${VERSION}`;
const DATA = `communion-data-${VERSION}`;
const API = `communion-api-${VERSION}`;
const MINE = [SHELL, DATA, API];

/** Static datasets: scripture, and everything study mode reads. */
const DATA_PATHS = [
  "/bible/",
  "/context/",
  "/headings/",
  "/paragraphs/",
  "/xref/",
  "/strongs/",
  "/gloss/",
  "/lexicon/",
  "/concordance/",
  "/absmith/",
  "/bdb/",
  // where Christ speaks, and the three sets of prose about the text: Henry,
  // Spurgeon's Treasury, and his Morning and Evening. All four ship in an
  // offline tier and none of them were named here, so the offline screen
  // reported those tiers downloaded and the service worker had quietly
  // dropped every file — this list is the allowlist that message is filtered
  // through, not a hint.
  "/redletter/",
  "/commentary/",
  "/treasury/",
  "/devotional/",
  "/maps/",
  "/icons/",
];

// Read-only API responses worth showing stale.
//
// These are the server's own answers about Gatherings, the Table and the
// calendar — things this device does not author and cannot reconstruct. With
// no signal the fetch throws, every screen catches it and renders its empty
// state, and the app tells a reader they have no Gatherings and no messages,
// which is a lie rather than an absence. Last-known is the truthful answer.
//
// An allowlist, not a denylist, because the cost of being wrong runs one way:
// the licensed translations are served from /api/bible and their licences
// forbid keeping the text, so a rule broad enough to catch them by accident
// would be a breach. Nothing reaches this cache unless it is named here.
//
// Bookmarks, notes, collections and reading plans are deliberately absent for
// the opposite reason: IndexedDB holds those, and it is *ahead* of the server
// whenever the outbox has anything in it. A copy here would be older than the
// device's own and would overwrite it on an offline reload.
//
// The manifest is here rather than in DATA because every build regenerates it;
// cache-first would pin a client to the file sizes of whenever it first looked.
const API_PATHS = [
  "/api/churches", // Gatherings: the list, and each one's members and events
  "/api/threads", // a discussion inside a Gathering
  "/api/messages", // the Table: the inbox, a conversation, the unread count
  "/api/notifications", // what was missed; the reader re-checks its age
  "/api/calendar",
  "/api/discover",
  "/api/prayers",
  "/api/profile",
  "/offline-manifest.json",
];

// Named and refused, so that adding to the list above stays a decision rather
// than an accident of prefix matching. /api/churches would otherwise swallow
// the invite codes, which sit under a Gathering's id and so cannot be excluded
// by prefix — hence patterns rather than a second list of paths.
const API_NEVER = [
  /^\/api\/bible\b/, // borrowed text: the licences forbid keeping it
  /^\/api\/sync\b/, // asks who we are; a cached answer is the wrong person
  /^\/api\/admin\b/,
  /^\/api\/search\b/,
  /\/invites(\/|$)/, // an invite code is a key, not a record
  /\/ics(\/|$)/, // a calendar download, not a screen
];

/** Pages worth guaranteeing offline; the rest fill in as they are visited. */
const SHELL_ROUTES = [
  "/",
  "/manifest.webmanifest",
  "/churches",
  "/discover",
  "/menu",
  "/menu/journal",
  "/menu/messages",
  "/menu/settings",
  "/calendar",
];

/** Where the shell cache records which build populated it. */
const BUILD_MARK = "/__shell-build";
/** …and where the data cache records which dataset version it holds. */
const DATA_MARK = "/__data-stamp";

/** Store what we can; a route that won't load must not sink the others. */
async function cacheEach(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res);
      } catch {
        // this one fills in the first time it is visited instead
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // one at a time, not addAll: that is atomic, so a single route failing
      // would throw away the whole shell and leave nothing to open offline
      cacheEach(cache, SHELL_ROUTES)
    )
  );
  self.skipWaiting();
});

/**
 * Cached HTML names the JS chunks of the build that produced it, and those
 * names change every deploy. Keeping stale HTML would mean opening offline to
 * a page whose scripts no longer exist — so when the build stamp moves, the
 * shell is emptied and refills from the network. The data cache is untouched:
 * those files are immutable, and re-downloading 30MB per deploy is not on.
 */
async function dropStaleShell() {
  try {
    const res = await fetch("/offline-manifest.json", { cache: "no-store" });
    if (!res.ok) return;
    const manifest = await res.json();
    const built = manifest.built;
    // The data cache is not touched here any more. This runs inside activate,
    // and every request the app makes waits for activate to finish — the
    // per-file check below can take seconds the first time, which would be
    // seconds of a frozen app. It runs from the first request instead.
    if (!built) return;
    const shell = await caches.open(SHELL);
    const markUrl = new URL(BUILD_MARK, self.location.origin).toString();
    const seen = await shell.match(markUrl);
    const previous = seen ? await seen.text() : null;
    if (previous === built) return;
    if (previous === null) {
      // first run: nothing stale to clear, and the install just precached
      // the shell — wiping it here would leave nothing to open offline
      await shell.put(markUrl, new Response(built));
      return;
    }
    await caches.delete(SHELL);
    const fresh = await caches.open(SHELL);
    await fresh.put(markUrl, new Response(built));
    // put the reader back straight away, so the first launch after a deploy
    // still opens with no signal
    await cacheEach(fresh, SHELL_ROUTES);
  } catch {
    // offline at activation: the shell we have is the shell we use
  }
}

/**
 * Bring the data cache into line with the datasets, one file at a time.
 *
 * The dataset files are immutable in practice, so the data cache is not
 * versioned per deploy — re-downloading 60MB because a button moved would be
 * absurd. But a file can be corrected or improved, and cache-first would then
 * serve the old one forever.
 *
 * This used to empty the whole cache whenever anything in the datasets
 * changed, and only asked when a new worker activated — which is only when
 * this file changes, and it went unchanged through every map release after
 * the first. So phones kept the first version of every map they had opened
 * while three better ones shipped past them. And had the check ever run, one
 * improved map would have thrown a downloaded Bible away with it.
 *
 * The manifest now carries a hash of every file. Only files whose hash has
 * moved are dropped; they come back fresh the next time they are asked for,
 * and the offline screen shows them as the few left to fetch. Everything that
 * did not change stays exactly where it is.
 */

/**
 * What the data cache last agreed with: the stamp, and every file's hash.
 *
 * The first marks held the stamp alone, which says that something changed but
 * not what. A phone still carrying one has no record to compare against, so
 * its first pass reads what it holds and hashes that instead.
 */
async function readDataMark(cache, markUrl) {
  const seen = await cache.match(markUrl);
  if (!seen) return null;
  const text = await seen.text();
  try {
    const mark = JSON.parse(text);
    if (
      mark &&
      typeof mark.stamp === "string" &&
      mark.hashes &&
      typeof mark.hashes === "object"
    ) {
      return mark;
    }
  } catch {
    // the old mark: a bare stamp, which is not JSON
  }
  return { stamp: text, hashes: {} };
}

/** The same sixteen characters build-offline-manifest.mjs writes for a file. */
async function hashOf(response) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await response.arrayBuffer()
  );
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function reconcile(manifest) {
  const stamp = manifest && manifest.dataStamp;
  if (!stamp || !manifest.tiers) return;
  const want = new Map();
  for (const tier of Object.values(manifest.tiers)) {
    const urls = Array.isArray(tier.urls) ? tier.urls : [];
    const hashes = Array.isArray(tier.hashes) ? tier.hashes : [];
    urls.forEach((url, i) => {
      if (typeof hashes[i] === "string") want.set(url, hashes[i]);
    });
  }
  // a manifest from before the hashes has nothing to compare against
  if (want.size === 0) return;

  const data = await caches.open(DATA);
  const markUrl = new URL(DATA_MARK, self.location.origin).toString();
  const mark = await readDataMark(data, markUrl);
  if (mark && mark.stamp === stamp) return;
  const known = (mark && mark.hashes) || {};
  // The folders the datasets live in. Anything else in this cache — the
  // icons — is not the manifest's to judge, and must not be dropped for
  // being absent from it.
  const folder = (path) => path.slice(0, path.lastIndexOf("/") + 1);
  const covered = new Set([...want.keys()].map(folder));

  for (const request of await data.keys()) {
    const path = new URL(request.url).pathname;
    if (path === DATA_MARK) continue;
    const now = want.get(path);
    if (now === undefined) {
      // removed from a folder the datasets still use: never asked for again
      if (covered.has(folder(path))) await data.delete(request);
      continue;
    }
    if (known[path] === now) continue;
    // Never recorded — an old mark, or stored since the last pass — so what
    // is actually held decides. Recorded and different is simply stale.
    if (known[path] === undefined) {
      const held = await data.match(request);
      if (held && (await hashOf(held)) === now) continue;
    }
    await data.delete(request);
  }
  // Written last, so a pass cut short by the phone suspending the worker is
  // simply run again rather than half-remembered.
  await data.put(
    markUrl,
    new Response(JSON.stringify({ stamp, hashes: Object.fromEntries(want) }))
  );
}

/** One pass at a time; anyone else who asks waits on the one running. */
let reconciling = null;
function reconcileData(manifest) {
  if (!reconciling) {
    reconciling = reconcile(manifest)
      .catch(() => {
        // storage refused or the worker was cut short: the next check retries
      })
      .finally(() => {
        reconciling = null;
      });
  }
  return reconciling;
}

/** When this worker last compared the datasets with the server. */
let dataCheckedAt = 0;
const DATA_CHECK_EVERY = 10 * 60 * 1000;

/**
 * Ask whether the datasets have moved, at most every ten minutes.
 *
 * Called from requests, not from activate, and that is what makes it work:
 * a worker only activates when this file changes, and nothing about a
 * corrected map changes this file. A worker is started for every launch, so
 * every launch asks — and an unchanged manifest is revalidated rather than
 * downloaded, so asking costs a 304.
 */
function checkData() {
  const now = Date.now();
  if (now - dataCheckedAt < DATA_CHECK_EVERY) return Promise.resolve();
  dataCheckedAt = now;
  return fetch("/offline-manifest.json", { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : null))
    .then((manifest) => (manifest ? reconcileData(manifest) : undefined))
    .catch(() => {
      // no signal: what we hold is what we use, and the next launch asks again
    });
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => !MINE.includes(n)).map((n) => caches.delete(n))
        )
      )
      .then(dropStaleShell)
      .then(() => self.clients.claim())
  );
});

const isData = (url) =>
  url.origin === self.location.origin &&
  url.pathname !== DATA_MARK &&
  DATA_PATHS.some((p) => url.pathname.startsWith(p));

const under = (pathname, prefix) =>
  pathname === prefix || pathname.startsWith(prefix + "/");

const isApi = (url) =>
  url.origin === self.location.origin &&
  !API_NEVER.some((p) => p.test(url.pathname)) &&
  API_PATHS.some((p) => under(url.pathname, p));

const isShell = (url, request) =>
  url.origin === self.location.origin &&
  url.pathname !== BUILD_MARK &&
  (request.mode === "navigate" ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest");

/** Never touches the network on a hit — these files don't change in place. */
async function cacheFirst(request, cacheName) {
  // A pass already running is about to say whether this file is stale. Most
  // finish in well under a second; the first one on an old phone hashes what
  // it holds and may not, and a read is never held up past this.
  if (reconciling) {
    await Promise.race([reconciling, new Promise((r) => setTimeout(r, 1500))]);
  }
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/** Fresh when there's signal, last-known when there isn't. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    // a navigation with nothing cached for it still gets the app shell
    if (request.mode === "navigate") {
      const root = await cache.match("/");
      if (root) return root;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // writes are the outbox's problem
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isData(url)) {
    event.respondWith(cacheFirst(request, DATA));
    event.waitUntil(checkData());
  } else if (isShell(url, request)) {
    event.respondWith(networkFirst(request, SHELL));
    // a page load is a launch, which is when to ask whether anything moved
    if (request.mode === "navigate") event.waitUntil(checkData());
  } else if (isApi(url)) {
    event.respondWith(networkFirst(request, API));
  }
});

// The offline screen asks for a list of files; we fetch and store them,
// reporting progress back so it can draw a bar.
const MAX_CACHE_URLS = 2000;

/**
 * Pages the warm-up may ask to have kept.
 *
 * SHELL_ROUTES covers the addresses that are the same for everybody. A
 * Gathering's page and a conversation's page have an id in them, so they
 * cannot be listed ahead of time — and without them the loss of signal leaves
 * the data cached and no page to show it in: the reader gets the app's root
 * document instead, which is a different screen entirely.
 */
const PAGE_PREFIXES = ["/churches/", "/menu/messages/"];
const MAX_CACHE_PAGES = 60;

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg && msg.type === "cache-pages") {
    const paths = (Array.isArray(msg.paths) ? msg.paths : [])
      .filter(
        (u) =>
          typeof u === "string" &&
          u.startsWith("/") &&
          !u.startsWith("//") &&
          PAGE_PREFIXES.some((p) => u.startsWith(p))
      )
      .slice(0, MAX_CACHE_PAGES);
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SHELL);
        for (const path of paths) {
          try {
            // as a navigation would ask for it, so what is stored is the
            // document and not a router payload
            const res = await fetch(path, {
              headers: { accept: "text/html" },
              cache: "no-store",
            });
            if (res.ok) await cache.put(path, res.clone());
          } catch {
            // no signal, or the page is gone: the next run tries again
          }
        }
      })()
    );
    return;
  }
  if (!msg || msg.type !== "cache-urls") return;
  // only same-origin dataset paths, and only so many: this message is how the
  // offline screen asks for files, not a general-purpose fetch-and-store
  const urls = (Array.isArray(msg.urls) ? msg.urls : [])
    .filter(
      (u) =>
        typeof u === "string" &&
        u.startsWith("/") &&
        !u.startsWith("//") &&
        DATA_PATHS.some((p) => u.startsWith(p))
    )
    .slice(0, MAX_CACHE_URLS);
  const id = msg.id;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(DATA);
      let done = 0;
      let failed = 0;
      let full = false;
      const post = (type) =>
        self.clients.matchAll().then((cs) =>
          cs.forEach((c) =>
            c.postMessage({ type, id, done, failed, total: urls.length, full })
          )
        );
      // a few at a time: enough to saturate a phone, not enough to stall it
      const queue = urls.slice();
      const worker = async () => {
        while (queue.length) {
          const url = queue.shift();
          try {
            if (await cache.match(url)) {
              done++;
            } else {
              const res = await fetch(url);
              if (res.ok) {
                await cache.put(url, res.clone());
                done++;
              } else {
                failed++;
              }
            }
          } catch (err) {
            failed++;
            // QuotaExceededError means every remaining file will fail too
            if (err && err.name === "QuotaExceededError") {
              queue.length = 0;
              full = true;
            }
          }
          if ((done + failed) % 10 === 0) await post("cache-progress");
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      await post("cache-done");
    })()
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Communion", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Communion", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || undefined,
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
