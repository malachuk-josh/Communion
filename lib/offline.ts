"use client";

// Downloading Communion onto the device. The service worker does the fetching
// and storing (it owns the cache); this is the client side of that
// conversation — what the tiers are, how big, how far along, and what is
// already here.

export type TierId = string;

export interface Tier {
  urls: string[];
  bytes: number;
}

export interface OfflineManifest {
  built: string;
  tiers: Record<TierId, Tier>;
}

let manifest: Promise<OfflineManifest> | null = null;

export function loadManifest(): Promise<OfflineManifest> {
  if (!manifest) {
    manifest = fetch("/offline-manifest.json").then((res) => {
      if (!res.ok) throw new Error("no offline manifest");
      return res.json();
    });
    manifest.catch(() => {
      manifest = null;
    });
  }
  return manifest;
}

export function supportsOffline(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof caches !== "undefined"
  );
}

/** How many of a tier's files are already stored. */
export async function tierProgress(tier: Tier): Promise<number> {
  if (!supportsOffline() || tier.urls.length === 0) return 0;
  const cache = await caches.open("communion-data-v1");
  // matching 600 URLs one by one is slow; read the key list once instead
  const keys = await cache.keys();
  const have = new Set(keys.map((r) => new URL(r.url).pathname));
  let n = 0;
  for (const url of tier.urls) if (have.has(url)) n++;
  return n;
}

export interface DownloadProgress {
  done: number;
  failed: number;
  total: number;
}

/**
 * Hand a tier's file list to the service worker and watch it land.
 * Resolves when every file has been stored or given up on.
 */
export function downloadTier(
  tier: Tier,
  onProgress: (p: DownloadProgress) => void
): Promise<DownloadProgress> {
  return new Promise((resolve, reject) => {
    if (!supportsOffline()) {
      reject(new Error("offline storage unavailable"));
      return;
    }
    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    navigator.serviceWorker.ready
      .then((reg) => {
        const worker = reg.active;
        if (!worker) throw new Error("no active service worker");
        const onMessage = (event: MessageEvent) => {
          const msg = event.data;
          if (!msg || msg.id !== id) return;
          if (msg.type === "cache-progress") {
            onProgress({ done: msg.done, failed: msg.failed, total: msg.total });
          } else if (msg.type === "cache-done") {
            navigator.serviceWorker.removeEventListener("message", onMessage);
            const final = {
              done: msg.done,
              failed: msg.failed,
              total: msg.total,
            };
            onProgress(final);
            resolve(final);
          }
        };
        navigator.serviceWorker.addEventListener("message", onMessage);
        worker.postMessage({ type: "cache-urls", id, urls: tier.urls });
      })
      .catch(reject);
  });
}

/** Everything Communion has stored, in bytes, as the browser accounts for it. */
export async function storageUsed(): Promise<{
  used: number;
  quota: number;
} | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null;
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { used: usage, quota };
}

/**
 * Ask the browser not to evict us when the device gets tight. Safari grants
 * this to installed apps; elsewhere it depends on engagement. Never throws.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Drop everything downloaded. The app still works, it just re-fetches. */
export async function clearDownloads(): Promise<void> {
  if (!supportsOffline()) return;
  await caches.delete("communion-data-v1");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}
