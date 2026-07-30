"use client";

// The Journal tab. Everything this account has made in Communion, gathered
// into one place and sorted into its own kind: the verses you have kept, the
// ones you have written on, and the plans you are walking through.
//
// Nothing here is a new source of truth. Notes, bookmarks, collections and
// plan progress all already live on the device in IndexedDB and on the server
// behind /api; this screen reads both, paints the local copy first so it is
// there with no signal, and lets the server's answer correct it when there is
// one. Every row is a door back into the reader.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import BackToMenu from "@/components/BackToMenu";
import HangOnWall from "@/components/HangOnWall";
import { api } from "@/lib/client";
import { DEFAULT_TRANSLATION, getBook } from "@/lib/bible";
import {
  bmRefLabel,
  bmVerses,
  parseBmKey,
  type BmRef,
} from "@/lib/bookmarkKey";
import { useI18n, type Lang, type MessageKey } from "@/lib/i18n";
import { useStickyTab } from "@/lib/stickyTab";
import { PLANS } from "@/lib/plans";
import type { PlanHour } from "@/lib/planReminders";
import type { CustomPlanRow } from "@/lib/customPlanTypes";
import { readOutbox } from "@/lib/localStore";
import { fetchVerses, verseKey } from "@/lib/scripture";
import {
  adoptIdentity,
  enqueue,
  flush,
  readLocalNotes,
  readLocalNotesAll,
  readLocalState,
  startSync,
  writeLocalNotes,
  writeLocalState,
  type BmCollection,
  type BmEntry,
} from "@/lib/sync";

type Tab = "bookmarks" | "notes" | "plans";
/** The toggles, in the order the row shows them. */
const JOURNAL_TABS: readonly Tab[] = ["bookmarks", "notes", "plans"];

interface NoteRow {
  b: number;
  c: number;
  v: number;
  text: string;
}

interface DragState {
  /** the collection being rearranged */
  group: string;
  /** the bookmark under the finger */
  key: string;
  /** that collection's keys in the order they are shown right now */
  keys: string[];
}

const bookName = (nr: number, lang: Lang) => {
  const book = getBook(nr);
  return book ? (lang === "es" ? book.es : book.en) : "";
};

const refLabel = (
  row: { b: number; c: number; v: number; end?: number },
  lang: Lang
) =>
  bmRefLabel(bookName(row.b, lang), {
    b: row.b,
    c: row.c,
    v: row.v,
    end: row.end ?? row.v,
  });

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

/**
 * What the collection picker means by "somewhere new".
 *
 * A sentinel rather than an empty value, because empty already means Unsorted
 * and the two are opposite intentions.
 */
const NEW_COLL = "__new";

/** where the shut shelves are remembered between visits */
const CLOSED_KEY = "communion.journalClosed";

