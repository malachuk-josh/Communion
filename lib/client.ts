"use client";

// Client-side fetch helper. In guest mode (no Clerk configured) every request
// carries a stable per-browser guest id; when Clerk is live the server ignores
// the header and uses the real session instead.

export function guestId(): string {
  let id = window.localStorage.getItem("communion.guestId");
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    window.localStorage.setItem("communion.guestId", id);
  }
  return id;
}

export function getSavedName(): string {
  return window.localStorage.getItem("communion.guestName") ?? "";
}

export function saveName(name: string): void {
  window.localStorage.setItem("communion.guestName", name.trim());
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-guest-id": guestId(),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      (detail as { error?: string }).error ?? `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}
