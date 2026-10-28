"use client";

// Which theme is on, read from the page itself and kept in step with it.
//
// Two controls change the theme — the button in the header and the three in
// Settings — and each used to read the page once, when it appeared. Change it
// with one and the other went on showing the theme from before, so the header
// button could picture the theme you were already in. The page's own
// attribute is the one answer both can watch.

import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "grey";

function read(): Theme {
  const current = document.documentElement.dataset.theme;
  return current === "light" || current === "grey" ? current : "dark";
}

export function useDocumentTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(read());
    const watch = new MutationObserver(() => setTheme(read()));
    watch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => watch.disconnect();
  }, []);
  return theme;
}
