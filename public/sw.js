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
  "/offline-manifest.json",
];

// Read-only API responses worth showing stale. Bookmarks and notes are
// deliberately absent: IndexedDB holds those now, and it is ahead of the
// server whenever the outbox has anything in it. A cached copy here would be
// older than the device's own and would overwrite it on an offline reload.
const API_PATHS = ["/api/plans/progress"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // the reader is the page worth guaranteeing; the rest fills in as visited
      cache.addAll(["/", "/manifest.webmanifest"]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => !MINE.includes(n)).map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isData = (url) =>
  url.origin === self.location.origin &&
  DATA_PATHS.some((p) => url.pathname.startsWith(p));

const isApi = (url) =>
  url.origin === self.location.origin &&
  API_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));

const isShell = (url, request) =>
  url.origin === self.location.origin &&
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
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "cache-urls") return;
  const urls = Array.isArray(msg.urls) ? msg.urls : [];
  const id = msg.id;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(DATA);
      let done = 0;
      let failed = 0;
      const post = (type) =>
        self.clients.matchAll().then((cs) =>
          cs.forEach((c) =>
            c.postMessage({ type, id, done, failed, total: urls.length })
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
          } catch {
            failed++;
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
