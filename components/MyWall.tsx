"use client";

// The reader's own wall, on their home screen.
//
// The same component the Gatherings use, with the room reduced to one person.
// Nothing is shared from here and nobody else can see it, so there is no
// "hung by" worth reading — but it is left in rather than special-cased away,
// because a verse somebody hung a year ago and their own name beside it is
// not the wrong thing to meet on a home screen.

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import VerseWall, { type WallEntry } from "@/components/VerseWall";

export default function MyWall() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<WallEntry[] | null>(null);

  useEffect(() => {
    api<{ entries: WallEntry[] }>("/api/wall")
      .then((res) => setEntries(res.entries))
      .catch(() => setEntries([]));
  }, []);

  if (entries === null) return <p className="skeleton">{t("common.loading")}</p>;

  const takeDown = async (key: string) => {
    setEntries((prev) => prev?.filter((e) => e.key !== key) ?? prev);
    await api(`/api/wall?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    }).catch(() => {
      // gone from the screen; the next load is the arbiter
    });
  };

  return (
    <VerseWall
      entries={entries}
      empty={t("wall.mineEmpty")}
      onTakeDown={takeDown}
      canTakeDown={() => true}
      // Open. This is not a glance at somebody else's room — it is the
      // handful of verses this reader chose to keep in front of themselves.
      startOpen
    />
  );
}
