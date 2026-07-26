"use client";

// Public view of a shared verse or bookmark collection: verse texts (KJV) with
// the sharer's labels, each deep-linking into The Word.
//
// Two ways in. A collection arrives as a token, because a shelf of verses and
// the names they were kept under is too much to carry in a link, and it is
// published as a snapshot. A single verse arrives as the verse itself, spelled
// out in the query — nothing needs storing to say "Psalm 23:1", and building
// the link takes no round trip, which matters: an await between the tap and
// navigator.share costs the user gesture, and iOS refuses the sheet.
//
// Either way, the offer that makes a share worth sending — keep it. Saving
// writes through the same local-first path the reader and the journal use: the
// device's copy first, then the outbox, so it works with no signal and lands
// in the account the next time one is reachable. Nothing here is a second
// source of truth; a saved collection is an ordinary collection afterwards,
// editable and deletable like any other.

import Link from "next/link";
import Icon from "@/components/Icon";
import { useEffect, useState } from "react";
import { getBook, type ChapterData } from "@/lib/bible";
import { useI18n, type Lang } from "@/lib/i18n";
import { fetchChapter } from "@/lib/scripture";
import {
  enqueue,
  flush,
  flushFailed,
  readLocalState,
  startSync,
  writeLocalState,
  type BmCollection,
  type BmEntry,
} from "@/lib/sync";

interface SharedVerse {
  b: number;
  c: number;
  v: number;
  label?: string;
}

interface Snapshot {
  name: string;
  sharedBy?: string;
  /** one verse rather than a collection: it is titled by its reference */
  single?: boolean;
  verses: SharedVerse[];
}

/**
 * Which collection a given share was saved into, on this device.
 *
 * Without this, saving the same link twice makes two collections of the same
 * name. It cannot live on the collection record itself — the server's copy is
 * authoritative and only carries a name and a share token — so it lives here,
 * as a device's memory of what it has already taken.
 */
const SAVED_KEY = "communion.saved-shares";

function readSavedShares(): Record<string, string> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "{}");
    return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function rememberShare(token: string, collectionId: string): void {
  try {
    const all = { ...readSavedShares(), [token]: collectionId };
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(all));
  } catch {
    // storage blocked — the worst case is a duplicate collection later
  }
}

const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const verseKeyOf = (x: SharedVerse) => `${x.b}:${x.c}:${x.v}`;

const refLabel = (x: SharedVerse, lang: Lang) => {
  const book = getBook(x.b);
  const name = book ? (lang === "es" ? book.es : book.en) : "";
  return `${name} ${x.c}:${x.v}`;
};

