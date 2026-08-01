"use client";

// Which of a page's toggles you had open, kept.
//
// Every tabbed screen in the app used to open on its first tab, every time.
// That is right the first time somebody arrives and wrong every time after:
// leaving the Journal to check something and coming back put you on Bookmarks
// when you had been in Plans, and a refresh did the same. The tab you chose is
// a thing you said, and the app should not forget it between one screen and
// the next.
//
// Kept on the device rather than on the account, in localStorage, beside the
// theme and the reading position — which are already remembered across
// sessions for the same reason. It is where you were, not what you own.

import { useCallback, useLayoutEffect, useState } from "react";
import { readLocal, writeLocal } from "@/lib/storage";

/**
 * A tab that survives a refresh.
 *
 * Read in a layout effect rather than in the initial state, and this is the
 * whole trick: the server renders this page with no idea what any device
 * remembers, so reading storage during the first render would hand React a
 * different answer than the HTML it is hydrating. A layout effect runs after
 * that first commit and before the browser paints, so the remembered tab is
 * on screen from the first frame the reader actually sees.
 *
 * `valid` is not a formality. Storage outlives deployments, so it holds tab
 * names from versions of the app that no longer exist — and a page asked to
 * show a tab it has never heard of shows nothing at all.
 */
export function useStickyTab<T extends string>(
  /** unique per page: "journal", "discover", "table", "gatherings" */
  page: string,
  fallback: T,
  valid: readonly T[]
): [T, (next: T) => void] {
  const [tab, setTab] = useState<T>(fallback);
  const key = `communion.tab.${page}`;

  useLayoutEffect(() => {
    try {
      const saved = readLocal(key);
      if (saved && (valid as readonly string[]).includes(saved)) {
        setTab(saved as T);
      }
    } catch {
      // storage blocked — the page opens on its first tab, as it always did
    }
    // `valid` is a literal at every call site, so it is a new array each
    // render and would restart this effect forever if it were a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const choose = useCallback(
    (next: T) => {
      setTab(next);
      try {
        writeLocal(key, next);
      } catch {
        // the choice just won't outlive this visit
      }
    },
    [key]
  );

  return [tab, choose];
}
