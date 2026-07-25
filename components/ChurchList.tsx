"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import StartGathering from "@/components/StartGathering";
import type { Church } from "@/lib/types";

export default function ChurchList() {
  const { t } = useI18n();
  const [churches, setChurches] = useState<Church[] | null>(null);

  useEffect(() => {
    api<{ churches: Church[] }>("/api/churches")
      .then((res) => setChurches(res.churches))
      .catch(() => setChurches([]));
  }, []);

  return (
    <div>
      <div className="section-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          {t("churches.title")}
        </h1>
        <StartGathering
          onCreated={(church) =>
            setChurches((prev) => [church, ...(prev ?? [])])
          }
        />
      </div>
      <p className="subtitle">{t("churches.subtitle")}</p>

      {churches === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : churches.length === 0 ? (
        <div className="glass card empty">
          <blockquote className="founding-verse">
            {t("verse.matthew")}
            <cite>{t("verse.matthewRef")}</cite>
          </blockquote>
          <p>{t("churches.empty")}</p>
        </div>
      ) : (
        <div>
          {churches.map((c) => (
            <Link
              key={c.id}
              href={`/churches/${c.id}`}
              className="glass church-row card"
            >
              <h3>{c.name}</h3>
              {c.description && <p>{c.description}</p>}
            </Link>
          ))}
        </div>
      )}

      {!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && (
        <p className="notice">{t("common.demoNotice")}</p>
      )}
    </div>
  );
}
