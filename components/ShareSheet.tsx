"use client";

// Passing Communion on, from the menu's "Share Communion".
//
// In person, a QR code: the friend points their phone's camera at it and the
// welcome page opens (app/get), with the steps for their phone. Apart, a link
// to that same page, sent the way the reader sends anything; or copied.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import QrCode from "@/components/QrCode";
import { useI18n } from "@/lib/i18n";
import { shareCommunion } from "@/lib/menuItems";
import { GET_URL } from "@/lib/site";

export default function ShareSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  const send = async () => {
    const copiedIt = await shareCommunion(t("menu.shareMessage", { url: GET_URL }));
    if (copiedIt) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(GET_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // no clipboard: the address is written under the code
    }
  };

  return createPortal(
    <div className="modal-overlay over-panel" onClick={onClose}>
      <div
        className="glass modal share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mh-head">
          <h2 id="share-title">
            <Icon name="share" /> {t("menu.share")}
          </h2>
          <button type="button" className="lex-close" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>
        <QrCode text={GET_URL} label={t("install.qrLabel")} className="qr share-qr" />
        <p className="share-scan">{t("share.scan")}</p>
        <p className="share-url">{GET_URL.replace(/^https:\/\//, "")}</p>
        <div className="share-actions">
          <button type="button" className="btn btn-primary" onClick={send}>
            <Icon name="send" /> {t("share.send")}
          </button>
          <button type="button" className="btn" onClick={copy}>
            <Icon name={copied ? "check" : "link"} /> {copied ? t("install.copied") : t("install.copy")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