export default function Journal() {
  const { lang, t } = useI18n();
  // Bookmarks first, and so the screen opens on them: keeping a verse is
  // the commonest thing anyone does here, and the tab that leads is also
  // the one that opens.
  const [tab, setTab] = useStickyTab<Tab>("journal", "bookmarks", JOURNAL_TABS);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [bookmarks, setBookmarks] = useState<Record<string, BmEntry>>({});
  const [collections, setCollections] = useState<Record<string, BmCollection>>(
    {}
  );
  const [plans, setPlans] = useState<Record<string, number>>({});
  /** what hour each plan asks at — null until the server has answered */
  const [planHours, setPlanHours] = useState<Record<string, PlanHour> | null>(
    null
  );
  /** the plans this reader wrote for themselves */
  const [custom, setCustom] = useState<CustomPlanRow[] | null>(null);
  /** scripture for the verses kept, keyed by verseKey() */
  const [verses, setVerses] = useState<Record<string, string>>({});
  /** which row's share just landed on the clipboard */
  const [copied, setCopied] = useState<string | null>(null);
  /** which entry is choosing a recipient, by the same id the row uses */
  const [sendFor, setSendFor] = useState<string | null>(null);
  /** why a collection could not be readied for sending, if it could not */
  const [sendGroupError, setSendGroupError] = useState("");
  /** the one row open for editing, if any */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /** the collection a bookmark is being moved to, while it is being edited */
  const [draftColl, setDraftColl] = useState("");
  /** and the name of one that has still to be made, if that is what was picked */
  const [newColl, setNewColl] = useState("");
  /** the row under the finger, and the order the collection is now in */
  const [drag, setDrag] = useState<DragState | null>(null);
  /** shelves the reader has shut, by collection id ("unfiled" for the rest) */
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());

  /*
   * Which shelves were left shut.
   *
   * Kept on the device rather than in the account: it is a view of the journal
   * rather than part of it, and somebody who shuts a long collection on their
   * phone has said nothing about how they want to see it on a laptop. Read
   * once here, written on every toggle.
   */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLOSED_KEY);
      if (raw) setClosedGroups(new Set(JSON.parse(raw) as string[]));
    } catch {
      // unreadable, or written by an older shape: every shelf starts open
    }
  }, []);

  const toggleGroup = (id: string) => {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
      } catch {
        // private browsing, or a full quota — it stays shut for this visit
      }
      return next;
    });
  };

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

  // ---- scripture for the verses kept --------------------------------------
  // A reference on its own is a lookup; the verse is the thing you kept. It is
  // what a bookmark row shows, and what a share of either kind carries. Only
  // fetched for the tab actually open, and in one call — fetchVerses groups by
  // book, so a shelf spread across the Bible costs one request per book rather
  // than one per verse.
  useEffect(() => {
    const wanted =
      tab === "bookmarks"
        ? // a run needs every verse in it, not just the one it starts on
          Object.keys(bookmarks)
            .map(parseBmKey)
            .filter((r): r is BmRef => r !== null)
            .flatMap((r) =>
              bmVerses(r).map((v) => ({
                bookNr: r.b,
                chapter: r.c,
                verse: v,
              }))
            )
        : tab === "notes"
          ? notes.map((n) => ({ bookNr: n.b, chapter: n.c, verse: n.v }))
          : [];
    const refs = wanted.filter(
      (r) => verses[verseKey(r.bookNr, r.chapter, r.verse)] === undefined
    );
    if (refs.length === 0) return;
    let cancelled = false;
    // whichever translation the reader was last left in
    let translation = DEFAULT_TRANSLATION;
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("communion.reading") ?? "null"
      ) as { translation?: string } | null;
      if (saved?.translation) translation = saved.translation;
    } catch {
      // nothing saved, or corrupted — the default stands
    }
    void fetchVerses(translation, refs).then((batch) => {
      if (cancelled || batch.verses.size === 0) return;
      setVerses((prev) => {
        const next = { ...prev };
        for (const [key, text] of batch.verses) next[key] = text;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // `verses` is written here and only read to skip what is already in hand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, bookmarks, notes]);

  /**
   * Hand a passage to whatever the device shares with. The native sheet where
   * there is one, the clipboard where there is not.
   *
   * This is the only way out of the journal to anywhere outside the app. There
   * used to be a second button beside it that opened the message composer
   * directly, on the reasoning that somebody texting a verse to their mother
   * should not have to find Messages behind a grid of apps — but Messages is
   * the first thing in that sheet on every phone this runs on, so the two
   * buttons did the same thing one tap apart.
   */
  const share = async (id: string, text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // cancelled, or refused — fall through and copy instead
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2200);
    } catch {
      // no clipboard either; nothing useful left to do quietly
    }
  };

  // ---- editing ------------------------------------------------------------
  // The same writes the reader makes, in the same order: the device's copy
  // first so the screen never waits, then the outbox. Nothing here talks to
  // the server directly, so every one of these works with no signal.

  const openEdit = (id: string, text: string, coll = "") => {
    setEditing(id);
    setDraft(text);
    setDraftColl(coll);
    setNewColl("");
  };

  const closeEdit = () => {
    setEditing(null);
    setDraft("");
    setDraftColl("");
    setNewColl("");
  };

  /**
   * Name a collection and hand back its id.
   *
   * The id is minted here rather than asked for, the same as in the reader:
   * everything else on this screen writes to the device first and the server
   * afterwards, and a shelf you cannot start without a signal would be the
   * one thing here that needs one.
   */
  const createCollectionNamed = (name: string): string | null => {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) return null;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const next = { ...collections, [id]: { name: trimmed } };
    setCollections(next);
    void writeLocalState({ collections: next });
    void enqueue({ kind: "collection.set", id, name: trimmed, ts: Date.now() });
    return id;
  };

  /** Rewrite a note, or delete it — an empty one is a deleted one. */
  const saveNote = (row: NoteRow, text: string) => {
    const trimmed = text.trim();
    setNotes((prev) => {
      const rest = prev.filter(
        (n) => !(n.b === row.b && n.c === row.c && n.v === row.v)
      );
      return trimmed ? [...rest, { ...row, text: trimmed }].sort(byRef) : rest;
    });
    const ref = `${row.c}:${row.v}`;
    // the reader keeps one record per book; read-modify-write that book alone
    void readLocalNotes(row.b).then((book) => {
      const next = { ...(book ?? {}) };
      if (trimmed) next[ref] = trimmed;
      else delete next[ref];
      return writeLocalNotes(row.b, next);
    });
    void enqueue({
      kind: "note.set",
      book: row.b,
      ref,
      text: trimmed,
      ts: Date.now(),
    });
    closeEdit();
  };

  /**
   * Rename a kept verse, or move it to another collection — including one that
   * does not exist yet, which is made on the way past.
   */
  const saveBookmark = (key: string, label: string, coll: string) => {
    const filed = coll === NEW_COLL ? (createCollectionNamed(newColl) ?? "") : coll;
    const entry: BmEntry = { ...bookmarks[key] };
    if (label.trim()) entry.l = label.trim().slice(0, 80);
    else delete entry.l;
    if (filed) entry.c = filed;
    else delete entry.c;
    const next = { ...bookmarks, [key]: entry };
    setBookmarks(next);
    void writeLocalState({ bookmarks: next });
    void enqueue({
      kind: "bookmark.set",
      key,
      t: entry.t,
      l: entry.l,
      c: entry.c,
      o: entry.o,
      ts: Date.now(),
    });
    closeEdit();
  };

  /**
   * Put a collection in the order it is now shown in.
   *
   * Every row is numbered from the top rather than only the ones that moved.
   * A collection is small — two hundred bookmarks is the ceiling for the whole
   * account — and numbering all of them means the order on the server is the
   * order on the screen, with no gaps to run out of and no arithmetic to get
   * wrong on the next drag. Rows already sitting at their number are skipped,
   * so a drag near the top of a long shelf still sends only a few.
   */
  const commitOrder = (keys: string[]) => {
    const next = { ...bookmarks };
    let changed = false;
    keys.forEach((key, at) => {
      const entry = next[key];
      if (!entry || entry.o === at) return;
      next[key] = { ...entry, o: at };
      changed = true;
      void enqueue({
        kind: "bookmark.set",
        key,
        t: entry.t,
        l: entry.l,
        c: entry.c,
        o: at,
        ts: Date.now(),
      });
    });
    if (!changed) return;
    setBookmarks(next);
    void writeLocalState({ bookmarks: next });
  };

  /** Move one row within its collection, by drag or by arrow key. */
  const moveWithin = (keys: string[], from: number, to: number) => {
    if (from === to || to < 0 || to >= keys.length) return;
    const next = [...keys];
    next.splice(to, 0, ...next.splice(from, 1));
    commitOrder(next);
  };

  // ---- dragging -----------------------------------------------------------
  // Pointer events rather than the drag-and-drop API, which Safari on iOS does
  // not implement — and this is a reader people hold. The row order is
  // rearranged live under the finger and written once, on release.

  const dragRef = useRef<DragState | null>(null);
  const pointerY = useRef(0);
  const listEls = useRef<Record<string, HTMLDivElement | null>>({});
  const autoScroll = useRef(0);
  /** drops the window listeners a drag in flight is holding */
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // leaving the journal mid-drag must not leave listeners or a frame loop
  useEffect(
    () => () => {
      cancelAnimationFrame(autoScroll.current);
      release.current?.();
    },
    []
  );

  /** Where the finger is now, in the list it is over. */
  const reorderTo = (y: number) => {
    const held = dragRef.current;
    const list = held && listEls.current[held.group];
    if (!held || !list) return;
    const rows = [...list.querySelectorAll<HTMLElement>("[data-bm]")];
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const box = rows[i].getBoundingClientRect();
      if (y < box.top + box.height / 2) {
        to = i;
        break;
      }
    }
    const from = held.keys.indexOf(held.key);
    if (from === -1 || from === to) return;
    const keys = [...held.keys];
    keys.splice(to, 0, ...keys.splice(from, 1));
    dragRef.current = { ...held, keys };
    setDrag(dragRef.current);
  };

  const startDrag = (
    group: string,
    key: string,
    keys: string[],
    e: React.PointerEvent<HTMLElement>
  ) => {
    e.preventDefault();
    pointerY.current = e.clientY;
    dragRef.current = { group, key, keys };
    setDrag(dragRef.current);

    // Window listeners rather than setPointerCapture on the handle. Capture is
    // the obvious way to do this and it does not survive: rearranging the list
    // moves the handle's own element in the DOM, and Chromium drops the
    // capture the first time it happens — the pointerup then lands somewhere
    // else and the drag never ends. The window is not going anywhere.
    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      pointerY.current = ev.clientY;
      reorderTo(ev.clientY);
    };
    const onUp = () => {
      release.current?.();
      endDrag();
    };
    release.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      release.current = null;
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // A frame loop rather than work inside pointermove: near the top or bottom
    // of the screen the list has to keep scrolling while the finger holds
    // still, and a finger holding still sends no events.
    const step = () => {
      if (!dragRef.current) return;
      const edge = 90;
      const y = pointerY.current;
      if (y < edge) window.scrollBy(0, -12);
      else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
      reorderTo(y);
      autoScroll.current = requestAnimationFrame(step);
    };
    autoScroll.current = requestAnimationFrame(step);
  };

  const endDrag = () => {
    cancelAnimationFrame(autoScroll.current);
    const held = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (held) commitOrder(held.keys);
  };

  /** A collection's rows in the order to draw them, drag included. */
  const orderedRows = <T extends { key: string }>(group: {
    id: string;
    rows: T[];
  }): T[] => {
    if (drag?.group !== group.id) return group.rows;
    const byKey = new Map(group.rows.map((r) => [r.key, r]));
    const moved = drag.keys
      .map((k) => byKey.get(k))
      .filter((r): r is T => r !== undefined);
    // a row that arrived mid-drag has no place in the dragged order yet
    return moved.length === group.rows.length ? moved : group.rows;
  };

  const removeBookmark = (key: string, ref: string) => {
    if (!window.confirm(t("reader.removeBookmarkConfirm", { ref }))) return;
    const next = { ...bookmarks };
    delete next[key];
    setBookmarks(next);
    void writeLocalState({ bookmarks: next });
    void enqueue({ kind: "bookmark.del", key, ts: Date.now() });
    closeEdit();
  };

  const renameCollection = (id: string, name: string) => {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) return;
    const next = {
      ...collections,
      [id]: { ...collections[id], name: trimmed },
    };
    setCollections(next);
    void writeLocalState({ collections: next });
    void enqueue({ kind: "collection.set", id, name: trimmed, ts: Date.now() });
    closeEdit();
  };

  /** The collection goes; the verses in it stay, unsorted — as in the reader. */
  const deleteCollection = (id: string) => {
    if (!window.confirm(t("reader.deleteCollectionConfirm"))) return;
    const nextColls = { ...collections };
    delete nextColls[id];
    const nextMarks: Record<string, BmEntry> = {};
    for (const [key, entry] of Object.entries(bookmarks)) {
      nextMarks[key] = entry.c === id ? { ...entry, c: undefined } : entry;
    }
    setCollections(nextColls);
    setBookmarks(nextMarks);
    void writeLocalState({ bookmarks: nextMarks, collections: nextColls });
    void enqueue({ kind: "collection.del", id, ts: Date.now() });
    closeEdit();
  };

  /**
   * Leave a plan.
   *
   * Not a reset. A plan reset to nought is still yours and still asks every
   * morning — which is right for somebody starting over and exactly wrong for
   * somebody who does not want it, and since every account is enrolled in one
   * without being asked, wanting out is a thing the app has to be able to
   * hear. Local first, like everything else here: gone from the screen at
   * once, and off the server when the outbox next drains.
   */
  const leavePlan = (planId: string, name: string) => {
    if (!window.confirm(t("journal.leaveConfirm", { name }))) return;
    const next = { ...plans };
    delete next[planId];
    setPlans(next);
    void writeLocalState({ plans: next });
    void enqueue({ kind: "plan.del", id: planId, ts: Date.now() });
  };

  /** Back to day one, still enrolled, still asking. */
  const restartPlan = (planId: string) => {
    const next = { ...plans, [planId]: 0 };
    setPlans(next);
    void writeLocalState({ plans: next });
    void enqueue({ kind: "plan.set", id: planId, done: 0, ts: Date.now() });
  };

  /** Today where this device is standing — the honest date for an offline read. */
  const localDate = () => {
    try {
      return new Intl.DateTimeFormat("en-CA").format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };

  /**
   * Today's reading, done.
   *
   * The same act as the button on the home screen, and written the same way:
   * it states the total rather than asking for one more, so an outbox the
   * server takes twice cannot advance anybody twice. The date goes with it,
   * which is what stops this evening's reminder arriving for a chapter read
   * this morning.
   */
  const markToday = (planId: string, total: number) => {
    const done = Math.min((plans[planId] ?? 0) + 1, total);
    const next = { ...plans, [planId]: done };
    setPlans(next);
    void writeLocalState({ plans: next });
    void enqueue({
      kind: "plan.set",
      id: planId,
      done,
      on: localDate(),
      ts: Date.now(),
    });
  };

  const SIGNATURE = "— Communion  https://communion-mu.vercel.app";
  /** With a link of its own in the message, the signature need not repeat one. */
  const SIGNED = "— Communion";

  /**
   * A link that offers whoever receives it the same verse you kept, and the
   * choice to keep it too. The address is the whole payload — nothing is
   * published to say "Psalm 23:1" — so building it costs no round trip, and
   * the share sheet opens on the same tap that asked for it.
   */
  const verseLink = (
    row: { b: number; c: number; v: number },
    label?: string
  ) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const query = new URLSearchParams({
      b: String(row.b),
      c: String(row.c),
      v: String(row.v),
    });
    if (label) query.set("l", label);
    return `${origin}/shared/verse?${query}`;
  };

  /** What a bookmark holds, read as one passage however many verses it spans. */
  const scriptureOf = (row: { b: number; c: number; v: number; end?: number }) => {
    const out: string[] = [];
    for (let v = row.v; v <= (row.end ?? row.v); v++) {
      const line = verses[verseKey(row.b, row.c, v)];
      if (line) out.push(line.trim());
    }
    return out.join(" ");
  };

  /** One entry: the reference, the verse, and whatever you wrote on it. */
  const entryText = (
    row: { b: number; c: number; v: number; end?: number },
    said?: string,
    link?: string
  ) => {
    const scripture = scriptureOf(row);
    return [
      `${refLabel(row, lang)}${scripture ? ` — ${scripture}` : ""}`,
      said ? `\n${said}` : "",
      link ? `\n\n${link}` : "",
      `\n${link ? SIGNED : SIGNATURE}`,
    ]
      .filter(Boolean)
      .join("");
  };

  /**
   * Publish a shelf and remember the address it was given.
   *
   * A collection is too much to spell out in a link, so it goes as a snapshot
   * with a token pointing at it. The token is stable — the server hands back
   * the same one every time — so a shelf shared twice is shared to the same
   * page rather than to two copies of itself, and every later send skips the
   * round trip.
   */
  const publishCollection = async (id: string): Promise<string> => {
    const known = collections[id]?.share;
    if (known) return known;
    const res = await api<{ url: string }>(`/api/collections/${id}/share`, {
      method: "POST",
    });
    const token = res.url.split("/").pop() ?? "";
    const next = { ...collections, [id]: { ...collections[id], share: token } };
    setCollections(next);
    void writeLocalState({ collections: next });
    return token;
  };

  /**
   * Share a whole shelf with whatever the device shares with.
   *
   * Unfiled is not a collection and has nothing to publish; it goes as text.
   */
  const shareGroup = async (
    group: { id: string; name: string },
    body: string
  ) => {
    const id = `g-${group.id}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (!group.id) return share(id, `${body}\n${SIGNATURE}`);
    try {
      const token = await publishCollection(group.id);
      return share(id, `${body}\n\n${origin}/shared/${token}\n${SIGNED}`);
    } catch {
      // offline, or signed out: the verses themselves still send
      return share(id, `${body}\n${SIGNATURE}`);
    }
  };

  /**
   * Hand a whole shelf to somebody at the Table.
   *
   * The panel cannot open until the collection has an address, since that
   * address is the whole of what gets sent — so the tap that asks for it is
   * also the tap that publishes it, and the panel waits on the answer. It is
   * one round trip, once per collection, and never again for that shelf.
   */
  const openGroupSend = async (id: string) => {
    const key = `g-send-${id}`;
    if (sendFor === key) {
      setSendFor(null);
      return;
    }
    setSendFor(key);
    setSendGroupError("");
    if (collections[id]?.share) return;
    try {
      await publishCollection(id);
    } catch {
      setSendGroupError(t("journal.sendGroupUnavailable"));
    }
  };

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

  /**
   * Bookmarks grouped under their collection, unfiled ones last.
   *
   * Within a collection, the order you put them in wins. A collection nobody
   * has dragged has no orders at all and falls back to canonical order, which
   * is also what a verse dropped into a hand-sorted collection does until it
   * is placed — it sorts to the end rather than jumping into the middle.
   */
  const bookmarkGroups = useMemo(() => {
    const rows = Object.entries(bookmarks)
      .map(([key, entry]) => {
        const ref = parseBmKey(key);
        return ref ? { key, ...ref, entry } : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort(
        (a, b) =>
          (a.entry.o ?? Infinity) - (b.entry.o ?? Infinity) || byRef(a, b)
      );
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
    // Having the plan is what makes it yours, not having read a day of it.
    // Every account is enrolled in one the day it is made, and it sits at
    // nought until the first morning — a test on the count alone would hide
    // exactly the plan this screen most needs to show.
    const rows = PLANS.map((plan) => ({
      plan,
      // The catalogue's plans are named in both dictionaries; a plan the
      // reader wrote is named by them, and t() would hand back the key.
      name: null as string | null,
      done: plans[plan.id] ?? 0,
      total: plan.days.length,
    })).filter((row) => row.plan.id in plans);

    // and the reader's own, in the same shape, so one row draws both
    for (const own of custom ?? []) {
      if (!(own.id in plans)) continue;
      rows.push({
        plan: {
          id: own.id,
          icon: "plan" as IconName,
          category: "foundations" as const,
          name: own.name,
          days: own.days.map((day) => ({
            readings: day.map(([b, c]) => ({ b, c })),
          })),
        },
        name: own.name,
        // Clamped, because a plan can be edited shorter than the reader has
        // already walked: eleven days into a plan cut back to two is "11/2"
        // and a progress bar drawn at 550% of its track.
        done: Math.min(plans[own.id] ?? 0, own.days.length),
        total: own.days.length,
      });
    }
    return {
      going: rows.filter((row) => row.done < row.total),
      finished: rows.filter((row) => row.done >= row.total),
    };
  }, [plans, custom]);

  const counts: Record<Tab, number> = {
    bookmarks: Object.keys(bookmarks).length,
    notes: notes.length,
    plans: planRows.going.length + planRows.finished.length,
  };

  // Asked for once the plans tab is first opened. Most visits to the Journal
  // are for a bookmark, and nobody needs an extra request to find out when a
  // plan they are not looking at asks for them.
  useEffect(() => {
    if (tab !== "plans" || planHours !== null) return;
    api<{ hours: Record<string, PlanHour> }>("/api/plans/reminders")
      .then((res) => setPlanHours(res.hours))
      .catch(() => setPlanHours({}));
  }, [tab, planHours]);

  /*
   * The reader's own plans.
   *
   * On mount rather than when the Plans tab is opened, unlike the hours: the
   * count in the toggle is drawn before anybody presses it, and gating this
   * on the tab meant a reader with three plans of their own saw "Plans 1"
   * until they went and looked.
   */
  useEffect(() => {
    api<{ plans: CustomPlanRow[] }>("/api/plans/custom")
      .then((res) => setCustom(res.plans))
      .catch(() => setCustom([]));
  }, []);

  /**
   * Move one plan's reminder.
   *
   * Written straight to the server rather than through the outbox: this is
   * the one thing in the Journal that only means anything to the nightly
   * sweep, and a reminder queued on a device with no signal would be a
   * setting that looks changed and does nothing. It shows as changed the
   * moment it is picked, and puts itself back if the write fails.
   */
  const setPlanHour = async (planId: string, hour: PlanHour) => {
    const before = planHours?.[planId];
    setPlanHours((prev) => ({ ...(prev ?? {}), [planId]: hour }));
    try {
      await api("/api/plans/reminders", {
        method: "POST",
        body: {
          planId,
          hour,
          // the sweep runs hourly and matches this against the reader's clock
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
      });
    } catch {
      setPlanHours((prev) => {
        const next = { ...(prev ?? {}) };
        if (before === undefined) delete next[planId];
        else next[planId] = before;
        return next;
      });
    }
  };

  const TABS: { id: Tab; icon: IconName; key: MessageKey }[] = [
    { id: "bookmarks", icon: "bookmark", key: "journal.bookmarks" },
    { id: "notes", icon: "note", key: "journal.notes" },
    { id: "plans", icon: "plan", key: "journal.plans" },
  ];

  return (
    <div>
      <BackToMenu />
      <h1 className="page-title">{t("journal.title")}</h1>
      <p className="subtitle">{t("journal.subtitle")}</p>

      {/* The same control the Table uses, and the same classes: three chips
          that wrapped onto two rows are three segments of one switch now, and
          the two screens are read the same way. The count rides inside its
          own segment rather than beside it. */}
      <div className="lang-toggle discover-tabs jr-tabs" role="group">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={tab === entry.id ? "active" : ""}
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            <Icon name={entry.icon} />
            <span className="jr-tab-label">
              {t(entry.key)}
              <span className="jr-count">{counts[entry.id]}</span>
            </span>
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
                {group.rows.map((row) => {
                  const id = `n-${row.b}-${row.c}-${row.v}`;
                  if (editing === id) {
                    return (
                      <div key={id} className="glass card jr-row jr-editing">
                        <div className="jr-go">
                          <span className="jr-ref">{refLabel(row, lang)}</span>
                          <textarea
                            className="jr-edit-text"
                            value={draft}
                            autoFocus
                            rows={4}
                            maxLength={1000}
                            placeholder={t("reader.notePlaceholder")}
                            onChange={(e) => setDraft(e.target.value)}
                          />
                          <div className="jr-edit-actions">
                            <button
                              type="button"
                              className="rsvp-btn"
                              onClick={closeEdit}
                            >
                              {t("session.cancel")}
                            </button>
                            <button
                              type="button"
                              className="rsvp-btn jr-danger"
                              onClick={() => saveNote(row, "")}
                            >
                              {t("threads.delete")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => saveNote(row, draft)}
                            >
                              {t("common.save")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={id} className="glass card jr-row">
                      {/* the link cannot wrap the buttons: one interactive
                          element inside another is invalid, and a tap on a
                          button would follow the link too */}
                      <Link
                        href={`/?b=${row.b}&c=${row.c}&v=${row.v}`}
                        className="jr-go"
                      >
                        <span className="jr-ref">{refLabel(row, lang)}</span>
                        <p className="jr-note">{row.text}</p>
                      </Link>
                      <span className="jr-actions">
                        <EditButton
                          label={t("journal.edit")}
                          onClick={() => openEdit(id, row.text)}
                        />
                        <ShareButton
                          copied={copied === id}
                          label={t("discover.share")}
                          done={t("reader.copied")}
                          onClick={() =>
                            // the note is your own writing and travels as
                            // text; the verse it sits on is what the reader
                            // on the other end can keep
                            share(id, entryText(row, row.text, verseLink(row)))
                          }
                        />
                        <SendButton
                          label={t("journal.sendToTable")}
                          onClick={() =>
                            setSendFor((cur) => (cur === id ? null : id))
                          }
                        />
                      </span>
                      {sendFor === id && (
                        <SendPanel
                          attach={{ b: row.b, c: row.c, v: row.v, kind: "note", label: row.text }}
                          refText={refLabel(row, lang)}
                          onClose={() => setSendFor(null)}
                        />
                      )}
                    </div>
                  );
                })}
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
          bookmarkGroups.map((group) => {
            // the address this shelf was published at, if it has been
            const shelfToken = group.id ? collections[group.id]?.share : "";
            return (
            <section key={group.id || "unfiled"} className="jr-group">
              <h2 className="jr-group-head">
                {editing === `g-edit-${group.id}` ? (
                  <Icon name={group.id ? "collection" : "bookmark"} />
                ) : (
                  /* The whole name is the handle, not a chevron off to one
                     side: a shelf of forty verses is a thing you want shut
                     without aiming, and the count stays visible so a closed
                     one still says how much is inside it. */
                  <button
                    type="button"
                    className="jr-group-toggle"
                    aria-expanded={!closedGroups.has(group.id || "unfiled")}
                    onClick={() => toggleGroup(group.id || "unfiled")}
                  >
                    <span className="jr-group-caret" aria-hidden>
                      {closedGroups.has(group.id || "unfiled") ? "›" : "⌄"}
                    </span>
                    <Icon name={group.id ? "collection" : "bookmark"} />
                    {group.name}
                    <span className="jr-group-count">{group.rows.length}</span>
                  </button>
                )}
                {editing === `g-edit-${group.id}` ? (
                  <span className="jr-rename">
                    <input
                      className="jr-edit-field"
                      value={draft}
                      autoFocus
                      maxLength={80}
                      aria-label={t("journal.rename")}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      className="rsvp-btn"
                      onClick={closeEdit}
                    >
                      {t("session.cancel")}
                    </button>
                    <button
                      type="button"
                      className="rsvp-btn jr-danger"
                      onClick={() => deleteCollection(group.id)}
                    >
                      {t("reader.deleteCollection")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => renameCollection(group.id, draft)}
                    >
                      {t("common.save")}
                    </button>
                  </span>
                ) : (
                  /* only a real collection can be renamed — Unfiled is
                     where a verse sits when it belongs to none */
                  group.id && (
                    <EditButton
                      label={t("journal.rename")}
                      onClick={() =>
                        openEdit(`g-edit-${group.id}`, group.name)
                      }
                    />
                  )
                )}
                <ShareButton
                  copied={copied === `g-${group.id}`}
                  label={t("journal.shareGroup", { name: group.name })}
                  done={t("reader.copied")}
                  onClick={() =>
                    shareGroup(
                      group,
                      [
                        group.name,
                        "",
                        ...group.rows.map((r) => {
                          const text = scriptureOf(r);
                          return `${refLabel(r, lang)}${text ? ` — ${text}` : ""}`;
                        }),
                      ].join("\n")
                    )
                  }
                />
                {/* Unfiled has no shelf to send — it is the absence of one */}
                {group.id && (
                  <SendButton
                    label={t("journal.sendGroupToTable", { name: group.name })}
                    onClick={() => void openGroupSend(group.id)}
                  />
                )}
              </h2>
              {sendFor === `g-send-${group.id}` &&
                (shelfToken ? (
                  <SendPanel
                    attach={{ kind: "collection", token: shelfToken }}
                    refText={group.name}
                    onClose={() => setSendFor(null)}
                  />
                ) : sendGroupError ? (
                  <p className="error-text">{sendGroupError}</p>
                ) : (
                  <p className="skeleton">{t("common.loading")}</p>
                ))}
              {/* A shut shelf renders nothing rather than hiding it: a hundred
                  verses off screen still cost a hundred rows of layout, and
                  the count in the heading already says what is in there. */}
              {!closedGroups.has(group.id || "unfiled") && (
              <div
                className="jr-list"
                ref={(el) => {
                  listEls.current[group.id] = el;
                }}
              >
                {/* while a drag is in flight the shown order is the one under
                    the finger, not the one on disk */}
                {orderedRows(group).map((row, at, ordered) => {
                  const scripture = scriptureOf(row);
                  const ref = refLabel(row, lang);
                  const keys = ordered.map((r) => r.key);
                  if (editing === row.key) {
                    return (
                      <div
                        key={row.key}
                        className="glass card jr-row jr-editing"
                      >
                        <div className="jr-go">
                          <span className="jr-ref">{ref}</span>
                          {scripture && <p className="jr-verse">{scripture}</p>}
                          <input
                            className="jr-edit-field"
                            value={draft}
                            autoFocus
                            maxLength={80}
                            placeholder={t("reader.labelPlaceholder")}
                            onChange={(e) => setDraft(e.target.value)}
                          />
                          <select
                            className="jr-edit-field"
                            value={draftColl}
                            aria-label={t("reader.addToCollection")}
                            onChange={(e) => setDraftColl(e.target.value)}
                          >
                            <option value="">{t("reader.unsorted")}</option>
                            {Object.entries(collections).map(([id, coll]) => (
                              <option key={id} value={id}>
                                {coll.name}
                              </option>
                            ))}
                            {/* the list could only ever move a verse between
                                shelves that already existed, which is no help
                                the first time a verse wants one of its own */}
                            <option value={NEW_COLL}>
                              ＋ {t("journal.newCollection")}
                            </option>
                          </select>
                          {draftColl === NEW_COLL && (
                            <input
                              className="jr-edit-field"
                              value={newColl}
                              autoFocus
                              maxLength={80}
                              placeholder={t("reader.newCollection")}
                              aria-label={t("reader.newCollection")}
                              onChange={(e) => setNewColl(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newColl.trim()) {
                                  saveBookmark(row.key, draft, draftColl);
                                }
                              }}
                            />
                          )}
                          <div className="jr-edit-actions">
                            <button
                              type="button"
                              className="rsvp-btn"
                              onClick={closeEdit}
                            >
                              {t("session.cancel")}
                            </button>
                            <button
                              type="button"
                              className="rsvp-btn jr-danger"
                              onClick={() => removeBookmark(row.key, ref)}
                            >
                              {t("reader.removeBookmark")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              // a new shelf with no name is not a shelf yet
                              disabled={
                                draftColl === NEW_COLL && !newColl.trim()
                              }
                              onClick={() =>
                                saveBookmark(row.key, draft, draftColl)
                              }
                            >
                              {t("common.save")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={row.key}
                      data-bm={row.key}
                      className={`glass card jr-row${
                        drag?.key === row.key ? " jr-dragging" : ""
                      }`}
                    >
                      {ordered.length > 1 && (
                        <button
                          type="button"
                          className="jr-grip"
                          aria-label={t("journal.reorder", { ref })}
                          title={t("journal.reorder", { ref })}
                          onPointerDown={(e) =>
                            startDrag(group.id, row.key, keys, e)
                          }
                          // the same move without a pointer, for a keyboard
                          // and for anyone who cannot hold a drag steady
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              moveWithin(keys, at, at - 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              moveWithin(keys, at, at + 1);
                            }
                          }}
                        >
                          <Icon name="menu" />
                        </button>
                      )}
                      <Link
                        href={`/?b=${row.b}&c=${row.c}&v=${row.v}`}
                        className="jr-go"
                      >
                        <span className="jr-ref">{ref}</span>
                        {scripture ? (
                          <p className="jr-verse">{scripture}</p>
                        ) : (
                          <p className="jr-verse jr-verse-wait">&nbsp;</p>
                        )}
                        {row.entry.l && (
                          <p className="jr-note jr-label">{row.entry.l}</p>
                        )}
                      </Link>
                      <span className="jr-actions">
                        <EditButton
                          label={t("reader.editLabel")}
                          onClick={() =>
                            openEdit(row.key, row.entry.l ?? "", row.entry.c ?? "")
                          }
                        />
                        <HangOnWall bmKey={row.key} />
                        <ShareButton
                          copied={copied === row.key}
                          label={t("discover.share")}
                          done={t("reader.copied")}
                          onClick={() =>
                            share(
                              row.key,
                              entryText(
                                row,
                                row.entry.l,
                                // the name you kept it under travels with it
                                verseLink(row, row.entry.l)
                              )
                            )
                          }
                        />
                        <SendButton
                          label={t("journal.sendToTable")}
                          onClick={() =>
                            setSendFor((cur) =>
                              cur === row.key ? null : row.key
                            )
                          }
                        />
                      </span>
                      {sendFor === row.key && (
                        <SendPanel
                          attach={{
                            b: row.b,
                            c: row.c,
                            v: row.v,
                            kind: "bookmark",
                            label: row.entry.l,
                          }}
                          refText={refLabel(row, lang)}
                          onClose={() => setSendFor(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </section>
            );
          })
        ))}

      {/* "You have no plans" is a claim, and it must not be made while the
          answer is still in the post. A reader walking nothing but plans of
          their own — or offline, where the request simply fails — would
          otherwise be told they have none. */}
      {tab === "plans" && custom === null && counts.plans === 0 ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : null}
      {tab === "plans" &&
        !(custom === null && counts.plans === 0) &&
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
                    <PlanRow
                      key={row.plan.id}
                      {...row}
                      hour={planHours?.[row.plan.id]}
                      onHour={setPlanHour}
                      onMark={markToday}
                      onLeave={leavePlan}
                      onRestart={restartPlan}
                    />
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
                    <PlanRow
                      key={row.plan.id}
                      {...row}
                      hour={planHours?.[row.plan.id]}
                      onHour={setPlanHour}
                      onMark={markToday}
                      onLeave={leavePlan}
                      onRestart={restartPlan}
                    />
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

/** The hours a plan may be set to ask at — morning, midday, evening, night. */
const PLAN_HOURS = [5, 6, 7, 8, 9, 10, 12, 15, 17, 19, 20, 21, 22];

function PlanRow({
  plan,
  name: ownName,
  done,
  total,
  hour,
  onHour,
  onMark,
  onLeave,
  onRestart,
}: {
  plan: (typeof PLANS)[number];
  /** set when the reader wrote this plan — there is no dictionary entry */
  name: string | null;
  done: number;
  total: number;
  /** undefined while the hours are still being fetched */
  hour: PlanHour | undefined;
  onHour: (id: string, hour: PlanHour) => void;
  onMark: (id: string, total: number) => void;
  onLeave: (id: string, name: string) => void;
  onRestart: (id: string) => void;
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
          <Icon name={plan.icon} /> {ownName ?? t(`plan.${plan.id}` as MessageKey)}
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
  const name = ownName ?? t(`plan.${plan.id}` as MessageKey);
  return (
    /* the card cannot be the link any more: a button inside an anchor is
       invalid, and a tap meant for one would follow the other */
    <div className="glass card jr-row jr-plan">
      {target ? (
        <Link href={`/?b=${target.b}&c=${target.c}`} className="jr-go">
          {body}
        </Link>
      ) : (
        <div className="jr-go">{body}</div>
      )}
      <span className="jr-actions">
        {done > 0 && (
          <button
            type="button"
            className="jr-share"
            onClick={() => onRestart(plan.id)}
            aria-label={t("journal.restartPlan", { name })}
            title={t("journal.restartPlan", { name })}
          >
            <Icon name="sunrise" />
          </button>
        )}
        <button
          type="button"
          className="jr-share jr-danger"
          onClick={() => onLeave(plan.id, name)}
          aria-label={t("journal.leavePlan", { name })}
          title={t("journal.leavePlan", { name })}
        >
          <Icon name="close" />
        </button>
      </span>
      {/* A line of its own under the plan, because .jr-row wraps and this is
          a sentence rather than a button. It cannot go inside the link above
          it — a select inside an anchor is invalid, and a tap meant for one
          would follow the other.

          Only for plans still underway: a finished plan has nothing to
          remind anybody about, and offering an hour for it would be offering
          a setting that does nothing. */}
      {/* The footer: what to do today, and when to be asked about it. Both
          full-width under the plan rather than in the row of icon buttons —
          crowded in beside them, a word-long button squeezed every plan's
          title onto two lines. */}
      {done < total && (
        <div className="jr-plan-foot">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onMark(plan.id, total)}
            title={t("journal.markReadFor", { name })}
          >
            ✓ {t("discover.markRead")}
          </button>
        </div>
      )}
      {done < total && (
        <label className="jr-plan-remind">
          <Icon name="bell" />
          <span>{t("journal.remindAt")}</span>
          <select
            value={hour === undefined ? "" : String(hour)}
            disabled={hour === undefined}
            aria-label={t("journal.remindAtFor", { name })}
            onChange={(e) =>
              onHour(
                plan.id,
                e.target.value === "off" ? "off" : Number(e.target.value)
              )
            }
          >
            {hour === undefined && <option value="">…</option>}
            <option value="off">{t("journal.remindOff")}</option>
            {/* whatever they had is offered even if it is not one of ours —
                an hour set before this list existed must not silently move */}
            {(typeof hour === "number" && !PLAN_HOURS.includes(hour)
              ? [...PLAN_HOURS, hour].sort((a, b) => a - b)
              : PLAN_HOURS
            ).map((h) => (
              <option key={h} value={h}>
                {new Date(2020, 0, 1, h).toLocaleTimeString(
                  lang === "es" ? "es" : "en",
                  { hour: "numeric", minute: "2-digit" }
                )}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** A pencil, sized and coloured like the share button beside it. */
function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="jr-share jr-edit-btn"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name="note" />
    </button>
  );
}

/** A quiet share affordance that says so when it has fallen back to a copy. */
/**
 * The same payload, straight into a text message. Shown only where there is a
 * messaging app to open: on a laptop this button would be a dead end, and the
 * share sheet next to it already does the right thing there.
 */

/**
 * Hand a passage to somebody at the Table.
 *
 * The composer inside a conversation could already attach a bookmark or a
 * note, but only once you were in the conversation — which meant the journal,
 * where those things actually live, could share to everywhere except the one
 * place inside this app. This is that missing direction: from the entry to the
 * person, rather than from the person to the entry.
 *
 * People you are already talking with come first and need no typing. The rest
 * of the directory is behind the same search the Table uses.
 */
function SendPanel({
  attach,
  refText,
  onClose,
}: {
  attach:
    | {
        b: number;
        c: number;
        v: number;
        kind: "bookmark" | "note";
        label?: string;
      }
    /* a shelf, which is not anywhere in scripture — it goes as the address of
       its published snapshot, and the card is built from that, not from here */
    | { kind: "collection"; token: string };
  refText: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<{ userId: string; displayName: string }[] | null>(null);
  const [busy, setBusy] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all([
        api<{ conversations: { peerId: string; peerName: string }[] }>(
          "/api/messages"
        ).catch(() => ({ conversations: [] })),
        api<{ users: { userId: string; displayName: string }[] }>(
          `/api/users?q=${encodeURIComponent(q.trim())}`
        ).catch(() => ({ users: [] })),
      ]).then(([mine, all]) => {
        if (cancelled) return;
        const seen = new Map<string, string>();
        for (const c of mine.conversations ?? []) seen.set(c.peerId, c.peerName);
        for (const u of all.users ?? []) if (!seen.has(u.userId)) seen.set(u.userId, u.displayName);
        const term = q.trim().toLowerCase();
        setPeople(
          [...seen]
            .map(([userId, displayName]) => ({ userId, displayName }))
            .filter((p) => !term || p.displayName.toLowerCase().includes(term))
        );
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q]);

  const send = async (peerId: string, name: string) => {
    if (busy) return;
    setBusy(peerId);
    setError("");
    try {
      await api(`/api/messages/${peerId}`, {
        method: "POST",
        body: { text: refText, attach },
      });
      setSent(name);
      window.setTimeout(onClose, 1400);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="jr-send">
      {sent ? (
        <p className="cal-hint">{t("journal.sentTo", { name: sent })}</p>
      ) : (
        <>
          <input
            className="input"
            type="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("messages.findPlaceholder")}
            aria-label={t("messages.findAnyone")}
          />
          {people === null ? (
            <p className="skeleton">{t("common.loading")}</p>
          ) : people.length === 0 ? (
            <p className="cal-hint">{t("messages.findNone")}</p>
          ) : (
            <div className="chips">
              {people.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  className="chip"
                  disabled={!!busy}
                  onClick={() => send(p.userId, p.displayName)}
                >
                  {p.displayName}
                </button>
              ))}
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {t("session.cancel")}
          </button>
        </>
      )}
    </div>
  );
}

function SendButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="jr-share jr-share-btn"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name="envelope" />
    </button>
  );
}

function ShareButton({
  copied,
  label,
  done,
  onClick,
}: {
  copied: boolean;
  label: string;
  done: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`jr-share jr-share-btn${copied ? " done" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name={copied ? "check" : "share"} />
      {copied && <span className="jr-share-done">{done}</span>}
    </button>
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
