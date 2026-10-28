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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { readLocal, writeLocal } from "@/lib/storage";

/**
 * The tabs of the screen being looked at, for the swipe across the app.
 *
 * The swipe (components/Nav) moves through a page's own tabs before it moves
 * on to the next page, so it has to know which tabs this page has, which one
 * is up, and how to change it. A page with tabs says so by being mounted.
 */
export interface ScreenTabs {
  page: string;
  tabs: readonly string[];
  tab: string;
  choose: (next: string) => void;
}

let onScreen: ScreenTabs | null = null;

export function screenTabs(): ScreenTabs | null {
  return onScreen;
}

/**
 * Have a page open on a given tab the next time it mounts — where a swipe
 * arriving at it from the side should land, whatever it last remembered.
 */
export function arriveOnTab(page: string, tab: string): void {
  try {
    writeLocal(`communion.tab.${page}`, tab);
  } catch {
    // it opens on whatever it remembers instead
  }
}

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
  /** unique per page: "journal", "discover" */
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

  // what the swipe sees: this page, its tabs and the one that is up
  const validRef = useRef(valid);
  validRef.current = valid;
  useEffect(() => {
    const entry: ScreenTabs = {
      page,
      tabs: validRef.current,
      tab,
      choose: (next) => {
        if ((validRef.current as readonly string[]).includes(next)) choose(next as T);
      },
    };
    onScreen = entry;
    return () => {
      if (onScreen === entry) onScreen = null;
    };
  }, [page, tab, choose]);

  return [tab, choose];
}
