"use client";

// Menu → My Journal. Everything this account has made in Communion, gathered
// into one place and sorted into its own kind: the verses you have written
// on, the ones you have kept, and the plans you are walking through.
//
// Nothing here is a new source of truth. Notes, bookmarks, collections and
// plan progress all already live on the device in IndexedDB and on the server
// behind /api; this screen reads both, paints the local copy first so it is
// there with no signal, and lets the server's answer correct it when there is
// one. Every row is a door back into the reader.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import BackToMenu from "@/components/BackToMenu";
import { api } from "@/lib/client";
import { getBook } from "@/lib/bible";
import { useI18n, type Lang, type MessageKey } from "@/lib/i18n";
import { PLANS } from "@/lib/plans";
import { readOutbox } from "@/lib/localStore";
import {
  adoptIdentity,
  flush,
  readLocalNotesAll,
  readLocalState,
  startSync,
  writeLocalNotes,
  writeLocalState,
  type BmCollection,
  type BmEntry,
} from "@/lib/sync";

type Tab = "notes" | "bookmarks" | "plans";

interface NoteRow {
  b: number;
  c: number;
  v: number;
  text: string;
}

const bookName = (nr: number, lang: Lang) => {
  const book = getBook(nr);
  return book ? (lang === "es" ? book.es : book.en) : "";
};

const refLabel = (row: { b: number; c: number; v: number }, lang: Lang) =>
  `${bookName(row.b, lang)} ${row.c}:${row.v}`;

const byRef = (
  a: { b: number; c: number; v: number },
  b: { b: number; c: number; v: number }
) => a.b - b.b || a.c - b.c || a.v - b.v;

/** Flatten one book's { "ch:v": text } record into journal rows. */
function rowsOfBook(b: number, notes: Record<string, string>): NoteRow[] {
  const out: NoteRow[] = [];
  for (const [ref, text] of Object.entries(notes)) {
    const [c, v] = ref.split(":").map(Number);
    if (c && v && text) out.push({ b, c, v, text });
  }
  return out;
}

