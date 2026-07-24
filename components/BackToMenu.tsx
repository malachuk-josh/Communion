"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function BackToMenu() {
  return (
    <Link href="/menu" className="passage-link back-link">
      ← {useI18n().t("menu.title")}
    </Link>
  );
}