export default function SharedCollection({
  token,
  verse,
}: {
  /** a published collection snapshot */
  token?: string;
  /** or one verse, spelled out in the link that carried it */
  verse?: SharedVerse & { sharedBy?: string };
}) {
  const { lang, t } = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(
    verse
      ? {
          name: "",
          single: true,
          verses: [verse],
          ...(verse.sharedBy ? { sharedBy: verse.sharedBy } : {}),
        }
      : null
  );
  const [invalid, setInvalid] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  /** what this journal already holds, so nothing is offered twice */
  const [kept, setKept] = useState<Record<string, BmEntry>>({});
  const [saving, setSaving] = useState(false);
  /** where the last save landed: the account, or only this device */
  const [landed, setLanded] = useState<"" | "synced" | "device">("");

  useEffect(() => {
    if (!token) {
      // the verse came in the link, and there is nothing to fetch — unless
      // neither arrived, which is a link that lost its address on the way
      if (!verse) setInvalid(true);
      return;
    }
    fetch(`/api/shared/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setSnap)
      .catch(() => setInvalid(true));
    // the verse prop is fixed for the life of the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // What this device already keeps. Read locally rather than from /api: this
  // page is reachable signed out, and the local copy is the one a save writes.
  useEffect(() => {
    startSync();
    readLocalState().then((local) => {
      if (local) setKept(local.bookmarks);
    });
  }, []);

  useEffect(() => {
    if (!snap) return;
    const chapters = [...new Set(snap.verses.map((x) => `${x.b}:${x.c}`))];
    chapters.forEach((ch) => {
      const [b, c] = ch.split(":").map(Number);
      fetchChapter("kjv", b, c)
        .then((json: ChapterData) => {
          setTexts((prev) => {
            const next = { ...prev };
            for (const verse of json.verses) {
              next[`${b}:${c}:${verse.verse}`] = verse.text;
            }
            return next;
          });
        })
        .catch(() => {});
    });
  }, [snap]);

  /**
   * Take some or all of what was shared.
   *
   * `intoCollection` is what separates the two offers: the whole shelf keeps
   * its shape, filed under the name it was sent with, while a single verse
   * lifted out of somebody else's collection lands unfiled in yours — it is
   * yours to sort, and inventing a collection for one verse would not be.
   */
  const save = async (verses: SharedVerse[], intoCollection: boolean) => {
    if (saving || verses.length === 0) return;
    setSaving(true);
    setLanded("");
    try {
      const local = await readLocalState();
      const collections: Record<string, BmCollection> = {
        ...(local?.collections ?? {}),
      };
      const bookmarks: Record<string, BmEntry> = { ...(local?.bookmarks ?? {}) };

      let collectionId = "";
      if (intoCollection && token) {
        const remembered = readSavedShares()[token];
        collectionId = remembered && collections[remembered] ? remembered : newId();
        const name = snap?.name?.trim().slice(0, 80) || t("shared.savedName");
        collections[collectionId] = { ...collections[collectionId], name };
        rememberShare(token, collectionId);
        // the collection has to exist before a bookmark can name it: the sync
        // route drops a file-into for a collection it has never heard of
        await enqueue({
          kind: "collection.set",
          id: collectionId,
          name,
          ts: Date.now(),
        });
      }

      const now = Date.now();
      for (const x of verses) {
        const key = verseKeyOf(x);
        const entry: BmEntry = {
          // a verse already kept keeps the day you kept it, not today
          t: bookmarks[key]?.t ?? now,
          ...(x.label ? { l: x.label.slice(0, 80) } : {}),
          ...(collectionId ? { c: collectionId } : {}),
        };
        bookmarks[key] = entry;
        await enqueue({
          kind: "bookmark.set",
          key,
          t: entry.t,
          l: entry.l,
          c: entry.c,
          ts: Date.now(),
        });
      }

      await writeLocalState({ bookmarks, collections });
      setKept(bookmarks);

      // Say honestly where it went. Signed out — or with no signal — the save
      // is real but local, and will reach the account on the next flush.
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      await flush().catch(() => null);
      setLanded(offline || flushFailed() ? "device" : "synced");
    } finally {
      setSaving(false);
    }
  };

  if (invalid) {
    return <p className="empty glass card">{t("shared.invalid")}</p>;
  }
  if (!snap) {
    return <p className="skeleton">{t("common.loading")}</p>;
  }

  const single = !!snap.single || snap.verses.length === 1;
  const title =
    snap.single && snap.verses[0]
      ? refLabel(snap.verses[0], lang)
      : snap.name;
  /**
   * What this shelf still has to offer.
   *
   * A verse you do not keep at all, plainly. But also one you keep loose and
   * unsorted — the shelf has a home for it, and putting it there is the whole
   * point of taking a collection rather than its verses one at a time. A verse
   * you have already filed somewhere of your own is left exactly where you put
   * it; nothing arriving from someone else moves it.
   */
  const outstanding = snap.verses.filter((x) => {
    const mine = kept[verseKeyOf(x)];
    if (!mine) return true;
    return !single && !mine.c;
  });
  const allKept = snap.verses.length > 0 && outstanding.length === 0;

  return (
    <div>
      <h1 className="page-title">
        <Icon name={single ? "bookmark" : "collection"} /> {title}
      </h1>
      <p className="subtitle">
        {snap.sharedBy
          ? t("shared.by", { name: snap.sharedBy })
          : t("shared.subtitle")}
      </p>

      {snap.verses.length > 0 && (
        <div className="glass card shared-keep">
          <p className="shared-keep-copy">
            {single ? t("shared.keepOne") : t("shared.keepAll")}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving || allKept}
            onClick={() => save(outstanding, !single)}
          >
            <Icon name={allKept ? "check" : "bookmark"} />{" "}
            {allKept
              ? t("shared.alreadySaved")
              : saving
                ? t("shared.saving")
                : single
                  ? t("shared.saveVerse")
                  : t("shared.saveCollection", {
                      n: String(outstanding.length),
                    })}
          </button>
          {landed && (
            <p className="shared-landed">
              {landed === "synced"
                ? t("shared.landedAccount")
                : t("shared.landedDevice")}
            </p>
          )}
          {allKept && (
            <Link href="/menu/journal" className="passage-link">
              {t("shared.openJournal")} →
            </Link>
          )}
        </div>
      )}

      {snap.verses.length === 0 ? (
        <div className="glass card empty">{t("shared.empty")}</div>
      ) : (
        snap.verses.map((x) => {
          const key = verseKeyOf(x);
          const have = !!kept[key];
          return (
            <div key={key} className="glass card shared-verse">
              {/* the link cannot wrap the button: one interactive element
                  inside another is invalid, and a tap on Keep would follow
                  the link away from the page too */}
              <Link href={`/?b=${x.b}&c=${x.c}&v=${x.v}`} className="shared-go">
                <span className="ref">{refLabel(x, lang)}</span>
                {x.label && <span className="shared-label">{x.label}</span>}
                <p>{texts[key] ?? "…"}</p>
              </Link>
              <button
                type="button"
                className={`shared-save${have ? " done" : ""}`}
                disabled={saving || have}
                aria-label={
                  have ? t("shared.alreadySaved") : t("shared.saveVerse")
                }
                title={have ? t("shared.alreadySaved") : t("shared.saveVerse")}
                onClick={() => save([x], false)}
              >
                <Icon name={have ? "check" : "bookmark"} />
              </button>
            </div>
          );
        })
      )}
      <p className="notice">{t("shared.footer")}</p>
    </div>
  );
}