export default function Journal() {
  const { lang, t } = useI18n();
  const [tab, setTab] = useState<Tab>("notes");
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [bookmarks, setBookmarks] = useState<Record<string, BmEntry>>({});
  const [collections, setCollections] = useState<Record<string, BmCollection>>(
    {}
  );
  const [plans, setPlans] = useState<Record<string, number>>({});

  // ---- bookmarks, collections and plan progress ---------------------------
  // The same order the reader and Discover use: the device's copy on screen
  // first, then flush whatever is queued, and only read the server when this
  // device is not holding changes it has yet to send.
  useEffect(() => {
    let cancelled = false;
    readLocalState().then((local) => {
      if (cancelled || !local) return;
      setBookmarks(local.bookmarks);
      setCollections(local.collections);
      setPlans(local.plans ?? {});
    });
    startSync();
    (async () => {
      try {
        const synced = await flush();
        if (cancelled) return;
        if (synced) {
          setBookmarks(synced.bookmarks);
          setCollections(synced.collections);
          setPlans(synced.plans ?? {});
          return;
        }
        const queued = await readOutbox();
        const ahead = (prefix: string) =>
          queued.some((op) => op.kind.startsWith(prefix));
        if (!ahead("bookmark.") && !ahead("collection.")) {
          const res = await api<{
            who?: string;
            bookmarks: Record<string, BmEntry>;
            collections: Record<string, BmCollection>;
          }>(`/api/bookmarks?lang=${lang}`);
          if (cancelled) return;
          await adoptIdentity(res.who);
          setBookmarks(res.bookmarks);
          setCollections(res.collections);
          void writeLocalState(res);
        }
        if (!ahead("plan.")) {
          const res = await api<{
            who?: string;
            progress: Record<string, number>;
          }>("/api/plans/progress");
          if (cancelled) return;
          await adoptIdentity(res.who);
          setPlans(res.progress);
          void writeLocalState({ plans: res.progress });
        }
      } catch {
        // offline, or signed out: the local snapshot above is what we show
      }
    })();
    return () => {
      cancelled = true;
    };
    // mount only — lang decides only the wording of the seeded collection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- notes across every book -------------------------------------------
  // The reader keeps one IndexedDB record per book, so the device knows only
  // about books it has opened; /api/notes knows about all of them. Take the
  // server's list, except for books with an unsent note — there this device
  // is ahead, and the server's copy would put the old text back on screen.
  useEffect(() => {
    let cancelled = false;
    let local: Record<number, Record<string, string>> = {};
    readLocalNotesAll()
      .then((all) => {
        if (cancelled) return;
        local = all;
        setNotes(
          Object.entries(all)
            .flatMap(([b, book]) => rowsOfBook(Number(b), book))
            .sort(byRef)
        );
      })
      .then(() => readOutbox())
      .then(async (queued) => {
        const ahead = new Set(
          (queued ?? [])
            .filter((op) => op.kind === "note.set")
            .map((op) => (op as { book: number }).book)
        );
        const res = await api<{ notes: NoteRow[] }>("/api/notes");
        if (cancelled) return;
        const merged = res.notes.filter((row) => !ahead.has(row.b));
        for (const b of ahead) {
          if (local[b]) merged.push(...rowsOfBook(b, local[b]));
        }
        setNotes(merged.sort(byRef));

        // Now that the whole set has been seen once, hand it to the store the
        // reader uses, book by book. Two things follow: the journal reads
        // completely offline afterwards rather than only for books that
        // happen to have been opened, and the reader opens on a note it has
        // never fetched. Books with an unsent change are left alone — there
        // the device is ahead, and this would put the old text back.
        const byBook: Record<number, Record<string, string>> = {};
        for (const row of res.notes) {
          (byBook[row.b] ??= {})[`${row.c}:${row.v}`] = row.text;
        }
        const touched = new Set([
          ...Object.keys(byBook).map(Number),
          ...Object.keys(local).map(Number),
        ]);
        for (const b of touched) {
          // an empty record is meaningful: it says this book's notes are gone
          if (!ahead.has(b)) void writeLocalNotes(b, byBook[b] ?? {});
        }
      })
      .catch(() => {
        // offline or signed out — whatever the device holds stands
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- shaping ------------------------------------------------------------

  /** Notes grouped under their book, in canonical order. */
  const noteBooks = useMemo(() => {
    const groups: { b: number; rows: NoteRow[] }[] = [];
    for (const row of notes) {
      const last = groups.at(-1);
      if (last && last.b === row.b) last.rows.push(row);
      else groups.push({ b: row.b, rows: [row] });
    }
    return groups;
  }, [notes]);

  /** Bookmarks grouped under their collection, unfiled ones last. */
  const bookmarkGroups = useMemo(() => {
    const rows = Object.entries(bookmarks)
      .map(([key, entry]) => {
        const [b, c, v] = key.split(":").map(Number);
        return { key, b, c, v, entry };
      })
      .filter((row) => row.b && row.c && row.v)
      .sort(byRef);
    const named = Object.entries(collections)
      .map(([id, coll]) => ({ id, name: coll.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const groups = named.map((coll) => ({
      id: coll.id,
      name: coll.name,
      rows: rows.filter((row) => row.entry.c === coll.id),
    }));
    const filed = new Set(named.map((coll) => coll.id));
    const loose = rows.filter((row) => !row.entry.c || !filed.has(row.entry.c));
    if (loose.length > 0) {
      groups.push({ id: "", name: t("journal.unfiled"), rows: loose });
    }
    return groups.filter((group) => group.rows.length > 0);
  }, [bookmarks, collections, t]);

  const planRows = useMemo(() => {
    const rows = PLANS.map((plan) => ({
      plan,
      done: plans[plan.id] ?? 0,
      total: plan.days.length,
    })).filter((row) => row.done > 0);
    return {
      going: rows.filter((row) => row.done < row.total),
      finished: rows.filter((row) => row.done >= row.total),
    };
  }, [plans]);

  const counts: Record<Tab, number> = {
    notes: notes.length,
    bookmarks: Object.keys(bookmarks).length,
    plans: planRows.going.length + planRows.finished.length,
  };

  const TABS: { id: Tab; icon: IconName; key: MessageKey }[] = [
    { id: "notes", icon: "note", key: "journal.notes" },
    { id: "bookmarks", icon: "bookmark", key: "journal.bookmarks" },
    { id: "plans", icon: "scroll", key: "journal.plans" },
  ];

  return (
    <div>
      <BackToMenu />
      <h1 className="page-title">{t("journal.title")}</h1>
      <p className="subtitle">{t("journal.subtitle")}</p>

      <div className="jr-tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`chip jr-tab${tab === entry.id ? " chip-active" : ""}`}
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            <Icon name={entry.icon} />
            {t(entry.key)}
            <span className="jr-count">{counts[entry.id]}</span>
          </button>
        ))}
      </div>

      {tab === "notes" &&
        (noteBooks.length === 0 ? (
          <Empty message={t("journal.noNotes")} href="/" cta={t("journal.openWord")} />
        ) : (
          noteBooks.map((group) => (
            <section key={group.b} className="jr-group">
              <h2 className="jr-group-head">
                {bookName(group.b, lang)}
                <span className="jr-group-count">{group.rows.length}</span>
              </h2>
              <div className="jr-list">
                {group.rows.map((row) => (
                  <Link
                    key={`${row.c}:${row.v}`}
                    href={`/?b=${row.b}&c=${row.c}&v=${row.v}`}
                    className="glass card jr-row"
                  >
                    <span className="jr-ref">{refLabel(row, lang)}</span>
                    <p className="jr-note">{row.text}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))
        ))}

      {tab === "bookmarks" &&
        (bookmarkGroups.length === 0 ? (
          <Empty
            message={t("journal.noBookmarks")}
            href="/"
            cta={t("journal.openWord")}
          />
        ) : (
          bookmarkGroups.map((group) => (
            <section key={group.id || "unfiled"} className="jr-group">
              <h2 className="jr-group-head">
                <Icon name={group.id ? "collection" : "bookmark"} />
                {group.name}
                <span className="jr-group-count">{group.rows.length}</span>
              </h2>
              <div className="jr-list jr-list-tight">
                {group.rows.map((row) => (
                  <Link
                    key={row.key}
                    href={`/?b=${row.b}&c=${row.c}&v=${row.v}`}
                    className="glass card jr-row"
                  >
                    <span className="jr-ref">{refLabel(row, lang)}</span>
                    {row.entry.l && <p className="jr-note">{row.entry.l}</p>}
                  </Link>
                ))}
              </div>
            </section>
          ))
        ))}

      {tab === "plans" &&
        (counts.plans === 0 ? (
          <Empty
            message={t("journal.noPlans")}
            href="/discover"
            cta={t("journal.browsePlans")}
          />
        ) : (
          <>
            {planRows.going.length > 0 && (
              <section className="jr-group">
                <h2 className="jr-group-head">
                  {t("journal.underway")}
                  <span className="jr-group-count">{planRows.going.length}</span>
                </h2>
                <div className="jr-list">
                  {planRows.going.map((row) => (
                    <PlanRow key={row.plan.id} {...row} />
                  ))}
                </div>
              </section>
            )}
            {planRows.finished.length > 0 && (
              <section className="jr-group">
                <h2 className="jr-group-head">
                  {t("journal.finished")}
                  <span className="jr-group-count">
                    {planRows.finished.length}
                  </span>
                </h2>
                <div className="jr-list">
                  {planRows.finished.map((row) => (
                    <PlanRow key={row.plan.id} {...row} />
                  ))}
                </div>
              </section>
            )}
            <Link href="/discover" className="passage-link jr-more">
              {t("journal.browsePlans")} →
            </Link>
          </>
        ))}
    </div>
  );
}

function PlanRow({
  plan,
  done,
  total,
}: {
  plan: (typeof PLANS)[number];
  done: number;
  total: number;
}) {
  const { lang, t } = useI18n();
  const pct = Math.round((done / total) * 100);
  const next = done < total ? plan.days[done] : null;
  // where the plan puts you next — its first reading is where the link lands
  const target = next?.readings[0];
  const body = (
    <>
      <div className="jr-plan-head">
        <span className="jr-ref">
          <Icon name={plan.icon} /> {t(`plan.${plan.id}` as MessageKey)}
        </span>
        <span className="plan-count">
          {done}/{total}
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="jr-plan-meta">
        {next && target
          ? `${t("journal.next", { n: String(done + 1) })} · ${bookName(
              target.b,
              lang
            )} ${target.c}`
          : t("discover.planDone")}
      </p>
    </>
  );
  return target ? (
    <Link
      href={`/?b=${target.b}&c=${target.c}`}
      className="glass card jr-row jr-plan"
    >
      {body}
    </Link>
  ) : (
    <div className="glass card jr-row jr-plan">{body}</div>
  );
}

function Empty({
  message,
  href,
  cta,
}: {
  message: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="glass card jr-empty">
      <p>{message}</p>
      <Link href={href} className="btn btn-primary btn-sm">
        {cta}
      </Link>
    </div>
  );
}
