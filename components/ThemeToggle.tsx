"use client";

// One button, three themes, cycling dark → grey → light → dark — which the
// reader knows as Illuminated, Grey and Parchment. The ids stay as they were,
// so everybody's saved choice still means what it did.
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
import { writeLocal } from "@/lib/storage";
import { useDocumentTheme, type Theme } from "@/lib/theme";

const NEXT: Record<Theme, Theme> = {
  dark: "grey",
  grey: "light",
  light: "dark",
};

const BAR: Record<Theme, string> = {
  dark: "#0b0d1a",
  grey: "#000000",
  light: "#f3e8cf",
};

const LABEL: Record<Theme, string> = {
  grey: "Switch to grey scale",
  light: "Switch to Parchment",
  dark: "Switch to Illuminated",
};

export default function ThemeToggle({
  className = "theme-toggle",
}: {
  className?: string;
}) {
  // the inline bootstrap script in the layout applies the saved theme before
  // paint; this follows it, and whatever Settings does to it afterwards
  const theme = useDocumentTheme();

  const cycle = () => {
    const next = NEXT[theme];
    if (next === "dark") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    writeLocal("communion.theme", next);
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
      <Icon
        name={theme === "dark" ? "news" : theme === "grey" ? "parchment" : "candle"}
      />
    </button>
  );
}
