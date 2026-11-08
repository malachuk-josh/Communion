"use client";

// The Bookshelf's pictures: on or off.
//
// The books are illustrated editions, so the pictures show unless a reader
// turns them off — the reverse of The Word's pictures in the text, which are
// an addition to the page and start off (lib/bibleArt). One setting for every
// book on the shelf, held on this device, as the theme and red letters are.

import { useEffect, useState } from "react";

const KEY = "communion.bookPictures";
const EVENT = "communion:bookPictures";

/** Whether the Bookshelf shows the books' pictures. On until turned off. */
export function readBookPictures(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeBookPictures(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // private mode: it holds for this visit
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

/** The setting, kept in step wherever it is changed. */
export function useBookPictures(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(readBookPictures());
    const hear = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, hear);
    return () => window.removeEventListener(EVENT, hear);
  }, []);
  return [on, writeBookPictures];
}
