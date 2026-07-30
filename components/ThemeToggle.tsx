"use client";

// One button, three themes, cycling dark → grey → light → dark.
//
// The icon shows what comes NEXT rather than what is on: a control that
// pictures the state you are already looking at tells you nothing you cannot
// see, and the question anybody has in front of it is where pressing will take
// them.
//
// Lifted out of the header so the reader's navigator can carry the same one.
// The Word's own header is kept for the passage and study mode — it is the one
// screen meant to be nothing but the text — so on that tab this lives inside
// the navigator, which is where somebody reading at night goes looking anyway.

import Icon from "@/components/Icon";
import { useEffect, useState } from "react";

type Theme = "dark" | "light" | "grey";

const NEXT: Record<Theme, Theme> = {
  dark: "grey",
  grey: "light",
  light: "dark",
};

const BAR: Record<Theme, string> = {
  dark: "#0b0d1a",
  grey: "#000000",
  light: "#ede1c8",
};

const LABEL: Record<Theme, string> = {
  grey: "Switch to grey scale",
  light: "Switch to light mode",
  dark: "Switch to dark mode",
};

export default function ThemeToggle({
  className = "theme-toggle",
}: {
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  // the inline bootstrap script in the layout applies the saved theme before
  // paint; here we just sync React state with what it decided
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" || current === "grey" ? current : "dark");
  }, []);

  const cycle = () => {
    const next = NEXT[theme];
    setTheme(next);
    if (next === "dark") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    window.localStorage.setItem("communion.theme", next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", BAR[next]);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={cycle}
      aria-label={LABEL[NEXT[theme]]}
      title={LABEL[NEXT[theme]]}
    >
      <Icon name={theme === "dark" ? "news" : theme === "grey" ? "sun" : "moon"} />
    </button>
  );
}
