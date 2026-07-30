"use client";

// A Gathering's wall, on its own page.
//
// Open by default where there is anything on it and shut where there is not:
// an empty wall with a heading over it is an instruction nobody asked for,
// and a wall with six verses on it is the best answer to "what is this group
// about" the page can give.

import Icon from "@/components/Icon";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import VerseWall, { type WallEntry } from "@/components/VerseWall";

interface WallAnswer {
  entries: WallEntry[];
  canHang: boolean;
  canCurate: boolean;
  myUserId: string;
}

export default function ChurchWall({ churchId }: { churchId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<WallAnswer | null>(null);
  const [shut, setShut] = useState(false);

  useEffect(() => {
    api<WallAnswer>(`/api/churches/${churchId}/wall`)
      .then(setData)
      .catch(() => setData(null));
  }, [churchId]);

  if (!data) return null;
  // Nothing hung and nothing this reader could hang: there is no wall here to
  // speak of, and a heading over an empty box is furniture.
  if (data.entries.length === 0 && !data.canHang) return null;

  const takeDown = async (key: string) => {
    setData((prev) =>
      prev ? { ...prev, entries: prev.entries.filter((e) => e.key !== key) } : prev
    );
    await api(
      `/api/churches/${churchId}/wall?key=${encodeURIComponent(key)}`,
      { method: "DELETE" }
    ).catch(() => {
      // it stays gone on screen until the next load says otherwise
    });
  };

  return (
    <>
      <div className="section-head">
        <h2>
          <Icon name="wall" /> {t("wall.title")}
          <span className="jr-group-count">{data.entries.length}</span>
        </h2>
        {data.entries.length > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShut((v) => !v)}
            aria-expanded={!shut}
          >
            {shut ? t("wall.show") : t("wall.hide")}
          </button>
        )}
      </div>
      {!shut && (
        <VerseWall
          entries={data.entries}
          empty={data.canHang ? t("wall.emptyMember") : t("wall.empty")}
          onTakeDown={takeDown}
          canTakeDown={(e) => data.canCurate || e.by === data.myUserId}
        />
      )}
    </>
  );
}
