"use client";

// The strip that says whose account you are in.
//
// The one thing that must never happen with this feature is forgetting it is
// on. So the marker is not a setting in a screen the owner would have to go
// looking for — it rides above the nav on every page, in a colour nothing
// else in the app uses, and the way out of the mode is the same tap wherever
// you happen to be when you remember.
//
// It reads a cookie rather than asking the server, so it costs nothing on
// every page load and is right immediately. That cookie proves nothing — the
// signed one beside it is what the server checks, and this one is not even
// consulted there. All this does is show a name.

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

const LABEL = "communion.actas.who";

function labelFromCookie(): string {
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== LABEL) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return "";
}

export default function ActingAs() {
  const [who, setWho] = useState("");
  const [leaving, setLeaving] = useState(false);

  /**
   * Notice the change, not just the state.
   *
   * A ticket can also end by running out of time, or by the tab being closed
   * and reopened later — nobody presses Stop in either case, and the answers
   * this device cached while standing in the account would otherwise still be
   * on it, ready to be served the next time it goes offline. Comparing what
   * is true now against what was true last load turns that into the same
   * cleanup pressing Stop does.
   */
  useEffect(() => {
    const now = labelFromCookie();
    setWho(now);
    const before = window.localStorage.getItem("communion.actingAs") ?? "";
    if (before !== now) {
      window.localStorage.setItem("communion.actingAs", now);
      if (before) {
        void import("@/lib/offline")
          .then((m) => m.clearApiCache())
          .catch(() => {});
      }
    }
  }, []);

  if (!who) return null;

  const stop = async () => {
    setLeaving(true);
    try {
      await fetch("/api/admin/impersonate", { method: "DELETE" });
    } catch {
      // even a failed call is worth reloading after: the cookie may be gone
    }
    // the same reason the dashboard reloads on the way in — this device's
    // local copy belongs to the account being left, and only a fresh load
    // runs the check that clears it
    await import("@/lib/offline")
      .then((m) => m.clearApiCache())
      .catch(() => {});
    window.location.href = "/admin";
  };

  return (
    <div className="acting-as" role="status">
      <span className="acting-as-mark">
        <Icon name="person" />
      </span>
      <span className="acting-as-text">
        Signed in as <strong>{who}</strong>
      </span>
      <button type="button" onClick={stop} disabled={leaving}>
        {leaving ? "…" : "Stop"}
      </button>
    </div>
  );
}
