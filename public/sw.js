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
  "/xref/",
  "/strongs/",
  "/lexicon/",
  "/concordance/",
  "/absmith/",
  "/bdb/",
  "/icons/",
];

// Read-only API responses worth showing stale. Bookmarks and notes are
// deliberately absent: IndexedDB holds those now, and it is ahead of the
// server whenever the outbox has anything in it. A cached copy here would be
// older than the device's own and would overwrite it on an offline reload.
// The manifest is here rather than in DATA because every build regenerates it;
// cache-first would pin a client to the file sizes of whenever it first looked.
const API_PATHS = ["/api/plans/progress", "/offline-manifest.json"];

/** Pages worth guaranteeing offline; the rest fill in as they are visited. */
const SHELL_ROUTES = [
  "/",
  "/manifest.webmanifest",
  "/churches",
  "/discover",
  "/menu",
  "/menu/offline",
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
    await dropStaleData(manifest.dataStamp);
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
 * The dataset files are immutable in practice, so the data cache is not
 * versioned per deploy — re-downloading 30MB because a button moved would be
 * absurd. But a file can be *corrected*, and cache-first would then serve the
 * old one forever. The manifest carries a stamp over every file's path and
 * size; when that moves, what we hold is genuinely out of date.
 */
async function dropStaleData(stamp) {
  if (!stamp) return;
  try {
    const data = await caches.open(DATA);
    const markUrl = new URL(DATA_MARK, self.location.origin).toString();
    const seen = await data.match(markUrl);
    const previous = seen ? await seen.text() : null;
    if (previous === stamp) return;
    if (previous !== null) await caches.delete(DATA);
    const fresh = await caches.open(DATA);
    await fresh.put(markUrl, new Response(stamp));
  } catch {
    // nothing to be done offline; the next activation tries again
  }
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

const isApi = (url) =>
  url.origin === self.location.origin &&
  API_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));

const isShell = (url, request) =>
  url.origin === self.location.origin &&
  url.pathname !== BUILD_MARK &&
  (request.mode === "navigate" ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest");

/** Never touches the network on a hit — these files don't change in place. */
async function cacheFirst(request, cacheName) {
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
  } else if (isShell(url, request)) {
    event.respondWith(networkFirst(request, SHELL));
  } else if (isApi(url)) {
    event.respondWith(networkFirst(request, API));
  }
});

// The offline screen asks for a list of files; we fetch and store them,
// reporting progress back so it can draw a bar.
const MAX_CACHE_URLS = 2000;

self.addEventListener("message", (event) => {
  const msg = event.data;
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
