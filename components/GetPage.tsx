"use client";

// Communion, for somebody who has just been sent it: what it is, in a few
// lines, and the steps to keep it — the ones for their phone and browser,
// laid out on the page so there is nothing to find first. Where the browser
// can install it in a tap, that one button is the whole of it.
//
// Somebody who already has it on their Home Screen and opens this page is
// taken straight into the app.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Icon, { type IconName } from "@/components/Icon";
import InstallSteps, { useInstallWay } from "@/components/InstallSteps";
import { useI18n, type MessageKey } from "@/lib/i18n";

const INSIDE: [IconName, MessageKey][] = [
  ["book", "get.bible"],
  ["letters", "get.languages"],
  ["compass", "get.maps"],
  ["download", "get.offline"],
];

export default function GetPage() {
  const { t } = useI18n();
  const router = useRouter();
  const way = useInstallWay();

  useEffect(() => {
    if (way?.k === "installed") router.replace("/");
  }, [way, router]);

  return (
    <div className="get-page">
      <div className="get-hero">
        <img className="get-icon" src="/icons/icon-192.png" alt="" width={84} height={84} />
        <h1 className="get-name">Communion</h1>
        <p className="get-tag">{t("get.tagline")}</p>
        <p className="get-lead">{t("get.lead")}</p>
      </div>

      <section className="glass card get-install" aria-labelledby="get-install-title">
        <h2 id="get-install-title">
          <Icon name="addSquare" /> {t("install.title")}
        </h2>
        <p className="install-why">{t("install.why")}</p>
        {way ? <InstallSteps way={way} /> : <div className="skeleton get-wait" />}
      </section>

      <ul className="get-inside">
        {INSIDE.map(([icon, key]) => (
          <li key={key}>
            <Icon name={icon} /> <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <p className="get-links">
        <Link href="/">{t("get.openHere")}</Link>
        <span aria-hidden> · </span>
        <Link href="/tour">{t("get.tour")}</Link>
      </p>
    </div>
  );
}
