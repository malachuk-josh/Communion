"use client";

// The pill that puts a verse on the reader's wall — the verses on their home
// screen.
//
// It used to open a menu: the reader's own wall, or the wall of any Gathering
// they belonged to, because from where the reader stood those were the same
// decision. The Gatherings are gone, so there is one wall left, and one tap
// hangs the verse on it.

import Icon from "@/components/Icon";
import { useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

export default function HangOnWall({
  bmKey,
  className = "jr-share",
  withLabel = false,
}: {
  /** the bookmark key of the verse or run being hung */
  bmKey: string;
  className?: string;
  /**
   * The sheet has room for a word, and a line of its own for the
   * confirmation; a row of icons has neither.
   */
  withLabel?: boolean;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const hang = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // a verse already up comes back as it was, so a second tap is harmless
      await api("/api/wall", { method: "POST", body: { key: bmKey } });
      setDone(true);
      window.setTimeout(() => setDone(false), 2600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={`hang-wrap${withLabel ? " hang-inline" : ""}`}>
      <button
        type="button"
        className={className}
        onClick={hang}
        disabled={busy}
        aria-label={t("wall.hang")}
        title={t("wall.hang")}
      >
        <Icon name="wall" />
        {withLabel && ` ${t("wall.hang")}`}
      </button>
      {done && (
        <span className="hang-done">{t("wall.hung")}</span>
      )}
      {error && <span className="error-text hang-done">{error}</span>}
    </span>
  );
}
