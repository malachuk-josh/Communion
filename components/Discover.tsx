"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import type { DiscoverChurch } from "@/lib/types";

export default function Discover() {
  const { t } = useI18n();
  const [churches, setChurches] = useState<DiscoverChurch[] | null>(null);

  useEffect(() => {
    api<{ churches: DiscoverChurch[] }>("/api/discover")
      .then((res) => setChurches(res.churches))
      .catch(() => setChurches([]));
  }, []);

  return (
    <div>
      <h1 className="page-title">{t("discover.title")}</h1>
      <p className="subtitle">{t("discover.subtitle")}</p>

      {churches === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : churches.length === 0 ? (
        <div className="glass card empty">
          <blockquote className="founding-verse">
            {t("verse.matthew")}
            <cite>{t("verse.matthewRef")}</cite>
          </blockquote>
          <p>{t("discover.empty")}</p>
        </div>
      ) : (
        churches.map((church) => (
          <Link
            key={church.id}
            href={`/churches/${church.id}`}
            className="glass church-row card"
          >
            <div className="discover-head">
              <h3>{church.name}</h3>
              <span className="discover-badges">
                {church.mine && (
                  <span className="chip mine-chip">✓ {t("discover.mine")}</span>
                )}
                <span className="chip">
                  👥 {t("discover.members", { count: String(church.memberCount) })}
                </span>
              </span>
            </div>
            {church.description && <p>{church.description}</p>}
          </Link>
        ))
      )}
    </div>
  );
}
